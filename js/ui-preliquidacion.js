// ═══════════════════════════════════════════════════════════════════════════
//  UI — PRELIQUIDACIÓN: honorarios por médico y cierre de mes (estado/factura/pago)
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Incluye getLiquidacion/regBloqueado, los 3 paneles (médico/admin/
//  cierre), cerrar/reabrir/factura/pago, copiar/ver/imprimir liquidación.
//  Se carga antes de persistencia.js. Usa helpers globales (DB, fmt, soloApellido,
//  honorMedicoReg, facturadoReg, contarConsultas, marcarCambios, hoyISO, …).
// ═══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════
//  PRELIQUIDACIÓN
// ══════════════════════════════════════

function initPreliquidacion() {
  // Populate medico select
  const sel = document.getElementById('preliq-medico');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = optionsMedicos('', '<option value="">Todos los médicos</option>');
    if (prev) sel.value = prev;
  }
  // Render all tabs
  generarPreliq();
}

function switchPreliqTab(tab, el) {
  document.querySelectorAll('#section-preliquidacion .tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['medico','admin','cierre','os'].forEach(t => {
    const d = document.getElementById(`preliq-tab-${t}`);
    if (d) d.style.display = t === tab ? '' : 'none';
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getMesLabel(mes) {
  const [anio, mesN] = mes.split('-');
  return MESES[parseInt(mesN)] + ' ' + anio;
}

function getLiquidacion(mes, medico) {
  return (DB.liquidaciones||[]).find(l => l.mes === mes && l.medico === medico);
}

// ¿El registro pertenece a una liquidación ya cerrada? (no debería editarse/borrarse)
function regBloqueado(r) {
  if (!r || !r.fecha) return false;
  const mes = r.fecha.slice(0, 7);
  const liq = getLiquidacion(mes, r.medico);
  return !!(liq && liq.estado === 'Cerrada');
}

// ── GENERAR PRELIQ — dispara los 3 paneles ───────────────────────────────────
function generarPreliq() {
  const medicoFiltro = document.getElementById('preliq-medico')?.value || '';
  const mes          = document.getElementById('preliq-mes')?.value || hoyISO().slice(0,7);
  const consultorio  = document.getElementById('preliq-consultorio')?.value || '';
  const mesLabel     = getMesLabel(mes);

  let regs = DB.registros.filter(r => r.fecha.startsWith(mes));
  if (consultorio) regs = regs.filter(r => r.consultorio === consultorio);

  const medicos = medicoFiltro
    ? DB.medicos.filter(m => m.nombre === medicoFiltro)
    : DB.medicos.filter(m => regs.some(r => r.medico === m.nombre));

  // Banner de estado del mes
  _renderEstadoBanner(mes, mesLabel, medicos);
  // Tab médico
  _renderTabMedico(regs, medicos, mes, mesLabel);
  // Tab admin
  _renderTabAdmin(regs, medicos, mes, mesLabel);
  // Tab cierre
  _renderTabCierre(medicos, mes, mesLabel, regs);
}

// ── BANNER estado del mes ────────────────────────────────────────────────────
function _renderEstadoBanner(mes, mesLabel, medicos) {
  const banner = document.getElementById('preliq-estado-banner');
  if (!banner) return;
  const liqList = (DB.liquidaciones||[]).filter(l => l.mes === mes);
  const cerradas = liqList.filter(l => l.estado === 'Cerrada').length;
  const conFactura = liqList.filter(l => l.facturaRecibida).length;
  const pagados = liqList.filter(l => l.pagoEnviado).length;
  const total = medicos.length;
  if (total === 0) { banner.innerHTML = ''; return; }
  const pct = Math.round(pagados / total * 100);
  banner.innerHTML = `
    <div style="background:var(--surface); border:1px solid var(--border2); border-radius:var(--r); padding:14px 18px; display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
      <div>
        <div style="font-size:13px; font-weight:700; color:var(--text2);">Estado — ${mesLabel}</div>
        <div style="font-size:11px; color:var(--text3); margin-top:2px;">${total} médico${total!==1?'s':''} con atenciones</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <span class="pill" style="background:${cerradas===total&&total>0?'var(--success-light)':'var(--surface2)'};color:${cerradas===total&&total>0?'var(--success)':'var(--text3)'};">🔒 Cerradas: ${cerradas}/${total}</span>
        <span class="pill" style="background:${conFactura>0?'var(--accent2-light)':'var(--surface2)'};color:${conFactura>0?'var(--accent2)':'var(--text3)'};">🧾 Factura recibida: ${conFactura}/${cerradas||total}</span>
        <span class="pill" style="background:${pagados>0?'var(--success-light)':'var(--surface2)'};color:${pagados>0?'var(--success)':'var(--text3)'};">✅ Pagos enviados: ${pagados}/${total}</span>
      </div>
      <div style="flex:1; min-width:120px;">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:var(--success);"></div></div>
        <div style="font-size:10px; color:var(--text3); margin-top:3px;">${pct}% completado</div>
      </div>
    </div>`;
}

// ── TAB MÉDICO — cuadro simple: fecha / OS / cantidad pacientes ───────────────
function _renderTabMedico(regs, medicos, mes, mesLabel) {
  const el = document.getElementById('preliq-medico-resultado');
  if (!el) return;
  if (medicos.length === 0) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div>Sin atenciones para este período</div></div>'; return; }

  el.innerHTML = medicos.map(med => {
    const mRegs = regs.filter(r => r.medico === med.nombre);
    if (!mRegs.length) return '';

    // Agrupar por fecha
    const porDia = {};
    mRegs.forEach(r => {
      if (!porDia[r.fecha]) porDia[r.fecha] = {};
      if (r.os !== 'Particular') {
        porDia[r.fecha][r.os] = (porDia[r.fecha][r.os]||0) + r.cantidad;
      } else {
        if (r.partEfectivo > 0) porDia[r.fecha]['Part. Efectivo'] = (porDia[r.fecha]['Part. Efectivo']||0) + r.partEfectivo;
        if (r.partTransf > 0)   porDia[r.fecha]['Part. Transferencia'] = (porDia[r.fecha]['Part. Transferencia']||0) + r.partTransf;
      }
    });

    const dias = Object.keys(porDia).sort();
    const totEf   = mRegs.reduce((s,r)=>s+r.partEfectivo,0);
    const totTr   = mRegs.reduce((s,r)=>s+r.partTransf,0);
    const totTodo = mRegs.reduce((s,r)=>s+totalConsultasReg(r),0);

    // Colectar todas las OS del médico
    const osUsadas = [...new Set(mRegs.filter(r=>r.os!=='Particular').map(r=>r.os))];
    const colOSNames = [...osUsadas];
    if (totEf>0) colOSNames.push('Part. Efectivo');
    if (totTr>0) colOSNames.push('Part. Transferencia');

    const rows = dias.map(fecha => {
      const [y,m,d] = fecha.split('-');
      const dayCols = colOSNames.map(os => {
        const v = porDia[fecha][os] || 0;
        const esOs = !os.startsWith('Part');
        return `<td style="text-align:center; font-weight:${v?'700':'400'}; color:${v?(esOs?'var(--accent2)':'var(--success)'):'var(--text3)'};">${v||'—'}</td>`;
      }).join('');
      const rowTotal = Object.values(porDia[fecha]).reduce((s,v)=>s+v,0);
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 10px; font-weight:600;">${d}/${m}</td>
        <td style="padding:8px 10px; text-align:center; font-size:16px; font-weight:800; color:var(--accent2);">${rowTotal}</td>
        ${dayCols}
      </tr>`;
    }).join('');

    const totCols = colOSNames.map(os => {
      let v = 0;
      dias.forEach(d => { v += porDia[d][os]||0; });
      const esOs = !os.startsWith('Part');
      return `<td style="padding:8px 10px; text-align:center; font-weight:700; color:${esOs?'white':'#e0f2fe'};">${v||'—'}</td>`;
    }).join('');

    // ── Cálculo de honorarios (fuente única: honorariosMedico) ────────────────
    const totConsultas = contarConsultas(mRegs);
    const { honOS, honSC, honEf, honTr, honExtra, honPract, aLiquidar } = honorariosMedico(mRegs);

    const liq = getLiquidacion(mes, med.nombre);

    // Consultorio(s) REAL(es) según las atenciones del mes (no la ficha del médico).
    // Si atendió en uno solo, muestra ese; si en ambos, muestra los dos.
    const consultoriosReales = [...new Set(mRegs.map(r => r.consultorio).filter(Boolean))];
    const consultorioLabel = consultoriosReales.length ? consultoriosReales.join(' + ') : (med.consultorio || '—');

    // Desglose por sede: pacientes y honorario en cada consultorio
    const porSede = {};
    mRegs.forEach(r => {
      const sede = r.consultorio || '—';
      if (!porSede[sede]) porSede[sede] = { pac: 0, honor: 0 };
      porSede[sede].pac   += totalConsultasReg(r);
      porSede[sede].honor += honorALiquidarReg(r);   // a liquidar (excluye efectivo ya pagado) → cuadra con aLiquidar
    });
    const sedesOrden = ['Palpa','Haedo'].filter(s => porSede[s]).concat(Object.keys(porSede).filter(s => s!=='Palpa' && s!=='Haedo'));
    const desgloseSedeHTML = sedesOrden.length > 1
      ? `<div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">` +
        sedesOrden.map(s => {
          const col = s==='Palpa' ? 'var(--palpa, #2563eb)' : s==='Haedo' ? 'var(--haedo, #16a34a)' : 'var(--text3)';
          return `<span style="font-size:11px; background:${col}1a; color:${col}; padding:2px 8px; border-radius:10px; font-weight:600;">${s}: ${fmtInt(porSede[s].pac)} pac · ${fmt(porSede[s].honor)}</span>`;
        }).join('') + `</div>`
      : '';
    return `
      <div class="card" style="margin-bottom:16px; border-top:3px solid ${med.color};">
        <div class="card-header" style="background:${med.color}11;">
          <div>
            <div style="font-size:15px; font-weight:700;">${med.nombre}</div>
            <div style="font-size:12px; color:var(--text3);">${mesLabel} · ${consultorioLabel}</div>
            ${desgloseSedeHTML}
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${liq?.estado==='Cerrada' ? `<span class="pill" style="background:var(--success-light);color:var(--success);">🔒 Cerrada</span>` : ''}
            <button class="btn btn-primary btn-sm" onclick="copiarTablamedico(decodeURIComponent('${encodeURIComponent(med.nombre)}'),'${mes}')">📋 Copiar preliq</button>
          </div>
        </div>
        <div class="card-body" style="padding:0; overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;" id="tabla-medico-${med.nombre.replace(/\s+/g,'_')}">
            <thead>
              <tr style="background:#4a90d9; color:white;">
                <th style="padding:8px 10px; text-align:left; width:70px;">Fecha</th>
                <th style="padding:8px 10px; text-align:center; width:80px;">Presentes</th>
                ${colOSNames.map(os=>`<th style="padding:8px 10px; text-align:center; font-size:11px;">${os}</th>`).join('')}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:#4a90d9; color:white; font-weight:700;">
                <td style="padding:8px 10px;">Total</td>
                <td style="padding:8px 10px; text-align:center; font-size:16px;">${totTodo}</td>
                ${totCols}
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Resumen de honorarios -->
        <div class="card-body" style="border-top:1px solid var(--border); background:var(--surface2);">
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
            <div style="flex:1; min-width:140px;">
              <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:2px;">OS — ${totConsultas} consultas × ${fmt(DB.config.honorarioOS)}</div>
              <div style="font-size:18px; font-weight:800; font-family:monospace; color:var(--accent2);">${fmt(honOS)}</div>
            </div>
            ${honEf > 0 ? `<div style="flex:1; min-width:120px;">
              <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:2px;">Part. efectivo (${totEf}) — ya cobró</div>
              <div style="font-size:18px; font-weight:800; font-family:monospace; color:var(--success);">${fmt(honEf)} ✓</div>
            </div>` : ''}
            ${honTr > 0 ? `<div style="flex:1; min-width:120px;">
              <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:2px;">Part. transf. (${totTr}) × ${fmt((DB.config.valorConsultaParticular/2))}</div>
              <div style="font-size:18px; font-weight:800; font-family:monospace; color:var(--accent2);">${fmt(honTr)}</div>
            </div>` : ''}
            ${honExtra > 0 ? `<div style="flex:1; min-width:120px;">
              <div style="font-size:10px; color:var(--text3); text-transform:uppercase; margin-bottom:2px;">Derivaciones</div>
              <div style="font-size:18px; font-weight:800; font-family:monospace; color:var(--accent2);">${fmt(honExtra)}</div>
            </div>` : ''}
            ${honPract > 0 ? `<div style="flex:1; min-width:120px;">
              <div style="font-size:10px; color:#5a3a99; text-transform:uppercase; margin-bottom:2px;">🔬 Estudios / Prácticas</div>
              <div style="font-size:18px; font-weight:800; font-family:monospace; color:#5a3a99;">${fmt(honPract)}</div>
            </div>` : ''}
            <div style="flex:1; min-width:160px; background:${med.color}; color:white; border-radius:var(--r-sm); padding:10px 14px;">
              <div style="font-size:10px; opacity:.8; text-transform:uppercase; margin-bottom:2px;">Total a depositar</div>
              <div style="font-size:22px; font-weight:900; font-family:monospace;">${fmt(aLiquidar)}</div>
              ${honEf > 0 ? `<div style="font-size:10px; opacity:.8;">+ ${fmt(honEf)} cobrado en ef.</div>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── TAB ADMIN — detalle financiero completo ──────────────────────────────────
function _renderTabAdmin(regs, medicos, mes, mesLabel) {
  const el = document.getElementById('preliq-admin-resultado');
  if (!el) return;
  if (medicos.length === 0) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div>Sin datos</div></div>'; return; }

  el.innerHTML = medicos.map(med => {
    const mRegs = regs.filter(r => r.medico === med.nombre);
    if (!mRegs.length) return '';

    const totEf   = mRegs.reduce((s,r)=>s+r.partEfectivo,0);
    const totTr   = mRegs.reduce((s,r)=>s+r.partTransf,0);
    const totTodo = mRegs.reduce((s,r)=>s+totalConsultasReg(r),0);
    const { honOS, honSC, honEf, honTr, aLiquidar } = honorariosMedico(mRegs);
    const factBruto= mRegs.reduce((s,r)=>s+facturadoReg(r),0);

    // ── Derivaciones operadas por este médico (como derivante) ───────────────
    const derivsOperadas = DB.derivaciones.filter(d =>
      d.medico === med.nombre && d.estado === 'Realizada'
    );
    const avisoDerivHTML = derivsOperadas.length > 0 ? `
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#854d0e;margin-bottom:6px;">
          🔔 ${derivsOperadas.length} derivación${derivsOperadas.length>1?'es':''} con cirugía realizada — pendiente${derivsOperadas.length>1?'s':''} de cobro
        </div>
        ${derivsOperadas.map(d=>`
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-bottom:1px solid #fde04780;">
            <div>
              <span style="font-weight:600;">${d.paciente}</span>
              <span style="color:#92400e;margin-left:6px;">${d.cirugia}${d.ojo?' ('+d.ojo+')':''}</span>
            </div>
            <div style="color:#78350f;font-size:11px;">${d.os} · ${d.fechaCx||d.fecha}</div>
          </div>`).join('')}
      </div>` : '';

    // Desglose por OS. "cant" = TODAS las prestaciones (para Neto/IVA/Total, que son
    // sobre lo facturado). "honFijo" = SOLO consultas × honorarioOS (cantConsultaHon
    // excluye cirugías/estudios, que no pagan honorario fijo) — si se usara "cant" acá
    // se inflaría el honorario mostrado en filas con cirugías. La suma de honFijo de
    // todas las OS coincide con honOS (fuente única, honorariosMedico).
    const osMap = {};
    mRegs.filter(r=>r.os!=='Particular').forEach(r=>{
      if (!osMap[r.os]) osMap[r.os]={cant:0,neto:0,iva:0,honFijo:0};
      osMap[r.os].cant += r.cantidad;
      osMap[r.os].neto += subtotalNeto(r);
      osMap[r.os].iva  += ivaReg(r);
      osMap[r.os].honFijo += cantConsultaHon(r) * DB.config.honorarioOS;
    });

    return `
      <div class="card" style="margin-bottom:16px; border-top:3px solid ${med.color};">
        <div class="card-header" style="background:${med.color}11;">
          <div>
            <div style="font-size:15px; font-weight:700;">${med.nombre}</div>
            <div style="font-size:12px; color:var(--text3);">${mesLabel} · Resumen administrativo</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:var(--text3);">A liquidar al médico</div>
            <div style="font-size:22px; font-weight:800; color:${med.color}; font-family:monospace;">${fmt(aLiquidar)}</div>
            ${honEf>0?`<div style="font-size:11px;color:var(--success);">+ ${fmt(honEf)} ya cobró (ef.)</div>`:''}
          </div>
        </div>
        <div class="card-body">
          ${avisoDerivHTML}
          <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
            <div class="stat-card" style="flex:1;min-width:110px;">
              <div class="stat-label">Total consultas</div>
              <div class="stat-value">${totTodo}</div>
            </div>
            <div class="stat-card" style="flex:1;min-width:110px;">
              <div class="stat-label">Facturado bruto</div>
              <div class="stat-value finance-num" style="font-size:16px;">${fmt(factBruto)}</div>
            </div>
            <div class="stat-card" style="flex:1;min-width:110px; border-left:3px solid ${med.color};">
              <div class="stat-label">Honorarios a pagar</div>
              <div class="stat-value finance-num" style="font-size:16px; color:${med.color};">${fmt(aLiquidar)}</div>
            </div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:12px;">
            <thead><tr style="background:var(--surface2);">
              <th style="padding:7px 10px; text-align:left;">Obra Social</th>
              <th style="padding:7px 10px; text-align:center;">Consultas</th>
              <th style="padding:7px 10px; text-align:right;">Neto</th>
              <th style="padding:7px 10px; text-align:right;">IVA</th>
              <th style="padding:7px 10px; text-align:right;">Total</th>
              <th style="padding:7px 10px; text-align:right;">Honorario</th>
            </tr></thead>
            <tbody>
              ${Object.entries(osMap).sort((a,b)=>b[1].cant-a[1].cant).map(([os,g])=>`
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:7px 10px; font-weight:600;">${os}</td>
                  <td style="padding:7px 10px; text-align:center; font-weight:700;">${g.cant}</td>
                  <td style="padding:7px 10px; text-align:right; font-family:monospace;">${fmt(g.neto)}</td>
                  <td style="padding:7px 10px; text-align:right; font-family:monospace; color:var(--warn);">${g.iva>0?fmt(g.iva):'—'}</td>
                  <td style="padding:7px 10px; text-align:right; font-family:monospace; font-weight:700;">${fmt((g.neto+g.iva))}</td>
                  <td style="padding:7px 10px; text-align:right; font-family:monospace; color:var(--accent2);">${fmt(g.honFijo)}</td>
                </tr>`).join('')}
              ${totEf>0?`<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:7px 10px; color:var(--success);">💵 Part. Efectivo</td>
                <td style="padding:7px 10px; text-align:center; font-weight:700;">${totEf}</td>
                <td colspan="2" style="padding:7px 10px; text-align:right; font-family:monospace;">${fmt((totEf*DB.config.valorConsultaParticular))}</td>
                <td style="padding:7px 10px; text-align:right; font-family:monospace; font-weight:700;">${fmt((totEf*DB.config.valorConsultaParticular))}</td>
                <td style="padding:7px 10px; text-align:right; font-family:monospace; color:var(--success);">${fmt(honEf)} ✓</td>
              </tr>`:''}
              ${totTr>0?`<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:7px 10px; color:var(--accent2);">🏦 Part. Transferencia</td>
                <td style="padding:7px 10px; text-align:center; font-weight:700;">${totTr}</td>
                <td colspan="2" style="padding:7px 10px; text-align:right; font-family:monospace;">${fmt((totTr*DB.config.valorConsultaParticular))}</td>
                <td style="padding:7px 10px; text-align:right; font-family:monospace; font-weight:700;">${fmt((totTr*DB.config.valorConsultaParticular))}</td>
                <td style="padding:7px 10px; text-align:right; font-family:monospace; color:var(--accent2);">${fmt(honTr)}</td>
              </tr>`:''}
            </tbody>
            <tfoot>
              <tr style="background:var(--surface2); font-weight:700; border-top:2px solid var(--border2);">
                <td style="padding:8px 10px;">TOTALES</td>
                <td style="padding:8px 10px; text-align:center;">${totTodo}</td>
                <td colspan="2" style="padding:8px 10px; text-align:right; font-family:monospace;">${fmt(factBruto)}</td>
                <td style="padding:8px 10px; text-align:right; font-family:monospace;">${fmt(factBruto)}</td>
                <td style="padding:8px 10px; text-align:right; font-family:monospace; color:${med.color}; font-size:15px;">${fmt(aLiquidar)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }).join('');
}

// ── TAB CIERRE Y PAGO ────────────────────────────────────────────────────────
function _renderTabCierre(medicos, mes, mesLabel, regs) {
  const el = document.getElementById('preliq-tab-cierre');
  if (!el) return;
  const inner = document.getElementById('preliq-cierre-resultado');
  if (!inner) return;
  if (medicos.length === 0) { inner.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><div>Sin atenciones para este período</div></div>'; return; }

  inner.innerHTML = medicos.map(med => {
    const mRegs = regs.filter(r => r.medico === med.nombre);
    if (!mRegs.length) return '';

    const totOS = mRegs.reduce((s,r)=>s+r.cantidad,0);
    const totEf = mRegs.reduce((s,r)=>s+r.partEfectivo,0);
    const totTr = mRegs.reduce((s,r)=>s+r.partTransf,0);
    const totConsultas = contarConsultas(mRegs);
    const { honOS, honSC, honEf, honTr, honPract, aLiquidar } = honorariosMedico(mRegs);

    const liq = getLiquidacion(mes, med.nombre) || {};

    const estadoColor = liq.pagoEnviado ? 'var(--success)' : liq.facturaRecibida ? 'var(--accent2)' : liq.estado==='Cerrada' ? 'var(--warn)' : 'var(--text3)';
    const estadoLabel = liq.pagoEnviado ? '✅ Pago enviado' : liq.facturaRecibida ? '🧾 Factura recibida' : liq.estado==='Cerrada' ? '🔒 Cerrada — esperando factura' : '📋 Abierta';

    // Encode name safe for inline onclick (escaping single quotes)
    const nomSafe = med.nombre.replace(/'/g, "\\'");

    // ── Derivaciones operadas por este médico (como derivante) ───────────────
    const derivsOpCierre = DB.derivaciones.filter(d =>
      d.medico === med.nombre && d.estado === 'Realizada'
    );
    const avisoDerivCierreHTML = derivsOpCierre.length > 0 ? `
      <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#854d0e;margin-bottom:6px;">
          🔔 ${derivsOpCierre.length} derivación${derivsOpCierre.length>1?'es':''} con cirugía realizada — verificar cobro antes de cerrar
        </div>
        ${derivsOpCierre.map(d=>`
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-bottom:1px solid #fde04780;">
            <div>
              <span style="font-weight:600;">${d.paciente}</span>
              <span style="color:#92400e;margin-left:6px;">${d.cirugia}${d.ojo?' ('+d.ojo+')':''}</span>
            </div>
            <div style="color:#78350f;font-size:11px;">${d.os} · ${d.fechaCx||d.fecha}</div>
          </div>`).join('')}
      </div>` : '';

    return `
      <div class="card" style="margin-bottom:16px; border-top:3px solid ${med.color};">
        <div class="card-header" style="background:${med.color}11;">
          <div>
            <div style="font-size:15px; font-weight:700;">${med.nombre}</div>
            <div style="font-size:12px; color:var(--text3);">${mesLabel}</div>
          </div>
          <span class="pill" style="background:${estadoColor}22; color:${estadoColor}; font-weight:700;">${estadoLabel}</span>
        </div>
        <div class="card-body">
          ${avisoDerivCierreHTML}
          <div style="background:var(--surface2); border-radius:var(--r-sm); padding:14px; margin-bottom:16px;">
            <div style="font-size:11px; font-weight:700; color:var(--text3); text-transform:uppercase; margin-bottom:10px;">Detalle del pago</div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;">
              <span>Honor. OS — ${totConsultas} cons. × ${fmt(DB.config.honorarioOS)}</span>
              <span class="finance-num" style="font-weight:700;">${fmt(honOS)}</span>
            </div>
            ${totTr>0?`<div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;">
              <span>Honor. transf. — ${totTr} × ${fmt((DB.config.valorConsultaParticular/2))}</span>
              <span class="finance-num" style="font-weight:700;">${fmt(honTr)}</span>
            </div>`:''}
            ${honEf>0?`<div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; color:var(--success);">
              <span>💵 Efectivo ya cobrado — ${totEf} × ${fmt((DB.config.valorConsultaParticular/2))}</span>
              <span class="finance-num" style="font-weight:700;">${fmt(honEf)} ✓</span>
            </div>`:''}
            ${honPract>0?`<div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; color:#5a3a99;">
              <span>🔬 Estudios / prácticas</span>
              <span class="finance-num" style="font-weight:700;">${fmt(honPract)}</span>
            </div>`:''}
            <div style="border-top:2px solid var(--border2); padding-top:10px; margin-top:6px; display:flex; justify-content:space-between; font-size:15px; font-weight:800;">
              <span>Total a depositar</span>
              <span class="finance-num" style="color:${med.color}; font-size:20px;">${fmt(aLiquidar)}</span>
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            ${!liq.estado || liq.estado!=='Cerrada' ? `
              <button class="btn btn-primary" onclick="cerrarMesMedico('${nomSafe}','${mes}')">
                🔒 Cerrar mes y generar liquidación
              </button>` : ''}

            ${liq.estado==='Cerrada' && !liq.facturaRecibida ? `
              <button class="btn btn-secondary" onclick="marcarFacturaRecibida('${nomSafe}','${mes}')">
                🧾 Marcar factura recibida
              </button>` : ''}

            ${liq.facturaRecibida && !liq.pagoEnviado ? `
              <button class="btn btn-primary" style="background:var(--success); border-color:var(--success);" onclick="confirmarPagoEnviado('${nomSafe}','${mes}')">
                ✅ Confirmar pago enviado
              </button>` : ''}

            ${liq.estado==='Cerrada' ? `
              <button class="btn btn-secondary" onclick="enviarLiquidacionCierre('${nomSafe}','${mes}')">
                📲 Copiar para WhatsApp
              </button>
              <button class="btn btn-secondary" onclick="imprimirLiquidacion('${nomSafe}','${mes}')">
                🖨️ Imprimir
              </button>` : ''}

            ${liq.estado==='Cerrada' && !liq.pagoEnviado ? `
              <button class="btn btn-secondary" style="color:var(--warn); border-color:var(--warn);" onclick="reabrirMesMedico('${nomSafe}','${mes}')">
                🔓 Reabrir período
              </button>` : ''}

            ${liq.pagoEnviado ? `
              <div style="background:var(--success-light); border:1px solid var(--success); border-radius:var(--r-sm); padding:8px 14px; font-size:13px; color:var(--success); font-weight:600;">
                ✅ Liquidación completada · ${liq.fechaPago||''}
              </div>
              <button class="btn btn-secondary" style="color:var(--warn); border-color:var(--warn);" onclick="reabrirMesMedico('${nomSafe}','${mes}')">
                🔓 Reabrir (corregir un error)
              </button>` : ''}
          </div>

          ${liq.fechaCierre?`<div style="font-size:11px; color:var(--text3); margin-top:10px;">
            Cerrada: ${liq.fechaCierre}
            ${liq.fechaFactura?' · Factura recibida: '+liq.fechaFactura:''}
            ${liq.fechaPago?' · Pago enviado: '+liq.fechaPago:''}
          </div>`:''}
        </div>
      </div>`;
  }).join('');
}

// ── Acciones de cierre ───────────────────────────────────────────────────────
function cerrarMesMedico(medico, mes) {
  const mesLabel = getMesLabel(mes);
  if (!confirm(`¿Cerrar ${mesLabel} para ${medico}?\n\nNo se podrán editar las atenciones de este período una vez cerrado.`)) return;
  if (!DB.liquidaciones) DB.liquidaciones = [];
  const existing = DB.liquidaciones.findIndex(l => l.mes===mes && l.medico===medico);
  const liq = {
    id: DB.nextId++, mes, medico, estado:'Cerrada',
    fechaCierre: hoyISO(),
    facturaRecibida: false, fechaFactura: null,
    pagoEnviado: false, fechaPago: null,
  };
  if (existing >= 0) DB.liquidaciones[existing] = liq;
  else DB.liquidaciones.push(liq); marcarCambios('liquidaciones');
  generarPreliq();
  showToast(`🔒 ${mesLabel} cerrado para ${soloApellido(medico)}`);
}

function reabrirMesMedico(medico, mes) {
  const liq = getLiquidacion(mes, medico);
  if (!liq) return;
  const mesLabel = getMesLabel(mes);

  // Caso normal (cerrada, aún sin pagar): reabrir directo.
  if (!liq.pagoEnviado) {
    if (!confirm(`¿Reabrir ${mesLabel} para ${medico}?\n\nVas a poder volver a editar las atenciones de este período.`)) return;
    liq.estado = 'Abierta';
    liq.facturaRecibida = false;
    liq.fechaFactura = null;
    marcarCambios('liquidaciones');
    generarPreliq();
    showToast(`🔓 ${mesLabel} reabierto para ${soloApellido(medico)}`);
    return;
  }

  // Caso con pago YA enviado (p. ej. corregir un error de carga): también se puede
  // reabrir, pero hay que REVERTIR el egreso de Caja que generó confirmarPagoEnviado
  // (movimiento con origen 'Honorario' y liqId de esta liq); si no, al volver a
  // confirmar el pago el banco quedaría descontado dos veces.
  const movPago = (DB.movimientos || []).find(m => m.liqId === liq.id && m.origen === 'Honorario');
  const detalleMov = movPago
    ? `\n\nSe va a REVERTIR el egreso de Caja del pago (${fmt(movPago.monto)}) para no descuadrar el banco. Cuando vuelvas a confirmar el pago, se registra de nuevo.`
    : '';
  if (!confirm(`⚠️ ${mesLabel} para ${medico} ya tiene el pago ENVIADO.\n\n¿Reabrir igual para corregir un error?${detalleMov}`)) return;

  if (movPago) {
    DB.movimientos = DB.movimientos.filter(m => m !== movPago);
    marcarCambios('movimientos');
  }
  liq.estado = 'Abierta';
  liq.pagoEnviado = false;
  liq.fechaPago = null;
  liq.facturaRecibida = false;
  liq.fechaFactura = null;
  marcarCambios('liquidaciones');
  generarPreliq();
  showToast(`🔓 ${mesLabel} reabierto${movPago ? ' (pago revertido)' : ''} — ${soloApellido(medico)}`);
}

function marcarFacturaRecibida(medico, mes) {
  const liq = getLiquidacion(mes, medico);
  if (!liq) return;
  liq.facturaRecibida = true;
  liq.fechaFactura = hoyISO();
  generarPreliq();
  showToast(`🧾 Factura registrada — ${soloApellido(medico)}`);
}

function confirmarPagoEnviado(medico, mes) {
  const liq = getLiquidacion(mes, medico);
  if (!liq) return;
  liq.pagoEnviado = true;
  liq.fechaPago = hoyISO();

  // El pago de la liquidación es SIEMPRE por transferencia (a diferencia del efectivo
  // que ya se paga en el momento y se registra aparte) — es un egreso más de Caja, si
  // no se registrara acá el saldo de banco quedaría de más (no descontaría lo pagado a
  // médicos). Se registra una sola vez, al confirmar el pago (no retroactivo).
  const regs = DB.registros.filter(r => r.medico === medico && r.fecha.startsWith(mes));
  const { aLiquidar } = honorariosMedico(regs);
  if (aLiquidar > 0) {
    DB.movimientos.unshift({
      id: DB.nextId++, fecha: liq.fechaPago, consultorio: 'General', tipo: 'Egreso',
      desc: `Liquidación ${getMesLabel(mes)} — ${soloApellido(medico)}`,
      monto: aLiquidar, saldo: 0, origen: 'Honorario', liqId: liq.id,
    });
    marcarCambios('movimientos');
  }

  generarPreliq();
  showToast(`✅ Pago confirmado — ${soloApellido(medico)}`);
}

function enviarLiquidacionCierre(medico, mes) {
  const mesLabel = getMesLabel(mes);
  const regs = DB.registros.filter(r => r.medico===medico && r.fecha.startsWith(mes));
  const totEf = regs.reduce((s,r)=>s+r.partEfectivo,0);
  const totTr = regs.reduce((s,r)=>s+r.partTransf,0);
  // OJO: usar SIEMPRE totConsultas (solo consultas) acá, no la cantidad total de
  // prestaciones OS. honOS se calcula solo con consultas (cirugías no pagan
  // honorario fijo) — si se mostrara la cantidad total, el "×" no cerraría con
  // el monto real y el médico vería un número que no coincide.
  const totConsultas = contarConsultas(regs);
  const { honOS, honSC, honEf, honTr, honExtra, honPract, aLiquidar } = honorariosMedico(regs);
  const nom = soloApellido(medico);

  // ── Bloque de CANTIDADES (todo el conteo de pacientes junto, arriba del todo) ──

  // Total de pacientes atendidos en general (OS + cirugías/prestaciones + particulares +
  // SinCargo). totalConsultasReg(r) es la fuente única para "cuántos pacientes" salen de
  // un registro (ya la usan Dashboard/Estadísticas).
  const totalPacientes = regs.reduce((s,r) => s + totalConsultasReg(r), 0);
  const lineaTotalPacientes = totalPacientes > 0 ? `👥 *Total de pacientes: ${totalPacientes}*\n` : '';

  // Por consultorio: mismo criterio que el total (totalConsultasReg, incluye particulares),
  // para que sumado dé el mismo número de arriba. Solo se muestra si atendió en más de uno.
  const porSede = {};
  regs.forEach(r => {
    const sede = r.consultorio || 'Sin consultorio';
    porSede[sede] = (porSede[sede] || 0) + totalConsultasReg(r);
  });
  const sedesLineas = Object.keys(porSede).sort()
    .map(sede => `   • ${sede}: ${porSede[sede]} pacientes`).join('\n');
  const desgloseSede = Object.keys(porSede).length > 1 ? `📍 *Por consultorio:*\n${sedesLineas}\n` : '';

  const lineaTotalOS = `🏥 Total obra social: ${totConsultas} consultas\n`;

  // Cantidad de pacientes particulares (efectivo vs transferencia).
  const totPart = totEf + totTr;
  const lineaParticulares = totPart > 0
    ? `👤 Particulares: ${totPart} (💵 ${totEf} efectivo · 🏦 ${totTr} transferencia)\n`
    : '';

  // ── Bloque de HONORARIOS (los números, después de las cantidades) ──
  const lineasHonorarios = `💰 *Honorarios:*\nObra social → *${fmt(honOS)}*\n${honPract>0?`Estudios/prácticas → *${fmt(honPract)}*\n`:''}${totTr>0?`Transferencia particulares → *${fmt(honTr)}*\n`:''}${honSC>0?`Sin cargo → *${fmt(honSC)}*\n`:''}${honExtra>0?`Derivaciones → *${fmt(honExtra)}*\n`:''}${honEf>0?`💵 Efectivo ya cobrado: ${fmt(honEf)}\n`:''}`;

  const msg = `👁 *OIP Oftalmología Integral*\n📋 *Liquidación ${mesLabel}*\n\n👨‍⚕️ ${medico}\n\n${lineaTotalPacientes}${desgloseSede}${lineaTotalOS}${lineaParticulares}\n${lineasHonorarios}\n*A depositar: ${fmt(aLiquidar)}*\n\nPor favor remitir factura para procesar el pago. ¡Muchas gracias!`;
  navigator.clipboard.writeText(msg).then(()=>showToast('📋 Liquidación copiada — lista para enviar por WhatsApp'));
}

function copiarTablamedico(medico, mes) {
  const mesLabel = getMesLabel(mes);
  const regs = DB.registros.filter(r => r.medico === medico && r.fecha.startsWith(mes));
  if (!regs.length) { showToast('⚠️ Sin registros para este médico en el período'); return; }
  const consultoriosReales = [...new Set(regs.map(r => r.consultorio).filter(Boolean))];
  const consultorioLabel = consultoriosReales.join(' + ');

  // Build data por día
  const porDia = {};
  const consultorioPorDia = {};  // qué consultorio se atendió cada día
  regs.forEach(r => {
    if (!porDia[r.fecha]) porDia[r.fecha] = {};
    if (r.consultorio) {
      if (!consultorioPorDia[r.fecha]) consultorioPorDia[r.fecha] = new Set();
      consultorioPorDia[r.fecha].add(r.consultorio);
    }
    if (r.os !== 'Particular') {
      porDia[r.fecha][r.os] = (porDia[r.fecha][r.os] || 0) + r.cantidad;
    } else {
      if (r.partEfectivo > 0) porDia[r.fecha]['Part. Efectivo'] = (porDia[r.fecha]['Part. Efectivo'] || 0) + r.partEfectivo;
      if (r.partTransf   > 0) porDia[r.fecha]['Part. Transf.']  = (porDia[r.fecha]['Part. Transf.']  || 0) + r.partTransf;
    }
  });
  const consultDe = (fecha) => consultorioPorDia[fecha] ? [...consultorioPorDia[fecha]].join(' + ') : '—';
  const dias     = Object.keys(porDia).sort();
  const osUsadas = [...new Set(regs.filter(r => r.os !== 'Particular').map(r => r.os))];
  const totEf    = regs.reduce((s,r) => s + r.partEfectivo, 0);
  const totTr    = regs.reduce((s,r) => s + r.partTransf,   0);
  if (totEf > 0) osUsadas.push('Part. Efectivo');
  if (totTr > 0) osUsadas.push('Part. Transf.');

  const med = DB.medicos.find(m => m.nombre === medico);

  // Column totals
  const totPorOS = {};
  osUsadas.forEach(os => {
    totPorOS[os] = dias.reduce((s, d) => s + (porDia[d][os] || 0), 0);
  });
  const totTotal = dias.reduce((s, d) => s + Object.values(porDia[d]).reduce((a,b) => a+b, 0), 0);

  // ── HTML table (se ve bien pegado en Word, mail, WhatsApp Web, Docs) ──────
  const HEADER_BG = '#2563eb';
  const HEADER_TXT = '#ffffff';
  const BORDER = '#dbeafe';
  const ROW_ALT = '#f0f7ff';

  const thStyle = `background:${HEADER_BG};color:${HEADER_TXT};padding:8px 14px;text-align:center;font-size:13px;font-weight:700;border:1px solid ${HEADER_BG};white-space:nowrap;`;
  const thLStyle = `background:${HEADER_BG};color:${HEADER_TXT};padding:8px 14px;text-align:left;font-size:13px;font-weight:700;border:1px solid ${HEADER_BG};`;
  const tdStyle  = (center=true, alt=false, bold=false) =>
    `background:${alt?ROW_ALT:'#ffffff'};padding:7px 14px;text-align:${center?'center':'left'};font-size:13px;border:1px solid ${BORDER};${bold?'font-weight:700;':''}`;

  const osHeaders = osUsadas.map(os => `<th style="${thStyle}">${os}</th>`).join('');

  const bodyRows = dias.map((fecha, i) => {
    const [y,m,d] = fecha.split('-');
    const alt = i % 2 === 1;
    const rowTotal = Object.values(porDia[fecha]).reduce((s,v) => s+v, 0);
    const osCells  = osUsadas.map(os => {
      const v = porDia[fecha][os];
      return `<td style="${tdStyle(true, alt)}">${v ?? '—'}</td>`;
    }).join('');
    return `<tr>
      <td style="${tdStyle(false, alt, true)}">${d}/${m}</td>
      <td style="${tdStyle(true, alt)};font-size:12px;">${consultDe(fecha)}</td>
      <td style="${tdStyle(true, alt, true)};font-size:15px;">${rowTotal}</td>
      ${osCells}
    </tr>`;
  }).join('');

  const totCells = osUsadas.map(os => {
    const v = totPorOS[os];
    return `<td style="${thStyle}">${v || '—'}</td>`;
  }).join('');

  const html = `
<div style="font-family:Arial,sans-serif;max-width:700px;">
  <div style="margin-bottom:12px;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">OIP OFTALMOLOGÍA INTEGRAL</div>
    <div style="font-size:17px;font-weight:700;color:#1e3a5f;">${medico}</div>
    <div style="font-size:13px;color:#4b5563;">${mesLabel}${consultorioLabel ? ' · ' + consultorioLabel : ''}</div>
  </div>
  <table style="border-collapse:collapse;width:100%;">
    <thead>
      <tr>
        <th style="${thLStyle}">Fecha</th>
        <th style="${thStyle}">Consultorio</th>
        <th style="${thStyle}">Presentes</th>
        ${osHeaders}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    <tfoot>
      <tr>
        <td style="${thLStyle}">TOTAL</td>
        <td style="${thStyle}">—</td>
        <td style="${thStyle};font-size:15px;">${totTotal}</td>
        ${totCells}
      </tr>
    </tfoot>
  </table>
</div>`;

  // ── Texto plano (fallback) ─────────────────────────────────────────────────
  const COL_F = 7;
  const COL_P = 8;
  const COL_O = Math.max(10, ...osUsadas.map(o => o.length + 2));
  const pad  = (s, w) => String(s).padStart(w);
  const padL = (s, w) => String(s).padEnd(w);
  const sep  = (w) => '─'.repeat(w);
  const COL_F2 = Math.max(COL_F, 14);  // más ancho para "04/06 Palpa"
  const hr   = `├─${sep(COL_F2)}─┼─${sep(COL_P)}─${osUsadas.map(() => `┼─${sep(COL_O)}─`).join('')}┤`;
  const top  = `┌─${sep(COL_F2)}─┬─${sep(COL_P)}─${osUsadas.map(() => `┬─${sep(COL_O)}─`).join('')}┐`;
  const bot  = `└─${sep(COL_F2)}─┴─${sep(COL_P)}─${osUsadas.map(() => `┴─${sep(COL_O)}─`).join('')}┘`;
  const mkRow = (fecha, total, vals) =>
    `│ ${padL(fecha, COL_F2)} │ ${pad(total, COL_P)} ${vals.map(v => `│ ${pad(v, COL_O)} `).join('')}│`;

  const plainRows = dias.map(fecha => {
    const [y,m,d] = fecha.split('-');
    const rowTotal = Object.values(porDia[fecha]).reduce((s,v) => s+v, 0);
    const cons = consultDe(fecha);
    const consCorto = cons === 'Palpa' ? 'Palpa' : cons === 'Haedo' ? 'Haedo' : cons;
    return mkRow(`${d}/${m} ${consCorto}`.trim(), rowTotal, osUsadas.map(os => porDia[fecha][os] ?? '—'));
  });

  const plain = [
    `📋 OIP OFTALMOLOGÍA INTEGRAL`,
    `Preliquidación — ${medico}`,
    `${mesLabel}${consultorioLabel ? ' · ' + consultorioLabel : ''}`,
    '',
    top,
    mkRow('Fecha / Cons.', 'Presentes', osUsadas),
    hr,
    ...plainRows,
    hr,
    mkRow('TOTAL', totTotal, osUsadas.map(os => totPorOS[os] || '—')),
    bot,
  ].join('\n');

  // ── Copiar HTML + texto plano ──────────────────────────────────────────────
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const blobPlain = new Blob([plain], { type: 'text/plain' });
    const item = new ClipboardItem({ 'text/html': blob, 'text/plain': blobPlain });
    navigator.clipboard.write([item]).then(() =>
      showToast('📋 Preliquidación copiada con formato — pegá en Word, mail o Google Docs')
    ).catch(() => {
      // Fallback: plain text only
      navigator.clipboard.writeText(plain).then(() =>
        showToast('📋 Preliquidación copiada (texto plano)')
      );
    });
  } catch(e) {
    navigator.clipboard.writeText(plain).then(() =>
      showToast('📋 Preliquidación copiada (texto plano)')
    );
  }
}

function verPreliqMedico(medico, mes) {
  // Navigate to preliq section filtered to this medico
  showSection('preliquidacion');
  // Set the medico filter
  const selMedico = document.getElementById('preliq-medico');
  const selMes    = document.getElementById('preliq-mes');
  if (selMedico) selMedico.value = medico;
  if (selMes && mes) selMes.value = mes;
  // Switch to tab médico
  const tabs = document.querySelectorAll('#section-preliquidacion .tabs .tab');
  if (tabs[0]) {
    tabs.forEach(t => t.classList.remove('active'));
    tabs[0].classList.add('active');
    ['admin','cierre','os'].forEach(t => {
      const el = document.getElementById(`preliq-tab-${t}`);
      if (el) el.style.display = 'none';
    });
    const medicoTab = document.getElementById('preliq-tab-medico');
    if (medicoTab) medicoTab.style.display = '';
  }
  initPreliquidacion();
}

function verTodasLasLiq() {
  showSection('preliquidacion');
  const selMedico = document.getElementById('preliq-medico');
  if (selMedico) selMedico.value = '';  // todos los médicos
  // Switch to cierre tab
  const tabs = document.querySelectorAll('#section-preliquidacion .tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  if (tabs[2]) {
    tabs[2].classList.add('active');
    ['medico','admin','os'].forEach(t => {
      const el = document.getElementById(`preliq-tab-${t}`);
      if (el) el.style.display = 'none';
    });
    const cierreTab = document.getElementById('preliq-tab-cierre');
    if (cierreTab) cierreTab.style.display = '';
  }
  initPreliquidacion();
}






function imprimirLiquidacion(medico, mes) {
  const mesLabel = getMesLabel(mes);
  const regs = DB.registros.filter(r => r.medico === medico && r.fecha.startsWith(mes));
  const med  = DB.medicos.find(m => m.nombre === medico) || {};
  const totOS = regs.reduce((s,r)=>s+r.cantidad,0);
  const totEf = regs.reduce((s,r)=>s+r.partEfectivo,0);
  const totTr = regs.reduce((s,r)=>s+r.partTransf,0);
  const totConsultas = contarConsultas(regs);
  const { honOS, honSC, honEf, honTr, honPract, aLiquidar } = honorariosMedico(regs);
  const liq = getLiquidacion(mes, medico) || {};

  // Tabla por día/OS
  const porDia = {};
  regs.forEach(r => {
    if (!porDia[r.fecha]) porDia[r.fecha] = {};
    if (r.os !== 'Particular') {
      porDia[r.fecha][r.os] = (porDia[r.fecha][r.os]||0) + r.cantidad;
    } else {
      if (r.partEfectivo>0) porDia[r.fecha]['Part.(e)'] = (porDia[r.fecha]['Part.(e)']||0) + r.partEfectivo;
      if (r.partTransf>0)   porDia[r.fecha]['Part.(t)'] = (porDia[r.fecha]['Part.(t)']||0) + r.partTransf;
    }
  });
  const dias = Object.keys(porDia).sort();
  const osUsadas = [...new Set(regs.filter(r=>r.os!=='Particular').map(r=>r.os))];
  if (totEf>0) osUsadas.push('Part.(e)');
  if (totTr>0) osUsadas.push('Part.(t)');

  const filas = dias.map(fecha => {
    const [y,m,d] = fecha.split('-');
    const rowTotal = Object.values(porDia[fecha]).reduce((s,v)=>s+v,0);
    const celdas = osUsadas.map(os=>`<td style="text-align:center;padding:6px 10px;">${porDia[fecha][os]||'—'}</td>`).join('');
    return `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px 10px;font-weight:600;">${d}/${m}</td><td style="text-align:center;padding:6px 10px;font-weight:800;font-size:15px;">${rowTotal}</td>${celdas}</tr>`;
  }).join('');

  const totCeldas = osUsadas.map(os=>{
    const v = dias.reduce((s,d)=>(porDia[d]?.[os]||0)+s, 0);
    return `<td style="text-align:center;padding:8px 10px;font-weight:700;color:white;">${v||'—'}</td>`;
  }).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #4a90d9;">
        <div>
          <h2 style="margin:0;font-size:20px;color:#4a90d9;">OIP Oftalmología Integral</h2>
          <p style="margin:4px 0;font-size:13px;color:#666;">Liquidación de honorarios médicos</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px;font-weight:700;color:#333;">${mesLabel}</div>
          ${liq.fechaCierre?`<div style="font-size:12px;color:#888;">Cerrada: ${liq.fechaCierre}</div>`:''}
        </div>
      </div>

      <div style="background:#eef3fa;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-size:18px;font-weight:700;color:#333;">${medico}</div>
        <div style="font-size:12px;color:#666;">${med.consultorio||''}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px;">
        <thead>
          <tr style="background:#4a90d9;color:white;">
            <th style="padding:8px 10px;text-align:left;width:65px;">Fecha</th>
            <th style="padding:8px 10px;text-align:center;width:75px;">Presentes</th>
            ${osUsadas.map(os=>`<th style="padding:8px 10px;text-align:center;">${os}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr style="background:#4a90d9;color:white;font-weight:700;">
            <td style="padding:8px 10px;">Total</td>
            <td style="padding:8px 10px;text-align:center;font-size:15px;">${totOS+totEf+totTr}</td>
            ${totCeldas}
          </tr>
        </tfoot>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr style="border-bottom:1px solid #e0e0e0;">
          <td style="padding:10px 4px;">Honorarios OS — ${totConsultas} × ${fmt(DB.config.honorarioOS)}</td>
          <td style="text-align:right;font-weight:700;padding:10px 4px;font-family:monospace;">${fmt(honOS)}</td>
        </tr>
        ${totTr>0?`<tr style="border-bottom:1px solid #e0e0e0;">
          <td style="padding:10px 4px;">Honorarios transf. — ${totTr} × ${fmt((DB.config.valorConsultaParticular/2))}</td>
          <td style="text-align:right;font-weight:700;padding:10px 4px;font-family:monospace;">${fmt(honTr)}</td>
        </tr>`:''}
        ${honPract>0?`<tr style="border-bottom:1px solid #e0e0e0;">
          <td style="padding:10px 4px;">Estudios / prácticas</td>
          <td style="text-align:right;font-weight:700;padding:10px 4px;font-family:monospace;">${fmt(honPract)}</td>
        </tr>`:''}
        ${honEf>0?`<tr style="border-bottom:1px solid #e0e0e0;color:green;">
          <td style="padding:10px 4px;">Efectivo ya cobrado — ${totEf} × ${fmt((DB.config.valorConsultaParticular/2))}</td>
          <td style="text-align:right;font-weight:700;padding:10px 4px;font-family:monospace;">${fmt(honEf)} ✓</td>
        </tr>`:''}
        <tr style="border-top:2px solid #333;">
          <td style="padding:14px 4px;font-size:16px;font-weight:800;">Total a depositar</td>
          <td style="text-align:right;font-size:22px;font-weight:800;color:#4a90d9;padding:14px 4px;font-family:monospace;">${fmt(aLiquidar)}</td>
        </tr>
      </table>

      <div style="border-top:1px solid #e0e0e0;padding-top:10px;font-size:10px;color:#aaa;">
        Generado el ${new Date().toLocaleDateString('es-AR')} · OIP Oftalmología Integral
      </div>
    </div>`;

  _abrirVentanaImpresion(`Liquidación ${mesLabel} — ${medico}`, html);
}

function _abrirVentanaImpresion(titulo, contenidoHTML) {
  const win = window.open('', '_blank', 'width=920,height=720');
  if (!win) { showToast('⚠️ Habilitá las ventanas emergentes para imprimir'); return; }
  win.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    *{box-sizing:border-box;} body{font-family:Arial,sans-serif;color:#333;margin:20px;background:white;}
    table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;}
    .card{border:1px solid #ddd;border-radius:6px;margin-bottom:16px;overflow:hidden;page-break-inside:avoid;}
    .card-header{background:#f5f7fa;padding:12px 16px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;}
    .card-body{padding:16px;} .pill{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;}
    .stat-card{border:1px solid #ddd;border-radius:6px;padding:12px;display:inline-block;min-width:120px;margin:4px;}
    .stat-label{font-size:11px;color:#888;text-transform:uppercase;} .stat-value{font-size:22px;font-weight:700;}
    .finance-num{font-family:monospace;} .empty-state{display:none;} button{display:none!important;}
    .progress-bar,.progress-fill{display:none;}
    @media print{body{margin:0;} @page{margin:12mm;}}
  </style>
</head><body>
  <div style="text-align:right;margin-bottom:16px;">
    <button onclick="window.print()" style="display:inline-block!important;padding:8px 20px;background:#4a90d9;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">🖨️ Imprimir</button>
  </div>
  ${contenidoHTML}
</body></html>`);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}
