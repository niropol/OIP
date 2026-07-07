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

  // No permitir dos médicos con el mismo nombre: TODO se referencia por nombre
  // (atenciones, liquidaciones, derivaciones), así que dos iguales serían ambiguos.
  const chocaNombre = DB.medicos.some(m =>
    m.id !== (existente ? existente.id : null) &&
    (m.nombre || '').trim().toLowerCase() === nombre.toLowerCase()
  );
  if (chocaNombre) { showToast('⚠️ Ya existe otro médico con ese nombre'); return; }

  if (existente) {
    const nombreViejo = existente.nombre;
    Object.assign(existente, datos);   // EDITAR: no duplica, conserva id/color

    // El médico se identifica por NOMBRE en todas las colecciones. Si se renombró (o se
    // cambió cualquier dato pero sobre todo el nombre), hay que arrastrar el nombre nuevo
    // a todo lo que apuntaba al viejo, para que siga siendo LA MISMA persona y no aparezca
    // como un médico distinto. (Borrar o agregar otro médico es otra cosa; esto es editar.)
    let nRelink = 0;
    if (nombreViejo && nombreViejo !== nombre) {
      (DB.registros || []).forEach(r => { if (r.medico === nombreViejo) { r.medico = nombre; nRelink++; } });
      (DB.liquidaciones || []).forEach(l => { if (l.medico === nombreViejo) l.medico = nombre; });
      (DB.derivaciones || []).forEach(d => { if (d.medico === nombreViejo) d.medico = nombre; });
      // La descripción de los egresos de liquidación en Caja lleva el apellido: actualizarla
      // para que no quede el nombre viejo (es cosmético, pero evita confusión).
      (DB.movimientos || []).forEach(m => {
        if (m.origen === 'Honorario' && typeof m.desc === 'string' && m.desc.includes(soloApellido(nombreViejo))) {
          m.desc = m.desc.replace(soloApellido(nombreViejo), soloApellido(nombre));
        }
      });
      marcarCambios('registros'); marcarCambios('liquidaciones');
      marcarCambios('derivaciones'); marcarCambios('movimientos');
    }
    marcarCambios('medicos');
    closeModal('modal-medico');
    showToast(nRelink > 0
      ? `✓ Médico actualizado — ${nRelink} atención${nRelink!==1?'es':''} siguen vinculadas`
      : '✓ Médico actualizado');
    renderMedicosGrid(); renderConfiguracion();
    return;
  }

  DB.medicos.push({
    id: DB.nextId++,
    ...datos,
    color: ['#2d5a8e','#1d6a4a','#7c3aed','#b45309','#be185d','#0e7490'][Math.floor(Math.random()*6)],
  });
  marcarCambios('medicos');
  closeModal('modal-medico');
  showToast('✓ Médico guardado');
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

// ── REPARACIÓN: reconectar atenciones/liquidaciones/derivaciones huérfanas ──
// Cuando un médico se renombró (antes del arreglo del arrastre) o se borró, sus
// atenciones quedan apuntando a un nombre que ya no existe: no se pierden, pero suman
// con un nombre inválido. Esto reasigna TODO lo de ese nombre a un médico existente
// que elijas. Devuelve la cantidad de nombres reconectados (para tests).
function reconectarMedicoHuerfano() {
  const validos = new Set((DB.medicos || []).map(m => m.nombre));
  const huerfanos = {};   // nombre inválido → { reg, liq, deriv }
  const contar = (arr, campo) => (arr || []).forEach(x => {
    const n = x && x.medico;
    if (n && !validos.has(n)) (huerfanos[n] = huerfanos[n] || { reg: 0, liq: 0, deriv: 0 })[campo]++;
  });
  contar(DB.registros, 'reg');
  contar(DB.liquidaciones, 'liq');
  contar(DB.derivaciones, 'deriv');

  const nombres = Object.keys(huerfanos);
  if (!nombres.length) { alert('✓ No hay nada para reconectar: todas las atenciones apuntan a un médico que existe.'); return 0; }
  if (!(DB.medicos || []).length) { alert('No hay médicos cargados para reasignar. Creá primero el médico correcto.'); return 0; }

  const lista = DB.medicos.map((m, i) => `${i + 1}) ${m.nombre}`).join('\n');
  let reconectados = 0;
  nombres.forEach(nombre => {
    const info = huerfanos[nombre];
    const resp = prompt(
      `RECONECTAR MÉDICO\n\nEl nombre "${nombre}" no existe como médico, pero lo usan:\n` +
      `• ${info.reg} atención(es)\n• ${info.liq} liquidación(es)\n• ${info.deriv} derivación(es)\n\n` +
      `¿A qué médico corresponde? Escribí el número (vacío = saltear):\n\n${lista}`
    );
    if (resp == null || resp.trim() === '') return;
    const idx = parseInt(resp.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= DB.medicos.length) { alert(`Número inválido; se saltea "${nombre}".`); return; }
    const destino = DB.medicos[idx].nombre;
    if (!confirm(`¿Reasignar TODO lo de "${nombre}" a "${destino}"?\n\n(${info.reg} atenciones, ${info.liq} liquidaciones, ${info.deriv} derivaciones)`)) return;

    let n = 0;
    (DB.registros || []).forEach(r => { if (r.medico === nombre) { r.medico = destino; n++; } });
    (DB.liquidaciones || []).forEach(l => { if (l.medico === nombre) l.medico = destino; });
    (DB.derivaciones || []).forEach(d => { if (d.medico === nombre) d.medico = destino; });
    if (n > 0) marcarCambios('registros');
    marcarCambios('liquidaciones'); marcarCambios('derivaciones');
    reconectados++;
  });

  if (reconectados) {
    renderMedicosGrid && renderMedicosGrid();
    renderConfiguracion && renderConfiguracion();
    initDashboard && initDashboard();
    showToast(`✓ ${reconectados} nombre(s) de médico reconectado(s)`);
  }
  return reconectados;
}

// ── VISOR: ver TODAS las atenciones de un médico que ya no existe (de cualquier mes) ──
// Sirve para ENCONTRARLAS (no aparecen en los filtros normales porque el nombre no está
// en la lista de médicos) y decidir qué hacer: reconectar (si son reales) o limpiar (si
// son duplicados). Abre una ventana con el detalle completo. Devuelve cuántas encontró.
function verAtencionesHuerfanas() {
  const validos = new Set((DB.medicos || []).map(m => m.nombre));
  const huerf = (DB.registros || []).filter(r => r.medico && !validos.has(r.medico))
    .sort((a, b) => (a.medico || '').localeCompare(b.medico || '') || (a.fecha || '').localeCompare(b.fecha || ''));
  const liqHuerf = (DB.liquidaciones || []).filter(l => l.medico && !validos.has(l.medico));
  if (!huerf.length && !liqHuerf.length) { alert('✓ No hay atenciones huérfanas: todas apuntan a un médico que existe.'); return 0; }

  const fact = (r) => (typeof facturadoReg === 'function') ? facturadoReg(r) : 0;
  const total = huerf.reduce((s, r) => s + fact(r), 0);
  const nombres = [...new Set(huerf.map(r => r.medico).concat(liqHuerf.map(l => l.medico)))];

  const filas = huerf.map(r => {
    const pac = r.paciente || [r.apellido, r.nombre].filter(Boolean).join(', ') || '—';
    const cant = r.os === 'Particular' ? ((r.partEfectivo || 0) + (r.partTransf || 0)) : (r.cantidad || 0);
    return `<tr>
      <td style="padding:6px 8px;font-family:monospace;">${r.fecha || '—'}</td>
      <td style="padding:6px 8px;color:#b00;">${escHtml ? escHtml(r.medico) : r.medico}</td>
      <td style="padding:6px 8px;">${r.os || '—'}</td>
      <td style="padding:6px 8px;">${escHtml ? escHtml(r.prestacion || '—') : (r.prestacion || '—')}</td>
      <td style="padding:6px 8px;">${escHtml ? escHtml(pac) : pac}</td>
      <td style="padding:6px 8px;">${r.consultorio || '—'}</td>
      <td style="padding:6px 8px;text-align:center;">${cant}</td>
      <td style="padding:6px 8px;text-align:right;font-family:monospace;">${fmt(fact(r))}</td>
    </tr>`;
  }).join('');

  const contenido = `
    <h2>Atenciones con un médico que ya no existe</h2>
    <p>Nombre(s) inválido(s): ${nombres.map(n => `<b style="color:#b00;">${escHtml ? escHtml(n) : n}</b>`).join(', ')}<br>
    <b>${huerf.length}</b> atención(es) · total facturado <b>${fmt(total)}</b> · ${liqHuerf.length} liquidación(es) huérfana(s)</p>
    <table>
      <thead><tr style="background:#f5f7fa;">
        <th style="padding:6px 8px;text-align:left;">Fecha</th>
        <th style="padding:6px 8px;text-align:left;">Médico (inválido)</th>
        <th style="padding:6px 8px;text-align:left;">OS</th>
        <th style="padding:6px 8px;text-align:left;">Prestación</th>
        <th style="padding:6px 8px;text-align:left;">Paciente</th>
        <th style="padding:6px 8px;text-align:left;">Consultorio</th>
        <th style="padding:6px 8px;">Cant.</th>
        <th style="padding:6px 8px;text-align:right;">Facturado</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="margin-top:16px;color:#666;font-size:12px;">
      Si estas atenciones son DUPLICADOS (ya las recargaste con el nombre corregido), usá
      <b>🧹 Limpiar huérfanas</b>. Si son reales y solo cambió el nombre del médico, usá
      <b>🔗 Reconectar médico</b> para reasignarlas al médico correcto.</p>`;

  if (typeof _abrirVentanaImpresion === 'function') _abrirVentanaImpresion('Atenciones huérfanas', contenido);
  else alert(`${huerf.length} atenciones huérfanas · total ${fmt(total)} — ${nombres.join(', ')}`);
  return huerf.length;
}

// ── LIMPIEZA: eliminar atenciones/liquidaciones de un médico que ya no existe ──
// Para el caso en que esas atenciones son DUPLICADOS (se borraron y se recargaron con
// el nombre corregido, pero las viejas quedaron): duplican plata y hay que sacarlas.
// Muestra el detalle (cuántas, total facturado, muestra con fechas) ANTES de borrar, y
// limpia los movimientos de caja vinculados por id. Destructivo → confirmación explícita.
function eliminarAtencionesHuerfanas() {
  const validos = new Set((DB.medicos || []).map(m => m.nombre));
  const huerf    = (DB.registros    || []).filter(r => r.medico && !validos.has(r.medico));
  const liqHuerf = (DB.liquidaciones || []).filter(l => l.medico && !validos.has(l.medico));
  if (!huerf.length && !liqHuerf.length) { alert('✓ No hay atenciones ni liquidaciones huérfanas para limpiar.'); return 0; }

  const nombres = [...new Set(huerf.map(r => r.medico).concat(liqHuerf.map(l => l.medico)))];
  const fact = (r) => (typeof facturadoReg === 'function') ? facturadoReg(r) : 0;
  const totalFact = huerf.reduce((s, r) => s + fact(r), 0);
  const ids = new Set(huerf.map(r => r.id));
  const ccVinc  = (DB.cajaChica   || []).filter(m => m.regId != null && ids.has(m.regId));
  const movVinc = (DB.movimientos || []).filter(m => m.regId != null && ids.has(m.regId));
  const sinCajaPorId = huerf.filter(r => !ccVinc.some(m => m.regId === r.id) && !movVinc.some(m => m.regId === r.id)).length;

  const muestra = huerf.slice(0, 10)
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .map(r => `• ${r.fecha} · ${r.os} · ${fmt(fact(r))}`).join('\n');

  if (!confirm(
    `ELIMINAR ATENCIONES HUÉRFANAS\n\n` +
    `Son atenciones/liquidaciones de un médico que ya no existe: ${nombres.map(n => `"${n}"`).join(', ')}.\n\n` +
    `• ${huerf.length} atención(es) — total facturado ${fmt(totalFact)}\n` +
    `• ${liqHuerf.length} liquidación(es)\n` +
    `• ${ccVinc.length + movVinc.length} movimiento(s) de caja vinculados (se eliminan también)\n\n` +
    `Muestra (fecha · OS · monto):\n${muestra}${huerf.length > 10 ? '\n…' : ''}\n\n` +
    `⚠️ Esto NO se puede deshacer. Si dudás, hacé primero un backup (Configuración → Backup completo JSON).\n\n` +
    `¿Eliminar TODO esto?`
  )) return 0;

  // Segundo OK para algo irreversible con plata de por medio.
  if (!confirm(`Última confirmación: se van a eliminar ${huerf.length} atención(es) por ${fmt(totalFact)}. ¿Seguro?`)) return 0;

  DB.registros    = DB.registros.filter(r => !ids.has(r.id));
  DB.liquidaciones = DB.liquidaciones.filter(l => !(l.medico && !validos.has(l.medico)));
  if (ccVinc.length)  { const s = new Set(ccVinc.map(m => m.id));  DB.cajaChica   = DB.cajaChica.filter(m => !s.has(m.id));   marcarCambios('cajaChica'); }
  if (movVinc.length) { const s = new Set(movVinc.map(m => m.id)); DB.movimientos = DB.movimientos.filter(m => !s.has(m.id)); marcarCambios('movimientos'); }
  marcarCambios('registros'); marcarCambios('liquidaciones');

  renderAtenciones && renderAtenciones();
  renderFinanzas && renderFinanzas();
  renderCajaChica && renderCajaChica();
  renderConfiguracion && renderConfiguracion();
  initDashboard && initDashboard();

  let msg = `✓ Eliminadas ${huerf.length} atención(es) huérfanas y ${liqHuerf.length} liquidación(es).`;
  if (sinCajaPorId > 0) msg += `\n\nOjo: ${sinCajaPorId} no tenían caja vinculada por id; si alguna fue en efectivo, revisá la caja chica a mano.`;
  alert(msg);
  return huerf.length;
}

