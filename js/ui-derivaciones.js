// ═══════════════════════════════════════════════════════════════════════════
//  UI — SECCIÓN DERIVACIONES (quirúrgicas) + pagos a la liquidación
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Incluye ESTADO_DERIV_CFG y URGENCIA_CFG (sólo se usan acá).
//  Se carga antes de persistencia.js. Usa helpers globales (DB, fmt, soloApellido,
//  marcarCambios, optionsMedicos, hoyISO, closeModal/openModal, …).
// ═══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════
//  DERIVACIONES
// ══════════════════════════════════════

const ESTADO_DERIV_CFG = {
  'Pendiente':  { cls:'pill-pending',  icon:'⏳' },
  'Programada': { cls:'pill-os',       icon:'📅' },
  'Realizada':  { cls:'pill-paid',     icon:'✓'  },
  'Cancelada':  { cls:'pill-overdue',  icon:'✕'  },
};

const URGENCIA_CFG = {
  'Programada':   { style:'background:var(--surface2);color:var(--text3);',     icon:'🟢' },
  'Urgente':      { style:'background:var(--warn-light);color:var(--warn);',    icon:'🟡' },
  'Muy urgente':  { style:'background:var(--danger-light);color:var(--danger);',icon:'🔴' },
};

function initDerivaciones() {
  // Poblar select de médicos en filtros y modal
  const selects = ['deriv-filter-medico', 'dv-medico'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const isFilter = id.includes('filter');
    el.innerHTML = optionsMedicos('', isFilter ? '<option value="">Todos los médicos</option>' : '');
  });

  // Wire cirugia select "Otra" toggle
  const dvCir = document.getElementById('dv-cirugia');
  if (dvCir) dvCir.onchange = () => {
    const otraGroup = document.getElementById('dv-otra-group');
    if (otraGroup) otraGroup.style.display = dvCir.value === 'Otra' ? '' : 'none';
  };

  renderDerivKPIs();
  renderDerivaciones();
}

function renderDerivKPIs() {
  const total = DB.derivaciones.length;
  const pendientes = DB.derivaciones.filter(d => d.estado === 'Pendiente').length;
  const programadas = DB.derivaciones.filter(d => d.estado === 'Programada').length;
  const realizadas = DB.derivaciones.filter(d => d.estado === 'Realizada').length;
  const totalPagado = DB.derivaciones.reduce((s,d) => s+(d.pagos||[]).reduce((ss,p)=>ss+p.monto,0),0);

  const el = document.getElementById('deriv-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card" style="border-left:3px solid var(--accent2);">
      <div class="stat-label">Total derivaciones</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">${DB.medicos.length} médicos</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--warn);">
      <div class="stat-label">Pendientes</div>
      <div class="stat-value" style="color:var(--warn);">${pendientes}</div>
      <div class="stat-sub">Sin fecha asignada aún</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--accent);">
      <div class="stat-label">Programadas</div>
      <div class="stat-value" style="color:var(--accent);">${programadas}</div>
      <div class="stat-sub">Con fecha confirmada</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--success);">
      <div class="stat-label">Pagado en derivaciones</div>
      <div class="stat-value finance-num" style="font-size:20px; color:var(--success);">${fmt(totalPagado)}</div>
      <div class="stat-sub">${realizadas} cirugías realizadas</div>
    </div>`;
}

function getDerivFiltradas() {
  const medico = document.getElementById('deriv-filter-medico')?.value || '';
  const cirugia = document.getElementById('deriv-filter-cirugia')?.value || '';
  const estado = document.getElementById('deriv-filter-estado')?.value || '';
  const consultorio = document.getElementById('deriv-filter-consultorio')?.value || '';
  const search = (document.getElementById('deriv-search')?.value || '').toLowerCase();

  return DB.derivaciones.filter(d => {
    if (medico && d.medico !== medico) return false;
    if (cirugia && d.cirugia !== cirugia) return false;
    if (estado && d.estado !== estado) return false;
    if (consultorio && d.consultorio !== consultorio) return false;
    if (search && !d.paciente.toLowerCase().includes(search) && !d.medico.toLowerCase().includes(search)) return false;
    return true;
  }).sort((a,b) => b.fecha.localeCompare(a.fecha));
}

function renderDerivaciones() {
  const data = getDerivFiltradas();
  const tbody = document.getElementById('deriv-tbody');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text3);">Sin derivaciones para este filtro</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(d => {
    const eCfg = ESTADO_DERIV_CFG[d.estado] || {};
    const med = DB.medicos.find(m => m.nombre === d.medico);
    const diasCx = d.fechaCx ? Math.ceil((new Date(d.fechaCx) - new Date()) / 86400000) : null;
    const pagos = (d.pagos||[]);
    const totalPagado = pagos.reduce((s,p)=>s+p.monto,0);
    return `
      <tr>
        <td>${d.fecha}</td>
        <td>
          <div style="font-weight:600;">${d.paciente}</div>
          <div style="font-size:11px;color:var(--text3);">DNI: ${d.dni}</div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${med?.color||'#888'};flex-shrink:0;"></div>
            <span style="font-size:13px;">${soloApellido(d.medico)}</span>
          </div>
        </td>
        <td><span class="pill ${d.consultorio==='Palpa'?'pill-palpa':d.consultorio==='Haedo'?'pill-haedo':'pill-os'}">${d.consultorio}</span></td>
        <td>
          <div style="font-weight:600;">${d.cirugia}</div>
          ${d.ojo ? `<div style="font-size:11px;color:var(--text3);">${d.ojo}</div>` : ''}
        </td>
        <td style="font-size:12px;">${d.os}</td>
        <td style="font-size:12px;">
          ${d.fechaCx
            ? `<div style="font-weight:600;">${d.fechaCx}</div>
               <div style="font-size:11px;color:${diasCx<0?'var(--success)':diasCx<=7?'var(--danger)':'var(--text3)'};">${diasCx<0?'Realizada':diasCx===0?'Hoy':diasCx+'d'}</div>`
            : '<span style="color:var(--text3);">Sin fecha</span>'}
        </td>
        <td><span class="pill ${eCfg.cls}">${eCfg.icon} ${d.estado}</span></td>
        <td>
          ${totalPagado > 0
            ? `<div class="finance-num" style="font-weight:700;color:var(--success);font-size:12px;">${fmt(totalPagado)}</div>
               <div style="font-size:10px;color:var(--text3);">${pagos.length} pago${pagos.length>1?'s':''}</div>`
            : '<span style="color:var(--text3);font-size:12px;">—</span>'}
        </td>
        <td style="max-width:150px;font-size:11px;color:var(--text2);">${d.notas||'—'}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="abrirPagoDerivacion(${d.id})">💸 Pagar</button>
            <button class="btn btn-secondary btn-sm" onclick="abrirActualizarEstado(${d.id})">Estado</button>
            <button class="btn btn-danger btn-sm" onclick="eliminarDerivacion(${d.id})">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function switchDerivTab(tab, el) {
  document.querySelectorAll('#deriv-subtabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('deriv-tab-listado').style.display = tab === 'listado' ? '' : 'none';
  document.getElementById('deriv-tab-por-medico').style.display = tab === 'por-medico' ? '' : 'none';
  document.getElementById('deriv-tab-por-cirugia').style.display = tab === 'por-cirugia' ? '' : 'none';
  if (tab === 'por-medico') renderDerivPorMedico();
  if (tab === 'por-cirugia') renderDerivPorCirugia();
}

function renderDerivPorMedico() {
  const periodo = document.getElementById('deriv-pm-periodo')?.value || 'todo';
  const estadoF = document.getElementById('deriv-pm-estado')?.value || '';
  const hoy = new Date();

  let data = [...DB.derivaciones];
  if (estadoF) data = data.filter(d => d.estado === estadoF);
  if (periodo === 'mes') {
    const mes = hoy.toISOString().slice(0,7);
    data = data.filter(d => d.fecha.startsWith(mes));
  } else if (periodo === 'trimestre') {
    const hace90 = new Date(hoy - 90*86400000).toISOString().split('T')[0];
    data = data.filter(d => d.fecha >= hace90);
  }

  const grid = document.getElementById('deriv-por-medico-grid');
  if (!grid) return;

  grid.innerHTML = DB.medicos.map(med => {
    const derivs = data.filter(d => d.medico === med.nombre);
    if (derivs.length === 0) return '';

    const realizadas = derivs.filter(d => d.estado === 'Realizada').length;
    const pendientes = derivs.filter(d => d.estado === 'Pendiente').length;
    const programadas = derivs.filter(d => d.estado === 'Programada').length;
    const totalPagado = derivs.reduce((s,d) => s + (d.pagos||[]).reduce((ss,p)=>ss+p.monto,0), 0);

    // Agrupar por cirugía
    const porCirugia = {};
    derivs.forEach(d => { porCirugia[d.cirugia] = (porCirugia[d.cirugia]||0)+1; });
    const topCirugias = Object.entries(porCirugia).sort((a,b)=>b[1]-a[1]);

    return `
      <div class="card" style="border-top:3px solid ${med.color};">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div class="avatar" style="width:38px;height:38px;background:${med.color}22;color:${med.color};font-size:13px;font-weight:700;">
              ${med.nombre.split(' ').map(w=>w[0]).slice(1,3).join('')}
            </div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:14px;">${med.nombre}</div>
              <div style="font-size:11px;color:var(--text3);">${med.consultorio}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:24px;font-weight:800;color:${med.color};">${derivs.length}</div>
              <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">derivaciones</div>
            </div>
          </div>

          <div style="display:flex;gap:6px;margin-bottom:14px;">
            <div style="flex:1;text-align:center;background:var(--success-light);border-radius:6px;padding:7px;">
              <div style="font-size:16px;font-weight:700;color:var(--success);">${realizadas}</div>
              <div style="font-size:10px;color:var(--success);">Realizadas</div>
            </div>
            <div style="flex:1;text-align:center;background:var(--accent2-light);border-radius:6px;padding:7px;">
              <div style="font-size:16px;font-weight:700;color:var(--accent2);">${programadas}</div>
              <div style="font-size:10px;color:var(--accent2);">Programadas</div>
            </div>
            <div style="flex:1;text-align:center;background:var(--warn-light);border-radius:6px;padding:7px;">
              <div style="font-size:16px;font-weight:700;color:var(--warn);">${pendientes}</div>
              <div style="font-size:10px;color:var(--warn);">Pendientes</div>
            </div>
            ${totalPagado > 0 ? `<div style="flex:1;text-align:center;background:var(--success-light);border-radius:6px;padding:7px;">
              <div style="font-size:13px;font-weight:700;color:var(--success);font-family:monospace;">${fmt(totalPagado)}</div>
              <div style="font-size:10px;color:var(--success);">Pagado</div>
            </div>`:''}
          </div>

          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Cirugías derivadas</div>
          ${topCirugias.map(([cir, n]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:12px;color:var(--text2);">${cir}</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <div style="width:80px;background:var(--border);border-radius:4px;height:5px;overflow:hidden;">
                  <div style="width:${Math.round(n/derivs.length*100)}%;background:${med.color};height:100%;border-radius:4px;"></div>
                </div>
                <span style="font-size:12px;font-weight:700;color:${med.color};min-width:16px;text-align:right;">${n}</span>
              </div>
            </div>`).join('')}

          <div style="margin-top:10px;">
            <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="filtrarPorMedico('${med.nombre}')">Ver detalle →</button>
          </div>
        </div>
      </div>`;
  }).filter(Boolean).join('');

  if (!grid.innerHTML) grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div>Sin derivaciones para este filtro</div></div>';
}

function renderDerivPorCirugia() {
  const data = DB.derivaciones;
  const porCirugia = {};
  data.forEach(d => {
    if (!porCirugia[d.cirugia]) porCirugia[d.cirugia] = [];
    porCirugia[d.cirugia].push(d);
  });

  const sorted = Object.entries(porCirugia).sort((a,b) => b[1].length - a[1].length);
  const el = document.getElementById('deriv-por-cirugia-content');
  if (!el) return;

  el.innerHTML = sorted.map(([cir, derivs]) => {
    const realizadas = derivs.filter(d => d.estado === 'Realizada').length;
    const pct = Math.round(realizadas/derivs.length*100);

    // Agrupar por médico
    const porMed = {};
    derivs.forEach(d => { porMed[d.medico] = (porMed[d.medico]||0)+1; });
    const medRanking = Object.entries(porMed).sort((a,b)=>b[1]-a[1]);

    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header">
          <div>
            <div style="font-size:15px;font-weight:700;">${cir}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">${derivs.length} derivaciones · ${realizadas} realizadas (${pct}%)</div>
          </div>
          <div style="text-align:right;">
            <div class="progress-bar" style="width:120px;margin-bottom:4px;">
              <div class="progress-fill" style="width:${pct}%;background:var(--success);"></div>
            </div>
            <div style="font-size:11px;color:var(--text3);">${pct}% concretadas</div>
          </div>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div style="flex:2;min-width:240px;">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Médicos que derivaron</div>
              ${medRanking.map(([nombre, n]) => {
                const med = DB.medicos.find(m => m.nombre === nombre);
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:${med?.color||'#888'};flex-shrink:0;"></div>
                  <span style="font-size:13px;flex:1;">${soloApellido(nombre)}</span>
                  <div style="width:80px;background:var(--border);border-radius:4px;height:5px;overflow:hidden;">
                    <div style="width:${Math.round(n/derivs.length*100)}%;background:${med?.color||'var(--accent)'};height:100%;"></div>
                  </div>
                  <span style="font-size:13px;font-weight:700;min-width:20px;text-align:right;">${n}</span>
                </div>`;
              }).join('')}
            </div>
            <div style="flex:1;min-width:180px;">
              <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Estados</div>
              ${['Pendiente','Programada','Realizada','Cancelada'].map(est => {
                const n = derivs.filter(d=>d.estado===est).length;
                if (n===0) return '';
                const cfg = ESTADO_DERIV_CFG[est];
                return `<div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                  <span class="pill ${cfg.cls}">${cfg.icon} ${est}</span>
                  <span style="font-weight:700;">${n}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function filtrarPorMedico(nombre) {
  // Ir a listado y filtrar por médico
  document.querySelectorAll('#deriv-subtabs .tab')[0].click();
  setTimeout(() => {
    const sel = document.getElementById('deriv-filter-medico');
    if (sel) { sel.value = nombre; renderDerivaciones(); }
  }, 50);
}

function guardarDerivacion() {
  const cirugia = document.getElementById('dv-cirugia').value;
  const otraDesc = document.getElementById('dv-otra-desc')?.value;
  const d = {
    id: DB.nextId++,
    fecha: document.getElementById('dv-fecha').value,
    consultorio: document.getElementById('dv-consultorio').value,
    paciente: document.getElementById('dv-paciente').value.trim(),
    dni: document.getElementById('dv-dni').value.trim(),
    medico: document.getElementById('dv-medico').value,
    os: document.getElementById('dv-os').value,
    cirugia: cirugia === 'Otra' ? (otraDesc || 'Otra') : cirugia,
    ojo: document.getElementById('dv-ojo').value,
    estado: document.getElementById('dv-estado').value,
    fechaCx: document.getElementById('dv-fecha-cx').value,
    notas: document.getElementById('dv-notas').value.trim(),
    pagos: [],  // historial de pagos por derivación
  };
  if (!d.paciente || !d.medico || !d.fecha) { showToast('⚠️ Completá paciente, médico y fecha'); return; }
  DB.derivaciones.unshift(d); marcarCambios('derivaciones');
  closeModal('modal-derivacion');
  renderDerivKPIs();
  renderDerivaciones();
  showToast(`✓ Derivación registrada — ${d.paciente} · ${d.cirugia}`);
}

function abrirActualizarEstado(id) {
  const d = DB.derivaciones.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dest-deriv-id').value = id;
  document.getElementById('dest-nuevo-estado').value = d.estado;
  document.getElementById('dest-fecha-cx').value = d.fechaCx || '';
  document.getElementById('dest-nota').value = '';
  const cfg = URGENCIA_CFG[d.urgencia] || URGENCIA_CFG['Programada'];
  document.getElementById('deriv-estado-info').innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${d.paciente}</div>
    <div style="font-size:12px;color:var(--text2);">${soloApellido(d.medico)} · ${d.cirugia} ${d.ojo?'('+d.ojo+')':''}</div>
    <div style="font-size:12px;color:var(--text3);margin-top:4px;">${d.os} · <span style="${cfg.style}padding:1px 6px;border-radius:3px;">${cfg.icon} ${d.urgencia}</span></div>`;
  openModal('modal-deriv-estado');
}

function actualizarEstadoDerivacion() {
  const id = parseInt(document.getElementById('dest-deriv-id').value);
  const d = DB.derivaciones.find(x => x.id === id);
  if (!d) return;
  d.estado = document.getElementById('dest-nuevo-estado').value;
  d.fechaCx = document.getElementById('dest-fecha-cx').value || d.fechaCx;
  const nota = document.getElementById('dest-nota').value.trim();
  if (nota) d.notas = d.notas ? d.notas + ' · ' + nota : nota;
  closeModal('modal-deriv-estado');
  marcarCambios('derivaciones');
  renderDerivKPIs();
  renderDerivaciones();
  showToast(`✓ Estado actualizado → ${d.estado}`);
}

// Porcentaje sugerido para el pago al médico derivante (sobre el valor de contrato).
const DERIV_PORC = 0.05;  // 5%

function abrirPagoDerivacion(id) {
  const d = DB.derivaciones.find(x => x.id === id);
  if (!d) return;
  document.getElementById('pago-deriv-id').value = id;
  document.getElementById('pago-deriv-concepto').value = 'Pago por derivación quirúrgica';
  document.getElementById('pago-deriv-nota').value = '';
  const filtroPrest = document.getElementById('pago-deriv-prest-filtro');
  if (filtroPrest) filtroPrest.value = '';
  const porcEl = document.getElementById('pago-deriv-porc');
  if (porcEl) porcEl.textContent = Math.round(DERIV_PORC * 100);

  // Poblar el selector con las prestaciones (cirugías/estudios con valor) del contrato
  // de ESA obra social, y preseleccionar la que mejor matchee la categoría de la cirugía.
  const sel = document.getElementById('pago-deriv-prest');
  if (sel) {
    const prests = (DB.prestaciones || [])
      .filter(p => p.os === d.os && p.valOS > 0 && categoriaPrestacion(p) !== 'consulta')
      .sort((a, b) => a.desc.localeCompare(b.desc));
    sel.innerHTML = '<option value="">— Sin prestación / monto manual —</option>' +
      prests.map(p => `<option value="${p.id}" data-val="${p.valOS}">${p.desc} — ${fmt(p.valOS)}</option>`).join('');
    const kw = (d.cirugia || '').toLowerCase().split(/[\s/(]+/).filter(Boolean)[0] || '';
    if (kw.length >= 4) {
      const match = prests.find(p => p.desc.toLowerCase().includes(kw));
      if (match) sel.value = String(match.id);
    }
  }

  const pagosAnt = (d.pagos||[]);
  const totalAnt = pagosAnt.reduce((s,p)=>s+p.monto,0);
  document.getElementById('pago-deriv-info').innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${d.paciente}</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">${d.medico} · ${d.cirugia}${d.ojo?' ('+d.ojo+')':''}</div>
    <div style="font-size:12px;color:var(--text3);">${d.os} · ${d.estado}</div>
    ${totalAnt > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;color:var(--success);font-weight:600;">Ya pagado: ${fmt(totalAnt)}</div>` : ''}`;

  recalcPagoDerivacion();   // setea valor de contrato + sugerido + prefija el monto
  openModal('modal-pago-derivacion');
}

// Recalcula el valor por contrato y el 5% sugerido según la prestación elegida, y
// prefija el monto editable. Se llama al abrir el modal y al cambiar el selector.
function recalcPagoDerivacion() {
  const sel = document.getElementById('pago-deriv-prest');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  const val = opt && opt.value ? (parseFloat(opt.dataset.val) || 0) : 0;
  const sugerido = round2(val * DERIV_PORC);
  const vEl = document.getElementById('pago-deriv-valor-contrato');
  const sEl = document.getElementById('pago-deriv-sugerido');
  const mInp = document.getElementById('pago-deriv-monto');
  if (vEl) vEl.textContent = val > 0 ? fmt(val) : '—';
  if (sEl) sEl.textContent = val > 0 ? fmt(sugerido) : '—';
  if (mInp) mInp.value = sugerido > 0 ? sugerido : '';
}

function confirmarPagoDerivacion() {
  const id = parseInt(document.getElementById('pago-deriv-id').value);
  const d = DB.derivaciones.find(x => x.id === id);
  if (!d) return;
  const monto = parseFloat(document.getElementById('pago-deriv-monto').value) || 0;
  const concepto = document.getElementById('pago-deriv-concepto').value;
  const nota = document.getElementById('pago-deriv-nota').value;
  if (!monto || monto <= 0) { showToast('⚠️ Ingresá un monto válido'); return; }

  // Prestación de contrato elegida (para trazabilidad: qué cirugía y a qué valor)
  const sel = document.getElementById('pago-deriv-prest');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  const cirugiaContrato = opt && opt.value ? opt.text.split(' — ')[0] : '';
  const valorContrato   = opt && opt.value ? (parseFloat(opt.dataset.val) || 0) : 0;

  if (!d.pagos) d.pagos = [];
  const pago = { id:DB.nextId++, fecha:hoyISO(), monto, concepto, nota, cirugiaContrato, valorContrato, porcentaje: DERIV_PORC };
  d.pagos.push(pago);

  // Agregar a registros de atenciones del médico como ingreso extra en liquidación
  DB.registros.push({
    id: DB.nextId++,
    fecha: pago.fecha,
    medico: d.medico,
    consultorio: d.consultorio,
    os: 'Pago derivación',
    plan: d.cirugia,
    prestacion: cirugiaContrato || d.cirugia,
    cantidad: 0,
    valorUnit: 0,
    exenta: true,
    partEfectivo: 0, partEfVal: 0,
    partTransf: 0,   partTrVal: 0,
    pagoExtra: monto,   // campo especial: suma directo a honorarios (ver honorMedicoReg)
    valorContrato,      // valor de contrato de la cirugía (referencia del 5%)
    concepto,
    derivId: id,        // vínculo a la derivación, para limpiar al borrarla
  });

  closeModal('modal-pago-derivacion');
  marcarCambios('derivaciones'); marcarCambios('registros');
  renderDerivaciones();
  showToast(`✓ ${fmt(monto)} sumado a la liquidación de ${soloApellido(d.medico)}`);
}

function eliminarDerivacion(id) {
  const d = DB.derivaciones.find(x => x.id === id);
  if (!d) return;
  // Registros de pago que esta derivación generó en la liquidación del médico
  const regsPago = DB.registros.filter(r => r.derivId === id || (r.os === 'Pago derivación' && r.medico === d.medico && (d.pagos||[]).some(p => p.concepto === r.concepto)));
  let msg = '¿Eliminar esta derivación?';
  if (regsPago.length > 0) {
    const totalPagos = regsPago.reduce((s,r) => s + (r.pagoExtra||0), 0);
    msg += `\n\nTambién se quitarán ${regsPago.length} pago(s) por ${fmt(totalPagos)} que sumaban a la liquidación de ${soloApellido(d.medico)}.`;
  }
  if (!confirm(msg)) return;
  DB.derivaciones = DB.derivaciones.filter(x => x.id !== id);
  marcarCambios('derivaciones');
  if (regsPago.length > 0) {
    const ids = new Set(regsPago.map(r => r.id));
    DB.registros = DB.registros.filter(r => !ids.has(r.id));
    marcarCambios('registros');
  }
  renderDerivKPIs();
  renderDerivaciones();
  showToast(regsPago.length > 0 ? '✓ Derivación y sus pagos eliminados' : 'Derivación eliminada');
}
