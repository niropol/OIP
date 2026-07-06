// ═══════════════════════════════════════════════════════════════════════════
//  UI — OBRAS SOCIALES (ABM): alta/edición/borrado de OS y preliquidación de OS.
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Junta la gestión de entidades OS que faltaba; las cobranzas/facturas
//  de OS están en js/ui-finanzas.js. Se carga antes de persistencia.js. Usa helpers
//  globales (DB, fmt, marcarCambios, renderOS, totalesOS, poblarSelectoresOS, …).
// ═══════════════════════════════════════════════════════════════════════════

function generarPreliqOS() {
  const osFiltro = document.getElementById('preliq-os-select').value;
  const mes = document.getElementById('preliq-mes')?.value || hoyISO().slice(0,7);  // usa el mismo selector global
  const prefijo = mes;  // ya está en formato YYYY-MM
  const [anioNum, mesNum] = mes.split('-');

  let atenciones = DB.registros.filter(r => r.fecha.startsWith(prefijo) && r.os !== 'Particular');
  if (osFiltro) atenciones = atenciones.filter(r => r.os === osFiltro);

  const osGroups = {};
  atenciones.forEach(r => {
    if (!osGroups[r.os]) osGroups[r.os] = [];
    osGroups[r.os].push(r);
  });

  let html = '';
  Object.entries(osGroups).forEach(([osName, regs]) => {
    const esCemepla = osName === 'CEMEPLA';
    // Totales (neto exento/gravado, IVA, copago) salen de totalesOS() — fuente única
    // (js/calculos.js) — en vez de recalcularse acá con su propio reduce.
    const t = totalesOS(regs, osName);
    const totalAdelanto = t.copagoAdelanto;
    // Copago complementario: lo cobró el consultorio aparte, la OS igual paga el total.
    const totalComplementario = regs.reduce((s,r) => s + (esCopagoAdelanto(r.os) && r.copagoTipo === 'complementario' ? (r.copago || 0) : 0), 0);
    const total = t.aFacturar;  // lo que la OS debe pagar (neto de copagos-adelanto)
    const totalIVA  = t.iva;
    const totCant   = regs.reduce((s,r) => s + r.cantidad, 0);

    // ── Resumen consolidado: agrupar por código (sin fecha), exentas y gravadas ──
    // Filas de la fuente única compartida (js/ui-finanzas.js) para que este "Generar"
    // coincida exactamente con el detalle en pantalla y con el mail a la OS.
    const pctLabel = esCemepla ? '21%' : '10.5%';
    const filas = filasPresentacionOS(regs, osName);
    const filasHTML = filas.map(f => {
      const neto = f.neto;
      const iva  = f.iva;
      return `<tr>
        <td style="font-family:monospace;font-size:12px;">${f.codigo}</td>
        <td style="font-size:12px;">${f.prestacion}${f.plan?' ('+f.plan+')':''}</td>
        <td><span class="pill" style="${f.exenta?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}font-size:10px;">${f.exenta?'Exenta':pctLabel}</span></td>
        <td style="text-align:center;font-weight:700;">${f.cant}</td>
        <td class="finance-num">${fmt(f.valorUnit)}${f.valorMixto?' ~':''}</td>
        <td class="finance-num">${fmt(neto)}</td>
        <td class="finance-num" style="color:${iva>0?'var(--warn)':'var(--text3)'};">${iva>0?fmt(iva):'—'}</td>
        <td class="finance-num" style="font-weight:700;">${fmt(neto+iva)}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header" style="justify-content:space-between;">
          <span class="card-title">${osName} · ${totCant} consultas</span>
          <button class="btn btn-primary btn-sm" onclick="copiarDetalleOSMail('${osName.replace(/'/g,"\\'")}','${mes}')">📧 Copiar para mail</button>
        </div>
        <div class="card-body" style="padding:0;">
          <table>
            <thead><tr><th>Código</th><th>Prestación</th><th>IVA</th><th style="text-align:center;">Cant.</th><th>Valor unit.</th><th>Subtotal</th><th>IVA $</th><th>Total</th></tr></thead>
            <tbody>${filasHTML}</tbody>
          </table>
        </div>
        <div class="card-body" style="background:var(--surface2);border-top:2px solid var(--border2);">
          <div style="max-width:360px;margin-left:auto;">
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">Neto exento:</span>
              <span style="font-weight:700;font-family:monospace;">${fmt(t.netoExento)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">Neto gravado:</span>
              <span style="font-weight:700;font-family:monospace;">${fmt(t.netoGravado)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">IVA ${pctLabel}:</span>
              <span style="font-weight:700;font-family:monospace;color:var(--warn);">${fmt(totalIVA)}</span>
            </div>
            ${totalAdelanto>0?`<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--accent);">− Copago a cuenta:</span>
              <span style="font-weight:700;font-family:monospace;color:var(--accent);">${fmt(totalAdelanto)}</span>
            </div>`:''}
            <div style="display:flex;justify-content:space-between;gap:20px;font-size:22px;font-weight:800;border-top:2px solid var(--border2);padding-top:10px;margin-top:6px;">
              <span>TOTAL:</span>
              <span style="font-family:monospace;color:var(--accent2);">${fmt(total)}</span>
            </div>
            ${totalComplementario>0?`<div style="display:flex;justify-content:space-between;gap:20px;margin-top:6px;font-size:13px;color:var(--success);">
              <span>+ Coseguro complementario cobrado al paciente:</span>
              <span style="font-family:monospace;">${fmt(totalComplementario)}</span>
            </div>`:''}
          </div>
        </div>
      </div>`;
  });
  document.getElementById('preliq-os-resultado').innerHTML = html || '<div class="empty-state"><div class="empty-icon">📭</div><div>Sin datos</div></div>';
}

async function guardarOS() {
  const editId = document.getElementById('os-edit-id').value;
  const nombre = document.getElementById('os-nombre').value.trim();
  const codigo = document.getElementById('os-codigo').value.trim();
  const pago = document.getElementById('os-pago').value;
  const vencimiento = document.getElementById('os-vencimiento').value;
  if (!nombre) { showToast('⚠️ Ingresá el nombre de la OS'); return; }

  if (editId) {
    // ── Edición ──
    const os = DB.obrasSociales.find(o => o.id === parseInt(editId));
    if (!os) return;
    const nombreViejo = os.nombre;
    os.nombre = nombre; os.codigo = codigo; os.pago = pago; os.vencimiento = vencimiento;
    marcarCambios('obrasSociales');
    // Si cambió el nombre, propagarlo a las facturas que apuntan a esta OS por nombre
    if (nombreViejo !== nombre) {
      let tocadas = 0;
      DB.facturas.forEach(f => { if (f.dest === nombreViejo) { f.dest = nombre; tocadas++; } });
      if (tocadas > 0) marcarCambios('facturas');
    }
    closeModal('modal-os');
    renderOS();
    await guardarOSenNubeYaConFeedback('✓ Obra social actualizada y guardada');
    return;
  }

  // ── Alta ──
  DB.obrasSociales.push({
    id: DB.nextId++, nombre, codigo, pago, vencimiento,
    consultas: 0, facturado: 0, estado: 'Activa',
  });
  marcarCambios('obrasSociales');
  closeModal('modal-os');
  renderOS();
  await guardarOSenNubeYaConFeedback('✓ Obra social creada y guardada en la nube');
}

// Fuerza el guardado inmediato a la nube y avisa el resultado REAL (no un toast optimista).
// Así, si el guardado falla, el usuario se entera en el momento en vez de perder los datos al recargar.
async function guardarOSenNubeYaConFeedback(msgOk) {
  if (!sb) { showToast('⚠️ No estás conectado a la nube. La OS no se guardó.'); return; }
  if (autosaveTimer) clearTimeout(autosaveTimer);
  try {
    await guardarEnNube(true);   // guarda en silencio (sin su propio toast)
    if (cambiosPendientes.dirty.size === 0) {
      showToast(msgOk);
    } else {
      showToast('⚠️ No se pudo confirmar el guardado. Revisá tu conexión e intentá de nuevo.');
    }
  } catch (e) {
    showToast('⚠️ Error al guardar en la nube. La OS puede no haberse guardado.');
  }
}

function nuevaOS() {
  document.getElementById('os-edit-id').value = '';
  document.getElementById('os-nombre').value = '';
  document.getElementById('os-codigo').value = '';
  document.getElementById('os-vencimiento').value = '';
  const contacto = document.getElementById('os-contacto'); if (contacto) contacto.value = '';
  const email = document.getElementById('os-email'); if (email) email.value = '';
  openModal('modal-os');
}

function editarOS(id) {
  const os = DB.obrasSociales.find(o => o.id === id);
  if (!os) return;
  document.getElementById('os-edit-id').value = id;
  document.getElementById('os-nombre').value = os.nombre || '';
  document.getElementById('os-codigo').value = os.codigo || '';
  document.getElementById('os-pago').value = os.pago || '';
  document.getElementById('os-vencimiento').value = os.vencimiento || '';
  const contacto = document.getElementById('os-contacto'); if (contacto) contacto.value = os.contacto || '';
  const email = document.getElementById('os-email'); if (email) email.value = os.email || '';
  openModal('modal-os');
}

function eliminarOS(id) {
  const os = DB.obrasSociales.find(o => o.id === id);
  if (!os) return;
  // Datos que dependen de esta OS
  const atenciones = DB.registros.filter(r => r.os === os.nombre).length;
  const facturas   = DB.facturas.filter(f => f.dest === os.nombre);
  const prestaciones = DB.prestaciones.filter(p => p.os === os.nombre).length;

  let msg = `¿Eliminar la obra social "${os.nombre}"?`;
  const avisos = [];
  if (atenciones > 0)   avisos.push(`${atenciones} atención(es) cargada(s) con esta OS quedarán con un nombre que ya no existe en la lista`);
  if (facturas.length > 0) avisos.push(`${facturas.length} factura(s) de esta OS`);
  if (prestaciones > 0) avisos.push(`${prestaciones} prestación(es) del nomenclador de esta OS`);
  if (avisos.length > 0) {
    msg += `\n\n⚠️ Atención: hay datos asociados:\n• ${avisos.join('\n• ')}\n\nLas atenciones y facturas históricas NO se borran (para no perder registros de plata ya movida). Solo se quita la OS de la lista. ¿Continuar?`;
  }
  if (!confirm(msg)) return;

  DB.obrasSociales = DB.obrasSociales.filter(o => o.id !== id);
  marcarCambios('obrasSociales');
  renderOS();
  showToast('✓ Obra social eliminada de la lista');
}
