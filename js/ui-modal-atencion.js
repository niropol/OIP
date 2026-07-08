// ═══════════════════════════════════════════════════════════════════════════
//  UI — MODAL de alta de ATENCIÓN (carga individual): estado AT, selección de
//  tipo/OS/categoría/prestación, IVA, copago, honorario y guardado (guardarAtencion).
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Se carga antes de persistencia.js. Usa helpers globales (DB, fmt,
//  fmtN, soloApellido, marcarCambios, getOSList/getExentaForOS/valorConsultaOS,
//  getConsultasDeOS/getPrestacionesSinConsulta, closeModal, validarFecha, …).
// ═══════════════════════════════════════════════════════════════════════════

// Toggle copago en el modal de atención
function toggleCopago() {
  const checked = document.getElementById('at-tiene-copago').checked;
  document.getElementById('at-copago-fields').style.display = checked ? '' : 'none';
  if (!checked) document.getElementById('at-copago-aviso').style.display = 'none';
}

function actualizarResumenCopago() {
  const monto = parseFloat(document.getElementById('at-copago-monto')?.value) || 0;
  const medio = document.getElementById('at-copago-medio')?.value || 'Efectivo';
  const aviso = document.getElementById('at-copago-aviso');
  const previewMonto = document.getElementById('at-copago-preview');
  const previewMedio = document.getElementById('at-copago-medio-preview');
  if (monto > 0) {
    if (aviso) aviso.style.display = '';
    if (previewMonto) previewMonto.textContent = fmtN(monto);
    if (previewMedio) previewMedio.textContent = medio === 'Efectivo'
      ? 'Efectivo → caja chica del consultorio'
      : 'Transferencia';
    if (aviso) aviso.style.background = medio === 'Efectivo' ? 'var(--success-light)' : 'var(--accent2-light)';
    if (aviso) aviso.style.color = medio === 'Efectivo' ? 'var(--success)' : 'var(--accent2)';
  } else {
    if (aviso) aviso.style.display = 'none';
  }
}

// ── Estado interno del modal de atención rápida ───────────────────────────
const AT = { tipo: 'OS', os: '', categoria: '', medioPago: '', prestacion: null };

function atResetModal() {
  Object.assign(AT, { tipo: 'OS', os: '', categoria: '', medioPago: '', prestacion: null });
  // Paso 1: tipo — OS seleccionado por defecto
  atEstiloBtn('btn-tipo-os', true);
  atEstiloBtn('btn-tipo-part', false);
  // Ocultar pasos 2, 3, 4
  ['at-paso-os','at-paso-tipo-prest','at-paso-prestacion','at-paso-particular','at-bloque-paciente','at-copago-bloque'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const res = document.getElementById('at-honorario-resumen');
  if (res) res.style.display = 'none';
  const btn = document.getElementById('at-btn-guardar');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  document.getElementById('at-modal-title').textContent = 'Atención rápida';
  document.getElementById('at-obs').value = '';
  const copCheck = document.getElementById('at-tiene-copago');
  if (copCheck) copCheck.checked = false;
  const copF = document.getElementById('at-copago-fields');
  if (copF) copF.style.display = 'none';
  const copM = document.getElementById('at-copago-monto'); if (copM) copM.value = '';
  const copT = document.getElementById('at-copago-tipo'); if (copT) copT.value = 'adelanto';
  const prestFiltro = document.getElementById('at-prest-filtro'); if (prestFiltro) prestFiltro.value = '';
  const copMed = document.getElementById('at-copago-medio'); if (copMed) copMed.value = 'Efectivo';
  // Reset datos de paciente
  const pacToggle = document.getElementById('at-pac-toggle');
  if (pacToggle) { pacToggle.checked = false; pacToggle.disabled = false; }
  const pacFields = document.getElementById('at-pac-fields');
  if (pacFields) pacFields.style.display = 'none';
  ['at-pac-apellido','at-pac-nombre','at-pac-dni','at-pac-empresa','at-pac-autorizacion'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Mostrar paso OS por defecto
  atSelTipo('OS');
}

function atEstiloBtn(id, activo) {
  const btn = document.getElementById(id); if (!btn) return;
  if (activo) {
    btn.style.background = 'var(--accent2)'; btn.style.borderColor = 'var(--accent2)'; btn.style.color = 'white';
  } else {
    btn.style.background = 'var(--surface)'; btn.style.borderColor = 'var(--border2)'; btn.style.color = 'var(--text2)';
  }
}

function atSelTipo(tipo) {
  AT.tipo = tipo; AT.os = ''; AT.categoria = ''; AT.prestacion = null;
  const cantInp = document.getElementById('at-cantidad'); if (cantInp) cantInp.value = '1';
  atEstiloBtn('btn-tipo-os',   tipo === 'OS');
  atEstiloBtn('btn-tipo-part', tipo === 'Particular');
  // Ocultar todo lo de abajo
  ['at-paso-os','at-paso-tipo-prest','at-paso-prestacion','at-paso-particular','at-bloque-paciente','at-copago-bloque','at-honorario-resumen'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  const btn = document.getElementById('at-btn-guardar');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  if (tipo === 'OS') {
    // Mostrar paso 2 — selección de OS
    const osPaso = document.getElementById('at-paso-os');
    if (osPaso) osPaso.style.display = '';
    // Llenar botones de OS
    const cont = document.getElementById('at-os-botones');
    if (cont) {
      cont.innerHTML = CM_OS_LIST.map(os =>
        `<button onclick="atSelOS('${os.replace(/'/g, "\\'")}')" id="at-os-btn-${os.replace(/[^a-zA-Z0-9]/g,'_')}"
          style="padding:6px 12px; border-radius:20px; border:1.5px solid var(--border2); background:var(--surface); color:var(--text2); font-size:12px; font-weight:600; cursor:pointer; transition:all .15s;">
          ${os}
        </button>`
      ).join('');
    }
  } else {
    // Particular — mostrar paso medio de pago directamente
    const p = document.getElementById('at-paso-particular');
    if (p) p.style.display = '';
    atActualizarHonorario();
  }
}

function atSelOS(os) {
  AT.os = os; AT.categoria = ''; AT.prestacion = null;
  // Resaltar botón seleccionado
  CM_OS_LIST.forEach(o => {
    const b = document.getElementById('at-os-btn-' + o.replace(/[^a-zA-Z0-9]/g,'_'));
    if (!b) return;
    if (o === os) { b.style.background = 'var(--accent2)'; b.style.borderColor = 'var(--accent2)'; b.style.color = 'white'; }
    else          { b.style.background = 'var(--surface)';  b.style.borderColor = 'var(--border2)';  b.style.color = 'var(--text2)'; }
  });

  ['at-paso-tipo-prest','at-paso-prestacion','at-bloque-paciente','at-copago-bloque','at-honorario-resumen'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  // Rehabilitar el toggle de paciente (CEMEPLA/SinCargo lo dejan obligatorio; otras OS no)
  const _pacTog = document.getElementById('at-pac-toggle');
  if (_pacTog) _pacTog.disabled = false;

  // Mostrar paso 3 — consulta o prestación (CEMEPLA va por el flujo normal)
  const p = document.getElementById('at-paso-tipo-prest');
  if (p) p.style.display = '';
  atEstiloBtn('btn-cat-consulta', false);
  atEstiloBtn('btn-cat-estudio', false);
  atEstiloBtn('btn-cat-practica', false);
  document.getElementById('at-paso-prestacion').style.display = 'none';

  // CEMEPLA: datos del paciente son OBLIGATORIOS (se presentan a la OS). Mostrarlos siempre.
  if (os === 'CEMEPLA') {
    const bloque = document.getElementById('at-bloque-paciente');
    const fields = document.getElementById('at-pac-fields');
    const toggle = document.getElementById('at-pac-toggle');
    const label  = document.getElementById('at-pac-toggle-label');
    if (bloque) bloque.style.display = '';
    if (fields) fields.style.display = '';
    if (toggle) { toggle.checked = true; toggle.disabled = true; }
    if (label)  label.innerHTML = '👤 Datos del paciente (obligatorio para CEMEPLA — se presentan a la obra social)';
  }

  // SinCargo: nombre y apellido del paciente OBLIGATORIOS. Mostrarlos siempre.
  if (os === 'SinCargo') {
    const bloque = document.getElementById('at-bloque-paciente');
    const fields = document.getElementById('at-pac-fields');
    const toggle = document.getElementById('at-pac-toggle');
    const label  = document.getElementById('at-pac-toggle-label');
    if (bloque) bloque.style.display = '';
    if (fields) fields.style.display = '';
    if (toggle) { toggle.checked = true; toggle.disabled = true; }
    if (label)  label.innerHTML = '👤 Nombre y apellido del paciente (obligatorio para SinCargo)';
  }
}

function atSelCategoria(cat) {
  AT.categoria = cat; AT.prestacion = null;
  atEstiloBtn('btn-cat-consulta', cat === 'consulta');
  atEstiloBtn('btn-cat-estudio',  cat === 'estudio');
  atEstiloBtn('btn-cat-practica', cat === 'practica' || cat === 'prestacion');

  const paso = document.getElementById('at-paso-prestacion');
  if (paso) paso.style.display = '';
  const labels = { consulta: 'Consulta', estudio: 'Estudio', practica: 'Práctica / Cirugía' };
  const label = document.getElementById('at-prest-label');
  if (label) label.textContent = labels[cat] || 'Estudio / Procedimiento / Cirugía';

  // Llenar el select con prestaciones reales, filtradas por categoría
  // (categoriaPrestacion, fuente única). 'prestacion' queda como alias viejo:
  // estudios + prácticas juntos (compatibilidad con callers previos).
  const sel = document.getElementById('at-prestacion-sel');
  if (!sel) return;
  const prests = cat === 'consulta' ? getConsultasDeOS(AT.os)
    : cat === 'estudio'  ? getEstudiosDeOS(AT.os)
    : cat === 'practica' ? getPracticasDeOS(AT.os)
    : getPrestacionesSinConsulta(AT.os);
  // data-exenta POR PRESTACIÓN (exentaPrestacion, fuente única): respeta el override
  // p.exenta cargado al importar el contrato. Antes se usaba un solo valor (el default
  // de la OS) para todas las opciones y el override no viajaba al registro.
  // OJO convención de este modal: data-exenta='1' significa GRAVADA.
  const exAttrDe = p => exentaPrestacion(p) ? '0' : '1';
  const exAttr0 = getExentaForOS(AT.os) ? '0' : '1';   // fallback sin prestación
  const opt0Val = cat === 'consulta' ? valorConsultaOS(AT.os) : 0;
  // El valor va a la vista en cada opción (" — $valor"). guardarAtencion ya separa por " — ".
  const precioTxt = v => v > 0 ? ` — ${fmt(v)}` : '';
  sel.innerHTML = prests.length
    ? prests.map(p => `<option value="${p.id}" data-val="${p.valOS}" data-exenta="${exAttrDe(p)}">[${p.codigo}] ${p.desc}${precioTxt(p.valOS)}</option>`).join('')
    : `<option value="0" data-val="${opt0Val}" data-exenta="${exAttr0}">${cat==='consulta'?'Consulta vestida oftalmológica'+precioTxt(opt0Val):'Sin prestaciones — ingresar valor'}</option>`;
  // Nuevas opciones = todas visibles: limpiar el filtro para no quedar desincronizado.
  const filtroInp = document.getElementById('at-prest-filtro');
  if (filtroInp) filtroInp.value = '';
  atOnPrestChange();

  // Mostrar copago
  const copBlq = document.getElementById('at-copago-bloque');
  if (copBlq) copBlq.style.display = '';
  // Mostrar datos de paciente (opcional)
  const pacBlq = document.getElementById('at-bloque-paciente');
  if (pacBlq) pacBlq.style.display = '';
  atHabilitarGuardar();
}

function togglePacienteFields() {
  const on = document.getElementById('at-pac-toggle')?.checked;
  const f = document.getElementById('at-pac-fields');
  if (f) f.style.display = on ? '' : 'none';
}

function atOnPrestChange() {
  const sel = document.getElementById('at-prestacion-sel');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const val = parseFloat(opt?.getAttribute('data-val')) || 0;
  const esGravada = opt?.getAttribute('data-exenta') === '1';  // data-exenta=1 → gravada (confusing but kept)
  const exenta = !esGravada;

  const montoInp = document.getElementById('at-monto');
  if (montoInp) montoInp.value = val;

  const badge = document.getElementById('at-iva-badge');
  const ivaHid = document.getElementById('at-iva-val');
  const ivaPct = AT.os === 'CEMEPLA' ? '21%' : '10.5%';
  if (badge) {
    badge.textContent = exenta ? '✓ Exenta' : '⚡ ' + ivaPct;
    badge.style.cssText = exenta
      ? 'background:var(--success-light);color:var(--success);font-size:12px;cursor:pointer;'
      : 'background:var(--warn-light);color:var(--warn);font-size:12px;cursor:pointer;';
  }
  if (ivaHid) ivaHid.value = exenta ? '0' : '1';

  // Mostrar plan solo para consultas
  const planGrp = document.getElementById('at-plan-group');
  if (planGrp) planGrp.style.display = AT.categoria === 'consulta' ? '' : 'none';

  atActualizarHonorario();
}

function atToggleIVA() {
  const ivaHid = document.getElementById('at-iva-val');
  const badge  = document.getElementById('at-iva-badge');
  if (!ivaHid || !badge) return;
  const eraExenta = ivaHid.value === '0';
  ivaHid.value = eraExenta ? '1' : '0';
  badge.textContent = getIVALabel(AT.os, !eraExenta);   // CEMEPLA muestra 21%, no 10.5%
  badge.style.cssText = eraExenta
    ? 'background:var(--warn-light);color:var(--warn);font-size:12px;cursor:pointer;'
    : 'background:var(--success-light);color:var(--success);font-size:12px;cursor:pointer;';
}

function atSelMedioPago(medio) {
  AT.medioPago = medio;
  atEstiloBtn('btn-pago-ef', medio === 'Efectivo');
  atEstiloBtn('btn-pago-tr', medio === 'Transferencia');
  atActualizarHonorario();
  atHabilitarGuardar();
}

function atActualizarHonorario() {
  const res = document.getElementById('at-honorario-resumen');
  const honMonto  = document.getElementById('at-hon-monto');
  const honCuando = document.getElementById('at-hon-cuando');
  if (!res || !honMonto) return;
  res.style.display = 'flex';

  if (AT.tipo === 'OS') {
    honMonto.textContent = fmt(DB.config.honorarioOS);
    honMonto.style.color = 'var(--accent2)';
    honCuando.textContent = '📅 Con la liquidación mensual';
    honCuando.style.color = 'var(--accent2)';
  } else {
    const mitad = DB.config.valorConsultaParticular / 2;
    honMonto.textContent = fmt(mitad);
    if (AT.medioPago === 'Efectivo') {
      honMonto.style.color = 'var(--success)';
      honCuando.textContent = '💵 Hoy mismo (efectivo)';
      honCuando.style.color = 'var(--success)';
    } else {
      honMonto.style.color = 'var(--accent2)';
      honCuando.textContent = '🏦 Con la liquidación del mes';
      honCuando.style.color = 'var(--accent2)';
    }
  }
}

function atHabilitarGuardar() {
  const btn = document.getElementById('at-btn-guardar');
  if (!btn) return;
  const ok = AT.tipo === 'Particular'
    ? !!AT.medioPago
    : AT.os === 'CEMEPLA' || !!AT.categoria;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.5';
  if (ok && AT.tipo === 'OS' && AT.os !== 'CEMEPLA') atActualizarHonorario();
}

function guardarAtencion() {
  const medico      = document.getElementById('at-medico-sel').value;
  const fecha       = document.getElementById('at-fecha').value;
  const consultorio = document.getElementById('at-consultorio-sel').value;
  if (!medico || !fecha) { showToast('⚠️ Seleccioná médico y fecha'); return; }
  if (!consultorio || !getConsultoriosList().includes(consultorio)) { showToast('⚠️ Seleccioná el consultorio'); return; }
  const errFecha = validarFecha(fecha, 'La fecha de atención');
  if (errFecha) { showToast('⚠️ ' + errFecha); return; }

  // ── PARTICULAR ────────────────────────────────────────────────────────────
  if (AT.tipo === 'Particular') {
    if (!AT.medioPago) { showToast('⚠️ Seleccioná efectivo o transferencia'); return; }
    const val    = parseFloat(document.getElementById('at-part-monto').value) || DB.config.valorConsultaParticular;
    const honMit = val / 2;
    const _regPart = {
      id:DB.nextId++, fecha, medico, consultorio, os:'Particular', plan:'', prestacion:'Consulta particular',
      cantidad:0, valorUnit:0, exenta:true, categoria:'consulta',
      partEfectivo: AT.medioPago==='Efectivo' ? 1 : 0,
      partEfVal:    val,
      partTransf:   AT.medioPago==='Transferencia' ? 1 : 0,
      partTrVal:    val,
    };
    DB.registros.push(_regPart);
    // Efectivo → entra a caja chica del consultorio donde se atendió
    if (AT.medioPago === 'Efectivo') {
      DB.cajaChica.push({
        id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
        concepto:`Particular efectivo — ${soloApellido(medico)}`,
        origen:'Efectivo', monto: val, regId: _regPart.id
      });
      // Pago del 50% al médico en el momento (previa confirmación)
      if (confirm(`El paciente pagó ${fmt(val)} en efectivo.\n\n¿Pagar ahora el honorario del médico (${fmt(honMit)}) en efectivo a ${soloApellido(medico)}?`)) {
        DB.cajaChica.push({
          id: DB.nextId++, fecha, consultorio, tipo:'Egreso',
          concepto:`Pago honorario efectivo — ${soloApellido(medico)} — ${fecha}`,
          origen:'Honorario', monto: honMit, regId: _regPart.id
        });
        _regPart.honorarioPagadoEfectivo = true;  // marca: ya cobrado, no pagar de nuevo en liquidación
        showToast(`✓ Pagado ${fmt(honMit)} a ${soloApellido(medico)} (efectivo)`);
      }
    }
    // Transferencia → entra a Caja (banco), no a caja chica
    if (AT.medioPago === 'Transferencia') {
      DB.movimientos.unshift({
        id: DB.nextId++, fecha, consultorio, tipo:'Ingreso',
        desc:`Particular transferencia — ${soloApellido(medico)}`,
        monto: val, saldo: 0, origen:'Particular', regId: _regPart.id
      });
      marcarCambios('movimientos');
    }
    closeModal('modal-atencion');
    showToast(`✓ Particular ${AT.medioPago.toLowerCase()} — ${soloApellido(medico)} · ${fmt(val)} → ${AT.medioPago==='Efectivo'?'caja '+consultorio:'liquidación'}`);
  marcarCambios('registros'); marcarCambios('cajaChica');
    initDashboard();
    if (AT.medioPago === 'Efectivo') renderCajaChica();
    return;
  }

  // ── OS estándar ───────────────────────────────────────────────────────────
  if (!AT.os || !AT.categoria) { showToast('⚠️ Seleccioná OS y tipo de prestación'); return; }
  const sel      = document.getElementById('at-prestacion-sel');
  const opt      = sel?.options[sel.selectedIndex];
  const rawText  = opt ? opt.text : 'Consulta vestida';
  const prestDesc= rawText.includes(' — ')
    ? rawText.split(' — ')[0].replace(/^\[.*?\]\s*/, '').trim()
    : rawText.replace(/^\[.*?\]\s*/, '').trim() || 'Consulta vestida';
  const montoRaw = parseFloat(document.getElementById('at-monto').value) || 0;
  // Código de nomenclador de la prestación elegida (para repreciar de forma robusta)
  const _pNom = (DB.prestaciones || []).find(p => p.os === AT.os && p.desc === prestDesc);
  const codigoPrest = _pNom ? (_pNom.codigo || '') : '';
  // Las consultas tienen valor de referencia por OS; las prestaciones no.
  const valorUnit = montoRaw || (AT.categoria === 'consulta' ? valorConsultaOS(AT.os) : 0);
  const exenta   = document.getElementById('at-iva-val')?.value === '0';
  const plan     = document.getElementById('at-plan')?.value || '';
  const cantAt   = Math.max(1, parseInt(document.getElementById('at-cantidad')?.value) || 1);

  // Prestación "por presupuesto" (valor 0): no se puede facturar sin un monto.
  if (!valorUnit || valorUnit <= 0) {
    showToast('⚠️ Esta prestación es "por presupuesto". Ingresá el monto antes de guardar.');
    const m = document.getElementById('at-monto');
    if (m) { m.focus(); m.style.borderColor = 'var(--warn)'; }
    return;
  }

  // Datos de paciente (opcionales) — útiles para OS que facturan por persona (ej. CEMEPLA)
  const pacApellido = document.getElementById('at-pac-apellido')?.value.trim() || '';
  const pacNombre   = document.getElementById('at-pac-nombre')?.value.trim() || '';
  const pacDni      = document.getElementById('at-pac-dni')?.value.trim() || '';
  const pacEmpresa  = document.getElementById('at-pac-empresa')?.value.trim() || '';
  const pacAutorizacion = document.getElementById('at-pac-autorizacion')?.value.trim() || '';
  const datosPaciente = (pacApellido || pacNombre || pacDni || pacEmpresa || pacAutorizacion)
    ? { paciente:`${pacApellido}, ${pacNombre}`.replace(/^, |, $/,''), apellido:pacApellido, nombre:pacNombre, dni:pacDni, empresa:pacEmpresa, autorizacion:pacAutorizacion }
    : {};

  // CEMEPLA: requiere datos del paciente para presentar a la OS (nombre, DNI, empresa) y el valor (neto).
  if (AT.os === 'CEMEPLA') {
    const faltan = [];
    if (!pacApellido && !pacNombre) faltan.push('nombre del paciente');
    if (!pacDni) faltan.push('DNI');
    if (!pacEmpresa) faltan.push('empresa');
    if (!montoRaw || montoRaw <= 0) faltan.push('valor de la consulta (neto, sin IVA)');
    if (faltan.length) {
      showToast('⚠️ CEMEPLA requiere: ' + faltan.join(', '));
      return;
    }
  }

  // SinCargo: el nombre y apellido del paciente son OBLIGATORIOS para procesarla.
  if (AT.os === 'SinCargo') {
    if (!pacApellido || !pacNombre) {
      showToast('⚠️ SinCargo requiere nombre Y apellido del paciente');
      // abrir el bloque de paciente para que lo complete
      const tog = document.getElementById('at-pac-toggle');
      if (tog && !tog.checked) { tog.checked = true; togglePacienteFields(); }
      return;
    }
  }

  // Copago: leer antes de crear el registro. Puede ser adelanto (se descuenta de la OS)
  // o complementario (la OS paga el total y el copago es ingreso extra).
  const tieneCopago = document.getElementById('at-tiene-copago')?.checked;
  let copMonto = 0, copMedio = 'Efectivo', copTipo = 'adelanto';
  if (tieneCopago) {
    copMonto = parseFloat(document.getElementById('at-copago-monto')?.value) || 0;
    copMedio = document.getElementById('at-copago-medio')?.value || 'Efectivo';
    copTipo  = document.getElementById('at-copago-tipo')?.value || 'adelanto';
  }

  // Categoría CONGELADA en el registro (consulta/estudio/practica): es la base para
  // después calcular cuánto se le paga al médico por práctica/estudio. Si se entró por
  // el alias viejo 'prestacion', se detecta por la descripción (categoriaDesc).
  const categoriaAt = CATEGORIAS_VALIDAS.includes(AT.categoria) ? AT.categoria : categoriaDesc(prestDesc);

  const _regOS = {
    id:DB.nextId++, fecha, medico, consultorio, os:AT.os, plan, prestacion:prestDesc, codigo:codigoPrest,
    cantidad:cantAt, valorUnit, exenta, categoria: categoriaAt,
    partEfectivo:0, partEfVal:valorUnit, partTransf:0, partTrVal:valorUnit,
    copago: copMonto, copagoMedio: copMedio, copagoTipo: copTipo,
    ...datosPaciente,
  };
  DB.registros.push(_regOS);

  // Ingreso del copago según medio:
  //  - Efectivo → caja chica del consultorio (plata física)
  //  - Transferencia → se registra como ingreso en movimientos (no caja)
  if (tieneCopago && copMonto > 0) {
    const etTipo = copTipo === 'complementario' ? 'complementario' : 'adelanto';
    if (copMedio === 'Efectivo') {
      DB.cajaChica.push({
        id:DB.nextId++, fecha, consultorio, tipo:'Ingreso',
        concepto:`Copago ${AT.os} (efectivo, ${etTipo}) — ${prestDesc.slice(0,28)}`,
        origen: 'Copago',
        monto: copMonto, regId: _regOS.id
      });
      marcarCambios('cajaChica');   // el copago en efectivo entra a caja chica → sincronizar ya
    } else {
      DB.movimientos.unshift({
        id:DB.nextId++, fecha, consultorio, tipo:'Ingreso',
        desc:`Copago ${AT.os} (transferencia, ${etTipo}) — ${prestDesc.slice(0,28)}`,
        monto: copMonto, saldo: 0, origen:'Copago', regId: _regOS.id
      });
      marcarCambios('movimientos');
    }
  }

  // SinCargo: el paciente paga $0,1 por transferencia que se le abona al médico
  // el mismo día. Se registra como ingreso Y egreso (queda en cero neto), ambos
  // vinculados al registro para poder limpiarlos si se borra la atención.
  if (AT.os === 'SinCargo') {
    const nomPac = `${pacApellido}, ${pacNombre}`.replace(/^, |, $/,'');
    DB.movimientos.unshift({
      id:DB.nextId++, fecha, consultorio, tipo:'Ingreso',
      desc:`SinCargo — ${nomPac} (paga ${soloApellido(medico)})`,
      monto: 0.1, saldo: 0, origen:'SinCargo', regId: _regOS.id
    });
    DB.movimientos.unshift({
      id:DB.nextId++, fecha, consultorio, tipo:'Egreso',
      desc:`SinCargo — pago a ${soloApellido(medico)} (${nomPac})`,
      monto: 0.1, saldo: 0, origen:'SinCargo', regId: _regOS.id
    });
    marcarCambios('movimientos');
  }

  closeModal('modal-atencion');
  showToast(`✓ ${AT.os} — ${prestDesc.slice(0,40)} · ${fmt(valorUnit)}`);
  marcarCambios('registros');
  initDashboard();
  if (tieneCopago) renderCajaChica();
}
