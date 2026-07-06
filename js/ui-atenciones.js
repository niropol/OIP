// ═══════════════════════════════════════════════════════════════════════════
//  UI — SECCIÓN ATENCIONES: listado, editar/eliminar registro, carga múltiple
//  (CM) y carga masiva por pegado (parser del resumen).
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Incluye helpers usados también por otras secciones (getOSList,
//  esConsulta, getExentaForOS, getIVALabel, makeOSSelect): siguen siendo globales
//  y se cargan antes de persistencia.js, así están disponibles en runtime.
// ═══════════════════════════════════════════════════════════════════════════

function renderAtenciones() {
  populateMedicoSelects();

  const mes         = document.getElementById('at-f-mes')?.value || hoyISO().slice(0,7);
  const consultorio = document.getElementById('at-f-consultorio')?.value || '';
  const medico      = document.getElementById('at-f-medico')?.value || '';
  const cobertura   = document.getElementById('at-f-cobertura')?.value || '';
  const buscar      = (document.getElementById('at-f-buscar')?.value || '').toLowerCase().trim();

  const mesLabel = getMesLabel(mes);

  const fechaExacta = document.getElementById('at-f-fecha')?.value || '';

  // Base filter
  let regs = DB.registros.filter(r => r.fecha.startsWith(mes));
  if (fechaExacta) regs = regs.filter(r => r.fecha === fechaExacta);
  if (consultorio) regs = regs.filter(r => r.consultorio === consultorio);
  if (medico)      regs = regs.filter(r => r.medico === medico);
  if (cobertura === 'os')         regs = regs.filter(r => r.os !== 'Particular');
  if (cobertura === 'particular') regs = regs.filter(r => r.os === 'Particular');
  if (buscar) regs = regs.filter(r =>
    (r.os||'').toLowerCase().includes(buscar) ||
    (r.prestacion||'').toLowerCase().includes(buscar) ||
    (r.plan||'').toLowerCase().includes(buscar) ||
    (r.medico||'').toLowerCase().includes(buscar)
  );

  // KPIs — render in both tabs
  const totConsultas = regs.reduce((s,r) => s + totalConsultasReg(r), 0);
  const totOS        = regs.reduce((s,r) => s + r.cantidad, 0);
  const totEfect     = regs.reduce((s,r) => s + r.partEfectivo, 0);
  const totTransf    = regs.reduce((s,r) => s + r.partTransf, 0);
  const totFacturado = regs.reduce((s,r) => s + facturadoReg(r), 0);
  const totIVA       = regs.reduce((s,r) => s + ivaReg(r), 0);
  const totHonor     = regs.reduce((s,r) => s + honorMedicoReg(r), 0);

  const kpiHTML = `
    <div class="stat-card" style="border-left:3px solid var(--accent2);">
      <div class="stat-label">Total atenciones</div>
      <div class="stat-value">${totConsultas}</div>
      <div class="stat-sub">OS: ${totOS} · Ef: ${totEfect} · Tr: ${totTransf}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--accent);">
      <div class="stat-label">Facturado neto</div>
      <div class="stat-value finance-num" style="font-size:20px;">${fmt((totFacturado-totIVA))}</div>
      <div class="stat-sub">+ IVA ${fmt(totIVA)}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--warn);">
      <div class="stat-label">Total con IVA</div>
      <div class="stat-value finance-num" style="font-size:20px;">${fmt(totFacturado)}</div>
      <div class="stat-sub">${mesLabel}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid #7c3aed;">
      <div class="stat-label">Honorarios médicos</div>
      <div class="stat-value finance-num" style="font-size:20px;">${fmt(totHonor)}</div>
      <div class="stat-sub">Total a liquidar</div>
    </div>`;

  const kpis = document.getElementById('at-kpis');
  if (kpis) kpis.innerHTML = kpiHTML;
  const kpisDiario = document.getElementById('at-diario-kpis');
  if (kpisDiario) kpisDiario.innerHTML = kpiHTML;

  // Resumen por médico
  const subtitulo = document.getElementById('at-resumen-subtitulo');
  if (subtitulo) subtitulo.textContent = mesLabel;

  const medMap = {};
  regs.forEach(r => {
    if (!medMap[r.medico]) medMap[r.medico] = { medico:r.medico, os:0, ef:0, tr:0, honOS:0, honPart:0, sedes:new Set() };
    const m = medMap[r.medico];
    m.os += r.cantidad;
    m.ef += r.partEfectivo;
    m.tr += r.partTransf;
    if (r.consultorio) m.sedes.add(r.consultorio);
    // honorALiquidarReg() (fuente única): OS/SinCargo → igual que antes; Particular →
    // SOLO transferencia (el efectivo ya se pagó en el momento) y al precio REAL cobrado,
    // no al estándar de config — antes esta fila usaba siempre el valor estándar y sumaba
    // también el efectivo, así que "Total liq." quedaba mal si se cobró un monto especial.
    if (r.os === 'Particular') { m.honPart += honorALiquidarReg(r); }
    else { m.honOS += honorALiquidarReg(r); }
  });
  const resumenTbody = document.getElementById('at-resumen-tbody');
  if (resumenTbody) {
    const rows = Object.values(medMap).sort((a,b) => (b.os+b.ef+b.tr)-(a.os+a.ef+a.tr));
    const med0 = DB.medicos.find(m=>m.nombre===rows[0]?.medico);
    resumenTbody.innerHTML = rows.map(m => {
      const med = DB.medicos.find(x=>x.nombre===m.medico);
      const total = m.os + m.ef + m.tr;
      const totLiq = m.honOS + m.honPart;
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${med?.color||'#888'};flex-shrink:0;"></div>
            <span style="font-weight:600;">${soloApellido(m.medico)}</span>
          </div>
        </td>
        <td>${(() => {
          const sedes = [...(m.sedes || [])].filter(Boolean);
          if (sedes.length === 0) return '<span class="pill pill-os">—</span>';
          const pill = s => `<span class="pill ${s==='Palpa'?'pill-palpa':s==='Haedo'?'pill-haedo':'pill-os'}" style="font-size:10px;">${s}</span>`;
          return ['Palpa','Haedo'].filter(s=>sedes.includes(s)).map(pill).join(' ') +
                 sedes.filter(s=>s!=='Palpa'&&s!=='Haedo').map(pill).join(' ');
        })()}</td>
        <td style="font-weight:700; color:var(--accent2);">${m.os}</td>
        <td style="color:var(--success);">${m.ef}</td>
        <td style="color:var(--accent2);">${m.tr}</td>
        <td style="font-weight:800; font-size:15px;">${total}</td>
        <td class="finance-num">${fmt(m.honOS)}</td>
        <td class="finance-num">${fmt(m.honPart)}</td>
        <td class="finance-num" style="font-weight:700; color:#7c3aed;">${fmt(totLiq)}</td>
      </tr>`;
    }).join('');
  }

  // Desglose por OS
  const osMap = {};
  regs.filter(r=>r.os !== 'Particular').forEach(r => {
    // exentaReg() (fuente única) normaliza r.exenta indefinido con el default de la OS —
    // agrupar por r.exenta crudo podía juntar mal una fila sin exenta definida como
    // "gravada" cuando en realidad esa OS es exenta por defecto.
    const exenta = exentaReg(r, r.os);
    const key = `${r.os}||${r.plan}||${exenta?'exenta':'grav'}`;
    if (!osMap[key]) osMap[key] = { os:r.os, plan:r.plan, exenta, cant:0, valUnit:r.valorUnit };
    osMap[key].cant += r.cantidad;
  });
  const osTbody = document.getElementById('at-os-tbody');
  const osTfoot = document.getElementById('at-os-tfoot');
  if (osTbody) {
    const osRows = Object.values(osMap).sort((a,b) => b.cant - a.cant);
    let sumNeto=0, sumIVA=0, sumTot=0;
    osTbody.innerHTML = osRows.map(o => {
      const neto = o.cant * o.valUnit;
      const iva  = ivaReg({ os: o.os, cantidad: o.cant, valorUnit: o.valUnit, exenta: o.exenta });
      const tot  = neto + iva;
      sumNeto+=neto; sumIVA+=iva; sumTot+=tot;
      return `<tr>
        <td style="font-weight:600;">${o.os}</td>
        <td><span class="tag">${o.plan||'—'}</span></td>
        <td>
          <span class="pill" style="${o.exenta?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}">
            ${o.exenta ? '✓ Exenta' : o.os==='CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%'}
          </span>
        </td>
        <td style="font-weight:700; text-align:center;">${o.cant}</td>
        <td class="finance-num">${fmt(o.valUnit)}</td>
        <td class="finance-num">${fmt(neto)}</td>
        <td class="finance-num" style="color:${iva>0?'var(--warn)':'var(--text3)'};">${iva>0?fmt(iva):'—'}</td>
        <td class="finance-num" style="font-weight:700;">${fmt(tot)}</td>
      </tr>`;
    }).join('');
    if (osTfoot) osTfoot.innerHTML = `
      <tr style="background:var(--surface2); font-weight:700; border-top:2px solid var(--border2);">
        <td colspan="4" style="padding:10px 14px; color:var(--text2);">TOTALES</td>
        <td></td>
        <td class="finance-num" style="padding:10px 14px;">${fmt(sumNeto)}</td>
        <td class="finance-num" style="padding:10px 14px; color:var(--warn);">${fmt(sumIVA)}</td>
        <td class="finance-num" style="padding:10px 14px; color:var(--accent); font-size:15px;">${fmt(sumTot)}</td>
      </tr>`;
  }

  // Por día
  const diarioTbody = document.getElementById('at-diario-tbody');
  if (diarioTbody) {
    const sorted = [...regs].sort((a,b) => b.fecha.localeCompare(a.fecha) || a.medico.localeCompare(b.medico));
    diarioTbody.innerHTML = sorted.length ? sorted.map(r => {
      const honor   = honorMedicoReg(r);
      const iva     = ivaReg(r);
      const neto    = subtotalNeto(r);
      const facturado = neto + iva;
      const esPart  = r.os === 'Particular';
      const osLabel = esPart ? '<span class="pill pill-particular" style="font-size:10px;">Part.</span>' : r.os;
      const prestLabel = (r.prestacion||'').replace('oftalmológica','oftalmol.').replace('Consulta vestida','Consulta').replace('computarizada','comp.').replace('unilateral','unilat.');
      const [y,m,d] = r.fecha.split('-');
      const cantShow = esPart
        ? (r.partEfectivo > 0 && r.partTransf > 0 ? `${r.partEfectivo}ef+${r.partTransf}tr` : r.partEfectivo > 0 ? `${r.partEfectivo}` : `${r.partTransf}`)
        : (r.cantidad || '—');
      return `<tr id="reg-row-${r.id}">
        <td style="white-space:nowrap;font-size:12px;">${d}/${m}/${y.slice(2)}</td>
        <td style="font-weight:600;font-size:12px;">${soloApellido(r.medico)}</td>
        <td><span class="pill ${r.consultorio==='Palpa'?'pill-palpa':'pill-haedo'}" style="font-size:10px;">${r.consultorio}</span></td>
        <td style="font-size:12px;">${osLabel}${r.plan?` <span style="font-size:10px;color:var(--text3);">(${r.plan})</span>`:''}</td>
        <td style="font-size:11px;color:var(--text3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.prestacion||''}">${prestLabel||'—'}</td>
        <td style="text-align:center;font-weight:700;">${r.cantidad||'—'}</td>
        <td style="text-align:center;color:var(--success);font-weight:700;">${r.partEfectivo||'—'}</td>
        <td style="text-align:center;color:var(--accent2);font-weight:700;">${r.partTransf||'—'}</td>
        <td class="finance-num" style="font-size:12px;color:var(--warn);">${iva>0?fmt(iva):'—'}</td>
        <td class="finance-num" style="font-size:12px;font-weight:700;">${facturado>0?fmt(facturado):'—'}</td>
        <td class="finance-num" style="font-size:12px;color:#7c3aed;font-weight:700;">${honor>0?fmt(honor):'—'}</td>
        <td>
          <div style="display:flex;gap:3px;">
            <button class="btn btn-secondary btn-sm" onclick="editarRegistro(${r.id})" title="Editar">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="eliminarRegistro(${r.id})" title="Eliminar">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text3);">${buscar||fechaExacta?'Sin resultados para este filtro':'Sin registros para este período'}</td></tr>`;
  }
}

function eliminarRegistro(id) {
  const r = DB.registros.find(x => x.id === id);
  if (!r) return;
  if (regBloqueado(r)) {
    showToast('🔒 No se puede eliminar: el período de este médico ya está cerrado. Reabrí la liquidación primero.');
    return;
  }
  const label = r.os === 'Particular'
    ? `${soloApellido(r.medico)} · Particular · ${r.fecha}`
    : `${soloApellido(r.medico)} · ${r.os} · ${r.fecha}`;

  // Movimientos de caja chica (efectivo) vinculados a este registro (por regId)
  let movsVinculados = DB.cajaChica.filter(m => m.regId === id);
  // Registros viejos sin regId: buscar por coincidencia (fecha + consultorio + concepto del médico)
  if (movsVinculados.length === 0) {
    const ape = soloApellido(r.medico);
    movsVinculados = DB.cajaChica.filter(m =>
      m.regId === undefined && m.fecha === r.fecha && m.consultorio === r.consultorio &&
      (m.origen === 'Efectivo' || m.origen === 'Copago' || m.origen === 'Honorario') &&
      m.concepto && m.concepto.includes(ape)
    );
  }

  // Movimientos de banco/transferencia (Caja) vinculados a este registro (por regId)
  let movsBancoVinc = DB.movimientos.filter(m => m.regId === id);
  // Registros viejos sin regId: buscar por coincidencia (particular o copago por transferencia)
  if (movsBancoVinc.length === 0) {
    const ape = soloApellido(r.medico);
    movsBancoVinc = DB.movimientos.filter(m =>
      m.regId === undefined && m.fecha === r.fecha &&
      (m.origen === 'Particular' || m.origen === 'Copago') &&
      m.desc && m.desc.includes(ape)
    );
  }

  let msg = `¿Eliminar este registro?\n\n${label}`;
  const todosMovs = [...movsVinculados, ...movsBancoVinc];
  if (todosMovs.length > 0) {
    const detalle = todosMovs.map(m => `• ${m.tipo} · ${m.concepto || m.desc} · ${fmt(m.monto)}`).join('\n');
    msg += `\n\nTambién se eliminarán estos movimientos de caja asociados:\n${detalle}`;
  }
  if (!confirm(msg)) return;

  DB.registros = DB.registros.filter(x => x.id !== id); marcarCambios('registros');
  if (movsVinculados.length > 0) {
    const ids = new Set(movsVinculados.map(m => m.id));
    DB.cajaChica = DB.cajaChica.filter(m => !ids.has(m.id));
    marcarCambios('cajaChica');
    renderCajaChica();
  }
  if (movsBancoVinc.length > 0) {
    const idsB = new Set(movsBancoVinc.map(m => m.id));
    DB.movimientos = DB.movimientos.filter(m => !idsB.has(m.id));
    marcarCambios('movimientos');
  }
  renderFinanzas();
  renderAtenciones();
  showToast(todosMovs.length > 0 ? '✓ Registro y movimiento(s) de caja eliminados' : '✓ Registro eliminado');
}

function editarRegistro(id) {
  const r = DB.registros.find(x => x.id === id);
  if (!r) return;
  if (regBloqueado(r)) {
    showToast('🔒 Este período ya está cerrado. Reabrí la liquidación del médico para poder editar.');
    return;
  }

  // Populate modal fields
  document.getElementById('edit-reg-id').value = id;
  document.getElementById('edit-reg-fecha').value = r.fecha;
  document.getElementById('edit-reg-medico').innerHTML =
    optionsMedicos(r.medico);
  document.getElementById('edit-reg-consultorio').value = r.consultorio;
  document.getElementById('edit-reg-os').value = r.os;

  const esParticular = r.os === 'Particular';
  document.getElementById('edit-reg-os-row').style.display   = esParticular ? 'none' : '';
  document.getElementById('edit-reg-os-fields').style.display = esParticular ? 'none' : '';
  document.getElementById('edit-reg-part-fields').style.display = esParticular ? '' : 'none';

  document.getElementById('edit-reg-plan').value       = r.plan || '';
  document.getElementById('edit-reg-cant').value       = r.cantidad || 0;
  document.getElementById('edit-reg-valunit').value    = r.valorUnit || 0;
  document.getElementById('edit-reg-part-ef').value    = r.partEfectivo || 0;
  document.getElementById('edit-reg-part-ef-val').value= r.partEfVal || DB.config.valorConsultaParticular;
  document.getElementById('edit-reg-part-tr').value    = r.partTransf || 0;
  document.getElementById('edit-reg-part-tr-val').value= r.partTrVal || DB.config.valorConsultaParticular;
  document.getElementById('edit-reg-paciente').value      = r.paciente || '';
  document.getElementById('edit-reg-autorizacion').value  = r.autorizacion || '';

  const ivaBtn = document.getElementById('edit-reg-iva');
  ivaBtn.textContent = r.exenta ? '✓ Exenta' : (r.os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%');
  ivaBtn.style.cssText = r.exenta
    ? 'background:var(--success-light);color:var(--success);cursor:pointer;'
    : 'background:var(--warn-light);color:var(--warn);cursor:pointer;';
  document.getElementById('edit-reg-iva-val').value = r.exenta ? '1' : '0';

  openModal('modal-edit-registro');
}

function editarRegOSChange() {
  const os = document.getElementById('edit-reg-os').value;
  const esParticular = os === 'Particular';
  document.getElementById('edit-reg-os-fields').style.display  = esParticular ? 'none' : '';
  document.getElementById('edit-reg-part-fields').style.display = esParticular ? '' : 'none';
  // Auto-fill valor unitario desde el nomenclador (valorConsultaOS)
  if (!esParticular) {
    const val = valorConsultaOS(os);
    document.getElementById('edit-reg-valunit').value = val;
    const exenta = getExentaForOS(os);
    document.getElementById('edit-reg-iva-val').value = exenta ? '1' : '0';
    const btn = document.getElementById('edit-reg-iva');
    const lbl = exenta ? '✓ Exenta' : (os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%');
    btn.textContent = lbl;
    btn.style.cssText = exenta
      ? 'background:var(--success-light);color:var(--success);cursor:pointer;'
      : 'background:var(--warn-light);color:var(--warn);cursor:pointer;';
  }
}

function editarRegToggleIVA() {
  const hidden = document.getElementById('edit-reg-iva-val');
  const btn    = document.getElementById('edit-reg-iva');
  const os     = document.getElementById('edit-reg-os')?.value || '';
  const esExenta = hidden.value === '1';
  hidden.value = esExenta ? '0' : '1';
  const gravLabel = os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%';
  btn.textContent = esExenta ? gravLabel : '✓ Exenta';
  btn.style.cssText = esExenta
    ? 'background:var(--warn-light);color:var(--warn);cursor:pointer;'
    : 'background:var(--success-light);color:var(--success);cursor:pointer;';
}

function guardarEdicionRegistro() {
  const id = parseInt(document.getElementById('edit-reg-id').value);
  const r  = DB.registros.find(x => x.id === id);
  if (!r) return;
  if (regBloqueado(r)) {
    showToast('🔒 No se puede editar: el período de este médico ya está cerrado. Reabrí la liquidación primero.');
    return;
  }

  r.fecha       = document.getElementById('edit-reg-fecha').value;
  r.medico      = document.getElementById('edit-reg-medico').value;
  r.consultorio = document.getElementById('edit-reg-consultorio').value;
  r.os          = document.getElementById('edit-reg-os').value;
  r.plan        = document.getElementById('edit-reg-plan').value;
  r.cantidad    = parseInt(document.getElementById('edit-reg-cant').value) || 0;
  r.valorUnit   = parseFloat(document.getElementById('edit-reg-valunit').value) || 0;
  r.exenta      = document.getElementById('edit-reg-iva-val').value === '1';
  r.partEfectivo= parseInt(document.getElementById('edit-reg-part-ef').value) || 0;
  r.partEfVal   = parseFloat(document.getElementById('edit-reg-part-ef-val').value) || DB.config.valorConsultaParticular;
  r.partTransf  = parseInt(document.getElementById('edit-reg-part-tr').value) || 0;
  r.partTrVal   = parseFloat(document.getElementById('edit-reg-part-tr-val').value) || DB.config.valorConsultaParticular;
  r.paciente      = document.getElementById('edit-reg-paciente').value.trim();
  r.autorizacion  = document.getElementById('edit-reg-autorizacion').value.trim();

  closeModal('modal-edit-registro');
  renderAtenciones();
  marcarCambios('registros'); showToast(`✓ Registro actualizado — ${soloApellido(r.medico)} · ${r.os} · ${r.fecha}`);
}


function switchAtTab(tab, el) {
  document.querySelectorAll('#section-atenciones .tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['diario','resumen'].forEach(t => {
    const d = document.getElementById(`at-tab-${t}`);
    if (d) d.style.display = t === tab ? '' : 'none';
  });
  renderAtenciones();
}

function resetFiltros() {
  const mes = document.getElementById('at-f-mes');
  if (mes) mes.selectedIndex = 0;
  const fecha = document.getElementById('at-f-fecha');
  if (fecha) fecha.value = '';
  const c = document.getElementById('at-f-consultorio');
  if (c) c.value = '';
  const m = document.getElementById('at-f-medico');
  if (m) m.value = '';
  const cob = document.getElementById('at-f-cobertura');
  if (cob) cob.value = '';
  const buscar = document.getElementById('at-f-buscar');
  if (buscar) buscar.value = '';
  renderAtenciones();
}

// ── Carga masiva ──
// Lista de OS para selectores: se deriva de las obras sociales reales (DB.obrasSociales),
// excluyendo Particular (que tiene su propio botón de carga). SinCargo sí se incluye.
function getOSList() {
  return (DB.obrasSociales || [])
    .filter(o => o.estado !== 'Inactiva' && o.nombre !== 'Particular')
    .map(o => o.nombre);
}
// Compatibilidad: CM_OS_LIST sigue existiendo como getter dinámico
Object.defineProperty(window, 'CM_OS_LIST', { get: getOSList });

// Lista de consultorios ACTIVOS para selectores: se deriva de DB.consultorios
// (gestionados en Configuración → Consultorios). Base única: cualquier consultorio
// nuevo/renombrado/dado de baja se refleja en todos los selectores de la app.
function getConsultoriosList() {
  return (DB.consultorios || [])
    .filter(c => c.estado !== 'Inactiva')
    .map(c => c.nombre);
}

// ── Filtro por letra en desplegables de prestaciones ────────────────────────
// Oculta (no elimina) las <option> de un <select> cuyo texto no contenga lo
// tipeado, insensible a mayúsculas/acentos. No toca value/data-*/selección
// actual: el select sigue funcionando exactamente igual, solo se ven menos
// opciones al desplegarlo. Se usa junto a un <input> de búsqueda arriba del
// select (ver at-prestacion-sel, pago-deriv-prest y las filas de carga masiva).
function _normalizarTexto(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function filtrarOpcionesSelect(selectEl, texto) {
  if (!selectEl) return;
  const q = _normalizarTexto(texto).trim();
  [...selectEl.options].forEach(opt => {
    opt.style.display = (!q || _normalizarTexto(opt.text).includes(q)) ? '' : 'none';
  });
}

// Distinguir consultas de prestaciones por descripción
function esConsulta(desc) {
  if (!desc) return false;
  const d = desc.toLowerCase();
  return d.includes('consulta') || d.includes('visita a consultorio') || d.includes('visita en consultorio');
}

// Un registro paga honorario solo si es una consulta (no cirugías, estudios, etc.)

function getConsultasDeOS(os) {
  // Filtra por categoría (categoriaPrestacion, fuente única) — así respeta el override
  // p.categoria, igual que getEstudiosDeOS/getPracticasDeOS. Antes usaba esConsulta(desc)
  // directo y una consulta re-categorizada a mano quedaba desincronizada entre los filtros.
  return DB.prestaciones.filter(p => p.os === os && categoriaPrestacion(p) === 'consulta');
}

// ÚNICA base del valor de consulta de una OS: el NOMENCLADOR (DB.prestaciones).
// Si la OS tiene su consulta cargada, se usa ese valor (la primera = primera opción del
// desplegable). CONSULTA_VALORES queda SOLO como fallback para las OS que todavía no
// tienen su consulta en el nomenclador (hoy: SinCargo). Así, actualizar el nomenclador
// actualiza el valor en todos lados.
function valorConsultaOS(os) {
  const consultas = getConsultasDeOS(os);
  if (consultas.length && consultas[0].valOS) return consultas[0].valOS;
  return CONSULTA_VALORES[os] || 22000;
}

function getPrestacionesSinConsulta(os) {
  // "no consulta" = estudios + prácticas (alias viejo del botón único de Atención rápida).
  // Por categoría (fuente única), consistente con getConsultasDeOS.
  return DB.prestaciones.filter(p => p.os === os && categoriaPrestacion(p) !== 'consulta');
}

// Filtros por categoría (fuente única: categoriaPrestacion en js/calculos.js).
// Atención rápida ofrece los 3 botones Consulta / Estudio / Práctica con estos.
function getEstudiosDeOS(os) {
  return DB.prestaciones.filter(p => p.os === os && categoriaPrestacion(p) === 'estudio');
}
function getPracticasDeOS(os) {
  return DB.prestaciones.filter(p => p.os === os && categoriaPrestacion(p) === 'practica');
}

function makeOSSelect(onChange) {
  return `<select onchange="${onChange}" style="width:128px; font-size:12px; padding:4px 5px;">
    ${CM_OS_LIST.map(o => `<option value="${o}">${o}</option>`).join('')}
  </select>`;
}

function makeIVABadge(exenta, rowId, os) {
  const label = exenta ? '✓ Exenta' : (os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%');
  const style = exenta
    ? 'background:var(--success-light);color:var(--success);cursor:pointer;'
    : 'background:var(--warn-light);color:var(--warn);cursor:pointer;';
  return `<span class="iva-badge pill" style="${style}" onclick="toggleIVARow('${rowId}')" title="Clic para cambiar">${label}</span>
  <input type="hidden" class="iva-hidden" value="${exenta ? '1' : '0'}">`;
}

function toggleIVARow(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  const hidden = row.querySelector('.iva-hidden');
  const badge  = row.querySelector('.iva-badge');
  const osSel  = row.querySelector('select');
  const os     = osSel ? osSel.value : '';
  const esExenta = hidden.value === '1';
  hidden.value = esExenta ? '0' : '1';
  const ahora = !esExenta;
  badge.textContent = ahora ? '✓ Exenta' : (os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%');
  badge.style.cssText = ahora
    ? 'background:var(--success-light);color:var(--success);cursor:pointer;'
    : 'background:var(--warn-light);color:var(--warn);cursor:pointer;';
  recalcCM();
}

// ── TABLA CONSULTAS ──────────────────────────────────────────────────────────
function agregarFilaConsulta() {
  const tbody = document.getElementById('cm-consultas-tbody');
  const id = 'ccrow_' + Date.now();
  const os0 = CM_OS_LIST[0];
  const consultas0 = getConsultasDeOS(os0);
  const val0 = valorConsultaOS(os0);
  // data-exenta POR PRESTACIÓN (exentaPrestacion): respeta el override p.exenta del
  // nomenclador. El badge inicial de la fila sigue a la primera opción del select.
  const exenta0 = consultas0.length ? exentaPrestacion(consultas0[0]) : getExentaForOS(os0);
  const opts0 = consultas0.length
    ? consultas0.map(p => `<option value="${p.id}" data-val="${p.valOS}" data-exenta="${exentaPrestacion(p)?'1':'0'}" data-os="${os0}">[${p.codigo}] ${p.desc} — ${fmt(p.valOS)}</option>`).join('')
    : `<option value="0" data-val="${val0}" data-exenta="${getExentaForOS(os0)?'1':'0'}" data-os="${os0}">Consulta vestida — ${fmt(val0)}</option>`;

  tbody.insertAdjacentHTML('beforeend', `
    <tr id="${id}">
      <td style="padding:5px 5px;">${makeOSSelect(`onCMConsultaOSChange(this,'${id}')`)}</td>
      <td style="padding:5px 5px;">
        <input type="text" class="cm-prest-filtro" placeholder="🔎 filtrar…" oninput="filtrarOpcionesSelect(this.nextElementSibling, this.value)" style="width:100%; font-size:10px; padding:2px 4px; margin-bottom:2px; border:1px solid var(--border2); border-radius:4px;">
        <select class="cm-prest-sel" onchange="onCMConsultaPrestChange(this,'${id}')" style="width:100%; font-size:11px; padding:4px 5px;">${opts0}</select>
      </td>
      <td style="padding:5px 5px;">
        <input type="text" class="cm-plan-input" placeholder="Plan" style="width:68px; font-size:12px; padding:4px 5px;">
      </td>
      <td style="padding:5px 5px; text-align:center;">
        <input type="number" min="0" value="0" oninput="recalcCM()" class="cm-cant-input" style="width:52px; font-size:15px; font-weight:700; text-align:center; padding:4px;">
      </td>
      <td style="padding:5px 5px;">
        <input type="number" min="0" value="${val0}" oninput="recalcCM()" class="cm-val-input" style="width:88px; font-size:12px; padding:4px 5px;">
      </td>
      <td style="padding:5px 8px; text-align:center;">${makeIVABadge(exenta0, id, os0)}</td>
      <td style="padding:5px 8px; text-align:right; font-weight:700; font-family:monospace;" class="cm-sub">$0</td>
      <td style="text-align:center; padding:2px;">
        <button onclick="document.getElementById('${id}').remove(); recalcCM();" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:15px;">✕</button>
      </td>
    </tr>`);
  recalcCM();
}

function onCMConsultaOSChange(sel, rowId) {
  const row = document.getElementById(rowId); if (!row) return;
  const os = sel.value;
  const consultas = getConsultasDeOS(os);
  const val0 = valorConsultaOS(os);
  // exentaPrestacion (fuente única): el badge de la fila sigue a la primera opción.
  const exenta = consultas.length ? exentaPrestacion(consultas[0]) : getExentaForOS(os);
  const prestSel = row.querySelector('.cm-prest-sel');
  if (prestSel) {
    prestSel.innerHTML = consultas.length
      ? consultas.map(p => `<option value="${p.id}" data-val="${p.valOS}" data-exenta="${exentaPrestacion(p)?'1':'0'}" data-os="${os}">[${p.codigo}] ${p.desc} — ${fmt(p.valOS)}</option>`).join('')
      : `<option value="0" data-val="${val0}" data-exenta="${getExentaForOS(os)?'1':'0'}" data-os="${os}">Consulta vestida — ${fmt(val0)}</option>`;
  }
  const prestFiltro = row.querySelector('.cm-prest-filtro');
  if (prestFiltro) prestFiltro.value = '';
  const valInp = row.querySelector('.cm-val-input');
  if (valInp) valInp.value = val0;
  updateIVAInRow(row, exenta, os);
  recalcCM();
}

function onCMConsultaPrestChange(sel, rowId) {
  const row = document.getElementById(rowId); if (!row) return;
  const opt = sel.options[sel.selectedIndex];
  const val = parseFloat(opt.getAttribute('data-val')) || 0;
  const exenta = opt.getAttribute('data-exenta') === '1';
  const os = opt.getAttribute('data-os') || row.querySelector('select')?.value || '';
  const valInp = row.querySelector('.cm-val-input');
  if (valInp) valInp.value = val;
  updateIVAInRow(row, exenta, os);
  recalcCM();
}

// ── TABLA PRESTACIONES ───────────────────────────────────────────────────────
function agregarFilaPrestacion() {
  const tbody = document.getElementById('cm-prest-tbody');
  const id = 'cprow_' + Date.now();
  const os0 = CM_OS_LIST[0];
  const prests0 = getPrestacionesSinConsulta(os0);
  const val0 = prests0[0]?.valOS || 0;
  // exentaPrestacion (fuente única): respeta el override p.exenta del nomenclador.
  const exenta0 = prests0.length ? exentaPrestacion(prests0[0]) : getExentaForOS(os0);
  const opts0 = prests0.length
    ? prests0.map(p => `<option value="${p.id}" data-val="${p.valOS}" data-exenta="${exentaPrestacion(p)?'1':'0'}" data-os="${os0}">[${p.codigo}] ${p.desc} — ${fmt(p.valOS)}</option>`).join('')
    : `<option value="0" data-val="0" data-exenta="${getExentaForOS(os0)?'1':'0'}" data-os="${os0}">Sin prestaciones — cargar valor manualmente</option>`;

  tbody.insertAdjacentHTML('beforeend', `
    <tr id="${id}">
      <td style="padding:5px 5px;">${makeOSSelect(`onCMPrestOSChange(this,'${id}')`)}</td>
      <td style="padding:5px 5px;">
        <input type="text" class="cm-prest-filtro" placeholder="🔎 filtrar…" oninput="filtrarOpcionesSelect(this.nextElementSibling, this.value)" style="width:100%; font-size:10px; padding:2px 4px; margin-bottom:2px; border:1px solid var(--border2); border-radius:4px;">
        <select class="cm-prest-sel" onchange="onCMPrestPrestChange(this,'${id}')" style="width:100%; font-size:11px; padding:4px 5px;">${opts0}</select>
      </td>
      <td style="padding:5px 5px; text-align:center;">
        <input type="number" min="0" value="1" oninput="recalcCM()" class="cm-cant-input" style="width:52px; font-size:14px; font-weight:700; text-align:center; padding:4px;">
      </td>
      <td style="padding:5px 5px;">
        <input type="number" min="0" value="${val0}" oninput="recalcCM()" class="cm-val-input" style="width:88px; font-size:12px; padding:4px 5px;">
      </td>
      <td style="padding:5px 8px; text-align:center;">${makeIVABadge(exenta0, id, os0)}</td>
      <td style="padding:5px 8px; text-align:right; font-weight:700; font-family:monospace;" class="cm-sub">$0</td>
      <td style="text-align:center; padding:2px;">
        <button onclick="document.getElementById('${id}').remove(); recalcCM();" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:15px;">✕</button>
      </td>
    </tr>`);
  recalcCM();
}

function onCMPrestOSChange(sel, rowId) {
  const row = document.getElementById(rowId); if (!row) return;
  const os = sel.value;
  const prests = getPrestacionesSinConsulta(os);
  const val0 = prests[0]?.valOS || 0;
  // exentaPrestacion (fuente única): el badge de la fila sigue a la primera opción.
  const exenta = prests.length ? exentaPrestacion(prests[0]) : getExentaForOS(os);
  const prestSel = row.querySelector('.cm-prest-sel');
  if (prestSel) {
    prestSel.innerHTML = prests.length
      ? prests.map(p => `<option value="${p.id}" data-val="${p.valOS}" data-exenta="${exentaPrestacion(p)?'1':'0'}" data-os="${os}">[${p.codigo}] ${p.desc} — ${fmt(p.valOS)}</option>`).join('')
      : `<option value="0" data-val="0" data-exenta="${getExentaForOS(os)?'1':'0'}" data-os="${os}">Sin prestaciones — cargar valor manualmente</option>`;
  }
  const prestFiltro = row.querySelector('.cm-prest-filtro');
  if (prestFiltro) prestFiltro.value = '';
  const valInp = row.querySelector('.cm-val-input');
  if (valInp) valInp.value = val0;
  updateIVAInRow(row, exenta, os);
  recalcCM();
}

function onCMPrestPrestChange(sel, rowId) {
  onCMConsultaPrestChange(sel, rowId);
}

function getExentaForOS(os) {
  if (os === 'CEMEPLA') return false;  // CEMEPLA tiene IVA 21% (no exenta)
  return !OS_GRAVADAS_SIEMPRE.has(os);
}

function getIVALabel(os, exenta) {
  if (exenta) return '✓ Exenta';
  if (os === 'CEMEPLA') return '⚡ 21%';
  return '⚡ 10.5%';
}

function updateIVAInRow(row, exenta, os) {
  const badge  = row.querySelector('.iva-badge');
  const hidden = row.querySelector('.iva-hidden');
  const label  = getIVALabel(os || '', exenta);
  if (badge)  {
    badge.textContent = label;
    badge.style.cssText = exenta
      ? 'background:var(--success-light);color:var(--success);cursor:pointer;'
      : 'background:var(--warn-light);color:var(--warn);cursor:pointer;';
  }
  if (hidden) hidden.value = exenta ? '1' : '0';
}

// ── recalcCM — dos tablas ────────────────────────────────────────────────────
function recalcCM() {
  function calcTabla(tbodyId, totalElId, esConsultas) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return { total: 0, consultas: 0, honOS: 0 };
    let total = 0, consultas = 0, honOS = 0;
    tbody.querySelectorAll('tr').forEach(row => {
      const cant   = parseInt(row.querySelector('.cm-cant-input')?.value) || 0;
      const val    = parseFloat(row.querySelector('.cm-val-input')?.value) || 0;
      const exenta = row.querySelector('.iva-hidden')?.value === '1';
      // Get OS from the select in this row
      const osSel  = row.querySelector('select');
      const os     = osSel ? osSel.value : '';
      const neto   = cant * val;
      const iva    = ivaReg({ os, cantidad: cant, valorUnit: val, exenta });
      const sub = neto + iva;
      total    += sub;
      consultas += cant;
      // Honorario solo para consultas OS (no prestaciones)
      if (esConsultas) honOS += cant * DB.config.honorarioOS;
      const subEl = row.querySelector('.cm-sub');
      if (subEl) subEl.textContent = fmt(sub);
    });
    const totEl = document.getElementById(totalElId);
    if (totEl) totEl.textContent = fmt(total);
    return { total, consultas, honOS };
  }

  const c = calcTabla('cm-consultas-tbody', 'cm-consultas-total', true);
  const p = calcTabla('cm-prest-tbody',     'cm-prest-total',     false);

  const ef    = parseInt(document.getElementById('cm-part-ef-cant')?.value) || 0;
  const efVal = parseFloat(document.getElementById('cm-part-ef-val')?.value) || 60000;
  const tr    = parseInt(document.getElementById('cm-part-tr-cant')?.value) || 0;
  const trVal = parseFloat(document.getElementById('cm-part-tr-val')?.value) || 60000;
  const subEf = ef * efVal;
  const subTr = tr * trVal;
  const honEf = ef * (efVal / 2);
  const honTr = tr * (trVal / 2);

  if (g('cm-part-ef-sub')) g('cm-part-ef-sub').textContent = fmt(subEf);
  if (g('cm-part-ef-hon')) g('cm-part-ef-hon').textContent = fmt(honEf);
  if (g('cm-part-tr-sub')) g('cm-part-tr-sub').textContent = fmt(subTr);
  if (g('cm-part-tr-hon')) g('cm-part-tr-hon').textContent = fmt(honTr);

  const totConsultas = c.consultas + p.consultas + ef + tr;
  const totCobrado   = c.total + p.total + subEf + subTr;
  const totHonOS     = c.honOS + p.honOS;

  if (g('cm-tot-consultas')) g('cm-tot-consultas').textContent = totConsultas;
  if (g('cm-tot-cobrado'))   g('cm-tot-cobrado').textContent   = fmt(totCobrado);
  if (g('cm-tot-cobrado-sub')) g('cm-tot-cobrado-sub').textContent = `OS/Prest: ${fmt((c.total+p.total))} · Part: ${fmt((subEf+subTr))}`;
  if (g('cm-tot-honor'))     g('cm-tot-honor').textContent = fmt((totHonOS + honEf + honTr));
  if (g('cm-tot-honor-sub')) g('cm-tot-honor-sub').textContent = `Hoy: ${fmt(honEf)} · Liq: ${fmt((totHonOS+honTr))}`;
}

function toggleCopagoCM() {
  const checked = document.getElementById('cm-tiene-copago').checked;
  document.getElementById('cm-copago-fields').style.display = checked ? '' : 'none';
  // Poblar OS del copago (las del grupo que maneja copago/coseguro)
  const sel = document.getElementById('cm-copago-os');
  if (sel && checked && !sel.options.length) {
    [...OS_COPAGO_ADELANTO].forEach(os => {
      const o = document.createElement('option'); o.value = os; o.textContent = os; sel.appendChild(o);
    });
  }
}

function recalcCopagoCM() {
  const unitario = parseFloat(document.getElementById('cm-copago-unitario')?.value) || 0;
  const cant     = parseInt(document.getElementById('cm-copago-cant')?.value) || 0;
  const medio    = document.getElementById('cm-copago-medio')?.value || 'Efectivo';
  const total    = unitario * cant;
  const totEl    = document.getElementById('cm-copago-total');
  const destEl   = document.getElementById('cm-copago-destino');
  if (totEl) totEl.textContent = fmt(total);
  if (destEl) {
    if (medio === 'Efectivo') {
      destEl.textContent = '→ 💵 Efectivo — ingresa a caja chica del consultorio';
      destEl.style.color = 'var(--success)';
    } else {
      destEl.textContent = '→ 🏦 Transferencia — se registra pero no va a caja chica';
      destEl.style.color = 'var(--accent2)';
    }
  }
}

function abrirPegarResumen() {
  const panel = document.getElementById('cm-paste-panel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
    if (panel.style.display !== 'none') {
      document.getElementById('cm-paste-text').focus();
    }
  }
}

// Mapeo de nombres comunes de OS del resumen → nombre en el sistema
const OS_ALIAS = {
  'osmecon': 'SAMI', 'sami': 'SAMI', 'osmecon salud': 'SAMI',
  'medicus': 'Medicus', 'mdcs': 'Medicus',
  'ioma': 'IOMA',
  'sancor': 'Sancor', 'sancor salud': 'Sancor',
  'medife': 'Medifé', 'medifé': 'Medifé', 'mf': 'Medifé',
  'doctored': 'DoctorRed', 'doctor red': 'DoctorRed',
  'premedic': 'Premedic',
  'amffa': 'AMFFA',
  'cmp': 'CMP', 'centro medico pueyrredon': 'CMP',
  'cobermed': 'CoberMed', 'cober': 'CoberMed',
  'bristol': 'Bristol', 'br': 'Bristol',
  "medical's": "Medical's", 'medicals': "Medical's", 'genesen': "Medical's",
  'asmepriv': 'ASMEPRIV', 'asm': 'ASMEPRIV',
  'bapro': 'BAPRO', 'banco provincia': 'BAPRO', 'bancaprovincia': 'BAPRO', 'bp salud': 'BAPRO',
  'luis pasteur': 'Luis Pasteur', 'lp': 'Luis Pasteur',
  'cemepla': 'CEMEPLA',
  'particular': 'Particular', 'particulares': 'Particular', 'part': 'Particular',
  // OSDE variants
  'osde': 'OSDE',
};

function normalizarOSAlias(raw) {
  const lower = raw.toLowerCase().trim();
  // Direct alias match
  if (OS_ALIAS[lower]) return { os: OS_ALIAS[lower], plan: '', osRaw: raw.trim() };
  // OSDE with plan: "OSDE - 210", "OSDE 310", "OSDE-410"
  const osdeM = lower.match(/^osde[\s\-–]*(\d{3})/);
  if (osdeM) return { os: 'OSDE', plan: osdeM[1], osRaw: raw.trim() };
  // Plain OSDE
  if (lower === 'osde') return { os: 'OSDE', plan: '', osRaw: raw.trim() };
  // Exact match against known OS names (case-insensitive). Usa las OS reales
  // (DB.obrasSociales) en vez del mapa hardcodeado: si se da de alta una OS nueva,
  // el parser la reconoce sin tener que tocar código.
  const knownOS = getOSList();
  const exactMatch = knownOS.find(os => os.toLowerCase() === lower);
  if (exactMatch) return { os: exactMatch, plan: '', osRaw: raw.trim() };
  // Unknown → Particular (don't create OS row)
  return { os: 'Particular', plan: '', osRaw: raw.trim() };
}

function parsearFecha(texto, anio) {
  // "15 de mayo", "15/05", "2026-05-15", etc.
  const meses = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,
    julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12 };
  const m1 = texto.match(/(\d{1,2})\s+de\s+(\w+)/i);
  if (m1) {
    const dia = m1[1].padStart(2,'0');
    const mes = (meses[m1[2].toLowerCase()]||1).toString().padStart(2,'0');
    return `${anio}-${mes}-${dia}`;
  }
  const m2 = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (m2) {
    const dia = m2[1].padStart(2,'0');
    const mes = m2[2].padStart(2,'0');
    const y   = m2[3] || anio;
    return `${y}-${mes}-${dia}`;
  }
  const m3 = texto.match(/(\d{4}-\d{2}-\d{2})/);
  if (m3) return m3[1];
  return '';
}

// ── Helpers puros de parseo del resumen pegado (extraídos de parsearResumenPegado) ──
// Cada uno recibe las líneas ya limpias y devuelve un dato. Sin tocar el DOM, testeables.
function detectarMedicoEnLineas(lines) {
  for (const line of lines.slice(0, 5)) {
    for (const med of DB.medicos) {
      const nombreClean = med.nombre.replace(/^Dr[a]?\. /i, '').toLowerCase();
      const apellido = nombreClean.split(/[,\s]/)[0];
      const lineL = line.toLowerCase();
      if (apellido.length >= 4 && lineL.includes(apellido)) return med.nombre;
    }
  }
  return '';
}
function detectarFechaEnLineas(lines, anio) {
  for (const line of lines) {
    const f = parsearFecha(line, anio);
    if (f) return f;
  }
  return '';
}
function detectarConsultorioEnLineas(lines, medicoDetectado) {
  for (const line of lines) {
    if (/haedo/i.test(line)) return 'Haedo';
    if (/palpa/i.test(line)) return 'Palpa';
  }
  if (medicoDetectado) {
    const med = DB.medicos.find(m => m.nombre === medicoDetectado);
    if (med && med.consultorio && med.consultorio !== 'Ambos') return med.consultorio;
  }
  return '';
}

function parsearResumenPegado() {
  const raw = document.getElementById('cm-paste-text')?.value || '';
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
  const anio = new Date().getFullYear().toString();

  // ── 1-3. Detección de médico, fecha y consultorio (funciones puras) ──
  const medicoDetectado = detectarMedicoEnLineas(lines);
  const fechaDetectada = detectarFechaEnLineas(lines, anio);
  const consultorioDetectado = detectarConsultorioEnLineas(lines, medicoDetectado);

  // ── 4. Detectar OS + cantidad ─────────────────────────────────────────────
  const osRows = [];
  let inOSSection = false;
  let particulares = 0;
  const particularesNombres = [];

  for (const line of lines) {
    // Inicio sección OS: "Obra social  Cant." o "Obra social" solo
    if (/obra social[\s\t]*cant\.?/i.test(line)) { inOSSection = true; continue; }
    // También iniciar si la línea tiene formato "TEXTO  número" y no hemos entrado aún
    // Esto cubre formatos sin encabezado explícito

    // Fin sección OS
    if (/^particulares\s*\(\d+\)/i.test(line)) { inOSSection = false; continue; }
    if (/^particulares\s+\d+$/i.test(line)) {
      const m = line.match(/(\d+)/);
      if (m) particulares = parseInt(m[1]);
      continue;
    }

    // Si no entramos aún a la sección OS, intentar detectar filas de OS
    // igualmente (formato sin encabezado)
    if (!inOSSection) {
      // Intentar parsear como "OS  número" — solo si no es una línea de metadata
      if (/^\d+$/.test(line)) continue;           // solo número → skip
      if (/^(total|con obra|sin obra|médico|medico|centro|clínica|clinica|📍)/i.test(line)) continue;
      if (parsearFecha(line, anio)) continue;       // es una fecha → skip
    }

    // Parsear fila OS (dentro o fuera de sección)
    // Primero intentar split por tab o doble espacio
    let parts = line.split(/\t|  +/).map(s => s.trim()).filter(Boolean);

    // Si no se separó (todo en un solo chunk), detectar número al inicio o al final
    if (parts.length === 1) {
      const words = line.split(/\s+/);
      const lastWord = words[words.length - 1];
      const firstWord = words[0];
      if (/^\d+$/.test(lastWord)) {
        // Formato "OS nombre 3"
        parts = [words.slice(0, -1).join(' '), lastWord];
      } else if (/^\d+$/.test(firstWord) && words.length > 1) {
        // Formato "3 OS nombre"
        parts = [words.slice(1).join(' '), firstWord];
      }
    }

    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const cant = parseInt(last);
      if (!isNaN(cant) && cant > 0 && /^\d+$/.test(last)) {
        const osRaw = parts.slice(0, parts.length - 1).join(' ').trim();
        if (osRaw.length < 2) continue;
        if (/^(total|con obra|sin obra|particulares|atendidos)/i.test(osRaw)) continue;
        const { os, plan, osRaw: rawName } = normalizarOSAlias(osRaw);
        if (os === 'Particular') {
          particulares += cant;
        } else {
          osRows.push({ osRaw: rawName || osRaw, os, plan, cant });
        }
        inOSSection = true;
        continue;
      }
    }
  }

  // Detectar nombres de particulares con indicador de pago (T)/(E) o OS entre ()
  let enNombresParticulares = false;
  let partEfectivo = 0, partTransf = 0;
  // Extra OS rows detected from individual patient names
  const extraOSRows = {};  // { osName: count }
  const nombresVistos = new Set();  // evitar contar dos veces la misma línea

  // Línea que activa explícitamente la sección de nombres: "Particulares (n)" o "n Part" o "Part"
  const esEncabezadoPart = (line) =>
    /^particulares\s*\(\d+\)/i.test(line) ||
    /^\d+\s*part(iculares?)?\.?$/i.test(line) ||
    /^part(iculares?)?\.?\s*\(?\d+\)?$/i.test(line);

  for (const line of lines) {
    // Marcador de pago al final de la línea, en cualquier parte del texto
    const parenMatch = line.match(/\(([^)]+)\)\s*$/);
    const parenContent = parenMatch ? parenMatch[1].trim() : '';
    const cleanName = line.replace(/\s*\([^)]+\)\s*$/, '').trim();

    const esEfectivo  = /^(e|ef|efe|efec|efect|efectivo|cash|c|ctdo|cont|contado|\$)$/i.test(parenContent);
    const esTransf    = /^(t|tr|tra|trans|transf|transfer|transferencia|transferido|transferec?ncia)$/i.test(parenContent);

    // Si la línea tiene un marcador de pago y un nombre razonable → es un particular
    if (parenContent && (esEfectivo || esTransf) && cleanName.length >= 2 && !/^\d+$/.test(cleanName)) {
      if (nombresVistos.has(line)) continue;
      nombresVistos.add(line);
      if (esEfectivo) { particularesNombres.push({ nombre: cleanName, medio: 'E' }); partEfectivo++; }
      else            { particularesNombres.push({ nombre: cleanName, medio: 'T' }); partTransf++; }
      continue;
    }

    // Si la línea tiene una OS reconocida entre paréntesis → es un paciente con OS (en cualquier parte)
    if (parenContent && cleanName.length >= 2 && !/^\d+$/.test(cleanName) && !esEncabezadoPart(line)) {
      const { os, plan } = normalizarOSAlias(parenContent);
      if (os !== 'Particular') {
        if (nombresVistos.has(line)) continue;
        nombresVistos.add(line);
        extraOSRows[os] = extraOSRows[os] || { os, plan, cant: 0 };
        extraOSRows[os].cant++;
        particularesNombres.push({ nombre: cleanName, medio: null, os, plan });
        continue;
      }
    }

    // Activar modo "sección de nombres" con encabezados tipo "Particulares (2)" / "2 Part"
    if (esEncabezadoPart(line)) { enNombresParticulares = true; continue; }

    if (enNombresParticulares) {
      if (!line || /^\d+$/.test(line) || /^(total|con obra|obra social|cant)/i.test(line)) continue;
      // Líneas que son encabezados/etiquetas, no nombres de pacientes
      if (/^(pacientes?|particulares?|part\.?|nombres?|listado|detalle)\s*:?\s*\(?\d*\)?$/i.test(line)) continue;
      if (line.includes(',') || /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(line) || /^[a-záéíóúñ]/.test(line)) {
        if (nombresVistos.has(line)) continue;
        // Nombre sin marcador → particular sin medio definido
        nombresVistos.add(line);
        particularesNombres.push({ nombre: cleanName || line, medio: null, nota: parenContent || undefined });
      }
    }
  }
  // Cantidad de particulares = los nombres detectados (sin OS), si hubo nombres.
  // Los nombres con marcador (e)/(t) son la fuente de verdad; el "Part N" es solo total
  // de referencia y NO debe sumarse aparte (si no, se duplican).
  const nombresConMarcador = particularesNombres.filter(p => p.medio === 'E' || p.medio === 'T').length;
  if (particularesNombres.length > 0) {
    const sinOS = particularesNombres.filter(p => !p.os).length;
    // Si los nombres detectados cubren (o superan) el conteo, usamos los nombres.
    if (sinOS >= particulares || nombresConMarcador > 0) {
      particulares = Math.max(sinOS, partEfectivo + partTransf);
    }
  }

  // OS no reconocidas → sumar a particulares
  const unknownRows = osRows.filter(r => r.os === 'Particular');
  const knownRows   = osRows.filter(r => r.os !== 'Particular');
  unknownRows.forEach(r => { particulares += r.cant; });

  // Agregar OS detectadas por nombre individual — sumar a las filas existentes
  Object.values(extraOSRows).forEach(extra => {
    const existing = knownRows.find(r => r.os === extra.os && r.plan === extra.plan);
    if (existing) {
      existing.cant += extra.cant;
    } else {
      knownRows.push(extra);
    }
  });

  // ── 5. Aplicar al modal ───────────────────────────────────────────────────
  if (medicoDetectado) {
    const sel = document.getElementById('cm-medico');
    if (sel) { sel.value = medicoDetectado; actualizarCMConsultorio(); }
  }
  if (fechaDetectada) {
    const inp = document.getElementById('cm-fecha');
    if (inp) inp.value = fechaDetectada;
  }
  if (consultorioDetectado) {
    const sel = document.getElementById('cm-consultorio');
    if (sel) sel.value = consultorioDetectado;
  }

  // Cargar filas de OS conocidas
  if (knownRows.length > 0) {
    const tbody = document.getElementById('cm-consultas-tbody');
    if (tbody) tbody.innerHTML = '';
    knownRows.forEach(({ os, plan, cant }) => {
      agregarFilaConsulta();
      const rows = document.querySelectorAll('#cm-consultas-tbody tr');
      const row = rows[rows.length - 1];
      if (!row) return;
      const osSel = row.querySelector('select');
      if (osSel) {
        const opt = [...osSel.options].find(o => o.value === os);
        if (opt) { osSel.value = os; osSel.dispatchEvent(new Event('change')); }
      }
      if (plan) {
        const planInp = row.querySelector('.cm-plan-input');
        if (planInp) planInp.value = plan;
      }
      const cantInp = row.querySelector('.cm-cant-input');
      if (cantInp) { cantInp.value = cant; cantInp.dispatchEvent(new Event('input')); }
    });
  }

  // Particulares — con desglose efectivo/transferencia si se detectó
  if (particulares > 0) {
    const sinMarcador = particulares - partEfectivo - partTransf;
    // Si hay marcadores explícitos, usar desglose; si no, poner todo en transferencia
    const totalEf = partEfectivo;
    const totalTr = partTransf + sinMarcador; // sin marcador → transferencia por defecto
    const efEl = document.getElementById('cm-part-ef-cant');
    const trEl = document.getElementById('cm-part-tr-cant');
    if (efEl) efEl.value = totalEf;
    if (trEl) trEl.value = totalTr;
    recalcCM && recalcCM();
  }

  // Cerrar panel
  document.getElementById('cm-paste-panel').style.display = 'none';
  document.getElementById('cm-paste-text').value = '';

  // ── 6. Construir resumen y mostrarlo SIEMPRE ─────────────────────────────
  mostrarResumenCargaMasiva({
    medicoDetectado, fechaDetectada, consultorioDetectado,
    knownRows, unknownRows, particulares, partEfectivo, partTransf, particularesNombres
  });
}

// Arma y muestra el modal-resumen de la carga masiva. Recibe los datos ya
// parseados (no parsea ni toca DB); solo construye el HTML y lo muestra.
function mostrarResumenCargaMasiva(d) {
  const { medicoDetectado, fechaDetectada, consultorioDetectado,
          knownRows, unknownRows, particulares, partEfectivo, partTransf, particularesNombres } = d;
  const warnings = [];
  if (!medicoDetectado)      warnings.push('⚠️ Médico no reconocido — seleccionalo manualmente');
  if (!fechaDetectada)       warnings.push('⚠️ Fecha no detectada — ingresala manualmente');
  if (!consultorioDetectado) warnings.push('⚠️ Consultorio no detectado — verificalo');
  if (unknownRows.length > 0)
    warnings.push(`⚠️ OS no reconocidas (→ Particular): ${unknownRows.map(r=>r.osRaw).join(', ')}`);

  const sinMarcador = particulares - partEfectivo - partTransf;
  const totalEf = partEfectivo;
  const totalTr = partTransf + sinMarcador;

  // Tabla de OS a cargar
  const osTableHTML = knownRows.length > 0 ? `
    <div style="font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;margin-bottom:6px;">OS a cargar</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:10px;">
      ${knownRows.map(r => `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:5px 4px;font-weight:600;">${r.os}</td>
          <td style="padding:5px 4px;color:var(--text3);font-size:11px;">${r.plan||''}</td>
          <td style="padding:5px 4px;text-align:right;font-weight:800;color:var(--accent2);font-size:16px;">${r.cant}</td>
        </tr>`).join('')}
      <tr style="border-top:2px solid var(--border2);">
        <td colspan="2" style="padding:6px 4px;font-weight:700;font-size:12px;">Total OS</td>
        <td style="padding:6px 4px;text-align:right;font-weight:900;font-size:17px;color:var(--accent2);">${knownRows.reduce((s,r)=>s+r.cant,0)}</td>
      </tr>
    </table>` : '';

  // Particulares con nombres y badges
  const nombresHTML = particularesNombres.filter(p=>!p.os).length > 0
    ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:12px;">${
        particularesNombres.filter(p=>!p.os).map(p => {
          const badge = p.medio === 'E'
            ? '<span style="font-size:10px;background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 5px;margin-left:4px;">💵 EF</span>'
            : p.medio === 'T'
            ? '<span style="font-size:10px;background:#dbeafe;color:#1e40af;border-radius:4px;padding:1px 5px;margin-left:4px;">🏦 TR</span>'
            : '<span style="font-size:10px;background:#f3f4f6;color:#6b7280;border-radius:4px;padding:1px 5px;margin-left:4px;">TR</span>';
          return `<li>${p.nombre}${badge}</li>`;
        }).join('')
      }</ul>` : '';

  const partHTML = particulares > 0 ? `
    <div style="background:var(--surface2);border-radius:8px;padding:10px 12px;margin-top:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${nombresHTML?'8px':'0'};">
        <div style="font-size:12px;font-weight:700;">Part. a cargar manualmente</div>
        <div style="font-size:20px;font-weight:900;color:var(--success);">${particulares}</div>
      </div>
      ${totalEf>0||totalTr>0 ? `<div style="display:flex;gap:8px;margin-bottom:${nombresHTML?'8px':'0'};">
        ${totalEf>0?`<span style="font-size:11px;background:#d1fae5;color:#065f46;border-radius:6px;padding:3px 8px;">💵 Efectivo: ${totalEf}</span>`:''}
        ${totalTr>0?`<span style="font-size:11px;background:#dbeafe;color:#1e40af;border-radius:6px;padding:3px 8px;">🏦 Transf.: ${totalTr}</span>`:''}
      </div>` : ''}
      ${nombresHTML}
    </div>` : '';

  const warningsHTML = warnings.length
    ? `<div style="margin-top:10px;font-size:11px;color:var(--warn);line-height:1.6;">${warnings.join('<br>')}</div>` : '';

  // Mostrar modal siempre
  const alertDiv = document.createElement('div');
  alertDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
  alertDiv.innerHTML = `
    <div style="background:var(--surface);border-radius:14px;padding:24px;max-width:500px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="font-size:15px;font-weight:700;margin-bottom:2px;">✓ Resumen procesado</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:14px;">
        ${medicoDetectado?soloApellido(medicoDetectado):'⚠ médico no detectado'}
        · ${fechaDetectada?fechaDetectada.split('-').reverse().join('/'):'⚠ fecha no detectada'}
        · ${consultorioDetectado||'⚠ consultorio no detectado'}
      </div>

      <!-- KPIs -->
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div style="flex:1;background:var(--surface2);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Total</div>
          <div style="font-size:24px;font-weight:900;">${knownRows.reduce((s,r)=>s+r.cant,0)+particulares}</div>
        </div>
        <div style="flex:1;background:var(--accent2-light);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--accent2);text-transform:uppercase;">Con OS</div>
          <div style="font-size:24px;font-weight:900;color:var(--accent2);">${knownRows.reduce((s,r)=>s+r.cant,0)}</div>
        </div>
        <div style="flex:1;background:var(--success-light);border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:var(--success);text-transform:uppercase;">Part.</div>
          <div style="font-size:24px;font-weight:900;color:var(--success);">${particulares}</div>
        </div>
      </div>

      ${osTableHTML}
      ${partHTML}
      ${warningsHTML}

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button onclick="this.closest('[style*=fixed]').remove(); closeModal('modal-carga-masiva');"
          style="background:var(--surface2);color:var(--text);border:1px solid var(--border2);border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;">
          Cancelar carga
        </button>
        <button onclick="this.closest('[style*=fixed]').remove();"
          style="background:var(--accent);color:white;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;">
          ✓ Confirmar y cargar
        </button>
      </div>
    </div>`;
  document.body.appendChild(alertDiv);
}


function actualizarCMConsultorio() {
  const selCons = document.getElementById('cm-consultorio');
  // Si el usuario ya eligió "Extra" a mano, respetarlo (no pisarlo con la sede del médico).
  if (selCons && selCons.value === 'Extra') return;
  const medNombre = document.getElementById('cm-medico')?.value;
  const med = DB.medicos.find(m => m.nombre === medNombre);
  if (med && med.consultorio !== 'Ambos' && selCons) {
    selCons.value = med.consultorio;
  }
}

function guardarCargaMasiva() {
  const medico = document.getElementById('cm-medico').value;
  const fecha  = document.getElementById('cm-fecha').value;
  const consultorio = document.getElementById('cm-consultorio').value || 'Palpa';
  if (!medico || !fecha) { showToast('⚠️ Seleccioná médico y fecha'); return; }
  const errFechaCM = validarFecha(fecha, 'La fecha');
  if (errFechaCM) { showToast('⚠️ ' + errFechaCM); return; }

  // ── Verificar si ya hay atenciones cargadas para este médico y fecha ───────
  const yaExiste = DB.registros.some(r => r.medico === medico && r.fecha === fecha);
  if (yaExiste) {
    const existentes = DB.registros.filter(r => r.medico === medico && r.fecha === fecha);
    const totalExist = existentes.reduce((s,r) => s + totalConsultasReg(r), 0);
    const confirmDiv = document.createElement('div');
    confirmDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;';
    confirmDiv.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;padding:24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.3);border-top:4px solid var(--warn);">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">⚠️ Atención ya cargada</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
          <strong>${soloApellido(medico)}</strong> ya tiene
          <strong>${totalExist} paciente${totalExist!==1?'s':''}</strong> cargados el
          <strong>${fecha.split('-').reverse().join('/')}</strong>.
        </div>
        <div style="background:var(--warn-light);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--warn);margin-bottom:16px;">
          ¿Querés agregar más atenciones a ese mismo día, o fue un error?
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button onclick="this.closest('[style*=fixed]').remove()"
            style="background:var(--surface2);color:var(--text);border:1px solid var(--border2);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;">
            Cancelar
          </button>
          <button onclick="this.closest('[style*=fixed]').remove(); _ejecutarGuardarCargaMasiva();"
            style="background:var(--warn);color:white;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;">
            Sí, agregar igual
          </button>
        </div>
      </div>`;
    document.body.appendChild(confirmDiv);
    return;
  }

  _ejecutarGuardarCargaMasiva();
}

function _ejecutarGuardarCargaMasiva() {
  const medico      = document.getElementById('cm-medico').value;
  const fecha       = document.getElementById('cm-fecha').value;
  const consultorio = document.getElementById('cm-consultorio').value || 'Palpa';
  let count = 0;
  const nuevosRegs = [];  // registros creados en esta tanda (para asignar copago-adelanto)

  // Pre-chequeo: filas de prestación con cantidad cargada pero monto en 0
  // (prestación "por presupuesto" sin valor). Evita descartarlas en silencio.
  let filaSinMonto = null;
  document.querySelectorAll('#cm-prest-tbody tr').forEach(row => {
    const cant = parseInt(row.querySelector('.cm-cant-input')?.value) || 0;
    const val  = parseFloat(row.querySelector('.cm-val-input')?.value) || 0;
    if (cant > 0 && val <= 0 && !filaSinMonto) filaSinMonto = row;
  });
  if (filaSinMonto) {
    showToast('⚠️ Hay una prestación "por presupuesto" con cantidad pero sin monto. Ingresá el valor.');
    const inp = filaSinMonto.querySelector('.cm-val-input');
    if (inp) { inp.focus(); inp.style.borderColor = 'var(--warn)'; }
    return;
  }

  // Guardar filas de CONSULTAS
  document.querySelectorAll('#cm-consultas-tbody tr').forEach(row => {
    const selOS    = row.querySelector('select');
    const prestSel = row.querySelector('.cm-prest-sel');
    const planInp  = row.querySelector('.cm-plan-input');
    const os       = selOS?.value || '';
    const prestOpt = prestSel?.options[prestSel.selectedIndex];
    // Option text: "[codigo] Descripción — $valor"  → tomar parte antes del " — "
    const rawText  = prestOpt ? prestOpt.text : 'Consulta vestida';
    const prestDesc= rawText.includes(' — ')
      ? rawText.split(' — ')[0].replace(/^\[.*?\]\s*/, '').trim()
      : rawText.replace(/^\[.*?\]\s*/, '').trim() || 'Consulta vestida';
    const plan     = planInp?.value || '';
    const cantidad = parseInt(row.querySelector('.cm-cant-input')?.value) || 0;
    const valorUnit= parseFloat(row.querySelector('.cm-val-input')?.value) || valorConsultaOS(os);
    const exenta   = row.querySelector('.iva-hidden')?.value === '1';
    if (cantidad > 0) {
      const _reg = { id:DB.nextId++, fecha, medico, consultorio, os, plan, prestacion: prestDesc, cantidad, valorUnit, exenta, categoria:'consulta', partEfectivo:0, partEfVal:valorUnit, partTransf:0, partTrVal:valorUnit };
      DB.registros.push(_reg); nuevosRegs.push(_reg);
      count++;
    }
  });

  // Guardar filas de PRESTACIONES
  document.querySelectorAll('#cm-prest-tbody tr').forEach(row => {
    const selOS    = row.querySelector('select');
    const prestSel = row.querySelector('.cm-prest-sel');
    const os       = selOS?.value || '';
    const prestOpt = prestSel?.options[prestSel.selectedIndex];
    const rawText  = prestOpt ? prestOpt.text : 'Prestación';
    const prestDesc= rawText.includes(' — ')
      ? rawText.split(' — ')[0].replace(/^\[.*?\]\s*/, '').trim()
      : rawText.replace(/^\[.*?\]\s*/, '').trim() || 'Prestación';
    const cantidad = parseInt(row.querySelector('.cm-cant-input')?.value) || 0;
    const valorUnit= parseFloat(row.querySelector('.cm-val-input')?.value) || 0;
    const exenta   = row.querySelector('.iva-hidden')?.value === '1';
    if (cantidad > 0 && valorUnit > 0) {
      const _reg = { id:DB.nextId++, fecha, medico, consultorio, os, plan:'', prestacion: prestDesc, cantidad, valorUnit, exenta, categoria: categoriaDesc(prestDesc), partEfectivo:0, partEfVal:valorUnit, partTransf:0, partTrVal:valorUnit };
      DB.registros.push(_reg); nuevosRegs.push(_reg);
      count++;
    }
  });

  // Particulares
  const ef    = parseInt(document.getElementById('cm-part-ef-cant').value) || 0;
  const efVal = parseFloat(document.getElementById('cm-part-ef-val').value) || DB.config.valorConsultaParticular;
  const tr    = parseInt(document.getElementById('cm-part-tr-cant').value) || 0;
  const trVal = parseFloat(document.getElementById('cm-part-tr-val').value) || DB.config.valorConsultaParticular;
  if (ef > 0 || tr > 0) {
    const _regP = { id:DB.nextId++, fecha, medico, consultorio, os:'Particular', plan:'', prestacion:'Consulta particular', cantidad:0, valorUnit:0, exenta:true, categoria:'consulta', partEfectivo:ef, partEfVal:efVal, partTransf:tr, partTrVal:trVal };
    DB.registros.push(_regP); nuevosRegs.push(_regP);
    window._regPartMasiva = _regP;  // referencia para vincular movimientos de caja
    count++;
  }

  if (count === 0) { showToast('⚠️ No hay consultas ni prestaciones cargadas'); return; }
  marcarCambios('registros');

  // Efectivo particular → entra a caja chica del consultorio
  if (ef > 0) {
    const totalEf = ef * efVal;
    const _regPId = window._regPartMasiva ? window._regPartMasiva.id : undefined;
    DB.cajaChica.push({
      id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
      concepto:`Particulares efectivo — ${soloApellido(medico)} (${ef} × ${fmt(efVal)})`,
      origen:'Efectivo', monto:totalEf, regId:_regPId
    });
    marcarCambios('cajaChica');   // ingreso en efectivo a caja chica → sincronizar ya
    // Pago del 50% al médico, preguntando paciente por paciente
    const honMit = efVal / 2;
    let pagados = 0;
    for (let i = 1; i <= ef; i++) {
      if (confirm(`Particular en efectivo ${i} de ${ef} (${soloApellido(medico)}).\n\n¿Pagar ahora el honorario (${fmt(honMit)}) al médico en efectivo?`)) {
        DB.cajaChica.push({
          id: DB.nextId++, fecha, consultorio, tipo:'Egreso',
          concepto:`Pago honorario efectivo — ${soloApellido(medico)} — ${fecha}`,
          origen:'Honorario', monto: honMit, regId:_regPId
        });
        pagados++;
      }
    }
    if (pagados > 0 && window._regPartMasiva) window._regPartMasiva.honorEfPagados = pagados;
    if (pagados > 0) showToast(`✓ Pagado ${fmt(honMit*pagados)} a ${soloApellido(medico)} (${pagados} en efectivo)`);
  }
  // Transferencia particular → entra a Caja (banco), no a caja chica
  if (tr > 0) {
    const totalTr = tr * trVal;
    const _regPId = window._regPartMasiva ? window._regPartMasiva.id : undefined;
    DB.movimientos.unshift({
      id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
      desc:`Particulares transferencia — ${soloApellido(medico)} (${tr} × ${fmt(trVal)})`,
      monto: totalTr, saldo: 0, origen:'Particular', regId:_regPId
    });
    marcarCambios('movimientos');
  }
  window._regPartMasiva = null;

  // Copago/coseguro: se imputa a la OS elegida. Puede ser adelanto (descuenta de la OS)
  // o complementario (la OS paga el total, el copago es extra). Ingreso: efectivo→caja, transf→movimientos.
  const tieneCopago = document.getElementById('cm-tiene-copago')?.checked;
  if (tieneCopago) {
    const copUnit  = parseFloat(document.getElementById('cm-copago-unitario')?.value) || 0;
    const copCant  = parseInt(document.getElementById('cm-copago-cant')?.value) || 0;
    const copMedio = document.getElementById('cm-copago-medio')?.value || 'Efectivo';
    const copConc  = document.getElementById('cm-copago-concepto')?.value || 'Copago OS';
    const copOS    = document.getElementById('cm-copago-os')?.value || '';
    const copTipo  = document.getElementById('cm-copago-tipo')?.value || 'adelanto';
    const copTotal = copUnit * copCant;
    if (copTotal > 0 && copOS) {
      // Imputar SOLO a los registros de la OS elegida cargados en esta tanda.
      const regsOS = nuevosRegs.filter(r => r.os === copOS);
      if (regsOS.length > 0) {
        const porReg = copTotal / regsOS.length;
        regsOS.forEach(r => { r.copago = (r.copago || 0) + porReg; r.copagoMedio = copMedio; r.copagoTipo = copTipo; });
      }
      const etTipo = copTipo === 'complementario' ? 'complementario' : 'adelanto';
      const copRegId = regsOS.length > 0 ? regsOS[0].id : undefined;
      if (copMedio === 'Efectivo') {
        DB.cajaChica.push({
          id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
          concepto:`${copConc} ${copOS} (efectivo, ${etTipo}) — ${copCant} × ${fmt(copUnit)}`,
          origen: 'Copago', monto: copTotal, regId: copRegId
        });
        marcarCambios('cajaChica');
      } else {
        DB.movimientos.unshift({
          id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
          desc:`${copConc} ${copOS} (transferencia, ${etTipo}) — ${copCant} × ${fmt(copUnit)}`,
          monto: copTotal, saldo: 0, origen:'Copago', regId: copRegId
        });
        marcarCambios('movimientos');
      }
    } else if (copTotal > 0 && !copOS) {
      showToast('⚠️ Elegí la obra social del copago');
      return;
    }
  }

  closeModal('modal-carga-masiva');
  renderAtenciones();
  renderCajaChica();
  initDashboard();   // refrescar el dashboard inmediatamente tras la carga masiva
  const toastParts = [];
  if (ef > 0) toastParts.push(`💵 ${fmt((ef*efVal))} → caja ${consultorio}`);
  if (tieneCopago) {
    const copUnit = parseFloat(document.getElementById('cm-copago-unitario')?.value||'0') || 0;
    const copCant = parseInt(document.getElementById('cm-copago-cant')?.value||'0') || 0;
    const copMedio = document.getElementById('cm-copago-medio')?.value || 'Efectivo';
    const copTotal = copUnit * copCant;
    if (copTotal > 0) {
      toastParts.push(`💰 Copago ${fmt(copTotal)} ${copMedio === 'Efectivo' ? '→ caja '+consultorio : 'transf.'}`);
    }
  }
  showToast(`✓ ${soloApellido(medico)} · ${fecha}${toastParts.length?' · '+toastParts.join(' · '):''}`);
}
