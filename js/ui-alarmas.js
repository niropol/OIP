// ═══════════════════════════════════════════════════════════════════════════
//  UI — SECCIÓN ALARMAS (render, motor y modal)
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Se carga ANTES de persistencia.js: init() usa avisarAlarmasVencidas/chequearAlarmasHora.
//  Usa helpers globales (DB, fmt, marcarCambios, optionsMedicos, …) de otros módulos.
// ═══════════════════════════════════════════════════════════════════════════

function renderAlarmas() {
  const container = document.getElementById('alarms-container');
  const icons = { urgente:'🔴', importante:'🟡', info:'🔵' };
  const labels = { urgente:'Urgente', importante:'Importante', info:'Informativo' };

  const fTipo   = document.getElementById('alarm-filter-tipo')?.value || '';
  const fEstado = document.getElementById('alarm-filter-estado')?.value || '';
  const lista = DB.alarmas.filter(al =>
    (!fTipo   || al.tipo === fTipo) &&
    (!fEstado || al.estado === fEstado)
  );

  container.innerHTML = lista.map(al => `
    <div class="alarm-card" id="alarm-${al.id}" style="${al.estado==='resuelta'?'opacity:0.6;':''}">
      <div class="alarm-icon ${al.tipo}">${icons[al.tipo]}</div>
      <div class="alarm-content">
        <div class="alarm-title">${al.titulo}</div>
        <div class="alarm-desc">${al.desc}</div>
        <div class="alarm-meta">
          <span>📅 ${al.fecha}</span>
          <span>🏥 ${al.rel}</span>
          <span>🔄 ${al.repeat}</span>
          <span class="pill ${al.tipo==='urgente'?'pill-overdue':al.tipo==='importante'?'pill-pending':'pill-os'}">${labels[al.tipo]}</span>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
        ${al.estado === 'activa' ? `<button class="btn btn-secondary btn-sm" onclick="resolverAlarma(${al.id})">✓ Resolver</button>` : `<span class="pill pill-paid">Resuelta</span>`}
        <button class="btn btn-danger btn-sm" onclick="eliminarAlarma(${al.id})">Eliminar</button>
      </div>
    </div>`).join('') || '<div class="empty-state"><div class="empty-icon">🔔</div><div>No hay alarmas para mostrar con este filtro</div></div>';
}

function resolverAlarma(id) {
  const al = DB.alarmas.find(a => a.id === id);
  if (al) { al.estado = 'resuelta'; marcarCambios('alarmas'); renderAlarmas(); updateAlarmBadge(); showToast('Alarma marcada como resuelta'); }
}

function eliminarAlarma(id) {
  DB.alarmas = DB.alarmas.filter(a => a.id !== id);
  marcarCambios('alarmas');
  renderAlarmas(); updateAlarmBadge();
  showToast('Alarma eliminada');
}

function filterAlarms() { renderAlarmas(); }

function updateAlarmBadge() {
  const active = DB.alarmas.filter(a => a.estado === 'activa').length;
  const badge = document.getElementById('alarm-badge');
  badge.textContent = active;
  badge.style.display = active > 0 ? '' : 'none';
}

function guardarAlarma() {
  const al = {
    id: DB.nextId++,
    tipo: document.getElementById('alarm-tipo').value,
    titulo: document.getElementById('alarm-titulo').value,
    desc: document.getElementById('alarm-desc').value,
    fecha: document.getElementById('alarm-fecha').value,
    hora: document.getElementById('alarm-hora').value,
    rel: document.getElementById('alarm-rel').value,
    repeat: document.getElementById('alarm-repeat').value,
    estado: 'activa',
  };
  if (!al.titulo) { showToast('⚠️ Ingresá un título'); return; }
  DB.alarmas.unshift(al); marcarCambios('alarmas');
  closeModal('modal-alarma');
  updateAlarmBadge();
  showToast('✓ Alarma creada');
  renderAlarmas();
}

// ── Motor de alarmas (sonido + cartel) ───────────────────────────────────────
// Limitación: una web solo puede sonar si está abierta. Si la app está cerrada,
// al abrirla se avisan las que ya vencieron.
const _alarmasSonadas = new Set();  // ids ya avisados en esta sesión

function sonarAlarma() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // tres "beeps" cortos
    [0, 0.35, 0.7].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.26);
    });
  } catch (e) { /* navegador sin audio o sin permiso aún */ }
}

function mostrarCartelAlarma(als) {
  const cont = document.getElementById('alarma-cartel-body');
  if (!cont) return;
  const icons = { urgente:'🔴', importante:'🟡', info:'🔵' };
  cont.innerHTML = als.map(al => `
    <div style="display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border); border-radius:10px; margin-bottom:8px;">
      <span style="font-size:22px;">${icons[al.tipo] || '🔔'}</span>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:15px;">${al.titulo}</div>
        ${al.desc ? `<div style="font-size:13px; color:var(--text2); margin-top:2px;">${al.desc}</div>` : ''}
        <div style="font-size:11px; color:var(--text3); margin-top:4px;">${al.fecha}${al.hora ? ' · ' + al.hora : ''}${al.rel && al.rel !== '—' ? ' · ' + al.rel : ''}</div>
      </div>
    </div>`).join('');
  openModal('modal-alarma-cartel');
  sonarAlarma();
}

// Chequea alarmas con hora cuya fecha+hora ya llegó (app abierta)
function chequearAlarmasHora() {
  const ahora = new Date();
  const hoy = hoyISO();
  const hhmm = String(ahora.getHours()).padStart(2,'0') + ':' + String(ahora.getMinutes()).padStart(2,'0');
  const porSonar = (DB.alarmas || []).filter(al =>
    al.estado === 'activa' && al.hora && al.fecha === hoy && al.hora <= hhmm && !_alarmasSonadas.has(al.id)
  );
  if (porSonar.length) {
    porSonar.forEach(al => _alarmasSonadas.add(al.id));
    mostrarCartelAlarma(porSonar);
  }
}

// Al abrir la app: avisar de alarmas vencidas (fecha pasada, o fecha hoy con hora ya cumplida)
function avisarAlarmasVencidas() {
  const ahora = new Date();
  const hoy = hoyISO();
  const hhmm = String(ahora.getHours()).padStart(2,'0') + ':' + String(ahora.getMinutes()).padStart(2,'0');
  const vencidas = (DB.alarmas || []).filter(al => {
    if (al.estado !== 'activa') return false;
    if (!al.fecha) return false;
    if (al.fecha < hoy) return true;                          // día pasado
    if (al.fecha === hoy && al.hora && al.hora <= hhmm) return true;  // hoy, hora cumplida
    return false;
  });
  if (vencidas.length) {
    vencidas.forEach(al => _alarmasSonadas.add(al.id));
    mostrarCartelAlarma(vencidas);
  }
}

