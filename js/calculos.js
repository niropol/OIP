// ═══════════════════════════════════════════════════════════════════════════
//  CÁLCULOS PUROS — lógica de negocio de facturación, IVA, copagos y honorarios
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2 (modularización). El comportamiento es
//  idéntico: el código se movió tal cual, sin cambiar la lógica.
//
//  Dependencias globales (siguen viviendo en index.html, se resuelven en tiempo
//  de ejecución porque todos los <script> comparten el scope global):
//    - DB (objeto de estado: usa DB.config en cálculos de Particular/honorarios)
//    - OS_GRAVADAS_SIEMPRE  (Set)
//    - esConsulta(desc), getExentaForOS(os)  (funciones)
//  Estas funciones y la constante OS_COPAGO_ADELANTO quedan globales para que el
//  resto de index.html y los onclick del HTML las sigan usando igual que antes.
// ═══════════════════════════════════════════════════════════════════════════

// ── FUENTE ÚNICA de qué estados de factura cuentan como "pendiente de cobro" ──
// Se encontraron 2 lugares que usaban una lista distinta (a mano) y por eso el
// "Cobros pendientes" no coincidía entre pantallas: Finanzas excluía Preliquidada,
// Dashboard excluía Vencida. Usar SIEMPRE esta constante/función en vez de escribir
// el array de estados de nuevo.
const ESTADOS_FACTURA_PENDIENTE = ['Pendiente', 'Vencida', 'Preliquidada'];
function facturaPendiente(f) { return ESTADOS_FACTURA_PENDIENTE.includes(f.estado); }

function esConsultaReg(r) {
  if (r.os === 'Particular') return true;      // particulares siempre cuentan como consultas
  const desc = (r.prestacion || r.desc || '').trim();
  if (!desc) return true;                       // sin descripción → asumir consulta (compat.)
  if (/^\$[\d.,]+$/.test(desc)) return true;   // precio mal guardado → asumir consulta
  if (/^\d[\d.,]+$/.test(desc)) return true;   // número solo → asumir consulta
  return esConsulta(desc);
}

// ── FUENTE ÚNICA de la CATEGORÍA de una prestación: consulta / estudio / practica ──
// Los ESTUDIOS se reconocen por estas palabras clave (lista definida por el usuario).
// Se comparan normalizadas (minúsculas, sin acentos). Los tokens cortos (oct, ubm,
// hrt, rfg) se buscan como palabra entera para no matchear adentro de otras
// ("doctor" contiene "oct" pero no es un estudio).
const ESTUDIO_KEYWORDS = [
  'topografia', 'tomografia', 'campo visual', 'campimetria', 'paquimetria',
  'estudio', 'iol master', 'recuento', 'pentacam', 'ultrabiomicroscopia',
  'ecografia', 'ecometria', 'interferometria', 'angiografia', 'papilografia',
  // segunda tanda del usuario (2026-07): con 'ejercicio' se cubren singular y plural;
  // 'fondo de ojo' también matchea "fondo de ojos"; electrorretinograma va con las
  // dos grafías (una y dos r); autorrefractometría idem; 'oftalmoscop' cubre
  // oftalmoscopia/oftalmoscópica; 'potencial' cubre "potenciales evocados";
  // 'curva tensiones' explícita además del token 'curva'.
  'autorrefractometr', 'autorefractometr', 'ejercicio', 'oftalmoscop',
  'fondo de ojo', 'electrorretinograma', 'electroretinograma', 'especular',
  'retinografia', 'potencial', 'iconografia', 'curva tensiones',
];
// Tokens cortos o palabras comunes: SOLO como palabra entera (\b), para no matchear
// adentro de otras ("doctor"→oct, "armazón"→arm, "curvatura"→curva, "testigo"→test).
const ESTUDIO_TOKENS = ['oct', 'ubm', 'hrt', 'rfg', 'arm', 'obi', 'test', 'curva', 'curvas'];

function _normCat(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Categoría a partir de la DESCRIPCIÓN: 'consulta' | 'estudio' | 'practica'
function categoriaDesc(desc) {
  if (esConsulta(desc)) return 'consulta';
  const d = _normCat(desc);
  if (ESTUDIO_KEYWORDS.some(k => d.includes(k))) return 'estudio';
  if (ESTUDIO_TOKENS.some(t => new RegExp(`\\b${t}\\b`).test(d))) return 'estudio';
  return 'practica';
}

// Categoría de una PRESTACIÓN del nomenclador: el override p.categoria (cargado al
// importar el contrato o corregido en la tabla de Prestaciones) manda; si no, se
// detecta por la descripción.
const CATEGORIAS_VALIDAS = ['consulta', 'estudio', 'practica'];
function categoriaPrestacion(p) {
  if (CATEGORIAS_VALIDAS.includes(p.categoria)) return p.categoria;
  return categoriaDesc(p.desc);
}

// Categoría de un REGISTRO (atención): base para pagar al médico por práctica.
//  1º categoría CONGELADA al crear la atención (r.categoria) — es autoritativa.
//  2º prestación del nomenclador por (os, desc): su categoría (override incluido)
//     manda sobre la detección por texto — así, re-categorizar una prestación en el
//     nomenclador SÍ afecta a los registros viejos que la usan.
//  3º guards defensivos de consulta (precio mal guardado / número solo / sin
//     descripción → consulta), para no romper el pago de registros con datos raros.
//  4º detección por descripción.
function categoriaReg(r) {
  if (r.os === 'Particular') return 'consulta';
  if (CATEGORIAS_VALIDAS.includes(r.categoria)) return r.categoria;
  const desc = (r.prestacion || r.desc || '').trim();
  const p = (DB.prestaciones || []).find(x => x.os === r.os && x.desc === desc);
  if (p) return categoriaPrestacion(p);
  if (esConsultaReg(r)) return 'consulta';
  return categoriaDesc(desc);
}

// Cantidad de consultas OS que generan honorario médico (solo consultas).
// Usa categoriaReg (fuente única de categoría) — así, si una prestación se recategoriza
// (override en el nomenclador o categoría congelada en el registro), el pago al médico
// lo RESPETA. Antes miraba solo la descripción (esConsultaReg) e ignoraba los overrides,
// con lo que una consulta marcada como estudio seguía pagando honorario de consulta.
function cantConsultaHon(r) {
  if (r.os === 'Particular') return 0;        // particular tiene su propia lógica
  if (r.os === 'SinCargo')   return 0;        // SinCargo paga $0,1, no el honorario fijo
  return categoriaReg(r) === 'consulta' ? r.cantidad : 0;
}

// Total de atenciones para conteo (consultas OS + particulares)
function totalConsultasReg(r) {
  if (r.os === 'Particular') return r.partEfectivo + r.partTransf;
  return r.cantidad;
}

// Neto sin IVA (OS: valor × cantidad; Particular: no aplica valorUnit)
function subtotalNeto(r) {
  if (r.os === 'Particular') {
    const vEf = r.partEfVal || DB.config.valorConsultaParticular;
    const vTr = r.partTrVal || r.partEfVal || DB.config.valorConsultaParticular;
    return (r.partEfectivo || 0) * vEf + (r.partTransf || 0) * vTr;
  }
  return r.cantidad * (r.valorUnit || 0);
}

// ── FUENTE ÚNICA de la ALÍCUOTA de IVA de una OS (data-driven con fallback) ──
// Lee la alícuota de la ficha de la OS (o.alicuota en %, ej. 10.5 o 21) si está definida;
// si no, el default histórico: 21% CEMEPLA, 10.5% el resto. Devuelve la fracción (0.105/0.21).
// Así, una OS nueva o que cambió su forma de facturar puede fijar su alícuota desde la ficha,
// sin tocar código, y toda la app (IVA, totales, factura) la respeta.
function pctIVAForOS(osName) {
  const o = (typeof DB !== 'undefined' ? (DB.obrasSociales || []) : []).find(x => x.nombre === osName);
  if (o && o.alicuota != null && !isNaN(Number(o.alicuota))) return Number(o.alicuota) / 100;
  return osName === 'CEMEPLA' ? 0.21 : 0.105;
}

// Etiqueta de la alícuota de una OS ("10.5%" / "21%"), data-driven. FUENTE ÚNICA de todos
// los labels de IVA de la app (badges, toasts, desplegables), para que ninguno quede fijo
// en 10,5% cuando una OS se configura al 21%. Redondeo para evitar "10.499999%".
function pctIVALabelOS(os) { return (Math.round(pctIVAForOS(os) * 1000) / 10) + '%'; }

// IVA del registro. Exención vía exentaReg (fuente única) y alícuota vía pctIVAForOS
// (data-driven). Comportamiento idéntico al anterior para las OS existentes.
function ivaReg(r) {
  if (r.os === 'Particular') return 0;           // particular no tiene IVA
  if (exentaReg(r, r.os)) return 0;              // exento (incluye CEMEPLA→false, flags y default OS)
  return (r.cantidad || 0) * (r.valorUnit || 0) * pctIVAForOS(r.os);
}

// Total facturado con IVA
function totalReg(r) { return subtotalNeto(r) + ivaReg(r); }

// ── FUENTE ÚNICA DE VERDAD para la facturación de un registro ──
// Devuelve lo facturado por el registro, sea OS o Particular:
//  - OS: neto + IVA (totalReg)
//  - Particular: el monto cobrado (efectivo + transferencia), que va en partEf/partTr
// Usar SIEMPRE esta función para totales de facturación, así dashboard, balance,
// estadísticas y preliquidaciones nunca dan distinto.
function facturadoReg(r) {
  if (r.os === 'Particular') {
    return (r.partEfectivo || 0) * (r.partEfVal || 0) + (r.partTransf || 0) * (r.partTrVal || 0);
  }
  return totalReg(r);
}

// OS del grupo Cober donde el copago del paciente es ADELANTO del pago de la OS:
// la OS abona (valor de la prestación − copago ya cobrado al paciente).
const OS_COPAGO_ADELANTO = new Set(['Bristol', 'CoberMed', "Medical's"]);
// Data-driven con fallback: si la ficha de la OS define copagoModo ('adelanto'|'complementario'),
// manda; si no, la lista histórica. Así una OS nueva puede fijar su forma de cobro del coseguro
// desde el alta, sin tocar código.
function esCopagoAdelanto(os) {
  const o = (typeof DB !== 'undefined' ? (DB.obrasSociales || []) : []).find(x => x.nombre === os);
  if (o && o.copagoModo) return o.copagoModo === 'adelanto';
  return OS_COPAGO_ADELANTO.has(os);
}
// Monto de copago que se descuenta de lo que paga la OS para este registro.
// Solo se descuenta si es ADELANTO. Si es complementario, la OS paga el total (no se descuenta).
// Registros viejos sin copagoTipo se tratan como adelanto (comportamiento previo).
function copagoAdelantoReg(r) {
  if (!esCopagoAdelanto(r.os)) return 0;
  if (r.copagoTipo === 'complementario') return 0;
  return r.copago || 0;
}
// Lo que efectivamente debe pagar la OS por el registro (neto + IVA − adelanto de copago).
function netoOS(r) {
  return totalReg(r) - copagoAdelantoReg(r);
}

// ── FUENTE ÚNICA de exención de una PRESTACIÓN del nomenclador ──
// p.exenta (override por prestación, seteable al importar un contrato o desde la tabla
// de Prestaciones) manda si está definido; si no, el default de la OS. CEMEPLA nunca
// exenta (mismo criterio que exentaReg). Los desplegables de Atención rápida y Carga
// masiva construyen su data-exenta con esta función — antes usaban SOLO el default de
// la OS y el override por prestación no viajaba al registro creado.
function exentaPrestacion(p) {
  if (p.os === 'CEMEPLA') return false;
  return p.exenta !== undefined ? p.exenta : getExentaForOS(p.os);
}

// ── FUENTE ÚNICA del ajuste porcentual de un valor (aumentos de contrato) ──
// valor × (1 + pct/100), redondeado a 2 decimales. La usa el "Aumento por porcentaje"
// de Contratos (Configuración); está acá para que el diagnóstico la verifique y para
// que cualquier otro ajuste porcentual futuro use la misma cuenta y redondeo.
function aplicarPorcentaje(valor, pct) {
  return Math.round((valor || 0) * (1 + pct / 100) * 100) / 100;
}

// ── FUENTE ÚNICA para saber si un registro está exento de IVA ──
// CEMEPLA es SIEMPRE gravada al 21% (no exenta) — igual criterio que ivaReg(), que
// chequea CEMEPLA antes que r.exenta. Para el resto: el flag r.exenta del registro
// manda si está definido; si no, se usa el default de la OS (getExentaForOS).
// Antes esta cuenta se repetía a mano en 6 lugares y ese caso puntual (CEMEPLA con
// r.exenta=true) los hacía dar iva=0 en algunos y 21% en otros para el mismo dato.
function exentaReg(r, osName) {
  if (osName === 'CEMEPLA') return false;
  return r.exenta === true ? true : r.exenta === false ? false : getExentaForOS(osName);
}

// ── FUENTE ÚNICA de los totales de una preliquidación de OS ──
// Recibe los registros de una OS y devuelve los totales que muestran todas las
// vistas (detalle de OS, generar preliq). Evita que cada vista recalcule distinto.
//   netoExento  : suma de netos de prestaciones exentas
//   netoGravado : suma de netos de prestaciones gravadas
//   iva         : IVA de las gravadas (21% CEMEPLA, 10.5% resto)
//   total       : netoExento + netoGravado + iva
//   copagoAdelanto : copagos que se descuentan de lo que paga la OS
//   aFacturar   : total − copagoAdelanto (lo que la OS efectivamente paga)
function totalesOS(registros, osName) {
  const pctIVA = pctIVAForOS(osName);
  let netoExento = 0, netoGravado = 0, iva = 0, copagoAdelanto = 0;
  let copagoExento = 0, copagoGravadoBruto = 0;   // copago-adelanto separado por su IVA
  registros.forEach(r => {
    const exenta = exentaReg(r, osName);
    const neto = (r.cantidad || 0) * (r.valorUnit || 0);
    if (exenta) { netoExento += neto; }
    else { netoGravado += neto; iva += neto * pctIVA; }
    const cop = copagoAdelantoReg(r);
    copagoAdelanto += cop;
    // El coseguro hereda el IVA de la prestación (regla del usuario): el de una prestación
    // exenta descuenta neto puro; el de una gravada viene con IVA incluido.
    if (cop) { if (exenta) copagoExento += cop; else copagoGravadoBruto += cop; }
  });
  const total = netoExento + netoGravado + iva;   // BRUTO (antes del copago)
  // Copago-adelanto GRAVADO: viene con IVA incluido → se descompone en neto + IVA a la
  // alícuota de la OS, para descontar del bucket correcto (no todo del neto).
  const copagoGravadoNeto = copagoGravadoBruto / (1 + pctIVA);
  const copagoGravadoIVA  = copagoGravadoBruto - copagoGravadoNeto;
  // Desglose NETO de copago (lo que realmente se factura a la OS, con el IVA del coseguro
  // ya imputado a su bucket). La suma da igual que total − copagoAdelanto: el copago no
  // cambia CUÁNTO paga la OS, solo cómo se reparte exento/gravado/IVA en la factura.
  const netoExentoAFacturar  = netoExento  - copagoExento;
  const netoGravadoAFacturar = netoGravado - copagoGravadoNeto;
  const ivaAFacturar         = iva         - copagoGravadoIVA;
  const aFacturar = netoExentoAFacturar + netoGravadoAFacturar + ivaAFacturar;
  return {
    netoExento, netoGravado, iva, total, copagoAdelanto, aFacturar,
    // Desglose neto de copago-adelanto (para la factura a la OS):
    netoExentoAFacturar, netoGravadoAFacturar, ivaAFacturar,
    copagoExento, copagoGravado: copagoGravadoBruto, copagoGravadoNeto, copagoGravadoIVA, pctIVA,
  };
}

// Honorario médico GENERADO por un registro (bruto: incluye el efectivo, que se
// paga en el momento de la atención). Es el "honorario total" para dashboard,
// estadísticas y export.
// - OS consulta → honorarioOS por consulta
// - OS cirugía/estudio → 0 (suma solo a liquidación OS para facturar)
// - Particular → 50% de lo realmente COBRADO (por default es el valor estándar de
//   consulta, pero si se cobró un monto especial, el honorario es 50% de ese monto).
// - SinCargo → lo que paga el paciente ($0,1 por consulta).
// - Pago de derivación → el monto del pago (pagoExtra), que suma directo a honorarios.
// - OS estudio/práctica → según la tarifa personal del médico (honorPracticaReg).
function honorMedicoReg(r) {
  if (r.pagoExtra) return r.pagoExtra;   // pago de derivación al médico derivante
  if (r.os === 'Particular') {
    return subtotalNeto(r) / 2;   // 50% de lo cobrado (subtotalNeto usa el valor estándar como default)
  }
  if (r.os === 'SinCargo') {
    return (r.cantidad || 1) * (r.valorUnit || 0.1);
  }
  // OS: consulta paga el honorario fijo; estudio/práctica paga según la tarifa del médico.
  return cantConsultaHon(r) * DB.config.honorarioOS + honorPracticaReg(r);
}

// ── FUENTE ÚNICA del honorario del médico por un ESTUDIO o PRÁCTICA de OS ──
// Cada médico tiene su tarifa por estudio y por práctica/cirugía, editable en su ficha:
//   med.pagoEstudio  / med.pagoPractica = { modo: 'fijo' | 'pct', valor: number }
//   - 'fijo' → $ por unidad × cantidad
//   - 'pct'  → % del neto de la prestación (cantidad × valorUnit)
// Sin config o valor 0 → 0 (los estudios/prácticas no pagan nada; comportamiento previo).
// Consultas, Particular, SinCargo y pagos de derivación NO pasan por acá.
function honorPracticaReg(r, med) {
  if (r.os === 'Particular' || r.os === 'SinCargo' || r.pagoExtra) return 0;
  const cat = categoriaReg(r);
  if (cat !== 'estudio' && cat !== 'practica') return 0;
  med = med || (DB.medicos || []).find(m => m.nombre === r.medico);
  const cfg = med && (cat === 'estudio' ? med.pagoEstudio : med.pagoPractica);
  if (!cfg || !cfg.valor) return 0;
  const base = cfg.modo === 'pct'
    ? (r.cantidad || 0) * (r.valorUnit || 0) * (cfg.valor / 100)   // % del neto
    : (cfg.valor || 0) * (r.cantidad || 0);                         // $ fijo por unidad
  return Math.round(base * 100) / 100;
}

// Honorario A LIQUIDAR de un registro: lo que falta pagarle al médico. Igual al
// generado, salvo en Particular EFECTIVO, que ya se le pagó en el momento de la
// atención → solo cuenta la parte por transferencia.
function honorALiquidarReg(r) {
  if (r.os === 'Particular') {
    const vTr = r.partTrVal || r.partEfVal || DB.config.valorConsultaParticular;
    return (r.partTransf || 0) * (vTr / 2);
  }
  return honorMedicoReg(r);
}

// ── FUENTE ÚNICA de los honorarios de un médico para un conjunto de registros ──
// Evita que cada vista (panel, mensaje de cierre, desglose) recalcule distinto.
//   honOS : consultas OS × honorario fijo
//   honSC : SinCargo (lo que paga el paciente)
//   honEf : particulares en efectivo (50% de lo cobrado) — YA PAGADO en el momento
//   honTr : particulares por transferencia (50% de lo cobrado)
//   honExtra : pagos de derivación al médico derivante (pagoExtra)
//   aLiquidar : honOS + honTr + honSC + honExtra  (el efectivo NO se incluye: ya se pagó)
//   honPract : estudios/prácticas OS × tarifa del médico (honorPracticaReg)
//   aLiquidar : honOS + honTr + honSC + honExtra + honPract  (el efectivo NO: ya se pagó)
function honorariosMedico(regs) {
  let honOS = 0, honSC = 0, honEf = 0, honTr = 0, honExtra = 0, honPract = 0;
  (regs || []).forEach(r => {
    if (r.pagoExtra) {                       // pago de derivación
      honExtra += r.pagoExtra;
    } else if (r.os === 'Particular') {
      const vEf = r.partEfVal || DB.config.valorConsultaParticular;
      const vTr = r.partTrVal || r.partEfVal || DB.config.valorConsultaParticular;
      honEf += (r.partEfectivo || 0) * (vEf / 2);
      honTr += (r.partTransf || 0) * (vTr / 2);
    } else if (r.os === 'SinCargo') {
      honSC += (r.cantidad || 1) * (r.valorUnit || 0.1);
    } else {
      honOS += cantConsultaHon(r) * DB.config.honorarioOS;
      honPract += honorPracticaReg(r);
    }
  });
  return { honOS, honSC, honEf, honTr, honExtra, honPract, aLiquidar: honOS + honTr + honSC + honExtra + honPract };
}
