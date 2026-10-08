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
  // Poller de concurrencia: bloquea si otra sesión guarda cambios (una sola vez).
  if (sb && !_soloLectura && !_syncPollTimer) _syncPollTimer = setInterval(_pollSyncTick, 40000);
  // Backup diario automático (best-effort, no bloquea el arranque).
  _backupDiarioSiCorresponde();
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
let _conflictoNube = false; // true cuando otra computadora modificó datos → esta sesión NO debe guardar

// Decisión PURA (testeable): ¿el tick remoto es de OTRA sesión y con un token DISTINTO al
// último que vimos? Sin comparar timestamps (inmune al desfase de relojes entre equipos).
function _hayCambiosDeOtraSesion(remoteTick, tokenVisto, miSession) {
  if (!remoteTick || !remoteTick.token) return false;
  if (remoteTick.by === miSession) return false;   // fue nuestra propia sesión
  return remoteTick.token !== tokenVisto;
}

// Lee el syncTick remoto (el "sello" del último guardado). Devuelve el objeto {token, by},
// null si no existe, o undefined si NO se pudo leer (para no bloquear por un error de red).
async function _leerSyncTokenRemoto() {
  try {
    const { data, error } = await sb.from('app_meta').select('valor').eq('clave', 'syncTick').maybeSingle();
    if (error) return undefined;
    return data ? data.valor : null;
  } catch (e) { return undefined; }
}

// Garantiza que TODA `fecha` de las colecciones que se filtran/parsean por fecha sea un STRING.
// Muchas vistas hacen r.fecha.startsWith(mes) / r.fecha.split('-'); si una fecha viniera en
// undefined/null (import corrupto, backup editado a mano), esas llamadas tiran toda la vista.
// Normalizar a '' acá — un solo punto tras cada carga/importación — las hace seguras a todas.
function _normalizarFechasDB() {
  ['registros', 'facturas', 'movimientos', 'cajaChica', 'pagosRecibidos', 'derivaciones', 'notas', 'alarmas'].forEach(col => {
    (DB[col] || []).forEach(x => { if (x && typeof x.fecha !== 'string') x.fecha = ''; });
  });
}

function _nuevoToken() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : (String(Math.random()).slice(2) + Date.now());
}

// ── RECLAMO ATÓMICO DEL TURNO DE GUARDADO (candado anti-carrera) ──────────────
// Cambia el syncTick de `expected` (el último token que vimos) a uno nuevo, SOLO si en la
// nube sigue estando `expected`, con un UPDATE condicional (compare-and-swap). Postgres
// serializa por fila: si dos equipos guardan a la vez, uno solo gana el turno; el otro recibe
// 0 filas y debe abortar ANTES de escribir datos.
//
// FAIL-SAFE (clave por no poder probar contra la nube real desde el modo edición): si el
// mecanismo condicional falla o se comporta raro (RLS, filtro JSON no soportado, etc.), NO
// bloquea: devuelve 'fallback' y el guardado sigue con el best-effort de siempre. Solo
// devuelve 'conflict' con EVIDENCIA POSITIVA de que OTRA sesión cambió el token. Así, en el
// peor caso queda igual que hoy, nunca peor.
// Devuelve { estado:'claimed'|'conflict'|'fallback', token?, valorNuevo? }.
async function _reclamarTokenNube(expected) {
  const token = _nuevoToken();
  const valorNuevo = { token, by: _sessionId };
  // Nube fresca (nunca vimos un token): no hay slot que reclamar condicionalmente → best-effort.
  if (expected == null) return { estado: 'fallback', token, valorNuevo };
  try {
    const { data, error } = await sb.from('app_meta')
      .update({ valor: valorNuevo })
      .eq('clave', 'syncTick')
      .eq('valor->>token', expected)
      .select('clave');
    if (error) return { estado: 'fallback', token, valorNuevo };          // mecanismo no disponible
    if (data && data.length >= 1) { _syncToken = token; return { estado: 'claimed', token }; }
    // 0 filas: ¿conflicto real o el filtro condicional no matchea en este backend? Re-leer.
    const remoto = await _leerSyncTokenRemoto();
    if (remoto === undefined) return { estado: 'fallback', token, valorNuevo };   // no se pudo leer
    if (!remoto || remoto.token === expected) return { estado: 'fallback', token, valorNuevo }; // filtro roto → no bloquear
    if (remoto.by === _sessionId) { _syncToken = remoto.token; return { estado: 'fallback', token, valorNuevo }; }
    return { estado: 'conflict' };   // el token cambió y lo puso OTRA sesión → conflicto real
  } catch (e) {
    return { estado: 'fallback', token, valorNuevo };
  }
}

// DIAGNÓSTICO: confirma si el UPDATE condicional (compare-and-swap) del candado atómico
// funciona en ESTE Supabase. Usa una clave DESECHABLE (syncTickDiag) en app_meta, así nunca
// toca el sello real ni los datos (cargarDesdeNube ignora esa clave; igual se borra al final).
// Prueba: (1) escribir la clave con un token t1; (2) CAS válido t1→t2 (debe cambiar 1 fila);
// (3) CAS inválido t1→t3 con la fila ya en t2 (debe cambiar 0 filas). Solo si (2) sí y (3) no,
// el candado atómico está ACTIVO. Si no, la app sigue segura en modo compatibilidad (fallback).
async function diagnosticarCandadoAtomico() {
  if (!sb) { alert('No estás conectado a la nube (modo edición): el candado no aplica acá.'); return null; }
  const CLAVE = 'syncTickDiag';
  const t1 = _nuevoToken(), t2 = _nuevoToken(), t3 = _nuevoToken();
  try {
    const seed = await sb.from('app_meta').upsert([{ clave: CLAVE, valor: { token: t1 } }], { onConflict: 'clave' });
    if (seed.error) throw new Error('no se pudo escribir la clave de prueba (' + seed.error.message + ')');
    const okCAS = await sb.from('app_meta').update({ valor: { token: t2 } }).eq('clave', CLAVE).eq('valor->>token', t1).select('clave');
    if (okCAS.error) throw new Error('el UPDATE condicional dio error (' + okCAS.error.message + ')');
    const cambioValido   = (okCAS.data || []).length >= 1;   // debería ser true
    const badCAS = await sb.from('app_meta').update({ valor: { token: t3 } }).eq('clave', CLAVE).eq('valor->>token', t1).select('clave');
    const cambioInvalido = !badCAS.error && (badCAS.data || []).length >= 1;   // debería ser false
    try { await sb.from('app_meta').delete().eq('clave', CLAVE); } catch (_) {}
    const activo = cambioValido && !cambioInvalido;
    if (activo) {
      alert('✅ Candado atómico ACTIVO\n\nEl guardado condicional funciona en tu nube: si dos computadoras guardan al mismo instante, una sola gana el turno y la otra recarga. Protección máxima anti-pisada.');
    } else {
      const motivo = !cambioValido ? 'no aceptó un cambio que debía aceptar' : 'no rechazó un cambio que debía rechazar';
      alert('⚠️ Candado en modo compatibilidad (fallback)\n\nEl guardado condicional ' + motivo + ' en tu nube. La app sigue SEGURA: funciona como siempre, con el aviso/bloqueo de conflicto. Solo falta la protección atómica extra para el caso raro de guardado simultáneo. Avisame y lo revisamos.');
    }
    return activo;
  } catch (e) {
    try { await sb.from('app_meta').delete().eq('clave', CLAVE); } catch (_) {}
    alert('⚠️ No se pudo completar el diagnóstico: ' + (e.message || e) + '\n\nLa app sigue segura (candado en modo compatibilidad).');
    return null;
  }
}

// ── CANDADO ANTI-PISADA: bloqueo BLOQUEANTE cuando otra computadora modificó datos ──
// Reemplaza al cartel azul que se podía ignorar. Cuando se detecta que otra sesión guardó
// (en el poll o justo antes de un guardado), esta sesión queda VIEJA: no puede seguir
// guardando sin pisar información. Se muestra un modal que NO se puede cerrar; el único
// camino es recargar para traer los datos actualizados. Así es imposible pisar la nube.
function _bloquearPorConflictoNube() {
  _conflictoNube = true;
  autosaveActivo = false;                                   // cortar reintentos de autosave
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  if (_syncPollTimer) { clearInterval(_syncPollTimer); _syncPollTimer = null; }
  if (typeof document === 'undefined' || document.getElementById('overlay-conflicto-nube')) return;
  const hayPendientes = cambiosPendientes.dirty.size > 0;
  const ov = document.createElement('div');
  ov.id = 'overlay-conflicto-nube';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.78);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';
  const card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:14px;max-width:460px;width:100%;padding:24px;' +
    'box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center;';
  card.innerHTML =
    '<div style="font-size:42px;margin-bottom:6px;">🔒</div>' +
    '<div style="font-size:18px;font-weight:800;color:#b91c1c;margin-bottom:10px;">Otra computadora modificó los datos</div>' +
    '<div style="font-size:14px;color:#334155;line-height:1.55;margin-bottom:14px;">' +
      'Para no pisar información, esta sesión quedó bloqueada. Tenés que <b>recargar</b> para seguir con los datos actualizados.</div>' +
    (hayPendientes ? '<div style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:14px;">⚠️ Tenés cambios en esta pantalla que <b>NO se guardaron</b>. Anotalos (o sacale una foto) antes de recargar.</div>' : '');
  const btn = document.createElement('button');
  btn.textContent = '🔄 Recargar ahora';
  btn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:700;cursor:pointer;';
  btn.onclick = () => { try { window.location.reload(); } catch (e) {} };
  card.appendChild(btn);
  ov.appendChild(card);
  (document.body || document.documentElement).appendChild(ov);
}

// Poll: cada tanto lee el sello remoto; si otra sesión guardó, BLOQUEA y obliga a recargar.
async function _pollSyncTick() {
  if (!sb || !datosCargados || _soloLectura || _conflictoNube) return;
  const tick = await _leerSyncTokenRemoto();
  if (_hayCambiosDeOtraSesion(tick, _syncToken, _sessionId)) _bloquearPorConflictoNube();
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
      .neq('coleccion', 'backup')   // los backups diarios viven en app_data pero NO se cargan
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
  _normalizarFechasDB();   // ninguna fecha puede quedar en undefined/null (un import corrupto tiraría las vistas)
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
// { val, exenta }.
// La exención se guarda SOLO si el contrato la define EXPLÍCITAMENTE (p.exenta booleano);
// si no, queda `undefined` a propósito. Así el reprecio NO arrastra el IVA por el default de
// la OS: una atención marcada a mano (p. ej. gravada) NO se revierte a exenta al actualizar
// precios cuando el nomenclador no dice nada de su IVA. (Bug: 2 OS aparecían exentas a fin de
// mes tras un reprecio.) Marca 'AMBIGUO' cuando la misma clave tiene más de un valor.
function _indicesPrecioPrestaciones() {
  const porDesc = {}, porCodigo = {}, porConsulta = {}, consultasPorOS = {};
  const set = (mapa, k, val, ex) => {
    if (mapa[k] === undefined) { mapa[k] = { val, exenta: ex }; }
    else {
      if (mapa[k].val !== val) mapa[k].val = 'AMBIGUO';
      if (mapa[k].exenta !== ex) mapa[k].exenta = 'AMBIGUO';
    }
  };
  // SOLO el override explícito del contrato (p.exenta booleano). Si no está definido → undefined
  // (el reprecio no toca el IVA de la atención).
  const exOf = (p) => (p.exenta === true || p.exenta === false) ? p.exenta : undefined;
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
// FUENTE ÚNICA de "cuál es el precio/IVA del nomenclador para esta atención". La usan TANTO
// el reprecio como la verificación, para que nunca difieran. Devuelve { val, exenta }, o
// undefined si no hay match; val/exenta pueden ser 'AMBIGUO' (misma clave con distinto valor).
//   1º por código (os+código), 2º por descripción (os+desc),
//   3º consulta sin match de texto: por os+plan, o el único valor de consulta de la OS.
function _matchNomenclador(r, idx) {
  const { porDesc, porCodigo, porConsulta, consultasPorOS } = idx;
  let m;
  if (r.codigo && porCodigo[r.os + '||' + r.codigo] !== undefined) m = porCodigo[r.os + '||' + r.codigo];
  else m = porDesc[r.os + '||' + r.prestacion];
  if ((m === undefined || m.val === 'AMBIGUO') && typeof esConsultaReg === 'function' && esConsultaReg(r)) {
    const planReg = (String(r.plan || '').match(/([0-9a-z]+)/i) || [])[1] || '';
    const porPlan = porConsulta[r.os + '||' + planReg.toLowerCase()];
    if (porPlan !== undefined && porPlan.val !== 'AMBIGUO') m = porPlan;
    else if (consultasPorOS[r.os] && consultasPorOS[r.os].size === 1) m = { val: [...consultasPorOS[r.os]][0], exenta: 'AMBIGUO' };
  }
  return m;
}

// Devuelve { actualizadas, ivaCambiado, ambiguas:[reg], noEncontradas:[reg] } sin guardar.
// Si dryRun=true, NO modifica nada: solo cuenta cuántas atenciones cambiarían (para el preview).
function _repreciarRegistros(vigencia, osFiltro, dryRun) {
  const vigDesde = (vigencia && vigencia.length === 7) ? vigencia + '-01' : vigencia;  // "YYYY-MM" → primer día
  const idx = _indicesPrecioPrestaciones();
  let actualizadas = 0, ivaCambiado = 0;
  const ambiguas = [], noEncontradas = [];
  (DB.registros || []).forEach(r => {
    if (r.os === 'Particular' || r.os === 'CEMEPLA') return;
    if (osFiltro && r.os !== osFiltro) return;
    if (!r.fecha || (vigDesde && r.fecha < vigDesde)) return;   // anteriores a la vigencia: intactas
    const m = _matchNomenclador(r, idx);
    if (m === undefined) { noEncontradas.push(r); return; }
    if (m.val === 'AMBIGUO') { ambiguas.push(r); return; }
    // Valor (solo si CAMBIA: así "los cambios introducidos son los modificados", no se toca lo igual)
    if (r.valorUnit !== m.val) { if (!dryRun) { r.valorUnit = m.val; r.partEfVal = m.val; r.partTrVal = m.val; } actualizadas++; }
    // IVA (exención): el reprecio NUNCA lo cambia. El estado exenta/gravada de una atención es
    // decisión del usuario y es CRÍTICO para la facturación: solo se cambia si el usuario lo toca
    // (toggle en Atenciones / en la presentación de la OS, o editando la atención). Actualizar
    // precios reajusta el PRECIO, jamás el IVA. (ivaCambiado queda en 0 por compatibilidad.)
  });
  return { actualizadas, ivaCambiado, ambiguas, noEncontradas };
}

// ── VERIFICACIÓN DE PRECIOS DE LAS ATENCIONES ────────────────────────────────
// Los aumentos rigen DESDE que se cargan en adelante y se hacen SOBRE el precio anterior: por eso
// las atenciones de un mes ANTERIOR a un aumento tienen legítimamente el precio viejo (comparar
// todo contra el precio actual daría falsos positivos). Lo que SÍ es un error es que, dentro del
// MISMO mes y la MISMA OS, una misma prestación aparezca con precios DISTINTOS: eso indica un
// reprecio que quedó a medias (alguna atención se quedó con el valor viejo). Eso es lo que se
// detecta acá. NO modifica nada. Devuelve { ok, revisadas, inconsistencias }.
function verificarPreciosAtenciones(osFiltro, mesFiltro) {
  const idx = _indicesPrecioPrestaciones();
  const grupos = {};
  let revisadas = 0;
  (DB.registros || []).forEach(r => {
    if (r.os === 'Particular' || r.os === 'CEMEPLA') return;
    if (osFiltro && r.os !== osFiltro) return;
    const mes = (r.fecha || '').slice(0, 7);
    if (mesFiltro && mes !== mesFiltro) return;
    revisadas++;
    // Clave del grupo: OS + NOMBRE de la prestación + mes. Se agrupa SOLO por el nombre (que ya
    // distingue "Consulta (Plan 210)" de "Consulta (Plan 510)"), NO por código ni por el campo
    // plan: el código lo comparten varias consultas con precios distintos (falso positivo), y el
    // campo plan viene inconsistente (unas con '210', otras vacío) y partiría la misma prestación
    // en dos renglones. Con el nombre, cada prestación queda en un solo grupo por mes.
    const clavePrest = (r.prestacion || '').trim() || r.codigo || '(sin nombre)';
    const key = r.os + '||' + clavePrest + '||' + mes;
    const g = grupos[key] || (grupos[key] = { os: r.os, mes, prestacion: (r.prestacion || '').trim() || r.codigo || '', codigo: r.codigo || '', valores: {}, repr: r });
    const v = Math.round((r.valorUnit || 0) * 100) / 100;
    g.valores[v] = (g.valores[v] || 0) + 1;
  });
  const inconsistencias = [];
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    const distintos = Object.keys(g.valores);
    if (distintos.length <= 1) return;   // un solo precio en ese mes → consistente
    const m = _matchNomenclador(g.repr, idx);
    const valorNomenclador = (m && m.val !== undefined && m.val !== 'AMBIGUO') ? m.val : null;
    inconsistencias.push({
      os: g.os, mes: g.mes, prestacion: g.prestacion, codigo: g.codigo,
      valores: distintos.map(v => ({ valor: parseFloat(v), cantidad: g.valores[v] })).sort((a, b) => b.valor - a.valor),
      valorNomenclador,
    });
  });
  inconsistencias.sort((a, b) => b.mes.localeCompare(a.mes) || a.os.localeCompare(b.os));
  return { ok: inconsistencias.length === 0, revisadas, inconsistencias };
}

// ── VERIFICACIÓN DE IVA (exenta/gravada) DE LAS ATENCIONES ────────────────────
// El IVA de una prestación en una OS suele ser fijo (o toda exenta, o toda gravada). Si dentro
// del MISMO mes y la MISMA OS una misma prestación aparece PARTE exenta y PARTE gravada, casi
// siempre es un error de carga (justo el problema que aparecía a fin de mes). Esto lo detecta y
// lo lista para revisar a mano — NO cambia nada (el IVA solo lo cambia el usuario). Se mira el
// IVA EFECTIVO (exentaReg), que es el que termina en la presentación de la OS.
// Devuelve { ok, revisadas, inconsistencias:[{os,mes,prestacion,codigo,exentas,gravadas,ejemplos}] }.
function verificarIVAAtenciones(osFiltro, mesFiltro) {
  const ivaEfectivo = r => (typeof exentaReg === 'function') ? !!exentaReg(r, r.os) : (r.exenta === true);
  const grupos = {};
  let revisadas = 0;
  (DB.registros || []).forEach(r => {
    if (r.os === 'Particular' || r.os === 'CEMEPLA') return;   // Particular no se presenta; CEMEPLA siempre gravada
    if (osFiltro && r.os !== osFiltro) return;
    const mes = (r.fecha || '').slice(0, 7);
    if (mesFiltro && mes !== mesFiltro) return;
    revisadas++;
    // Igual criterio de agrupación que el verificador de precios: por NOMBRE de la prestación
    // (distingue "Consulta (Plan 210)" de "(Plan 510)"), NO por código ni por el campo plan.
    const clavePrest = (r.prestacion || '').trim() || r.codigo || '(sin nombre)';
    const key = r.os + '||' + clavePrest + '||' + mes;
    const g = grupos[key] || (grupos[key] = { os: r.os, mes, prestacion: (r.prestacion || '').trim() || r.codigo || '', codigo: r.codigo || '', exentas: 0, gravadas: 0, ejemplos: [] });
    if (ivaEfectivo(r)) g.exentas++; else g.gravadas++;
    if (g.ejemplos.length < 6) g.ejemplos.push({ id: r.id, fecha: r.fecha, iva: ivaEfectivo(r) ? 'exenta' : 'gravada' });
  });
  const inconsistencias = [];
  Object.keys(grupos).forEach(k => {
    const g = grupos[k];
    if (g.exentas > 0 && g.gravadas > 0) inconsistencias.push(g);   // mezcla dentro del mismo mes+OS+prestación
  });
  inconsistencias.sort((a, b) => b.mes.localeCompare(a.mes) || a.os.localeCompare(b.os));
  return { ok: inconsistencias.length === 0, revisadas, inconsistencias };
}

// — Actualizar precios de UNA obra social desde UN mes —
// El flujo es POR OS y POR MES (claro y acotado): elegís la OS y el mes desde el que rige el
// precio nuevo; se re-aplica SOLO a esa OS y solo desde ese mes en adelante. Otras OS y los
// meses anteriores NO se tocan. Config sigue siendo la fuente de verdad.

// Abre el modal con la OS y el mes a actualizar.
function abrirActualizarPreciosOS() {
  const sel = document.getElementById('actu-precios-os');
  if (sel) sel.innerHTML = (typeof getOSList === 'function' ? getOSList() : [])
    .map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
  const mes = document.getElementById('actu-precios-mes');
  if (mes) mes.value = hoyISO().slice(0, 7);   // mes actual por defecto
  const info = document.getElementById('actu-precios-info');
  if (info) info.textContent = '';
  openModal('modal-actualizar-precios-os');
}

// Valida OS + mes, muestra un PREVIEW de cuántas atenciones cambian (sin tocar nada) y aplica.
async function confirmarActualizarPreciosOS() {
  const os  = document.getElementById('actu-precios-os')?.value || '';
  const mes = document.getElementById('actu-precios-mes')?.value || '';
  if (!os) { showToastSafe('⚠️ Elegí la obra social.'); return; }
  if (!/^\d{4}-\d{2}$/.test(mes)) { showToastSafe('⚠️ Elegí el mes (AAAA-MM).'); return; }
  if (mes < '2020-01') { showToastSafe('⚠️ El mes es demasiado antiguo.'); return; }
  const vigencia = mes + '-01';
  const mesLbl = (typeof getMesLabel === 'function') ? getMesLabel(mes) : mes;
  // Preview SIN modificar (dryRun): cuántas atenciones de ESA OS desde ESE mes cambian de PRECIO.
  const prev = _repreciarRegistros(vigencia, os, true);
  if (prev.actualizadas === 0) {
    if (!confirm(`No hay atenciones de ${os} desde ${mesLbl} cuyo precio cambie con los valores actuales de Configuración.\n\n¿Subir igual el nomenclador de ${os} a la nube?`)) return;
  } else {
    if (!confirm(
      `ACTUALIZAR PRECIOS — ${os} · desde ${mesLbl}\n\n` +
      `Se va a recalcular el PRECIO de ${prev.actualizadas} atención(es) de ${os}, desde ${mesLbl} en adelante, con los valores que tenés en Configuración.\n\n` +
      `• Solo se toca ${os}. Las demás obras sociales NO se modifican.\n` +
      `• Las atenciones de ${os} ANTERIORES a ${mesLbl} NO se tocan.\n` +
      `• El IVA (exenta/gravada) de cada atención NO se toca: eso solo lo cambiás vos.\n\n¿Continuar?`
    )) return;
  }
  closeModal('modal-actualizar-precios-os');
  await actualizarPreciosPrestaciones(os, vigencia);
}

// Worker: reprecia SOLO `os` desde `vigencia` (AAAA-MM-DD) y sube al nube. NO reemplaza el
// catálogo (upsert seguro). Todos los mensajes dicen la OS y el mes.
async function actualizarPreciosPrestaciones(os, vigencia) {
  if (!os || !vigencia) { showToastSafe('⚠️ Falta la obra social o el mes a actualizar.'); return; }
  const mesLbl = (typeof getMesLabel === 'function') ? getMesLabel(vigencia.slice(0, 7)) : vigencia;
  // Config es la fuente de verdad; se re-aplican esos valores SOLO a las atenciones de `os`
  // desde la vigencia (fuente única _repreciarRegistros con osFiltro).
  marcarCambios('prestaciones');
  const { actualizadas, ivaCambiado, ambiguas } = _repreciarRegistros(vigencia, os);

  // Avisar de las prestaciones ambiguas (mismo nombre, distinto precio) para revisar a mano.
  if (ambiguas.length > 0) {
    const lista = ambiguas.slice(0, 20).map(r =>
      `• ${r.fecha} · ${r.prestacion}: revisar a mano (varias con igual nombre)`
    ).join('\n');
    const extra = ambiguas.length > 20 ? `\n…y ${ambiguas.length - 20} más.` : '';
    alert(`En ${os} hay ${ambiguas.length} atención(es) con nombres repetidos que conviene revisar a mano:\n\n${lista}${extra}`);
  }

  if (actualizadas > 0 || ivaCambiado > 0) marcarCambios('registros');

  renderConfiguracion && renderConfiguracion();
  initDashboard && initDashboard();

  if (!sb) {
    showToastSafe(`✓ Precios de ${os} actualizados (${actualizadas} atención(es) recalculada(s) desde ${mesLbl}). Se guardan al sincronizar.`);
    return { actualizadas, ivaCambiado };
  }

  // Subir por el camino SEGURO (guardarEnNube): upsert + borrado por snapshot + dedupe.
  showToastSafe(`Actualizando precios de ${os} en la nube…`);
  const ok = await guardarEnNube(true);
  showToastSafe(ok
    ? `✓ Precios de ${os} actualizados en la nube · ${actualizadas} atención(es) recalculada(s) desde ${mesLbl}`
    : '⚠️ No se pudieron actualizar los precios ahora. Se reintenta solo; revisá la conexión.');
  return { actualizadas, ivaCambiado };
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
  // CANDADO ANTI-PISADA: si esta sesión ya quedó vieja (otra compu guardó), no guardar más.
  if (_conflictoNube) { _bloquearPorConflictoNube(); return; }
  // Pre-chequeo rápido: si ya sabemos que otra sesión guardó, abortar (no pisar) y recargar.
  const _tokRemoto = await _leerSyncTokenRemoto();
  if (_hayCambiosDeOtraSesion(_tokRemoto, _syncToken, _sessionId)) {
    _bloquearPorConflictoNube();
    return false;
  }
  // RECLAMO ATÓMICO del turno (cierra la carrera "chequear-y-escribir"): reclama el syncTick
  // en un solo paso. Si otra sesión lo reclamó a la vez, esta pierde y aborta ANTES de escribir.
  // Fail-safe: 'fallback' = seguir best-effort (igual que antes). Ver _reclamarTokenNube.
  const _claim = await _reclamarTokenNube(_syncToken);
  if (_claim.estado === 'conflict') { _bloquearPorConflictoNube(); return false; }
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
    // Foto EXACTA de lo que estamos por subir, tomada ANTES de los await de red. Si una
    // colección cambia DURANTE el guardado (p. ej. el usuario carga una atención mientras
    // sube la anterior), su hash actual va a diferir de esta foto → NO la damos por guardada
    // al final: queda dirty y se sube en la próxima vuelta. Sin esto se perdía en silencio.
    const _hashSubido = {};
    dirty.forEach(c => { _hashSubido[c] = _hashColeccion(c); });
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

    // 4) syncTick (candado de concurrencia). Si el reclamo atómico YA lo escribió ('claimed'),
    //    no hay nada que hacer (el token nuevo ya está en la nube y _syncToken ya se actualizó).
    //    Si fue 'fallback' (o nube fresca), se sube BEST-EFFORT como siempre: en su propio
    //    upsert y con try/catch, para que un fallo (RLS, red, etc.) NUNCA rompa el guardado.
    if (_claim.estado !== 'claimed') {
      try {
        const { error: eTick } = await sb.from('app_meta').upsert([{ clave: 'syncTick', valor: _claim.valorNuevo }], { onConflict: 'clave' });
        if (eTick) console.warn('syncTick no se pudo guardar (candado anti-pisada degradado):', eTick.message);
        else _syncToken = _claim.token;   // nuestro propio sello: no debe auto-bloquearnos
      } catch (e) { console.warn('syncTick error:', e); }
    }

    // Limpiar/snapshotear SOLO las colecciones que NO cambiaron durante el guardado (su hash
    // sigue igual a la foto de lo que subimos). Las que SÍ cambiaron en vuelo — una atención
    // cargada mientras subía otra, o una colección distinta modificada — quedan dirty y con su
    // snapshot viejo → se suben en la próxima vuelta. Antes se limpiaba/snapshoteaba TODO el
    // lote y una atención cargada en ese instante se perdía en silencio (bug de pérdida).
    const _estables = dirty.filter(c => _hashColeccion(c) === _hashSubido[c]);
    _estables.forEach(c => cambiosPendientes.dirty.delete(c));
    _guardarSnapshot(_estables);
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
  if (_soloLectura || _conflictoNube) return;   // solo lectura o sesión vieja: nunca escribe
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

// ── BACKUP DIARIO AUTOMÁTICO EN LA NUBE ──────────────────────────────────────
// Una foto COMPLETA de la base por día, guardada en app_data como coleccion 'backup'
// (que NO se carga en el arranque, así no pesa ni se puede pisar). Se crea sola tras una
// carga exitosa; se conservan los últimos 30 días. Todo best-effort: si algo falla, jamás
// rompe la app. No necesita configurar nada en Supabase (misma tabla y permisos que ya usa).
const BACKUP_COLECCION = 'backup';
const BACKUP_DIAS_RETENER = 30;
// '2026-07-20' → 20260720 (doc_id numérico y ordenable por fecha)
function _fechaNum(fechaISO) { return parseInt(String(fechaISO).replace(/-/g, ''), 10); }
// Foto de TODAS las colecciones de DB (copia PROFUNDA, para que la foto sea fiel al momento
// y no cambie si DB se modifica después). Mismo formato que el backup manual: { DB, ... }.
function _snapshotDB() {
  try { return JSON.parse(JSON.stringify(DB)); }
  catch (e) { const snap = {}; Object.keys(DB).forEach(k => { snap[k] = DB[k]; }); return snap; }
}

async function _backupDiarioSiCorresponde() {
  if (!sb || !datosCargados || _soloLectura) return;
  try {
    const hoy = hoyISO();
    const docId = _fechaNum(hoy);
    // ¿ya existe el backup de hoy? (no re-subir la foto grande en cada carga del día)
    const { data: ya } = await sb.from('app_data').select('doc_id')
      .eq('coleccion', BACKUP_COLECCION).eq('doc_id', docId).maybeSingle();
    if (ya) return;
    const fila = { coleccion: BACKUP_COLECCION, doc_id: docId,
      data: { app: 'OIP', version: 1, fecha: new Date().toISOString(), dia: hoy, DB: _snapshotDB() } };
    const { error } = await sb.from('app_data').upsert([fila], { onConflict: 'coleccion,doc_id' });
    if (error) { console.warn('Backup diario no se pudo guardar:', error.message); return; }
    // Podar los backups de más de 30 días.
    const limite = _fechaNum(new Date(Date.parse(hoy + 'T00:00:00') - BACKUP_DIAS_RETENER * 86400000).toISOString().slice(0, 10));
    await sb.from('app_data').delete().eq('coleccion', BACKUP_COLECCION).lt('doc_id', limite);
  } catch (e) { console.warn('Backup diario error:', e); }
}

// Fuerza un backup EN LA NUBE con el estado ACTUAL, a demanda (botón). A diferencia del
// automático, NO se saltea si ya hay uno de hoy: actualiza la foto de hoy con lo más reciente.
// No pasa por el candado (solo escribe una fila 'backup' aparte, no pisa datos ni el syncTick).
async function backupNubeAhora() {
  if (!sb) { showToastSafe('No estás conectado a la nube.'); return false; }
  if (_soloLectura) { showToastSafe('🔒 Modo solo lectura: no se puede escribir en la nube.'); return false; }
  if (!datosCargados) { showToastSafe('⚠️ Los datos no se cargaron bien; no se hace backup para no guardar algo incompleto.'); return false; }
  if (_conflictoNube) { showToastSafe('⚠️ Esta sesión quedó vieja (otra compu modificó datos). Recargá antes de hacer el backup.'); return false; }
  try {
    showToastSafe('Guardando backup en la nube…');
    const hoy = hoyISO();
    const docId = _fechaNum(hoy);
    const fila = { coleccion: BACKUP_COLECCION, doc_id: docId,
      data: { app: 'OIP', version: 1, fecha: new Date().toISOString(), dia: hoy, DB: _snapshotDB() } };
    const { error } = await sb.from('app_data').upsert([fila], { onConflict: 'coleccion,doc_id' });
    if (error) { showToastSafe('⚠️ No se pudo guardar el backup en la nube: ' + error.message); return false; }
    const limite = _fechaNum(new Date(Date.parse(hoy + 'T00:00:00') - BACKUP_DIAS_RETENER * 86400000).toISOString().slice(0, 10));
    try { await sb.from('app_data').delete().eq('coleccion', BACKUP_COLECCION).lt('doc_id', limite); } catch (e) {}
    showToastSafe(`✓ Backup guardado en la nube (${hoy})`);
    if (typeof renderBackupsNube === 'function') renderBackupsNube();
    return true;
  } catch (e) { showToastSafe('⚠️ Error al hacer el backup en la nube.'); return false; }
}

// Lista de fechas de backup en la nube (solo el doc_id AAAAMMDD, sin el contenido grande).
async function listarBackupsNube() {
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('app_data').select('doc_id')
      .eq('coleccion', BACKUP_COLECCION).order('doc_id', { ascending: false }).range(0, 999);
    if (error) return [];
    return (data || []).map(r => Number(r.doc_id));
  } catch (e) { return []; }
}

// Restaura un backup de la nube por su fecha (docId). Reemplaza DB en el lugar (igual que
// importarBackupJSON) y marca todo para guardar. NO sube solo: el usuario revisa y guarda.
async function restaurarBackupNube(docId) {
  if (!sb) { showToastSafe('No conectado a la nube.'); return false; }
  try {
    // 1) Leer PRIMERO el backup a restaurar (antes de tocar nada). Se lee acá para que la
    //    copia de seguridad de abajo no pueda pisar justo el backup que estamos restaurando.
    const { data, error } = await sb.from('app_data').select('data')
      .eq('coleccion', BACKUP_COLECCION).eq('doc_id', Number(docId)).maybeSingle();
    if (error || !data || !data.data || !data.data.DB) { showToastSafe('⚠️ No se pudo leer ese backup.'); return false; }
    const snapRestaurar = data.data.DB;
    // 2) RED ANTI-ERROR: copia de seguridad del estado ACTUAL en la nube antes de reemplazar.
    //    Así, si restaurar fue un error, se puede volver al estado de hoy.
    const okSeg = await backupNubeAhora();
    if (!okSeg && !confirm('⚠️ No se pudo guardar una copia de seguridad del estado actual.\n\nSi restaurás y fue un error, no vas a poder deshacerlo fácil. ¿Restaurar igual?')) return false;
    // 3) Reemplazar DB por la foto restaurada.
    Object.keys(DB).forEach(k => { delete DB[k]; });
    Object.assign(DB, snapRestaurar);
    _normalizarFechasDB();   // la foto restaurada puede traer fechas raras: normalizarlas
    if (typeof COLECCIONES !== 'undefined') COLECCIONES.forEach(c => marcarCambios(c));
    marcarCambios();
    return true;
  } catch (e) { showToastSafe('⚠️ Error al restaurar el backup.'); return false; }
}

// '20260720' → '2026-07-20' (para mostrar la fecha de un backup)
function _fechaNumALegible(docId) {
  const s = String(docId);
  return s.length === 8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : s;
}

// Pinta la lista de backups de la nube en Configuración (con botón Restaurar por día).
async function renderBackupsNube() {
  const cont = document.getElementById('backups-nube-lista');
  if (!cont) return;
  cont.innerHTML = '<div style="font-size:12px;color:var(--text3);">Cargando backups…</div>';
  const fechas = await listarBackupsNube();
  if (!fechas.length) {
    cont.innerHTML = '<div style="font-size:12px;color:var(--text3);">Todavía no hay backups guardados (se crea el primero al usar la app).</div>';
    return;
  }
  cont.innerHTML = fechas.map(d => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">📅 ${_fechaNumALegible(d)}</span>
      <button class="btn btn-secondary btn-sm" onclick="confirmarRestaurarBackupNube(${d})">Restaurar este día</button>
    </div>`).join('');
}

async function confirmarRestaurarBackupNube(docId) {
  const fecha = _fechaNumALegible(docId);
  if (!confirm(
    `RESTAURAR EL BACKUP DEL ${fecha}\n\n` +
    '⚠️ Reemplaza TODOS los datos actuales por la foto de ese día. ' +
    'Todo lo cargado DESPUÉS de esa fecha se pierde.\n\n¿Continuar?'
  )) return;
  const ok = await restaurarBackupNube(docId);
  if (!ok) return;
  if (typeof initDashboard === 'function') initDashboard();
  if (typeof showSection === 'function') showSection('dashboard');
  showToastSafe(`✓ Backup del ${fecha} restaurado — revisá los datos y guardá para subirlo a la nube`);
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
