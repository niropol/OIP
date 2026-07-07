// ═══════════════════════════════════════════════════════════════════════════
//  UI — VISTAS DE SOLO LECTURA (Dashboard y Estadísticas)
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Se carga DESPUÉS del script principal y ANTES de persistencia.js,
//  porque arranque()→init() llama a initDashboard(). Usa helpers globales (fmt,
//  facturadoReg, DB, …) que viven en otros módulos / index.html.
// ═══════════════════════════════════════════════════════════════════════════

// ── Pizarrón de notas del dashboard ─────────────────────────────────────────
// Notas compartidas entre usuarios (DB.notas se sincroniza como cualquier colección).
// El texto es libre: SIEMPRE escapado antes de insertarse en el HTML.
function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderNotas() {
  const cont = document.getElementById('notas-lista');
  if (!cont) return;
  const notas = DB.notas || [];
  cont.innerHTML = notas.length === 0
    ? '<span style="font-size:11px; color:#b45309; opacity:.7;">Sin notas — lo que escribas acá lo ven todos los usuarios.</span>'
    : notas.map(n => `
      <div style="display:flex; align-items:center; gap:8px; background:#fef3c7; border:1px solid #fcd34d; border-radius:8px; padding:6px 10px; max-width:100%;">
        <span style="font-size:13px; color:#78350f; word-break:break-word;">${escHtml(n.texto)}</span>
        <span style="font-size:10px; color:#b45309; white-space:nowrap;">${escHtml(n.fecha || '')}</span>
        <button onclick="eliminarNota(${n.id})" title="Borrar nota"
          style="background:none; border:none; cursor:pointer; color:#b45309; font-size:13px; padding:0 2px;">✕</button>
      </div>`).join('');
}

function agregarNota() {
  const inp = document.getElementById('nota-nueva');
  const texto = (inp?.value || '').trim();
  if (!texto) { showToast('⚠️ Escribí la nota primero'); return; }
  if (!DB.notas) DB.notas = [];
  const now = new Date();
  const fecha = `${hoyISO().slice(8,10)}/${hoyISO().slice(5,7)} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  DB.notas.unshift({ id: DB.nextId++, texto, fecha });
  if (inp) inp.value = '';
  marcarCambios('notas');
  renderNotas();
}

function eliminarNota(id) {
  DB.notas = (DB.notas || []).filter(n => n.id !== id);
  marcarCambios('notas');
  renderNotas();
}

function initDashboard() {
  const hoy  = hoyISO();
  const now  = new Date();
  const mesPrefijo = hoy.slice(0,7);
  const mesLabel = MESES[now.getMonth()+1] + ' ' + now.getFullYear();

  // Pizarrón de notas (siempre, aunque no haya registros)
  renderNotas();

  // Fecha en topbar del dashboard
  const fechaEl = document.getElementById('dash-fecha-hoy');
  if (fechaEl) fechaEl.textContent = 'Hoy';
  const mesLabelEl = document.getElementById('dash-mes-label');
  if (mesLabelEl) mesLabelEl.textContent = `Distribución — ${mesLabel}`;

  // ── Registros del día y del mes ──────────────────────────────────────────
  const regsHoy = DB.registros.filter(r => r.fecha === hoy);
  const regsMes = DB.registros.filter(r => r.fecha.startsWith(mesPrefijo));

  // Consultas hoy/mes por consultorio — TODOS los consultorios activos, no solo
  // Palpa/Haedo/Extra (si se agrega uno nuevo en Configuración, debe sumar acá).
  const consultoriosDash = getConsultoriosList();
  const hoyPorConsultorio = consultoriosDash.map(c => ({ nombre: c, cant: sumarPacientes(regsHoy, c) }));
  const hoyTotal = hoyPorConsultorio.reduce((s,c)=>s+c.cant, 0);
  const mesPorConsultorio = consultoriosDash.map(c => ({ nombre: c, cant: sumarPacientes(regsMes, c) }));
  const mesTotal = mesPorConsultorio.reduce((s,c)=>s+c.cant, 0);
  const pillClaseConsultorio = c => c === 'Palpa' ? 'pill-palpa' : c === 'Haedo' ? 'pill-haedo' : 'pill-os';
  const pillsConsultorio = lista => lista.filter(c=>c.cant>0 || ['Palpa','Haedo'].includes(c.nombre))
    .map(c => `<span class="pill ${pillClaseConsultorio(c.nombre)}" style="font-size:14px; margin-left:4px;">${c.nombre} ${c.cant}</span>`).join('');

  // Facturado mes
  const factMes = regsMes.reduce((s,r) => s + facturadoReg(r), 0);
  const factOS  = regsMes.filter(r=>r.os!=='Particular').reduce((s,r)=>s+facturadoReg(r),0);
  const factPart= regsMes.filter(r=>r.os==='Particular').reduce((s,r)=>s+facturadoReg(r),0);

  // Cobros pendientes (antes excluía Vencida acá — el KPI más urgente quedaba afuera)
  const factPend = DB.facturas.filter(facturaPendiente);
  const montoPend = factPend.reduce((s,f)=>s+f.monto,0);
  const liqPend   = DB.liquidaciones ? DB.liquidaciones.filter(l=>l.estado==='Cerrada'&&!l.pagoEnviado) : [];

  // KPIs
  const kpisEl = document.getElementById('dash-kpis');
  if (kpisEl) kpisEl.innerHTML = `
    <div class="stat-card" style="border-left:3px solid var(--accent);">
      <div class="stat-label">Consultas hoy</div>
      <div class="stat-value" style="font-size:28px;">${hoyTotal || '—'}</div>
      <div class="stat-sub">${pillsConsultorio(hoyPorConsultorio)}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--accent2);">
      <div class="stat-label">Consultas ${mesLabel}</div>
      <div class="stat-value" style="font-size:28px;">${mesTotal || '—'}</div>
      <div class="stat-sub">${pillsConsultorio(mesPorConsultorio)}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid #7c3aed;" title="Por fecha de atención (no de factura). Para el monto de facturas emitidas del mes, ver Finanzas.">
      <div class="stat-label">Facturado ${mesLabel} (atenciones)</div>
      <div class="stat-value finance-num" style="font-size:${factMes>=1000000?'18px':'22px'};">${factMes>0?fmt(factMes):'—'}</div>
      <div class="stat-sub" style="font-size:10px;">${factMes>0?`OS: ${fmt(factOS)} · Part: ${fmt(factPart)}`:''}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--warn);">
      <div class="stat-label">Cobros pendientes</div>
      <div class="stat-value finance-num" style="font-size:${montoPend>=1000000?'18px':'22px'}; color:${montoPend>0?'var(--warn)':'var(--text3)'};">${montoPend>0?fmt(montoPend):'$0,00'}</div>
      <div class="stat-sub">${factPend.length} factura${factPend.length!==1?'s':''} OS${liqPend.length>0?' · '+liqPend.length+' liq. pendiente'+( liqPend.length!==1?'s':''):''}</div>
    </div>`;

  // Médicos activos hoy
  const medicoCount = {};
  regsHoy.forEach(r => {
    const tot = totalConsultasReg(r);
    if (tot > 0) medicoCount[r.medico] = (medicoCount[r.medico]||0) + tot;
  });
  const list = document.getElementById('medico-hoy-list');
  if (list) {
    const sorted = Object.entries(medicoCount).sort((a,b)=>b[1]-a[1]);
    const maxV = sorted[0]?.[1] || 1;
    const mes = hoy.slice(0,7);
    list.innerHTML = sorted.length ? sorted.map(([nombre, count]) => {
      const med = DB.medicos.find(m=>m.nombre===nombre);
      const nomEnc = encodeURIComponent(nombre);
      return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <div class="avatar" style="background:${med?.color||'#888'}22;color:${med?.color||'#888'};font-size:11px;width:36px;height:36px;">
          ${nombre.split(' ').map(w=>w[0]).slice(1,3).join('')}
        </div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${nombre}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${Math.round(count/maxV*100)}%;background:${med?.color||'var(--accent)'};"></div></div>
            <span style="font-size:12px;font-weight:700;min-width:24px;text-align:right;">${count}</span>
          </div>
        </div>
        <span class="pill ${med?.consultorio==='Palpa'?'pill-palpa':med?.consultorio==='Haedo'?'pill-haedo':'pill-os'}" style="font-size:10px;">${med?.consultorio||''}</span>
        <button class="btn btn-secondary btn-sm" style="font-size:11px;padding:3px 8px;" onclick="verPreliqMedico(decodeURIComponent('${nomEnc}'),'${mes}')">Ver preliq</button>
      </div>`;
    }).join('') : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Sin atenciones cargadas hoy</div></div>';
  }

  // Distribución OS del mes
  const distEl = document.getElementById('dash-os-dist');
  if (distEl) {
    const osMap = {};
    regsMes.filter(r=>r.os!=='Particular').forEach(r=>{ osMap[r.os]=(osMap[r.os]||0)+totalReg(r); });
    if (factPart>0) osMap['Particular'] = factPart;
    const osEntries = Object.entries(osMap).sort((a,b)=>b[1]-a[1]);
    const maxOS = osEntries[0]?.[1]||1;
    const totDist = osEntries.reduce((s,[,v])=>s+v,0);
    const colors = ['var(--accent2)','var(--accent)','#7c3aed','#f59e0b','#be185d','#0891b2','#16a34a','#dc2626'];
    if (osEntries.length === 0) {
      distEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">Sin datos del mes</div></div>';
    } else {
      distEl.innerHTML = `
        <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
          <div style="flex:1;text-align:center;background:var(--accent2-light);border-radius:8px;padding:10px;">
            <div style="font-size:22px;font-weight:800;color:var(--accent2);">${Math.round((factOS/totDist)*100)||0}%</div>
            <div style="font-size:11px;color:var(--accent2);">Obras Sociales</div>
          </div>
          <div style="flex:1;text-align:center;background:#ede8ff;border-radius:8px;padding:10px;">
            <div style="font-size:22px;font-weight:800;color:#7c3aed;">${Math.round((factPart/totDist)*100)||0}%</div>
            <div style="font-size:11px;color:#7c3aed;">Particulares</div>
          </div>
        </div>
        ${osEntries.slice(0,6).map(([os,monto],i)=>`
          <div style="margin-bottom:7px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
              <span>${os}</span><span class="finance-num">${fmt(monto)}</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(monto/maxOS*100)}%;background:${colors[i%colors.length]};"></div></div>
          </div>`).join('')}`;
    }
  }

  // Timeline
  const timeline = document.getElementById('timeline-recent');
  if (timeline) {
    const recents = [...DB.registros].sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,6);
    timeline.innerHTML = recents.map(r=>{
      const tot = totalConsultasReg(r);
      return `<li class="timeline-item">
        <div class="timeline-dot ${r.os==='Particular'?'orange':'green'}">${r.os==='Particular'?'💰':'🏥'}</div>
        <div class="timeline-content">
          <div class="timeline-title">${soloApellido(r.medico)} — ${r.os}${r.plan?' ('+r.plan+')':''} · ${tot} consulta${tot!==1?'s':''}</div>
          <div class="timeline-meta">${r.consultorio} · ${r.fecha}</div>
        </div>
      </li>`;
    }).join('') || '<li style="color:var(--text3);font-size:13px;padding:10px 0;">Sin actividad reciente</li>';
  }

  // Alarmas
  const da = document.getElementById('dashboard-alarms');
  if (da) {
    const icons = { urgente:'🔴', importante:'🟡', info:'🔵' };
    const activas = DB.alarmas.filter(a=>a.estado==='activa').slice(0,3);
    da.innerHTML = activas.length ? activas.map(al=>`
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:16px;">${icons[al.tipo]||'🔵'}</span>
        <div>
          <div style="font-size:13px;font-weight:600;">${al.titulo}</div>
          <div style="font-size:11px;color:var(--text3);">${al.fecha} · ${al.rel}</div>
        </div>
      </div>`).join('') : '<div style="color:var(--text3);font-size:13px;padding:10px 0;">Sin alertas activas</div>';
  }

}

function renderEstadisticas() {
  // Poblar selector de mes y leer el mes elegido
  poblarSelectoresMes();
  const mesSel = document.getElementById('est-mes')?.value || hoyISO().slice(0,7);
  // Rango del mes: del día 01 al último día
  const desde = mesSel + '-01';
  const [yy, mm] = mesSel.split('-').map(Number);
  const ultDia = new Date(yy, mm, 0).getDate();
  const hasta = `${mesSel}-${String(ultDia).padStart(2,'0')}`;
  const consultorio = document.getElementById('est-consultorio')?.value || '';
  const medico      = document.getElementById('est-medico')?.value || '';
  const tipo        = document.getElementById('est-tipo')?.value || '';

  // Poblar el select de médicos solo si está vacío (primera vez)
  const medSel = document.getElementById('est-medico');
  if (medSel && medSel.options.length <= 1) {
    medSel.innerHTML = optionsMedicos('', '<option value="">Todos los médicos</option>');
  }
  // Restaurar la selección en caso de que se haya repoblado
  if (medSel && medico) medSel.value = medico;

  let data = DB.registros.filter(r => {
    if (desde && r.fecha < desde) return false;
    if (hasta && r.fecha > hasta) return false;
    if (consultorio && r.consultorio !== consultorio) return false;
    if (medico && r.medico !== medico) return false;
    if (tipo === 'OS' && r.os === 'Particular') return false;
    if (tipo === 'Particular' && r.os !== 'Particular') return false;
    return true;
  });

  const kpis = document.getElementById('est-kpis');
  if (!kpis) return;

  const total = data.reduce((s,r) => s + totalConsultasReg(r), 0);
  const totalMonto = data.reduce((s,r) => s + facturadoReg(r), 0);
  const osCount = data.reduce((s,r) => s + r.cantidad, 0);
  const pctOS = total > 0 ? Math.round(osCount/total*100) : 0;

  kpis.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total consultas</div><div class="stat-value">${fmtInt(total)}</div><div class="stat-sub">Todos los registros</div></div>
    <div class="stat-card"><div class="stat-label">Facturación total</div><div class="stat-value finance-num" style="font-size:20px;">$${(totalMonto/1000000).toFixed(2)}M</div></div>
    <div class="stat-card"><div class="stat-label">OS vs Particular</div><div class="stat-value">${pctOS}%</div><div class="stat-sub">Obras sociales</div></div>
    <div class="stat-card"><div class="stat-label">Promedio por consulta</div><div class="stat-value finance-num" style="font-size:20px;">$${total>0?fmtN(totalMonto/total):'—'}</div></div>`;

  // Bar chart mensual — agrupar por mes
  const porMes = {};
  data.forEach(r => {
    const m = r.fecha.slice(0,7);
    porMes[m] = (porMes[m]||0) + totalConsultasReg(r);
  });
  const mesesKeys = Object.keys(porMes).sort().slice(-6);
  const mesesLabels = mesesKeys.map(k => { const [y,m]=k.split('-'); return MESES[parseInt(m)].slice(0,3); });
  const valores = mesesKeys.map(k => porMes[k]);
  const maxVal = Math.max(...valores, 1);
  const chartDiv = document.getElementById('chart-mensual');
  const labelsDiv = document.getElementById('chart-labels');
  if (chartDiv) chartDiv.innerHTML = valores.map((v, i) => `
    <div class="bar-wrap">
      <span style="font-size:11px; color:var(--text3); margin-bottom:4px;">${v}</span>
      <div class="bar" style="background:${i===valores.length-1?'var(--accent)':'var(--accent2)'}; height:${Math.round(v/maxVal*110)}px; width:100%;"></div>
    </div>`).join('');
  if (labelsDiv) labelsDiv.innerHTML = mesesLabels.map(m => `<span style="flex:1; text-align:center; font-size:11px; color:var(--text3);">${m}</span>`).join('');

  // Ranking médicos
  const medCount = {};
  data.forEach(r => { medCount[r.medico] = (medCount[r.medico]||0) + totalConsultasReg(r); });
  const sorted = Object.entries(medCount).sort((a,b) => b[1]-a[1]);
  const maxC = sorted[0]?.[1] || 1;
  const rankEl = document.getElementById('ranking-medicos');
  if (rankEl) rankEl.innerHTML = sorted.map(([nombre, count], i) => {
    const med = DB.medicos.find(m => m.nombre === nombre);
    return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      <span style="font-size:12px; font-weight:700; color:var(--text3); width:18px;">${i+1}</span>
      <div style="flex:1;">
        <div style="font-size:13px; font-weight:500; margin-bottom:3px;">${nombre}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(count/maxC*100)}%; background:${med?.color||'var(--accent)'};"></div></div>
      </div>
      <span style="font-size:13px; font-weight:600; min-width:30px; text-align:right;">${count}</span>
    </div>`;
  }).join('');

  // OS chart
  const osMap = {};
  data.filter(r => r.os !== 'Particular').forEach(r => { osMap[r.os] = (osMap[r.os]||0) + r.cantidad; });
  const osSorted = Object.entries(osMap).sort((a,b)=>b[1]-a[1]);
  const osMax = osSorted[0]?.[1]||1;
  const osColors = ['var(--accent2)','var(--accent)','#7c3aed','#f59e0b','#be185d'];
  const osChartEl = document.getElementById('est-os-chart');
  if (osChartEl) osChartEl.innerHTML = osSorted.map(([os, count], i) => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      <span style="width:110px; font-size:12px; font-weight:500;">${os}</span>
      <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${Math.round(count/osMax*100)}%; background:${osColors[i%osColors.length]};"></div></div>
      <span style="font-size:12px; font-weight:600; min-width:30px; text-align:right;">${count}</span>
    </div>`).join('');

  // Consultorio chart — TODOS los consultorios activos (Configuración → Consultorios),
  // no solo Palpa/Haedo/Extra (si se agrega uno nuevo, debe aparecer acá).
  const consultoriosEst = getConsultoriosList();
  const cCount = {};
  consultoriosEst.forEach(c => { cCount[c] = 0; });
  data.forEach(r => { if (cCount[r.consultorio]!==undefined) cCount[r.consultorio] += totalConsultasReg(r); });
  const cTotal = consultoriosEst.reduce((s,c)=>s+cCount[c], 0) || 1;
  const cColor = c => c === 'Palpa' ? 'var(--palpa)' : c === 'Haedo' ? 'var(--haedo)' : 'var(--accent2)';
  const cColorLight = c => c === 'Palpa' ? 'var(--palpa-light)' : c === 'Haedo' ? 'var(--haedo-light)' : 'var(--accent2-light)';
  const cEl = document.getElementById('est-consultorio-chart');
  if (cEl) cEl.innerHTML = `
    <div style="display:flex; gap:20px; margin-bottom:16px; text-align:center;">
      ${consultoriosEst.filter(c => cCount[c] > 0 || ['Palpa','Haedo'].includes(c)).map(c => `
      <div style="flex:1; background:${cColorLight(c)}; border-radius:8px; padding:16px;">
        <div style="font-size:24px; font-weight:700; color:${cColor(c)};">${cCount[c]}</div>
        <div style="font-size:12px; color:var(--text2);">${c}</div>
        <div style="font-size:11px; color:var(--text3);">${Math.round(cCount[c]/cTotal*100)}%</div>
      </div>`).join('')}
    </div>`;

  // ── Balance mensual: facturación − (honorarios médicos + gastos de caja) ──
  // Usa el mismo rango/filtros que el resto de estadísticas (data + caja del período).
  const balPorMes = {};  // mes → { fact, honor, gastos }
  const ensureMes = (m) => { if (!balPorMes[m]) balPorMes[m] = { fact:0, honor:0, gastos:0 }; return balPorMes[m]; };

  data.forEach(r => {
    if (!r.fecha) return;
    const m = r.fecha.slice(0,7);
    const b = ensureMes(m);
    // Misma fórmula que el dashboard: OS (totalReg) + particulares (efectivo + transferencia)
    b.fact  += facturadoReg(r);
    b.honor += honorMedicoReg(r);
  });
  // Egresos de caja del período (excluye los de origen 'Honorario' para no duplicar
  // con los honorarios médicos, que ya se cuentan arriba). Respeta filtro de consultorio.
  (DB.cajaChica || []).forEach(c => {
    if (c.tipo !== 'Egreso' || !c.fecha) return;
    if (desde && c.fecha < desde) return;
    if (hasta && c.fecha > hasta) return;
    if (consultorio && c.consultorio !== consultorio) return;
    if (c.origen === 'Honorario') return;  // ya contado en honorarios
    const b = ensureMes(c.fecha.slice(0,7));
    b.gastos += c.monto;
  });

  const balKeys = Object.keys(balPorMes).sort().reverse();
  const balEl = document.getElementById('est-balance-chart');
  if (balEl) {
    if (balKeys.length === 0) {
      balEl.innerHTML = '<div style="color:var(--text3); font-size:13px;">Sin datos en el período seleccionado.</div>';
    } else {
      const filas = balKeys.map(m => {
        const b = balPorMes[m];
        const pagos = b.honor + b.gastos;
        const balance = b.fact - pagos;
        const [yy, mm] = m.split('-').map(Number);
        const color = balance >= 0 ? 'var(--success)' : 'var(--danger)';
        return `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 10px; font-weight:600;">${MESES[mm]} ${yy}</td>
          <td style="padding:8px 10px; text-align:right; font-family:monospace;">${fmt(b.fact)}</td>
          <td style="padding:8px 10px; text-align:right; font-family:monospace; color:var(--text3);">${fmt(b.honor)}</td>
          <td style="padding:8px 10px; text-align:right; font-family:monospace; color:var(--text3);">${fmt(b.gastos)}</td>
          <td style="padding:8px 10px; text-align:right; font-family:monospace; font-weight:800; color:${color};">${fmt(balance)}</td>
        </tr>`;
      }).join('');
      balEl.innerHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border); color:var(--text3); font-size:11px; text-transform:uppercase;">
              <th style="padding:8px 10px; text-align:left;">Mes</th>
              <th style="padding:8px 10px; text-align:right;">Facturación</th>
              <th style="padding:8px 10px; text-align:right;">Honorarios</th>
              <th style="padding:8px 10px; text-align:right;">Gastos caja</th>
              <th style="padding:8px 10px; text-align:right;">Balance</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
        </div>
        <div style="font-size:11px; color:var(--text3); margin-top:8px;">Balance = Facturación − (Honorarios médicos + Gastos de caja). No incluye los honorarios pagados en efectivo dos veces.</div>`;
    }
  }
}
