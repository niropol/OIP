// ─────────────────────────────────────────────────────────────────────────────
//  Harness de tests para la app OIP.
//
//  NO modifica index.html. Lee el archivo de producción tal cual, y SOLO en la
//  copia en memoria que carga jsdom le agrega un <script> al final que "expone"
//  algunos símbolos (DB, AT, funciones de cálculo, etc.) en window.__APP__.
//  Eso es necesario porque en index.html esos símbolos son `const` de nivel
//  superior y no quedan accesibles desde afuera. El archivo en disco queda igual.
//
//  La app, al cargar fuera de localhost, intenta conectarse a Supabase; como el
//  SDK no está disponible en jsdom, `arranque()` corta temprano sin tocar nada.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, '..', 'index.html');

// Símbolos que queremos poder usar/inspeccionar desde los tests.
const EXPONER = [
  // estado
  'DB', 'AT', 'CONSULTA_VALORES', 'OS_GRAVADAS_SIEMPRE', 'OS_COPAGO_ADELANTO',
  // cálculos puros
  'facturadoReg', 'totalReg', 'ivaReg', 'subtotalNeto', 'honorMedicoReg',
  'totalesOS', 'netoOS', 'copagoAdelantoReg', 'getExentaForOS',
  'esConsulta', 'esConsultaReg', 'cantConsultaHon', 'totalConsultasReg',
  'honorALiquidarReg', 'honorariosMedico', 'exentaReg', 'facturaPendiente',
  'ESTADOS_FACTURA_PENDIENTE', 'honorPracticaReg',
  // ABM de médicos (alta/edición + tarifa de estudios/prácticas) + reparación de huérfanos
  'guardarMedico', 'editarMedico', 'abrirNuevoMedico',
  'reconectarMedicoHuerfano', 'confirmarReconexionMedicos',
  'verAtencionesHuerfanas', 'eliminarAtencionesHuerfanas', 'eliminarMedico',
  '_gruposMedicosDuplicados', 'unirMedicosDuplicados',
  // vistas que se auditaron por duplicar cálculos (fuente única)
  'renderAtenciones', 'renderMedicosGrid', 'recalcCM', 'sumarPacientes',
  // navegación: sección fusionada OS/Pagos (ex Obras sociales + Médicos + Derivaciones)
  'showSection', 'switchOSPagosTab', 'switchDerivTab', 'verCobranzasOS',
  // contratos: importación por archivo y aumento por porcentaje
  'confirmarImportContrato', 'calcularAumentoContrato', 'confirmarAumentoContrato',
  'poblarSelectoresOS', 'aplicarPorcentaje', 'exentaPrestacion',
  // ABM de obras sociales + atributos de facturación data-driven (copago / IVA por OS)
  'guardarOS', 'editarOS', 'nuevaOS', 'esCopagoAdelanto', 'pctIVAForOS', 'copagoAdelantoReg',
  '_categorizarSobrantes',
  // pizarrón de notas del dashboard
  'renderNotas', 'agregarNota', 'eliminarNota', 'toggleNotaHecha', 'responderNota', 'escHtml',
  'renderConfiguracion', 'renderValoresVigentes',
  // categorías consulta/estudio/práctica (fuente única + filtros + corrección manual)
  'categoriaDesc', 'categoriaPrestacion', 'categoriaReg',
  'getEstudiosDeOS', 'getPracticasDeOS', 'togglePrestCategoria',
  'ESTUDIO_KEYWORDS', 'ESTUDIO_TOKENS',
  // flujos con efectos
  'confirmarCobro', 'eliminarFactura', 'eliminarRegistro', 'guardarAtencion',
  'atSelCategoria', 'atOnPrestChange', 'editarRegistro', 'guardarEdicionRegistro',
  'editarRegOSChange', 'editarRegPrestChange', 'editarRegToggleCopago', 'editarRegToggleIVA',
  'toggleExentaAtencion', 'editarComentarioAtencion', 'exentaReg',
  'actualizarPreciosPrestaciones', 'marcarCambios',
  // derivaciones
  'guardarDerivacion', 'confirmarPagoDerivacion', 'eliminarDerivacion',
  // carga masiva (parser del resumen pegado)
  'parsearResumenPegado', 'normalizarOSAlias', 'parsearFecha',
  'detectarMedicoEnLineas', 'detectarFechaEnLineas', 'detectarConsultorioEnLineas',
  'actualizarCMConsultorio', 'guardarCargaMasiva', '_ejecutarGuardarCargaMasiva',
  'toggleIVARow', 'duplicarFilaCM', 'onCMConsultaPrestChange',
  'agregarFilaPrestacion', 'onCMPrestOSChange',
  // valores de consulta (base única: nomenclador)
  'valorConsultaOS', 'getConsultasDeOS', 'getOSList',
  // orden alfabético de desplegables
  'cmpAlfa', 'optionsMedicos', 'soloApellido',
  // filtro por letra en desplegables de prestaciones
  'filtrarOpcionesSelect', 'atSelOS', 'atSelTipo',
  'agregarFilaConsulta', 'agregarFilaPrestacion', 'onCMConsultaOSChange', 'onCMPrestOSChange',
  'abrirPagoDerivacion',
  // preliquidación (cierre de mes por médico) + foto de liquidación (drift)
  'getLiquidacion', 'regBloqueado', 'cerrarMesMedico', 'reabrirMesMedico',
  '_fotoLiquidacion', '_driftLiquidacion', '_regsMedicoMes',
  'marcarFacturaRecibida', 'confirmarPagoEnviado', 'contarConsultas',
  'generarPreliq', 'enviarLiquidacionCierre', 'enviarLiquidacionMail', '_cuerpoLiquidacion',
  'copiarTablamedico', '_tablaPreliqMedico',
  // diagnóstico de datos reales (salud de la DB, solo lectura) + verificación de cálculos
  'runDiagnosticoDatos', 'runSelfTests',
  // persistencia (guardado/sync)
  'guardarEnNube', '_guardarSnapshot', 'cargarDesdeNube', '_chequearCambiosNoMarcados',
  '_corregirNextId', 'verificarSyncPrestaciones',
  // candado anti-pisada + reclamo atómico del turno (anti-carrera) + backup diario automático
  '_hayCambiosDeOtraSesion', '_leerSyncTokenRemoto', '_reclamarTokenNube', '_nuevoToken', 'diagnosticarCandadoAtomico',
  '_fechaNum', '_snapshotDB', '_backupDiarioSiCorresponde', 'listarBackupsNube', 'restaurarBackupNube', 'backupNubeAhora',
  // reprecio de atenciones desde la vigencia (import/aumento lo aplican solo) — por OS + mes
  'actualizarPreciosPrestaciones', '_repreciarRegistros', '_indicesPrecioPrestaciones', '_matchNomenclador',
  'abrirActualizarPreciosOS', 'confirmarActualizarPreciosOS',
  // verificación de precios de las atenciones vs nomenclador
  'verificarPreciosAtenciones', 'verificarPreciosAtencionesUI',
  // verificación de IVA (exenta/gravada) consistente por OS+prestación+mes
  'verificarIVAAtenciones', 'verificarIVAAtencionesUI',
  // unir prestaciones duplicadas por nombre (distinta grafía) — sobrevive el valor más alto
  '_gruposPrestacionesDuplicadas', 'unirPrestacionesDuplicadas', '_normNombrePrest',
  // consultorios (base única para "aplicar a consultorio")
  'getConsultoriosList', 'poblarSelectoresConsultorio',
  'nuevoConsultorio', 'editarConsultorio', 'guardarConsultorio',
  'eliminarConsultorio', 'toggleConsultorioEstado',
  // renders que agregan por consultorio (auditoría: deben cubrir TODOS los activos)
  'renderCajaChica', 'renderFinanzas', 'saldoCajaChica', 'asignarConsultorioCaja',
  'initDashboard', 'renderEstadisticas', 'hoyISO', 'renderOSTbody',
  'copiarInformeDiario', '_informeDiario',
  // resumen mensual de Finanzas (efectivo / banco / pendiente de cobrar por período)
  'renderResumenMensual', 'getMesLabel', 'toggleDetallePendienteMes',
  // cobros con monto distinto al facturado (auditoría D3)
  'renderHistorialPagos', 'abrirConfirmarCobro',
  // backup completo (Datos y respaldo)
  'construirDatosExportacion', 'exportarBackupJSON', 'exportarTodo', 'importarBackupJSON',
  // Obras Sociales: totales unificados en totalesOS() (auditoría D1)
  'renderOSCards', 'renderOSDetalle', 'copiarDetalleOSMail', 'generarPreliqOS',
  // filas de la presentación agrupadas por código (fuente única de las 3 vistas)
  'filasPresentacionOS',
  // selector de mes OS/Pagos (refresco inmediato + filtrado de meses malformados)
  'poblarSelectoresMes', 'onOSMesChange', 'renderOSStats',
  // alarmas: alta + edición en el lugar + finalizar desde el cartel emergente
  'renderAlarmas', 'guardarAlarma', 'editarAlarma', 'resolverAlarma', 'eliminarAlarma',
  'mostrarCartelAlarma', 'avisarAlarmasVencidas', 'finalizarAlarmaDesdeCartel', 'finalizarTodasAlarmasCartel',
  // editar la presentación (factura) ya hecha a una OS, desde el detalle de la OS
  'editarFactura', 'guardarEdicionFactura', 'confirmarPagoEnviado',
  // corregir en la presentación si una prestación va exenta o gravada de IVA
  // (exentaReg/ivaReg ya expuestos arriba); por código (bulk) o por atención puntual
  'toggleExentaPresentacion', 'toggleExentaRegistro', 'toggleFilaAtenciones',
  // cajas: editar/eliminar movimientos de banco (renderFinanzas ya está expuesto arriba)
  'guardarMovimiento', 'editarMovimiento', 'eliminarMovimiento', 'abrirNuevoMovimiento',
];

// "Seams" de test para la capa de persistencia: permiten inyectar un Supabase
// simulado y manipular el estado interno (sb, datosCargados, _snapshot) que de otro
// modo no es accesible desde afuera. Se asignan a las variables globales del módulo.
const SEAMS = `
  window.__APP__.__setSb = (x) => { sb = x; };
  window.__APP__.__setDatosCargados = (b) => { datosCargados = b; };
  window.__APP__.__setAutosaveActivo = (b) => { autosaveActivo = b; };
  window.__APP__.__setSoloLectura = (b) => { _soloLectura = b; };
  window.__APP__.__setSyncToken = (t) => { _syncToken = t; };
  window.__APP__.__getSyncToken = () => _syncToken;
  window.__APP__.__dirtyCols = () => [...cambiosPendientes.dirty];
  // Inicializa los selectores de UI como lo hace init() tras el login en producción
  // (sin los setInterval de alarmas/autoguardado). Necesario porque, con el login
  // reactivado, arranque() ya no llama a init() en el harness (no hay Supabase).
  window.__APP__.__initSelectoresTest = () => {
    try { poblarSelectoresMes(); } catch (e) {}
    try { poblarSelectoresOS(); } catch (e) {}
    try { poblarSelectoresConsultorio(); } catch (e) {}
    try { populateMedicoSelects(); } catch (e) {}
  };
`;

export function loadApp() {
  let html = readFileSync(HTML_PATH, 'utf8');

  // jsdom no descarga los <script src="js/..."> locales: los reemplazamos por su
  // contenido inline, así el test carga EXACTAMENTE el mismo código que el navegador.
  html = html.replace(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"><\/script>/g, (_m, src) => {
    const code = readFileSync(join(__dirname, '..', src), 'utf8');
    return `<script>\n${code}\n</script>`;
  });

  const shim = `\n<script>window.__APP__ = { ${EXPONER.join(', ')} };\n${SEAMS}</script>\n`;
  // Inyectar el shim justo antes de cerrar el body (solo en esta copia en memoria).
  // OJO: hay literales con "</body>" dentro del JS (ventanas de impresión), así que
  // se reemplaza el ÚLTIMO "</body>" del archivo, que es el real del documento.
  const idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + shim + html.slice(idx);

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',     // ejecuta el <script> embebido
    url: 'https://example.com/',   // NO localhost → no entra el modo dev, corta en Supabase
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Neutralizar diálogos del navegador que jsdom no implementa.
  window.confirm = () => true;
  window.alert = () => {};
  window.prompt = () => '';

  const app = window.__APP__;
  if (!app) throw new Error('No se pudo exponer __APP__: ¿cambió la estructura de index.html?');
  // Simular el estado "app inicializada tras el login" (selectores poblados). En
  // producción lo hace init(); acá arranque() ya no lo llama (login activo, sin Supabase).
  if (typeof app.__initSelectoresTest === 'function') app.__initSelectoresTest();
  return { window, dom, app };
}

// Helper: dejar las colecciones de datos vacías para un test limpio.
export function resetDatos(app) {
  const D = app.DB;
  ['registros', 'facturas', 'pagosRecibidos', 'movimientos', 'cajaChica',
   'liquidaciones', 'derivaciones', 'notas'].forEach(c => { D[c] = []; });
  return D;
}

// Helper: setear el valor de un input/select por id (como lo haría el usuario).
export function setInput(window, id, value) {
  const el = window.document.getElementById(id);
  if (!el) throw new Error('No existe el elemento #' + id);
  el.value = String(value);
  return el;
}
