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
  // Poller de concurrencia: avisa si otra sesión guarda cambios (una sola vez).
  if (sb && !_soloLectura && !_syncPollTimer) _syncPollTimer = setInterval(_pollSyncTick, 40000);
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

// ── AVISO DE CAMBIOS DE OTRA SESIÓN (concurrencia multiusuario) ──────────────
// No es sincronización en vivo (eso es un cambio mayor). Es un chequeo liviano: cada
// guardado deja en app_meta un "syncTick" = { token, by:sessionId } con un token ALEATORIO
// nuevo por guardado. Un poller lee ese único registro cada 40 s; si el token es distinto
// al último visto y lo escribió OTRA sesión, muestra un banner para traer los cambios.
// Se compara por IGUALDAD de token (no por timestamp) a propósito: los relojes de cada
// equipo pueden estar desfasados, y ordenar por "más nuevo" con wall-clock de máquinas
// distintas daría falsos negativos (un cambio real de una máquina con reloj atrasado se
// vería "más viejo" y no avisaría). La igualdad de token es inmune a eso.
const _sessionId = ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2)) + '-' + Date.now();
let _syncToken = null;      // último token de syncTick conocido (nuestro o ya avisado)
let _syncPollTimer = null;

// Decisión PURA (testeable): ¿el tick remoto es de OTRA sesión y con un token DISTINTO al
// último que vimos? Sin comparar timestamps (inmune al desfase de relojes entre equipos).
function _hayCambiosDeOtraSesion(remoteTick, tokenVisto, miSession) {
  if (!remoteTick || !remoteTick.token) return false;
  if (remoteTick.by === miSession) return false;   // fue nuestra propia sesión
  return remoteTick.token !== tokenVisto;
}

// Banner NO bloqueante: avisa que otra sesión guardó y ofrece traer los cambios.
function _mostrarBannerCambiosNube() {
  if (document.getElementById('banner-cambios-nube')) return;   // ya visible
  const b = document.createElement('div');
  b.id = 'banner-cambios-nube';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#1d4ed8;color:#fff;' +
    'padding:8px 12px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.25);' +
    'display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;';
  const txt = document.createElement('span');
  txt.textContent = '🔄 Otra sesión cargó o modificó datos. Traé los cambios para no trabajar sobre información vieja.';
  const btnTraer = document.createElement('button');
  btnTraer.textContent = 'Traer cambios ahora';
  btnTraer.style.cssText = 'background:#fff;color:#1d4ed8;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer;';
  btnTraer.onclick = async () => { b.remove(); try { await traerCambiosNube(); } catch (e) {} };
  const btnCerrar = document.createElement('button');
  btnCerrar.textContent = '✕';
  btnCerrar.title = 'Cerrar (podés traerlos más tarde con “Traer cambios de la nube”)';
  btnCerrar.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:6px;padding:4px 8px;cursor:pointer;';
  btnCerrar.onclick = () => b.remove();
  b.appendChild(txt); b.appendChild(btnTraer); b.appendChild(btnCerrar);
  (document.body || document.documentElement).prepend(b);
}

// Lee el syncTick remoto y, si corresponde, avisa. Read-only salvo el propio guardado.
async function _pollSyncTick() {
  if (!sb || !datosCargados || _soloLectura) return;
  try {
    const { data, error } = await sb.from('app_meta').select('valor').eq('clave', 'syncTick').maybeSingle();
    if (error || !data) return;
    if (_hayCambiosDeOtraSesion(data.valor, _syncToken, _sessionId)) {
      _syncToken = data.valor.token;   // no volver a avisar por el mismo cambio
      _mostrarBannerCambiosNube();
    }
  } catch (e) {}
}

// — Cargar todo desde Supabase. Si está vacío, hace el seed inicial. —
async function cargarDesdeNube() {
  // ── CARGA PAGINADA Y VERIFICADA (crítico) ──────────────────────────────────
  // Supabase/PostgREST corta en 1000 filas por defecto. Sin paginar, una base con más de
  // 1000 filas cargaba INCOMPLETA en silencio: la app mostraba/exportaba/guardaba una
  // versión recortada y podía pisar la nube. Ahora se trae TODO de a tandas y se VERIFICA
  // contra el total real (count). Si la carga vino incompleta, se aborta (throw) y NO se
  // arranca la app → ningún guardado puede pisar la nube con datos parciales.
  const PAGE = 1000;
  let filas = [], desde = 0, total = null;
  while (true) {
    const { data, error, count } = await sb.from('app_data')
      .select('coleccion, doc_id, data', { count: 'exact' })
      .order('id', { ascending: true })
      .range(desde, desde + PAGE - 1);
    if (error) throw error;
    if (total === null) total = count;
    filas = filas.concat(data || []);
    if (!data || data.length < PAGE) break;   // última tanda
    desde += PAGE;
  }
  if (total != null && filas.length < total) {
    throw new Error(`Carga incompleta: se trajeron ${filas.length} de ${total} filas de la nube. ` +
      `No se arranca la app para NO pisar la nube con datos parciales. Reintentá (revisá la conexión).`);
  }
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
  // Meta (config, nextId, syncTick)
  (metas || []).forEach(m => {
    if (m.clave === 'config') DB.config = m.valor;
    if (m.clave === 'nextId') DB.nextId = m.valor;
    // syncTick que ya existía al cargar: registrar su token como "visto" para no auto-avisar.
    if (m.clave === 'syncTick' && m.valor && m.valor.token) _syncToken = m.valor.token;
  });
  cambiosPendientes.dirty.clear();
  const corrigioNextId = _corregirNextId();   // nextId nunca puede quedar por detrás del id más alto en uso
  _guardarSnapshot();  // base de comparación para la red de seguridad
  datosCargados = true;  // carga exitosa: ya es seguro guardar
  // Si hubo que corregir el nextId, agendar un guardado para persistir el valor sano
  // en la nube (guardarEnNube siempre sube meta/config, que incluye nextId).
  if (corrigioNextId) marcarCambios();
}

// Autocorrección de nextId: es el contador para el próximo id. Si por cualquier
// motivo quedó por detrás del id más alto realmente en uso (p. ej. datos importados
// o dos sesiones que incrementaron en paralelo), la próxima alta generaría un id que
// choca con uno existente y rompe el guardado en la nube. Acá se recalcula sobre TODAS
// las colecciones y se deja siempre en máx(id) + 1. Se llama en cada carga, así se
// autorrepara solo. Devuelve true si tuvo que corregir.
function _corregirNextId() {
  let maxId = 0;
  COLECCIONES.forEach(c => (DB[c] || []).forEach(it => {
    const n = Number(it && it.id);
    if (!isNaN(n) && n > maxId) maxId = n;
  }));
  if ((DB.nextId || 0) <= maxId) {
    DB.nextId = maxId + 1;
    return true;
  }
  return false;
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

// ── CONTROL para operaciones sensibles: verificar que las prestaciones locales estén
//    realmente en la NUBE, iguales (mismos ids, códigos y valores). Se usa después de
//    importar o actualizar un contrato. Primero fuerza el guardado de lo pendiente y
//    después LEE la nube y compara. Devuelve un detalle de discrepancias.
async function verificarSyncPrestaciones(osFiltro) {
  if (!sb) return { ok: false, error: 'No conectado a la nube.' };
  // Asegurar que todo lo pendiente se guardó antes de comparar.
  if (cambiosPendientes.dirty.size) {
    const ok = await guardarEnNube(false);
    if (!ok) return { ok: false, error: 'No se pudo guardar antes de verificar. Revisá la conexión.' };
  }
  // Paginado (igual que cargarDesdeNube): si hay más de 1000 prestaciones, sin paginar el
  // conteo de la nube saldría capado en 1000 y la verificación daría un falso "no coincide".
  let data = [], _d = 0; const _P = 1000;
  while (true) {
    const { data: pag, error } = await sb.from('app_data').select('doc_id, data')
      .eq('coleccion', 'prestaciones').order('id', { ascending: true }).range(_d, _d + _P - 1);
    if (error) return { ok: false, error: error.message };
    data = data.concat(pag || []);
    if (!pag || pag.length < _P) break;
    _d += _P;
  }

  const filtra = (p) => p && (!osFiltro || p.os === osFiltro);
  const nubeArr  = (data || []).map(r => r.data).filter(filtra);
  const localArr = (DB.prestaciones || []).filter(filtra);
  const nubeById  = new Map(nubeArr.map(p => [p.id, p]));
  const localById = new Map(localArr.map(p => [p.id, p]));

  // faltan = local pero NO en la nube (no subieron). sobran = en la nube pero ya no local
  // (no se borraron). distintos = mismo id pero código/valor/desc distintos (no se actualizó).
  const faltan    = localArr.filter(p => !nubeById.has(p.id));
  const sobran    = nubeArr.filter(p => !localById.has(p.id));
  const distintos = localArr.filter(p => {
    const n = nubeById.get(p.id);
    return n && ((n.valOS || 0) !== (p.valOS || 0) || n.codigo !== p.codigo || n.desc !== p.desc);
  });
  // Ids inválidos locales (null/NaN) que romperían el guardado — los flagueamos aparte.
  const idsInvalidos = localArr.filter(p => p.id == null || isNaN(Number(p.id)));

  return {
    ok: faltan.length === 0 && sobran.length === 0 && distintos.length === 0 && idsInvalidos.length === 0,
    local: localArr.length, nube: nubeArr.length,
    faltan, sobran, distintos, idsInvalidos,
  };
}

// ── FUENTE ÚNICA del reprecio de atenciones ──────────────────────────────────
// Construye los índices desde DB.prestaciones (config = fuente de verdad): por código
// (os+código), por descripción (os+desc) y por consulta (os+plan). Para cada clave guarda
// { val, exenta } (la exención sale de exentaPrestacion: override o default de la OS).
// Marca 'AMBIGUO' cuando la misma clave tiene más de un valor (idem para la exención).
function _indicesPrecioPrestaciones() {
  const porDesc = {}, porCodigo = {}, porConsulta = {}, consultasPorOS = {};
  const set = (mapa, k, val, ex) => {
    if (mapa[k] === undefined) { mapa[k] = { val, exenta: ex }; }
    else {
      if (mapa[k].val !== val) mapa[k].val = 'AMBIGUO';
      if (mapa[k].exenta !== ex) mapa[k].exenta = 'AMBIGUO';
    }
  };
  const exOf = (p) => (typeof exentaPrestacion === 'function') ? exentaPrestacion(p) : !!p.exenta;
  (DB.prestaciones || []).forEach(p => {
    const ex = exOf(p);
    set(porDesc, p.os + '||' + p.desc, p.valOS, ex);
    if (p.codigo) set(porCodigo, p.os + '||' + p.codigo, p.valOS, ex);
    if (typeof esConsulta === 'function' && esConsulta(p.desc)) {
      const mPlan = (p.desc.match(/plan\s*([0-9a-z]+)/i) || [])[1] || '';
      set(porConsulta, p.os + '||' + mPlan.toLowerCase(), p.valOS, ex);
      (consultasPorOS[p.os] = consultasPorOS[p.os] || new Set()).add(p.valOS);
    }
  });
  return { porDesc, porCodigo, porConsulta, consultasPorOS };
}

// Reprecia las atenciones (registros) DESDE la vigencia (mes AAAA-MM o fecha AAAA-MM-DD)
// en adelante, con los valores actuales de config. Además ARRASTRA el IVA (exención) del
// contrato: si el nomenclador define para esa prestación una exención distinta a la que
// tiene la atención, se actualiza (así un cambio de IVA del contrato llega a las atenciones
// del mes). Si osFiltro se pasa, solo esa OS. Particular y CEMEPLA no se tocan.
// Devuelve { actualizadas, ivaCambiado, ambiguas:[reg], noEncontradas:[reg] } sin guardar.
function _repreciarRegistros(vigencia, osFiltro) {
  const vigDesde = (vigencia && vigencia.length === 7) ? vigencia + '-01' : vigencia;  // "YYYY-MM" → primer día
  const { porDesc, porCodigo, porConsulta, consultasPorOS } = _indicesPrecioPrestaciones();
  let actualizadas = 0, ivaCambiado = 0;
  const ambiguas = [], noEncontradas = [];
  (DB.registros || []).forEach(r => {
    if (r.os === 'Particular' || r.os === 'CEMEPLA') return;
    if (osFiltro && r.os !== osFiltro) return;
    if (!r.fecha || (vigDesde && r.fecha < vigDesde)) return;   // anteriores a la vigencia: intactas
    // 1º por código (robusto), 2º por descripción → trae { val, exenta }
    let m;
    if (r.codigo && porCodigo[r.os + '||' + r.codigo] !== undefined) m = porCodigo[r.os + '||' + r.codigo];
    else m = porDesc[r.os + '||' + r.prestacion];
    // 3º consulta sin match por texto: por OS + plan, o el único valor de consulta de la OS
    if ((m === undefined || m.val === 'AMBIGUO') && typeof esConsultaReg === 'function' && esConsultaReg(r)) {
      const planReg = (String(r.plan || '').match(/([0-9a-z]+)/i) || [])[1] || '';
      const porPlan = porConsulta[r.os + '||' + planReg.toLowerCase()];
      if (porPlan !== undefined && porPlan.val !== 'AMBIGUO') m = porPlan;
      else if (consultasPorOS[r.os] && consultasPorOS[r.os].size === 1) m = { val: [...consultasPorOS[r.os]][0], exenta: 'AMBIGUO' };
    }
    if (m === undefined) { noEncontradas.push(r); return; }
    if (m.val === 'AMBIGUO') { ambiguas.push(r); return; }
    // Valor
    if (r.valorUnit !== m.val) { r.valorUnit = m.val; r.partEfVal = m.val; r.partTrVal = m.val; actualizadas++; }
    // IVA (exención): solo si el contrato la define sin ambigüedad y difiere de la actual.
    if (m.exenta !== undefined && m.exenta !== 'AMBIGUO') {
      const actualEx = (typeof exentaReg === 'function') ? exentaReg(r, r.os) : !!r.exenta;
      if (actualEx !== m.exenta) { r.exenta = m.exenta; ivaCambiado++; }
    }
  });
  return { actualizadas, ivaCambiado, ambiguas, noEncontradas };
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

  // Config es la fuente de verdad; NO se reemplaza el catálogo. Se re-aplican esos
  // valores a las atenciones de OS desde la vigencia (fuente única _repreciarRegistros).
  marcarCambios('prestaciones');
  const { actualizadas, ivaCambiado, ambiguas } = _repreciarRegistros(vigencia, null);   // null = todas las OS

  // Avisar de las prestaciones ambiguas (mismo nombre, distinto precio) para revisar a mano
  if (ambiguas.length > 0) {
    const lista = ambiguas.slice(0, 20).map(r =>
      `• ${r.fecha} · ${r.os} · ${r.prestacion}: revisar manualmente (varias con igual nombre)`
    ).join('\n');
    const extra = ambiguas.length > 20 ? `\n…y ${ambiguas.length - 20} más.` : '';
    alert(`Hay ${ambiguas.length} atención(es) con nombres repetidos que conviene revisar a mano:\n\n${lista}${extra}`);
  }

  if (actualizadas > 0 || ivaCambiado > 0) marcarCambios('registros');

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

    // 3) Meta (config, nextId) — CAMINO CRÍTICO. Solo estas dos claves, sin nada nuevo
    //    que pueda hacer fallar el guardado real de datos.
    await sb.from('app_meta').upsert([
      { clave: 'config', valor: DB.config },
      { clave: 'nextId', valor: DB.nextId }
    ], { onConflict: 'clave' });

    // 4) syncTick (aviso de concurrencia): BEST-EFFORT, en su PROPIO upsert y con try/catch,
    //    para que un fallo (RLS que no acepte el clave, red, etc.) NUNCA rompa el guardado de
    //    datos, que en este punto ya está confirmado. No se await-ea (no suma latencia al save).
    try {
      const _tok = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (String(Math.random()).slice(2) + Date.now());
      _syncToken = _tok;   // nuestro propio guardado: no debe auto-avisarnos
      sb.from('app_meta').upsert([{ clave: 'syncTick', valor: { token: _tok, by: _sessionId } }], { onConflict: 'clave' }).then(null, () => {});
    } catch (e) {}

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
