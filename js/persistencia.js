// ═══════════════════════════════════════════════════════════════════════════
//  PERSISTENCIA — integración con Supabase (login, carga, guardado, sync)
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. El comportamiento es idéntico: el
//  código se movió tal cual. Este módulo se carga DESPUÉS del script principal
//  porque al final dispara el arranque() de la app (necesita init(), DB y los
//  render ya definidos). Todos los símbolos siguen siendo globales.
// ═══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  INTEGRACIÓN SUPABASE — login, carga, guardado y sincronización
// ══════════════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://fviirbiuzfvjajyqldkn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2aWlyYml1emZ2amFqeXFsZGtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTI1MDIsImV4cCI6MjA5NTY2ODUwMn0.PKh13QTrpUa8O0tio9cNcZtBh2GuTwCUpvSLZc4kEBk';

// Colecciones de DB que se sincronizan (arrays de objetos con id)
const COLECCIONES = ['registros','medicos','prestaciones','facturas','liquidaciones','cajaChica','alarmas','derivaciones','contratos','movimientos','pagosRecibidos','obrasSociales','consultorios','notas'];
// Copia de las obras sociales que vienen por defecto en el código (para migración:
// si la nube todavía no tiene ninguna OS guardada, se siembran estas una sola vez).
const OBRAS_SOCIALES_BASE = JSON.parse(JSON.stringify(DB.obrasSociales || []));
// Idem para consultorios (Palpa/Haedo/Extra): una nube EXISTENTE (con datos ya cargados)
// nunca tuvo esta colección — sin esta migración, DB.consultorios quedaría vacío tras
// cargar y ningún selector de "aplicar a consultorio" tendría opciones.
const CONSULTORIOS_BASE = JSON.parse(JSON.stringify(DB.consultorios || []));

// ── MODO DEV SIN LOGIN ───────────────────────────────────────────────────────
// TEMPORAL (fase de edición/corrección): con true la app arranca SIN pedir login
// (ni contraseña ni Google), en cualquier contexto. Trabaja con los datos semilla
// en memoria y NO se conecta a Supabase, así que NO toca los datos de producción.
//
// ⚠️ NO DESPLEGAR EN ESTE ESTADO: si se sube así a GitHub Pages, la app queda sin
// login y sin datos reales. Antes de volver a producción hay que poner esta
// constante en false (eso reactiva el login con contraseña/Google de siempre).
// ►► PRODUCCIÓN (2026-07-05): el usuario verificó la carga real en modo solo lectura
//    y dio el OK para ir a producción. Login reactivado. ◄◄
const DEV_SIN_LOGIN = false;

// ── MODO SOLO LECTURA / EXPORTAR BACKUP ──────────────────────────────────────
// TEMPORAL, para el "camino a producción": con true, la app pide login REAL y carga
// los datos de la nube EXACTAMENTE como lo haría producción, pero el GUARDADO queda
// BLOQUEADO por completo (guardarEnNube y flushKeepalive no hacen nada, autosave
// apagado). Sirve para dos cosas a la vez, sin ningún riesgo de escritura:
//   1) Hacer un backup fiel de producción (Configuración → Backup completo JSON).
//   2) Verificar que cargarDesdeNube funciona contra el Supabase real.
// Tiene PRIORIDAD sobre DEV_SIN_LOGIN. Volver a false cuando el backup esté hecho.
// (2026-07-05) Backup hecho y carga real verificada → apagado. Producción normal.
const MODO_EXPORTAR_BACKUP = false;

let sb = null;              // cliente supabase
let _soloLectura = false;   // true en MODO_EXPORTAR_BACKUP: bloquea TODA escritura a la nube
let appIniciada = false;    // para no re-inicializar la UI
let datosCargados = false;  // SEGURIDAD: true sólo tras una carga (o seed) EXITOSA desde la nube.
                            // Si es false, NO se guarda nada (evita pisar la nube con datos semilla
                            // o incompletos cuando la carga falló).
let _accessToken = null;    // token de sesión cacheado, para el flush de salida con keepalive
const cambiosPendientes = { dirty: new Set() };  // tracking de colecciones modificadas para guardar

// — Marcar la app como "con cambios sin guardar" —
let autosaveTimer = null;
let autosaveActivo = true;  // se puede apagar desde Configuración si hiciera falta

// — Indicador de guardado (botón "Guardar" de la topbar) ────────────────────
// Antes 'pendiente' (sin guardar) y 'error' (el último intento falló) se veían
// IGUAL — un usuario no podía distinguir "recién escribí algo" de "hace 20 min
// que no guarda nada". Ahora son estados separados con color distinto, y al
// guardar bien se recuerda la hora para mostrarla en el tooltip.
let _ultimoGuardadoOk = null;  // Date del último guardado exitoso (o null si nunca)
function _horaCorta(d) { return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
function _actualizarIndicadorGuardado(estado) {
  const btn = document.getElementById('btn-guardar-nube');
  if (!btn) return;
  btn.classList.remove('pendiente', 'error');
  if (estado === 'guardando') {
    btn.disabled = true; btn.textContent = 'Guardando…';
    btn.title = 'Guardando cambios en la nube…';
  } else if (estado === 'error') {
    btn.disabled = false; btn.classList.add('error'); btn.textContent = '⚠️ No guardado';
    btn.title = 'El último guardado falló. Revisá tu conexión — se reintenta solo, o tocá el botón para forzarlo.';
  } else if (estado === 'pendiente') {
    btn.disabled = false; btn.classList.add('pendiente'); btn.textContent = '💾 Guardar cambios';
    btn.title = 'Hay cambios sin guardar.';
  } else {  // 'ok'
    btn.disabled = false; btn.textContent = '✓ Guardado';
    btn.title = _ultimoGuardadoOk ? `Todo guardado — último: ${_horaCorta(_ultimoGuardadoOk)}` : 'Todo guardado';
    setTimeout(() => { const b = document.getElementById('btn-guardar-nube'); if (b && !b.classList.contains('pendiente') && !b.classList.contains('error')) b.textContent = '💾 Guardar'; }, 2000);
  }
}

function marcarCambios(coleccion) {
  if (coleccion) cambiosPendientes.dirty.add(coleccion);
  // Si el último intento falló (estado 'error'), un cambio nuevo no debe "tapar" ese
  // aviso con el naranja genérico de 'pendiente' — sigue habiendo un problema real.
  const btn = document.getElementById('btn-guardar-nube');
  if (!btn || !btn.classList.contains('error')) _actualizarIndicadorGuardado('pendiente');
  // Guardado automático: espera poco tras el último cambio y guarda solo.
  // Para datos críticos (atenciones, obras sociales, prestaciones, facturas) guarda casi al instante.
  if (autosaveActivo && sb) {
    const criticas = ['registros', 'obrasSociales', 'prestaciones', 'facturas', 'pagosRecibidos'];
    const demora = criticas.includes(coleccion) ? 250 : 1200;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => { guardarEnNube(true); }, demora);
  }
}

function loginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function loginLoading(on) {
  const l = document.getElementById('login-loading');
  if (l) l.style.display = on ? 'block' : 'none';
  const b = document.getElementById('login-btn');
  if (b) b.disabled = on;
}

// — Inicializar cliente —
function initSupabase() {
  if (sb) return sb;
  if (typeof supabase === 'undefined') { loginError('No se pudo cargar la conexión. Revisá tu internet.'); return null; }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  // Cachear el token para poder hacer un guardado de salida con keepalive (ver flushKeepalive).
  try { sb.auth.onAuthStateChange((_e, session) => { _accessToken = session?.access_token || null; }); } catch (e) {}
  return sb;
}

// — Login con email/contraseña —
async function loginEmail() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { loginError('Completá email y contraseña.'); return; }
  if (!initSupabase()) return;
  loginLoading(true); loginError('');
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { loginError('Email o contraseña incorrectos.'); loginLoading(false); return; }
    await onLoginOk();
  } catch (e) {
    loginError('Error de conexión. Intentá de nuevo.');
    loginLoading(false);
  }
}

// — Login con Google —
async function loginGoogle() {
  if (!initSupabase()) return;
  loginError('');
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) loginError('No se pudo iniciar con Google.');
  } catch (e) { loginError('Error de conexión con Google.'); }
}

async function logout() {
  if (sb) { try { await sb.auth.signOut(); } catch(e){} }
  window.location.reload();
}

// — Tras login exitoso: cargar datos y arrancar la app —
// ── Mails autorizados a usar el sistema ──
// Para agregar o quitar accesos, editá esta lista (en minúsculas).
const MAILS_AUTORIZADOS = [
  'drpolisky@gmail.com',
  'cirugiaoftalmo@gmail.com',
  'niropol@gmail.com',
];

async function onLoginOk() {
  loginLoading(true);
  // Verificar que el mail esté autorizado
  let email = '';
  try {
    const { data } = await sb.auth.getUser();
    email = (data && data.user && data.user.email || '').toLowerCase().trim();
  } catch (e) {}
  if (!email || !MAILS_AUTORIZADOS.includes(email)) {
    try { await sb.auth.signOut(); } catch (e) {}
    loginLoading(false);
    loginError('Tu cuenta no está autorizada para usar este sistema. Contactá al administrador.');
    document.getElementById('login-screen').style.display = 'flex';
    return;
  }
  // Cachear el token de sesión (para el flush de salida con keepalive).
  try { const { data: s } = await sb.auth.getSession(); _accessToken = s?.session?.access_token || null; } catch (e) {}

  // SEGURIDAD CRÍTICA: si la carga falla, NO arrancar la app. Si arrancáramos, la app
  // quedaría con los datos semilla y el primer guardado pisaría/borraría la nube real.
  try {
    await cargarDesdeNube();
  } catch (e) {
    console.error('Error cargando datos:', e);
    datosCargados = false;
    loginLoading(false);
    loginError('No se pudieron cargar los datos de la nube. Revisá tu conexión y volvé a entrar. (No se modificó nada en la nube.)');
    document.getElementById('login-screen').style.display = 'flex';
    return;  // ← clave: no init() ⇒ ningún guardado puede pisar la nube
  }
  document.getElementById('login-screen').style.display = 'none';
  if (!appIniciada) { init(); appIniciada = true; }
  else { initDashboard(); }
}

function showToastSafe(m) { if (typeof showToast === 'function') showToast(m); }

// Banner fijo de aviso para el MODO SOLO LECTURA (no se puede confundir con el modo normal).
function _mostrarBannerSoloLectura() {
  if (document.getElementById('banner-solo-lectura')) return;
  const b = document.createElement('div');
  b.id = 'banner-solo-lectura';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b45309;color:#fff;' +
    'text-align:center;padding:6px 12px;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.25);';
  b.textContent = '🔒 MODO SOLO LECTURA — el guardado está bloqueado. Exportá el backup (Configuración → Datos y respaldo) y avisá.';
  const poner = () => document.body && document.body.prepend(b);
  if (document.body) poner(); else document.addEventListener('DOMContentLoaded', poner);
}

// — Cargar todo desde Supabase. Si está vacío, hace el seed inicial. —
async function cargarDesdeNube() {
  const { data: filas, error } = await sb.from('app_data').select('coleccion, doc_id, data');
  if (error) throw error;
  const { data: metas, error: errorMeta } = await sb.from('app_meta').select('clave, valor');
  // Si falla meta, NO seguir: arrancaríamos con config/nextId semilla (honorarios mal,
  // nextId=2000 → colisiones de id). Mejor fallar la carga entera y que el usuario reintente.
  if (errorMeta) throw errorMeta;

  if (!filas || filas.length === 0) {
    // OJO: "sin filas" NO siempre significa "base nueva". Si app_data vino vacío pero
    // app_meta TIENE datos (config/nextId guardados antes), la base ya se usó — lo más
    // probable es que el select de app_data falló o volvió vacío por un problema
    // transitorio (RLS, red, timeout). Re-sembrar acá subiría las 700+ prestaciones y
    // médicos SEMILLA encima de producción. Mejor abortar y que el usuario reintente:
    // no se toca nada en la nube.
    if (metas && metas.length > 0) {
      throw new Error('app_data vino vacío pero hay metadatos guardados: la base no es nueva. No se re-siembra para no pisar la información existente. Reintentá la carga.');
    }
    // Base REALMENTE nueva (ni datos ni meta) → seed inicial.
    await sembrarInicial();
    return;
  }
  // Reconstruir DB desde las filas
  COLECCIONES.forEach(c => { DB[c] = []; });
  filas.forEach(f => {
    if (!DB[f.coleccion]) DB[f.coleccion] = [];
    DB[f.coleccion].push(f.data);
  });
  // Migración una sola vez: si la nube tiene datos pero nunca se guardaron las
  // obras sociales, conservar las que vienen por defecto y subirlas.
  if (DB.obrasSociales.length === 0 && OBRAS_SOCIALES_BASE.length > 0) {
    DB.obrasSociales = JSON.parse(JSON.stringify(OBRAS_SOCIALES_BASE));
    marcarCambios('obrasSociales');
  }
  // Migración: asegurar que cada OS base exista en la nube (agrega las que falten,
  // por ejemplo SinCargo en bases que se guardaron antes de crearla). No pisa las existentes.
  OBRAS_SOCIALES_BASE.forEach(base => {
    if (!DB.obrasSociales.some(o => o.nombre === base.nombre)) {
      const nueva = JSON.parse(JSON.stringify(base));
      // Evitar id duplicado: si el id base ya lo usa otra OS de la nube, asignar uno
      // nuevo (maxId+1). Un id repetido rompería el guardado con el error 21000.
      if (DB.obrasSociales.some(o => o.id === nueva.id)) {
        nueva.id = DB.obrasSociales.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0) + 1;
      }
      DB.obrasSociales.push(nueva);
      marcarCambios('obrasSociales');
    }
  });
  // Migración de consultorios: mismo criterio que las OS (sembrar si está vacío,
  // agregar los que falten sin pisar los que el usuario ya haya cargado/renombrado).
  if (DB.consultorios.length === 0 && CONSULTORIOS_BASE.length > 0) {
    DB.consultorios = JSON.parse(JSON.stringify(CONSULTORIOS_BASE));
    marcarCambios('consultorios');
  }
  CONSULTORIOS_BASE.forEach(base => {
    if (!DB.consultorios.some(c => c.nombre === base.nombre)) {
      const nuevo = JSON.parse(JSON.stringify(base));
      if (DB.consultorios.some(c => c.id === nuevo.id)) {
        nuevo.id = DB.consultorios.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
      }
      DB.consultorios.push(nuevo);
      marcarCambios('consultorios');
    }
  });
  // Meta (config, nextId)
  (metas || []).forEach(m => {
    if (m.clave === 'config') DB.config = m.valor;
    if (m.clave === 'nextId') DB.nextId = m.valor;
  });
  cambiosPendientes.dirty.clear();
  _guardarSnapshot();  // base de comparación para la red de seguridad
  datosCargados = true;  // carga exitosa: ya es seguro guardar
}

// — Seed inicial: sube el DB actual (con las 737 prestaciones, médicos y config) —
async function sembrarInicial() {
  showToastSafe('Cargando datos iniciales por primera vez…');
  const filasRaw = [];
  COLECCIONES.forEach(c => {
    (DB[c] || []).forEach(item => {
      if (item && item.id != null) filasRaw.push({ coleccion: c, doc_id: item.id, data: item });
    });
  });
  const filas = _dedupeFilas(filasRaw);  // evita el error 21000 si hubiera ids repetidos
  // Subir en lotes de 500 para no exceder límites
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error } = await sb.from('app_data').upsert(lote, { onConflict: 'coleccion,doc_id' });
    if (error) throw error;
  }
  await sb.from('app_meta').upsert([
    { clave: 'config', valor: DB.config },
    { clave: 'nextId', valor: DB.nextId }
  ], { onConflict: 'clave' });
  cambiosPendientes.dirty.clear();
  _guardarSnapshot();    // base de comparación para el borrado seguro
  datosCargados = true;  // seed exitoso: ya es seguro guardar
}

// — Guardar cambios en la nube (solo lo que cambió) —
// Actualiza los PRECIOS de las prestaciones con los valores del código (fuente de la verdad)
// y los sube a la nube. NO toca atenciones ni ningún otro dato.
async function actualizarPreciosPrestaciones() {
  const totalCfg = (DB.prestaciones || []).length;

  // Confirmación inicial: explicar exactamente qué va a hacer (config manda)
  if (!confirm(
    'ACTUALIZAR PRECIOS A LA NUBE\n\n' +
    'Se van a tomar los valores que tenés cargados en Configuración ' +
    `(${totalCfg} prestaciones) y se subirán a la nube.\n\n` +
    'Los precios de Configuración NO se modifican: son la fuente de verdad.\n' +
    'Solo se re-aplican a las atenciones ya cargadas (desde una fecha que vas a elegir).\n\n' +
    '¿Querés continuar?'
  )) return;

  // Pedir fecha de vigencia (desde cuándo rigen los valores nuevos)
  const hoy = hoyISO();
  let vigencia = prompt(
    'Estos valores rigen DESDE qué fecha (formato AAAA-MM-DD).\n\n' +
    '• Para un cambio retroactivo (ej: en julio cargás valores de junio), poné 2026-06-01.\n' +
    '• Para un cambio a futuro (ej: en junio cargás valores de julio), poné 2026-07-01.\n' +
    '• Las atenciones ANTERIORES a esta fecha no se tocan.',
    hoy.slice(0,8) + '01'
  );
  if (vigencia === null) return;  // canceló
  vigencia = vigencia.trim();
  // Validación propia: formato correcto y no absurdamente vieja. SE PERMITEN fechas futuras
  // (para cargar valores que rigen a partir de un mes que todavía no llegó).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigencia) || isNaN(Date.parse(vigencia + 'T00:00:00'))) {
    showToastSafe('⚠️ La fecha de vigencia no es válida (usá AAAA-MM-DD).'); return;
  }
  if (vigencia < '2020-01-01') { showToastSafe('⚠️ La fecha de vigencia es demasiado antigua.'); return; }

  if (!confirm(
    `Se re-aplicarán los precios de Configuración a las atenciones de obra social ` +
    `DESDE el ${vigencia} en adelante. Las anteriores no se tocan.\n\n¿Continuar?`
  )) return;

  // 1) Los precios "nuevos" son los que están EN CONFIGURACIÓN (lo que el usuario editó).
  //    NO se reemplaza el catálogo con el código: configuración es la fuente de verdad.
  //    precioNuevo = valores actuales de config. precioViejo = el que tienen las atenciones
  //    (se infiere comparando); en la práctica re-aplicamos el precio de config a las
  //    atenciones que todavía usan un valor distinto al de config.
  const precioNuevo = {};
  const precioPorCodigo = {};
  const contar = (arr, dst) => {
    arr.forEach(p => {
      const k = p.os + '||' + p.desc;
      if (dst[k] === undefined) dst[k] = p.valOS;
      else if (dst[k] !== p.valOS) dst[k] = 'AMBIGUO';
      // índice por código (os + código): match robusto que no depende del texto
      if (p.codigo) {
        const kc = p.os + '||' + p.codigo;
        if (precioPorCodigo[kc] === undefined) precioPorCodigo[kc] = p.valOS;
        else if (precioPorCodigo[kc] !== p.valOS) precioPorCodigo[kc] = 'AMBIGUO';
      }
    });
  };
  contar(DB.prestaciones || [], precioNuevo);

  // Índice de CONSULTAS por OS + plan (para repreciar consultas aunque su descripción
  // guardada no coincida exactamente con la del nomenclador). El plan se extrae de la
  // descripción de la prestación ("Consulta (Plan 510)") o queda '' si no tiene.
  const precioConsulta = {};   // clave: os||plan  → valOS
  const consultasPorOS = {};   // clave: os → [valOS únicos]  (para detectar plan único)
  (DB.prestaciones || []).forEach(p => {
    if (!esConsulta(p.desc)) return;
    const mPlan = (p.desc.match(/plan\s*([0-9a-z]+)/i) || [])[1] || '';
    const k = p.os + '||' + mPlan.toLowerCase();
    if (precioConsulta[k] === undefined) precioConsulta[k] = p.valOS;
    else if (precioConsulta[k] !== p.valOS) precioConsulta[k] = 'AMBIGUO';
    if (!consultasPorOS[p.os]) consultasPorOS[p.os] = new Set();
    consultasPorOS[p.os].add(p.valOS);
  });

  // 2) NO se reemplaza el catálogo. Configuración manda.
  marcarCambios('prestaciones');

  // 3) Re-aplicar a las atenciones de OS desde la vigencia
  let actualizadas = 0;
  const diferencias = [];  // atenciones con monto manual o desc ambigua (no se pisan sin confirmar)
  (DB.registros || []).forEach(r => {
    if (r.os === 'Particular' || r.os === 'CEMEPLA') return;  // no aplican
    if (!r.fecha || r.fecha < vigencia) return;               // anteriores: intactas
    // 1º intentar por código (robusto, no depende del texto); 2º por descripción
    let nuevo;
    if (r.codigo && precioPorCodigo[r.os + '||' + r.codigo] !== undefined) {
      nuevo = precioPorCodigo[r.os + '||' + r.codigo];
    } else {
      nuevo = precioNuevo[r.os + '||' + r.prestacion];
    }
    // 3º si es una consulta y no matcheó por texto, repreciar por OS + plan
    if ((nuevo === undefined || nuevo === 'AMBIGUO') && esConsultaReg(r)) {
      const planReg = (String(r.plan || '').match(/([0-9a-z]+)/i) || [])[1] || '';
      const porPlan = precioConsulta[r.os + '||' + planReg.toLowerCase()];
      if (porPlan !== undefined && porPlan !== 'AMBIGUO') {
        nuevo = porPlan;
      } else if (consultasPorOS[r.os] && consultasPorOS[r.os].size === 1) {
        // la OS tiene un único valor de consulta (sin planes) → usarlo
        nuevo = [...consultasPorOS[r.os]][0];
      }
    }
    if (nuevo === undefined || nuevo === 'AMBIGUO') {
      // no se encontró, o la desc es ambigua (varios precios) → a confirmar, no tocar
      if (nuevo === 'AMBIGUO') diferencias.push({ r, actual: r.valorUnit, sugerido: null, ambiguo: true });
      return;
    }
    if (r.valorUnit !== nuevo) {
      // la atención usa un valor distinto al de config → actualizar al de config
      r.valorUnit = nuevo; r.partEfVal = nuevo; r.partTrVal = nuevo; actualizadas++;
    }
  });

  // 4) Avisar de las prestaciones ambiguas (mismo nombre, distinto precio) para revisar a mano
  if (diferencias.length > 0) {
    const lista = diferencias.slice(0, 20).map(d =>
      `• ${d.r.fecha} · ${d.r.os} · ${d.r.prestacion}: revisar manualmente (varias con igual nombre)`
    ).join('\n');
    const extra = diferencias.length > 20 ? `\n…y ${diferencias.length - 20} más.` : '';
    alert(`Hay ${diferencias.length} atención(es) con nombres repetidos que conviene revisar a mano:\n\n${lista}${extra}`);
  }

  marcarCambios('prestaciones');
  if (actualizadas > 0) marcarCambios('registros');

  renderConfiguracion && renderConfiguracion();
  initDashboard && initDashboard();

  if (!sb) {
    showToastSafe(`✓ Precios actualizados (${actualizadas} atenciones recalculadas). Se guardarán al sincronizar.`);
    return;
  }

  // Subir por el camino SEGURO (guardarEnNube): upsert + borrado por snapshot + dedupe.
  // ANTES se hacía delete() de TODO el nomenclador y después re-subir: si la subida fallaba
  // a mitad, quedaban borradas todas las prestaciones de la nube. Ya no.
  showToastSafe('Actualizando precios en la nube…');
  const ok = await guardarEnNube(true);
  showToastSafe(ok
    ? `✓ Precios actualizados en la nube · ${actualizadas} atenciones recalculadas desde ${vigencia}`
    : '⚠️ No se pudieron actualizar los precios ahora. Se reintenta solo; revisá la conexión.');
}

// ── Red de seguridad de guardado ───────────────────────────────────────────
// Aunque una función se olvide de llamar marcarCambios, este mecanismo compara
// un "snapshot" de cada colección con lo último que se guardó. Si detecta una
// diferencia no marcada, la marca y la guarda. Así nada se pierde en silencio.
let _snapshot = {};
let _snapshotConfig = '';   // snapshot de DB.config (va en app_meta, NO es una colección)
function _hashColeccion(c) {
  try { return JSON.stringify(DB[c] || []); } catch (e) { return ''; }
}
function _guardarSnapshot(cols) {
  // Si se pasan colecciones, snapshotea SOLO esas (para no marcar como "guardado" algo
  // que cambió durante un guardado en vuelo y todavía no se subió). Sin argumento: todas.
  (cols || COLECCIONES).forEach(c => { _snapshot[c] = _hashColeccion(c); });
  // config siempre: guardarEnNube SIEMPRE sube meta (config/nextId), así que tras cada
  // guardado el snapshot de config queda al día.
  try { _snapshotConfig = JSON.stringify(DB.config || {}); } catch (e) { _snapshotConfig = ''; }
}
function _chequearCambiosNoMarcados() {
  if (!sb) return;
  let detecto = false;
  COLECCIONES.forEach(c => {
    const actual = _hashColeccion(c);
    if (_snapshot[c] !== undefined && _snapshot[c] !== actual && !cambiosPendientes.dirty.has(c)) {
      marcarCambios(c);  // cambio que nadie marcó → marcarlo ahora
      detecto = true;
    }
  });
  // config (honorario OS, valor de consulta particular) también: cambia DB.config sin ser
  // una colección. Sin esto, cambiar los valores globales no se detecta ni se guarda.
  let cfgActual = '';
  try { cfgActual = JSON.stringify(DB.config || {}); } catch (e) {}
  if (_snapshotConfig !== '' && _snapshotConfig !== cfgActual) {
    marcarCambios();   // agenda un guardado (guardarEnNube sube meta/config)
    detecto = true;
  }
  return detecto;
}

// IDs de una colección guardados en el último snapshot (lo que sabíamos que existía
// en la nube tras la última carga/guardado). Sirve para el BORRADO SEGURO.
function _idsSnapshot(c) {
  const ids = new Set();
  try { JSON.parse(_snapshot[c] || '[]').forEach(it => { if (it && it.id != null) ids.add(it.id); }); } catch (e) {}
  return ids;
}

// Deduplica filas {coleccion, doc_id, data} por (coleccion, doc_id). Gana la ÚLTIMA.
// CRÍTICO: si dos filas tienen la misma clave, Postgres falla el upsert con
// "ON CONFLICT DO UPDATE command cannot affect row a second time" (código 21000) y
// NO se guarda NADA (aparece como "error de conexión"). Esto lo evita siempre.
function _dedupeFilas(filas) {
  const map = new Map();
  for (const f of filas) map.set(f.coleccion + ':' + f.doc_id, f);
  const out = [...map.values()];
  if (out.length < filas.length) {
    console.warn(`⚠️ Se encontraron ${filas.length - out.length} fila(s) con id repetido; se deduplicaron antes de guardar (gana la última). Revisar ids duplicados en los datos.`);
  }
  return out;
}

async function guardarEnNube(automatico = false) {
  // MODO SOLO LECTURA: guardado bloqueado, imposible escribir en la nube.
  if (_soloLectura) { if (!automatico) showToastSafe('🔒 Modo solo lectura: el guardado está bloqueado.'); return; }
  if (!sb) { if (!automatico) showToastSafe('No conectado a la nube.'); return; }
  // SEGURIDAD: nunca guardar si los datos no se cargaron bien (evita pisar la nube
  // con datos semilla/incompletos). Esta es la principal causa de pérdidas.
  if (!datosCargados) {
    console.warn('Guardado cancelado: los datos no se cargaron desde la nube.');
    if (!automatico) showToastSafe('⚠️ No se guardó: los datos no se cargaron bien. Recargá la página.');
    return;
  }
  _chequearCambiosNoMarcados();  // capturar cambios profundos antes de guardar
  const dirty = [...cambiosPendientes.dirty];
  _actualizarIndicadorGuardado('guardando');
  try {
    // 1) Subir SOLO las colecciones modificadas (mucho más rápido que subir todo).
    //    Se deduplica por (coleccion, doc_id) para no disparar el error 21000 de Postgres.
    const upsertsRaw = [];
    dirty.forEach(c => {
      (DB[c] || []).forEach(item => {
        if (item && item.id != null) upsertsRaw.push({ coleccion: c, doc_id: item.id, data: item });
      });
    });
    const upserts = _dedupeFilas(upsertsRaw);
    for (let i = 0; i < upserts.length; i += 500) {
      const lote = upserts.slice(i, i + 500);
      const { error } = await sb.from('app_data').upsert(lote, { onConflict: 'coleccion,doc_id' });
      if (error) throw error;
    }

    // 2) BORRADO SEGURO: borrar de la nube SOLO lo que el usuario eliminó en esta
    //    sesión (estaba en el snapshot y ya no está local). NUNCA se borra algo que
    //    no estaba en nuestro snapshot (ej: registros que cargó otro usuario, o una
    //    carga que vino incompleta). Así no se pierde info ya sincronizada.
    const aBorrar = [];
    dirty.forEach(c => {
      const localIds = new Set((DB[c] || []).filter(it => it && it.id != null).map(it => it.id));
      _idsSnapshot(c).forEach(id => { if (!localIds.has(id)) aBorrar.push([c, id]); });
    });
    for (const [coleccion, doc_id] of aBorrar) {
      const { error } = await sb.from('app_data').delete().eq('coleccion', coleccion).eq('doc_id', Number(doc_id));
      if (error) throw error;
    }

    // 3) Meta (config, nextId)
    await sb.from('app_meta').upsert([
      { clave: 'config', valor: DB.config },
      { clave: 'nextId', valor: DB.nextId }
    ], { onConflict: 'clave' });

    // Limpiar/snapshotear SOLO las colecciones que efectivamente subimos. Si el usuario
    // cambió OTRA colección DURANTE este guardado (la red tarda), queda en dirty y con su
    // snapshot viejo → se guarda en la próxima vuelta. Así no se pierde en silencio.
    dirty.forEach(c => cambiosPendientes.dirty.delete(c));
    _guardarSnapshot(dirty);
    const quedanCambios = cambiosPendientes.dirty.size > 0;
    if (quedanCambios) {
      _actualizarIndicadorGuardado('pendiente');
    } else {
      _ultimoGuardadoOk = new Date();
      _actualizarIndicadorGuardado('ok');
    }
    if (!automatico) showToastSafe('✓ Cambios guardados en la nube');
    // Si quedaron cambios de durante el guardado, agendar otra pasada para no esperar.
    if (quedanCambios && autosaveActivo) { if (autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => guardarEnNube(true), 300); }
    return true;   // éxito (para callers que necesiten saberlo, ej. el reprecio)
  } catch (e) {
    console.error('Error guardando:', e);
    _actualizarIndicadorGuardado('error');
    showToastSafe('⚠️ No se pudo guardar. Revisá tu conexión e intentá de nuevo.');
    // Si falló el autosave, reintenta una vez en 10s
    if (automatico) { if (autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => guardarEnNube(true), 10000); }
    return false;  // falló
  }
}

// — Flush de salida (BEST-EFFORT, red de último momento): al cerrar la pestaña, el
//   guardado async puede no completar; esto manda los cambios con fetch keepalive
//   (sobrevive al cierre). Solo HACE UPSERT (nunca borra) → no puede corromper.
//
//   LÍMITES CONOCIDOS (por eso es best-effort, NO un guardado garantizado):
//   - El token cacheado (_accessToken) puede estar VENCIDO en sesiones largas
//     (~1 h) → el POST daría 401 y se pierde en silencio. El guardado primario es
//     el async de guardarEnNube (refresca token); esto es solo respaldo.
//   - keepalive tiene un tope de cuerpo (~64 KB): si el payload es grande, el
//     navegador lo descarta. Por eso, si es grande, NO intentamos por acá y
//     dejamos que el guardado async (disparado en el mismo handler) se ocupe.
//   - No está verificado contra el Supabase real (en modo edición sb=null).
const KEEPALIVE_MAX_BYTES = 60000;  // margen bajo el límite del navegador (~64 KB)
function flushKeepalive() {
  if (_soloLectura) return;   // modo solo lectura: nunca escribe
  if (!sb || !datosCargados || !_accessToken) return;
  if (cambiosPendientes.dirty.size === 0) return;
  const rowsRaw = [];
  cambiosPendientes.dirty.forEach(c => {
    (DB[c] || []).forEach(item => { if (item && item.id != null) rowsRaw.push({ coleccion: c, doc_id: item.id, data: item }); });
  });
  const rows = _dedupeFilas(rowsRaw);  // evita el error 21000 (clave repetida)
  if (rows.length === 0) return;
  const body = JSON.stringify(rows);
  if (body.length > KEEPALIVE_MAX_BYTES) return;  // demasiado grande para keepalive → lo cubre el async
  try {
    fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=coleccion,doc_id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + _accessToken,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body,
    });
  } catch (e) {}
}

// — Traer cambios del otro usuario (recarga manual) —
async function traerCambiosNube() {
  if (!sb) return;
  if (cambiosPendientes.dirty.size > 0) {
    if (!confirm('Tenés cambios sin guardar. Si traés los cambios de la nube, se perderán los tuyos. ¿Continuar?')) return;
  }
  try {
    await cargarDesdeNube();
    initDashboard();
    showToastSafe('✓ Datos actualizados desde la nube');
  } catch (e) { showToastSafe('⚠️ No se pudieron traer los cambios.'); }
}

// — Arranque: ¿hay sesión activa? —
async function arranque() {
  // MODO SOLO LECTURA / EXPORTAR BACKUP (prioridad sobre DEV_SIN_LOGIN): login REAL,
  // carga real desde la nube, pero guardado BLOQUEADO. Ver MODO_EXPORTAR_BACKUP.
  if (MODO_EXPORTAR_BACKUP) {
    _soloLectura = true;
    autosaveActivo = false;
    _mostrarBannerSoloLectura();
    if (!initSupabase()) return;
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { await onLoginOk(); }
      else { loginLoading(false); }
    } catch (e) { loginLoading(false); }
    return;
  }
  // MODO DEV SIN LOGIN: saltar el login y correr con datos semilla, sin conectarse
  // a la nube (no toca producción). TEMPORAL mientras se edita. Ver DEV_SIN_LOGIN.
  if (DEV_SIN_LOGIN) {
    sb = null;                 // sin nube → marcarCambios/guardarEnNube no hacen nada
    autosaveActivo = false;    // no autoguardar
    const ls = document.getElementById('login-screen');
    if (ls) ls.style.display = 'none';
    if (!appIniciada) { init(); appIniciada = true; }
    showToastSafe('🧪 Modo edición sin login (sin nube). Reactivar el login antes de publicar.');
    return;
  }
  if (!initSupabase()) return;  // si no carga el SDK, queda la pantalla de login con el error
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) { await onLoginOk(); }
    else { loginLoading(false); }  // mostrar login
  } catch (e) { loginLoading(false); }
}

// Red de seguridad: avisar/guardar si se cierra con cambios sin guardar
window.addEventListener('beforeunload', (e) => {
  if (sb) {
    _chequearCambiosNoMarcados();  // capturar cambios profundos (ej: prácticas) que no quedaron marcados
    if (cambiosPendientes.dirty.size > 0) {
      // Flush con keepalive (sobrevive al cierre) + intento normal. Y avisar al usuario.
      try { flushKeepalive(); } catch (err) {}
      try { guardarEnNube(true); } catch (err) {}
      e.preventDefault();
      e.returnValue = 'Tenés cambios sin guardar. Si salís ahora podés perderlos.';
      return e.returnValue;
    }
  }
});

// Guardar cuando la página pasa a segundo plano (cambiar de pestaña, minimizar,
// bloquear el teléfono o cerrar la app en el celular). Es más confiable que
// beforeunload para llegar a completar el guardado en la nube.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && sb) {
    _chequearCambiosNoMarcados();  // capturar cambios profundos antes de ocultar
    if (cambiosPendientes.dirty.size > 0) {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      try { flushKeepalive(); } catch (err) {}
      try { guardarEnNube(true); } catch (err) {}
    }
  }
});

// Lanzar el arranque cuando cargue la página
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', arranque);
} else {
  arranque();
}
