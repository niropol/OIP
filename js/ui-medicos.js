// ═══════════════════════════════════════════════════════════════════════════
//  UI — SECCIÓN MÉDICOS (ABM)
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Se carga después del script principal y antes de persistencia.js.
//  Usa helpers globales (DB, fmt, marcarCambios, optionsMedicos, …) de otros módulos.
// ═══════════════════════════════════════════════════════════════════════════

function renderMedicosGrid() {
  const grid = document.getElementById('medicos-grid');
  const hoy = hoyISO();
  const mesPrefijo = hoy.slice(0,7); // e.g. 2026-05

  grid.innerHTML = DB.medicos.map(med => {
    const hoy       = hoyISO();
    const mesPrefijo= hoy.slice(0,7);
    const regsHoy   = DB.registros.filter(r => r.fecha === hoy && r.medico === med.nombre);
    const resMes    = DB.registros.filter(r => r.fecha.startsWith(mesPrefijo) && r.medico === med.nombre);

    // ── Hoy ──────────────────────────────────────────────────────────────────
    // honorariosMedico() (fuente única): antes acá se calculaba a mano cantidad ×
    // valorConsultaParticular/2, que ignora un monto especial cobrado a un particular
    // (ver honorMedicoReg — el honorario es 50% de lo REALMENTE cobrado, no del estándar).
    const hoyConsulOS = contarConsultas(regsHoy);
    const hoyEfec     = regsHoy.reduce((s,r) => s + r.partEfectivo, 0);
    const hoyTransf   = regsHoy.reduce((s,r) => s + r.partTransf, 0);
    const { honOS: hoyHonOS, honEf: hoyHonEf, honTr: hoyHonTr } = honorariosMedico(regsHoy);
    // Total pacientes: totalConsultasReg() (incluye cirugías/estudios, no solo consultas) —
    // antes "hoy" usaba hoyConsulOS (solo consultas) y quedaba inconsistente con "mes"
    // (que sí sumaba todo), subcontando si el médico operó una cirugía ese mismo día.
    const hoyTotalPac = regsHoy.reduce((s,r) => s + totalConsultasReg(r), 0);

    // ── Mes ───────────────────────────────────────────────────────────────────
    // Solo consultas OS generan honorario fijo; estudios/cirugías van a facturación OS
    const mesConsulOS = contarConsultas(resMes);
    const mesEfec     = resMes.reduce((s,r) => s + r.partEfectivo, 0);
    const mesTransf   = resMes.reduce((s,r) => s + r.partTransf, 0);
    const mesTotalPac = resMes.reduce((s,r) => s + totalConsultasReg(r), 0);

    // aLiquidar de honorariosMedico() ya suma honOS + honTr + honSC + honExtra (excluye
    // el efectivo, que ya se cobró) — antes acá "A liquidar" solo sumaba honOS+honTransf,
    // dejando afuera SinCargo y pagos de derivación si el médico tuvo alguno ese mes.
    const { honOS, honEf: honEfec, honTr: honTransf, honPract, aLiquidar: totalLiquidar } = honorariosMedico(resMes);
    // Ya cobró en efectivo = honorario particulares efectivo
    const yaCobroEfectivo = honEfec;
    // Cantidad de estudios/prácticas del mes (para el rótulo del pago por práctica)
    const mesEstPract = resMes.reduce((s,r) => {
      const c = categoriaReg(r);
      return s + ((c === 'estudio' || c === 'practica') ? (r.cantidad || 0) : 0);
    }, 0);

    const mesMes = new Date().toLocaleString('es-AR',{month:'long',year:'numeric'});

    return `
      <div class="card" style="border-top:3px solid ${med.color};">
        <div class="card-body">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            <div class="avatar" style="width:42px; height:42px; background:${med.color}22; color:${med.color}; font-size:14px; font-weight:700;">${med.nombre.split(' ').map(w=>w[0]).slice(1,3).join('')}</div>
            <div style="flex:1;">
              <div style="font-weight:600; font-size:14px;">${med.nombre}</div>
              <div style="font-size:12px; color:var(--text3);">${med.especialidad||''}</div>
            </div>
          </div>

          <!-- Hoy -->
          <div style="background:var(--surface2); border-radius:6px; padding:10px 12px; margin-bottom:10px;">
            <div style="font-size:10px; font-weight:700; color:var(--text3); text-transform:uppercase; margin-bottom:6px;">Hoy — ${hoyTotalPac} pacientes</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              ${hoyHonOS > 0 ? `<div style="flex:1; min-width:80px;">
                <div style="font-size:10px; color:var(--text3);">OS (${hoyConsulOS} cons.)</div>
                <div style="font-weight:700; font-family:monospace; color:var(--accent2);">${fmt(hoyHonOS)}</div>
                <div style="font-size:10px; color:var(--text3);">en liquidación</div>
              </div>` : ''}
              ${hoyHonEf > 0 ? `<div style="flex:1; min-width:80px;">
                <div style="font-size:10px; color:var(--text3);">Part. ef. (${hoyEfec})</div>
                <div style="font-weight:700; font-family:monospace; color:var(--success);">${fmt(hoyHonEf)}</div>
                <div style="font-size:10px; color:var(--success);">💵 cobró hoy</div>
              </div>` : ''}
              ${hoyHonTr > 0 ? `<div style="flex:1; min-width:80px;">
                <div style="font-size:10px; color:var(--text3);">Part. transf. (${hoyTransf})</div>
                <div style="font-weight:700; font-family:monospace; color:var(--accent2);">${fmt(hoyHonTr)}</div>
                <div style="font-size:10px; color:var(--text3);">en liquidación</div>
              </div>` : ''}
              ${hoyTotalPac === 0 ? `<div style="color:var(--text3); font-size:12px;">Sin atenciones hoy</div>` : ''}
            </div>
          </div>

          <!-- Mes -->
          <div style="font-size:11px; color:var(--text3); margin-bottom:6px; font-weight:600; text-transform:uppercase; letter-spacing:.04em;">${mesMes} — ${mesTotalPac} atenciones</div>
          <div style="display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
            <div style="flex:1; min-width:80px; background:var(--accent2-light); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:var(--accent2);">OS (${mesConsulOS} cons.)</div>
              <div style="font-weight:700; font-family:monospace; font-size:14px; color:var(--accent2);">${fmt(honOS)}</div>
            </div>
            <div style="flex:1; min-width:80px; background:var(--success-light); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:var(--success);">💵 Ef. (${mesEfec})</div>
              <div style="font-weight:700; font-family:monospace; font-size:14px; color:var(--success);">${fmt(honEfec)}</div>
            </div>
            <div style="flex:1; min-width:80px; background:var(--surface2); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:var(--text3);">🏦 Tr. (${mesTransf})</div>
              <div style="font-weight:700; font-family:monospace; font-size:14px;">${fmt(honTransf)}</div>
            </div>
            ${honPract > 0 ? `<div style="flex:1; min-width:80px; background:#ede8ff; border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; color:#5a3a99;">🔬 Est./Prác. (${mesEstPract})</div>
              <div style="font-weight:700; font-family:monospace; font-size:14px; color:#5a3a99;">${fmt(honPract)}</div>
            </div>` : ''}
          </div>

          <!-- Total a liquidar -->
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:${med.color}11; border-radius:6px; margin-bottom:10px; border-left:3px solid ${med.color};">
            <div>
              <div style="font-size:10px; color:var(--text3);">A liquidar este mes</div>
              <div style="font-size:17px; font-weight:700; font-family:monospace; color:${med.color};">${fmt(totalLiquidar)}</div>
              <div style="font-size:9px; color:var(--text3);">OS (${mesConsulOS} cons.) + Part. transf. (${mesTransf})</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10px; color:var(--text3);">Cobrado efectivo</div>
              <div style="font-size:14px; font-weight:600; color:var(--success);">${fmt(yaCobroEfectivo)}</div>
              <div style="font-size:9px; color:var(--text3);">${mesEfec} Part. ef.</div>
            </div>
          </div>

          <div style="font-size:11px; color:var(--text3); margin-bottom:10px;">${med.formaPago} · ${med.diaPago}</div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="editarMedico(${med.id})">Editar</button>
            <button class="btn btn-primary btn-sm" style="flex:1;" onclick="verPreliqMedico('${med.nombre}','${mesPrefijo}')">Ver preliq.</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// Lee la tarifa de estudios/prácticas del formulario → { modo, valor }
function _leerPagoCat(prefijo) {
  const modo  = document.getElementById(`med-pago-${prefijo}-modo`)?.value || 'fijo';
  const valor = parseFloat(document.getElementById(`med-pago-${prefijo}-valor`)?.value) || 0;
  return { modo, valor };
}

// Abrir el modal en blanco para dar de ALTA un médico nuevo.
function abrirNuevoMedico() {
  document.getElementById('med-edit-id').value = '';
  document.getElementById('med-modal-title').textContent = 'Nuevo médico';
  ['med-nombre','med-especialidad','med-cuit','med-matricula','med-tel','med-email','med-cbu',
   'med-pago-estudio-valor','med-pago-practica-valor'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('med-consultorio').value = 'Palpa';
  document.getElementById('med-pago-estudio-modo').value = 'fijo';
  document.getElementById('med-pago-practica-modo').value = 'fijo';
  openModal('modal-medico');
}

function guardarMedico() {
  const nombre = document.getElementById('med-nombre').value.trim();
  if (!nombre) { showToast('⚠️ Ingresá el nombre del médico'); return; }

  const editId = parseInt(document.getElementById('med-edit-id').value) || null;
  const existente = editId ? DB.medicos.find(m => m.id === editId) : null;

  const datos = {
    nombre,
    especialidad: document.getElementById('med-especialidad').value,
    cuit: document.getElementById('med-cuit').value,
    matricula: document.getElementById('med-matricula').value,
    consultorio: document.getElementById('med-consultorio').value,
    formaPago: document.getElementById('med-forma-pago').value,
    diaPago: document.getElementById('med-dia-pago').value,
    tel: document.getElementById('med-tel').value,
    email: document.getElementById('med-email').value,
    cbu: document.getElementById('med-cbu').value,
    pagoEstudio:  _leerPagoCat('estudio'),
    pagoPractica: _leerPagoCat('practica'),
  };

  if (existente) {
    Object.assign(existente, datos);   // EDITAR: no duplica, conserva id/color
  } else {
    DB.medicos.push({
      id: DB.nextId++,
      ...datos,
      color: ['#2d5a8e','#1d6a4a','#7c3aed','#b45309','#be185d','#0e7490'][Math.floor(Math.random()*6)],
    });
  }
  marcarCambios('medicos');
  closeModal('modal-medico');
  showToast(existente ? '✓ Médico actualizado' : '✓ Médico guardado');
  renderMedicosGrid(); renderConfiguracion();
}

function editarMedico(id) {
  const med = DB.medicos.find(m => m.id === id);
  if (!med) return;
  openModal('modal-medico');
  setTimeout(() => {
    document.getElementById('med-edit-id').value = med.id;
    document.getElementById('med-modal-title').textContent = 'Editar médico';
    document.getElementById('med-nombre').value = med.nombre || '';
    document.getElementById('med-especialidad').value = med.especialidad || '';
    document.getElementById('med-cuit').value = med.cuit || '';
    document.getElementById('med-matricula').value = med.matricula || '';
    if (med.consultorio) document.getElementById('med-consultorio').value = med.consultorio;
    if (med.formaPago)   document.getElementById('med-forma-pago').value = med.formaPago;
    if (med.diaPago)     document.getElementById('med-dia-pago').value = med.diaPago;
    document.getElementById('med-tel').value = med.tel || '';
    document.getElementById('med-email').value = med.email || '';
    document.getElementById('med-cbu').value = med.cbu || '';
    document.getElementById('med-pago-estudio-modo').value  = med.pagoEstudio?.modo || 'fijo';
    document.getElementById('med-pago-estudio-valor').value = med.pagoEstudio?.valor || '';
    document.getElementById('med-pago-practica-modo').value  = med.pagoPractica?.modo || 'fijo';
    document.getElementById('med-pago-practica-valor').value = med.pagoPractica?.valor || '';
  }, 50);
}

function eliminarMedico(id) {
  const med = DB.medicos.find(m => m.id === id);
  if (!med) return;
  const regs = DB.registros.filter(r => r.medico === med.nombre).length;
  if (regs > 0) {
    if (!confirm(`⚠️ ${med.nombre} tiene ${regs} atención${regs!==1?'es':''} cargada${regs!==1?'s':''}.\n\nSi lo eliminás, esas atenciones quedan sin médico válido (seguirán sumando en los totales pero con un nombre que ya no existe).\n\n¿Eliminar de todas formas?`)) return;
    DB.medicos = DB.medicos.filter(m => m.id !== id);
    marcarCambios('medicos');
    renderConfiguracion();
    showToast(`Médico eliminado — ${regs} atención${regs!==1?'es':''} quedó sin médico válido`);
    return;
  }
  if (confirm('¿Eliminar este médico?')) {
    DB.medicos = DB.medicos.filter(m => m.id !== id);
    marcarCambios('medicos');
    renderConfiguracion();
    showToast('Médico eliminado');
  }
}

