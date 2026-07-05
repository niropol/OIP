// ═══════════════════════════════════════════════════════════════════════════
//  UI — FINANZAS: Obras Sociales (cobranzas/facturas), Caja (banco) y Caja chica
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Incluye OBRAS SOCIALES + FINANZAS + CAJA CHICA. Se carga antes de
//  persistencia.js. Usa helpers globales (DB, fmt, marcarCambios, totalesOS,
//  facturadoReg, poblarSelectoresOS, getExentaForOS, closeModal/openModal, …).
// ═══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════
//  OBRAS SOCIALES
// ══════════════════════════════════════

// (switchOSTab se eliminó: los tabs Resumen/Cobranzas/Historial ahora viven en la
//  sección OS/Pagos y los maneja switchOSPagosTab, en index.html.)

function renderOS() {
  poblarSelectoresOS();
  renderOSCards();
  renderOSStats();
  renderOSTbody();
  renderCobranzas();
}

// ── Cards de OS con atenciones del mes seleccionado ──────────────────────────
function renderOSCards() {
  const mes = document.getElementById('os-fact-mes')?.value || new Date().toISOString().slice(0,7);
  const mesLabel = getMesLabel(mes);
  const grid = document.getElementById('os-cards-grid');
  if (!grid) return;

  // Agrupar atenciones del mes por OS. Los totales (neto/IVA por exención) salen de
  // totalesOS() — fuente única (js/calculos.js) — en vez de recalcularse acá aparte.
  const regsPorOS = {};
  DB.registros.filter(r => r.fecha.startsWith(mes) && r.os !== 'Particular').forEach(r => {
    (regsPorOS[r.os] = regsPorOS[r.os] || []).push(r);
  });
  const osMap = {};
  Object.entries(regsPorOS).forEach(([os, regs]) => {
    const t = totalesOS(regs, os);
    osMap[os] = {
      cant: regs.reduce((s,r)=>s+r.cantidad, 0),
      netoExento: t.netoExento, netoGravado: t.netoGravado, ivaGravado: t.iva, total: t.total,
    };
  });

  if (Object.keys(osMap).length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:var(--text3);font-size:13px;background:var(--surface2);border-radius:var(--r);border:1px solid var(--border);">
      📋 Sin atenciones OS cargadas para ${mesLabel}. Cargalas desde <strong>Atenciones → Cargar día</strong>.
    </div>`;
    return;
  }

  grid.innerHTML = Object.entries(osMap).map(([os, g]) => {
    const total   = g.total;
    const pctIVA  = os === 'CEMEPLA' ? 21 : 10.5;
    const fact    = DB.facturas.find(f => f.dest===os && f.mes===mesLabel && ['Pendiente','Pagada','Preliquidada'].includes(f.estado));
    const facturada = !!fact;
    const borderColor = facturada
      ? (fact.estado==='Pagada' ? 'var(--success)' : 'var(--accent2)')
      : 'var(--border2)';
    const estadoBadge = facturada
      ? `<span class="pill" style="background:${fact.estado==='Pagada'?'var(--success-light)':'var(--accent2-light)'};color:${fact.estado==='Pagada'?'var(--success)':'var(--accent2)'};font-size:10px;">${fact.num} · ${fact.estado}</span>`
      : `<span class="pill" style="background:var(--warn-light);color:var(--warn);font-size:10px;">Sin facturar</span>`;

    return `<div onclick="renderOSDetalle('${os.replace(/'/g,"\\'")}','${mes}')"
      style="background:var(--surface);border:2px solid ${borderColor};border-radius:var(--r);padding:14px;cursor:pointer;transition:box-shadow .15s;"
      onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="font-size:14px;font-weight:800;">${os}</div>
        ${estadoBadge}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">${g.cant} consulta${g.cant!==1?'s':''} · ${mesLabel}</div>
      ${g.netoExento>0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;"><span style="color:var(--success);">✓ Exento</span><span style="font-family:monospace;font-weight:600;">${fmt(g.netoExento)}</span></div>` : ''}
      ${g.netoGravado>0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span style="color:var(--warn);">⚡ Gravado</span><span style="font-family:monospace;">${fmt(g.netoGravado)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:4px;"><span>+ IVA ${pctIVA}%</span><span style="font-family:monospace;">${fmt(g.ivaGravado)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-top:6px;">
        <span style="font-size:12px;font-weight:700;">Total</span>
        <span style="font-size:16px;font-weight:800;font-family:monospace;color:var(--accent2);">${fmt(total)}</span>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:11px;color:var(--accent2);">👆 Ver detalle</div>
    </div>`;
  }).join('');
}

// ── Detalle de una OS: listado de prestaciones + botón hacer factura ──────────
function renderOSDetalle(os, mes) {
  const panel = document.getElementById('os-detalle-panel');
  if (!panel) return;

  // Toggle: si ya está abierto para esta OS, cerrarlo
  if (panel.dataset.os === os && panel.style.display !== 'none') {
    panel.style.display = 'none';
    panel.dataset.os = '';
    return;
  }
  panel.dataset.os = os;
  panel.style.display = '';

  const mesLabel = getMesLabel(mes);
  const regs = DB.registros.filter(r => r.fecha.startsWith(mes) && r.os === os);
  const esCemepla = os === 'CEMEPLA';
  const manejaCopago = esCopagoAdelanto(os);  // Bristol, CoberMed, Medical's
  // Totales (neto/IVA/copago) salen de totalesOS() — fuente única (js/calculos.js) — en
  // vez de recalcularse en el loop de abajo. El loop sigue calculando el desglose POR
  // FILA (necesario para la tabla), pero ya no re-suma el agregado en paralelo.
  const totOS = totalesOS(regs, os);

  // SinCargo: informe simple (no factura). Una fila por atención con fecha, paciente y médico.
  if (os === 'SinCargo') {
    const regsSC = [...regs].sort((a,b) => a.fecha.localeCompare(b.fecha));
    const filasSC = regsSC.map(r => {
      const [y,m,d] = r.fecha.split('-');
      const pac = r.paciente || [r.apellido, r.nombre].filter(Boolean).join(', ') || '—';
      return `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:7px 10px;font-family:monospace;font-size:12px;">${d}/${m}/${y}</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;">${pac}</td>
        <td style="padding:7px 10px;font-size:13px;">${r.medico || '—'}</td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--r); padding:18px; margin-top:14px;">
        <div style="font-size:15px; font-weight:700; margin-bottom:4px;">SinCargo — ${mes}</div>
        <div style="font-size:12px; color:var(--text3); margin-bottom:14px;">
          ${regsSC.length} atención${regsSC.length!==1?'es':''} sin cargo · consulta oftalmológica (420101) · el paciente abona $0,1 que se paga al médico el mismo día
        </div>
        ${regsSC.length === 0
          ? `<div style="text-align:center; padding:24px; color:var(--text3);">No hay atenciones SinCargo en ${mes}</div>`
          : `<table style="width:100%; border-collapse:collapse;">
              <thead><tr style="border-bottom:2px solid var(--border2); text-align:left;">
                <th style="padding:8px 10px; width:110px;">Fecha</th>
                <th style="padding:8px 10px;">Paciente</th>
                <th style="padding:8px 10px;">Médico que atendió</th>
              </tr></thead>
              <tbody>${filasSC}</tbody>
            </table>`}
      </div>`;
    return;
  }


  // Helper: obtener el código de nomenclador de una prestación, buscándolo en el catálogo
  // por OS + descripción (los registros guardan la descripción, no el código).
  const codigoDe = (osNom, desc) => {
    const p = (DB.prestaciones || []).find(x => x.os === osNom && x.desc === desc);
    return p ? (p.codigo || '—') : '—';
  };

  // Agrupar por fecha + prestación (CEMEPLA: NO agrupar, una fila por paciente con sus datos)
  let filas;
  if (esCemepla) {
    filas = regs.map(r => ({
      fecha: r.fecha, prestacion: r.prestacion || 'Consulta', plan: r.plan || '',
      exenta: exentaReg(r, os),
      os, valorUnit: r.valorUnit, cant: r.cantidad, copagoAdel: copagoAdelantoReg(r),
      codigo: codigoDe(os, r.prestacion || 'Consulta'),
      paciente: r.paciente || r.apellido || '—', dni: r.dni || '—', empresa: r.empresa || '—',
      autorizacion: r.autorizacion || ''
    })).sort((a,b) => a.fecha.localeCompare(b.fecha));
  } else {
    // Agrupar POR CÓDIGO (junta todas las del mismo código, sin importar la fecha).
    // Se separa por exenta/gravada y por valor unitario (por si cambió de precio).
    const grupos = {};
    regs.forEach(r => {
      const exenta = exentaReg(r, os);
      const desc = r.prestacion || 'Consulta';
      const codigo = codigoDe(os, desc);
      const key = `${codigo}||${desc}||${r.plan||''}||${exenta}||${r.valorUnit}`;
      if (!grupos[key]) grupos[key] = { codigo, prestacion:desc, plan:r.plan||'', exenta, os, valorUnit:r.valorUnit, cant:0, copagoAdel:0 };
      grupos[key].cant += r.cantidad;
      grupos[key].copagoAdel += copagoAdelantoReg(r);
    });
    // Ordenar: exentas primero, luego gravadas; dentro, por código
    filas = Object.values(grupos).sort((a,b) =>
      (a.exenta === b.exenta ? 0 : (a.exenta ? -1 : 1)) ||
      String(a.codigo).localeCompare(String(b.codigo))
    );
  }
  const pctLabel = os === 'CEMEPLA' ? '21%' : '10.5%';

  const filasHTML = filas.map(f => {
    const fechaCell = esCemepla && f.fecha ? (() => { const [y,m,d]=f.fecha.split('-'); return `${d}/${m}`; })() : (f.codigo || '—');
    const neto = f.cant * (f.valorUnit || 0);
    // exenta/iva salen de exentaReg()/ivaReg() (fuente única) sobre una "fila" sintética
    // con la cantidad ya agrupada — antes se reimplementaba la fórmula acá a mano.
    const exenta = f.exenta;
    const iva  = ivaReg({ os, cantidad: f.cant, valorUnit: f.valorUnit, exenta: f.exenta });
    const tot  = neto + iva;
    const copFila = f.copagoAdel || 0;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:7px 10px;font-family:monospace;font-size:12px;">${fechaCell}</td>
      ${esCemepla?`<td style="padding:7px 10px;font-size:12px;font-weight:600;">${f.paciente}</td><td style="padding:7px 10px;font-size:12px;">${f.dni}</td><td style="padding:7px 10px;font-size:12px;">${f.empresa}</td><td style="padding:7px 10px;font-size:12px;">${f.autorizacion||'—'}</td>`:''}
      <td style="padding:7px 10px;font-size:12px;">${f.prestacion}${f.plan?' ('+f.plan+')':''}</td>
      <td style="padding:7px 10px;text-align:center;font-weight:700;">${f.cant}</td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;">${fmt(f.valorUnit)}</td>
      <td style="padding:7px 10px;text-align:center;">
        <span class="pill" style="${f.exenta?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}font-size:10px;">
          ${f.exenta?'✓ Exento':'⚡ '+pctLabel}
        </span>
      </td>
      <td style="padding:7px 10px;text-align:right;font-family:monospace;color:var(--warn);">${iva>0?fmt(iva):'—'}</td>
      ${manejaCopago?`<td style="padding:7px 10px;text-align:right;font-family:monospace;color:var(--accent);">${copFila>0?'− '+fmt(copFila):'—'}</td>`:''}
      <td style="padding:7px 10px;text-align:right;font-family:monospace;font-weight:700;">${fmt(tot - copFila)}</td>
    </tr>`;
  }).join('');

  const { netoExento, netoGravado, iva: ivaGravado, copagoAdelanto: totalCopagoAdel, total } = totOS;
  const factExist = DB.facturas.find(f => f.dest===os && f.mes===mesLabel && ['Pendiente','Pagada'].includes(f.estado));

  // Resumen de prestaciones agrupadas por tipo de IVA (exentas por un lado, gravadas por otro)
  const resumenExentas = {}, resumenGravadas = {};
  filas.forEach(f => {
    const dst = f.exenta ? resumenExentas : resumenGravadas;
    const nombre = f.prestacion || 'Consulta';
    dst[nombre] = (dst[nombre] || 0) + f.cant;
  });
  const fmtResumen = (obj) => Object.keys(obj).sort((a,b)=>obj[b]-obj[a])
    .map(k => `${obj[k]} ${k}`).join(', ');
  const textoExentas  = fmtResumen(resumenExentas);
  const textoGravadas = fmtResumen(resumenGravadas);

  // Algunas OS piden, además del resumen por código, el detalle paciente + N° de
  // autorización (sobre todo para cirugías). CEMEPLA ya lo muestra en la tabla principal
  // (no agrupa); para el resto se agrega esta sección aparte con las atenciones que
  // tengan paciente y/o autorización cargados (el resto no aparece acá, sin ensuciar).
  const regsConDato = !esCemepla ? regs.filter(r => r.paciente || r.autorizacion).sort((a,b) => a.fecha.localeCompare(b.fecha)) : [];
  const detalleAutorizacionHTML = regsConDato.length ? `
      <div class="card-body" style="border-top:2px solid var(--border2);">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">🔖 Pacientes / N° de autorización</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="background:var(--surface2);">
            <th style="padding:6px 10px;text-align:left;width:80px;">Fecha</th>
            <th style="padding:6px 10px;text-align:left;">Paciente</th>
            <th style="padding:6px 10px;text-align:left;">Prestación</th>
            <th style="padding:6px 10px;text-align:left;width:120px;">N° Autorización</th>
          </tr></thead>
          <tbody>${regsConDato.map(r => {
            const [y,m,d] = r.fecha.split('-');
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:6px 10px;font-family:monospace;">${d}/${m}</td>
              <td style="padding:6px 10px;font-weight:600;">${r.paciente || '—'}</td>
              <td style="padding:6px 10px;">${r.prestacion || 'Consulta'}</td>
              <td style="padding:6px 10px;">${r.autorizacion || '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : '';

  panel.innerHTML = `
    <div class="card" style="border-top:3px solid var(--accent2);">
      <div class="card-header">
        <div>
          <div style="font-size:15px;font-weight:700;">${os} — ${mesLabel}</div>
          <div style="font-size:12px;color:var(--text3);">Detalle de prestaciones a facturar</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="copiarDetalleOSMail('${os.replace(/'/g,"\\'")}','${mes}')">📧 Copiar para mail</button>
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('os-detalle-panel').style.display='none'">✕ Cerrar</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:var(--surface2);">
              <th style="padding:8px 10px;text-align:left;width:80px;">${esCemepla?'Fecha':'Código'}</th>
              ${esCemepla?'<th style="padding:8px 10px;text-align:left;">Paciente</th><th style="padding:8px 10px;text-align:left;width:90px;">DNI</th><th style="padding:8px 10px;text-align:left;">Empresa</th><th style="padding:8px 10px;text-align:left;width:100px;">N° Autorización</th>':''}
              <th style="padding:8px 10px;text-align:left;">Prestación</th>
              <th style="padding:8px 10px;text-align:center;width:55px;">Cant.</th>
              <th style="padding:8px 10px;text-align:right;width:100px;">Valor unit.</th>
              <th style="padding:8px 10px;text-align:center;width:80px;">IVA</th>
              <th style="padding:8px 10px;text-align:right;width:90px;">IVA $</th>
              ${manejaCopago?'<th style="padding:8px 10px;text-align:right;width:100px;">Copago a cuenta</th>':''}
              <th style="padding:8px 10px;text-align:right;width:100px;">Total</th>
            </tr>
          </thead>
          <tbody>${filasHTML}</tbody>
        </table>
      </div>
      <div class="card-body" style="background:var(--surface2);border-top:2px solid var(--border2);">
        ${(textoExentas || textoGravadas) ? `
        <div style="margin-bottom:14px;">
          ${textoExentas ? `<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:6px;font-size:14px;">
            <span class="pill" style="background:var(--success-light);color:var(--success);font-size:11px;font-weight:700;">EXENTAS</span>
            <span style="font-weight:600;">${textoExentas}</span>
          </div>` : ''}
          ${textoGravadas ? `<div style="display:flex;gap:8px;align-items:baseline;font-size:14px;">
            <span class="pill" style="background:var(--warn-light);color:var(--warn);font-size:11px;font-weight:700;">GRAVADAS ${pctLabel}</span>
            <span style="font-weight:600;">${textoGravadas}</span>
          </div>` : ''}
        </div>` : ''}
        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;">
          <div style="min-width:280px;">
            ${netoExento>0 ? `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">Neto exento:</span>
              <span style="font-weight:700;font-family:monospace;">${fmt(netoExento)}</span>
            </div>` : ''}
            ${netoGravado>0 ? `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">Neto gravado:</span>
              <span style="font-family:monospace;font-weight:700;">${fmt(netoGravado)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">IVA ${pctLabel}:</span>
              <span style="font-family:monospace;color:var(--warn);font-weight:700;">${fmt(ivaGravado)}</span>
            </div>` : ''}
            ${manejaCopago && totalCopagoAdel>0 ? `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--text2);">Subtotal prestaciones:</span>
              <span style="font-family:monospace;font-weight:700;">${fmt(total)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:7px;font-size:15px;">
              <span style="color:var(--accent);">− Copago a cuenta:</span>
              <span style="font-family:monospace;color:var(--accent);font-weight:700;">${fmt(totalCopagoAdel)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;gap:20px;font-size:22px;font-weight:800;border-top:2px solid var(--border2);padding-top:10px;margin-top:6px;">
              <span>${manejaCopago && totalCopagoAdel>0 ? 'A facturar a la OS:' : 'TOTAL:'}</span>
              <span style="font-family:monospace;color:var(--accent2);">${fmt(total - totalCopagoAdel)}</span>
            </div>
          </div>
          <div>
            ${factExist
              ? `<div style="background:var(--success-light);border:1px solid var(--success);border-radius:var(--r-sm);padding:10px 16px;font-size:13px;color:var(--success);font-weight:600;">
                  ✓ Factura ${factExist.num} — ${factExist.estado}
                </div>`
              : `<button class="btn btn-primary" style="font-size:14px;padding:10px 24px;" onclick="abrirConfirmarFactura('${os.replace(/'/g,"\\'")}','${mes}','${mesLabel}',${total - totalCopagoAdel},${netoExento},${netoGravado},${ivaGravado},${filas.reduce((s,f)=>s+f.cant,0)},${totalCopagoAdel})">
                  🧾 Hacer factura
                </button>`
            }
          </div>
        </div>
      </div>${detalleAutorizacionHTML}
    </div>`;

  // Scroll to top of detail panel, accounting for fixed topbar
  setTimeout(() => {
    const panelEl = document.getElementById('os-detalle-panel');
    if (panelEl) {
      const topbar = document.querySelector('.topbar');
      const topbarH = topbar ? topbar.offsetHeight : 56;
      const y = panelEl.getBoundingClientRect().top + window.scrollY - topbarH - 12;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }, 80);
}

// Copia todo el cuadro de la preliquidación de una OS, con formato, para pegar en un mail.
function copiarDetalleOSMail(os, mes) {
  const mesLabel = getMesLabel(mes);
  const regs = DB.registros.filter(r => r.fecha.startsWith(mes) && r.os === os);
  if (!regs.length) { showToast('⚠️ Sin prestaciones para esta OS en el período'); return; }
  const esCemepla = os === 'CEMEPLA';
  const manejaCopago = esCopagoAdelanto(os);
  const pctLabel = esCemepla ? '21%' : '10.5%';
  // Totales de totalesOS() — fuente única — en vez de re-sumarlos en el loop de abajo.
  const totOS = totalesOS(regs, os);

  const codigoDe = (osNom, desc) => {
    const p = (DB.prestaciones || []).find(x => x.os === osNom && x.desc === desc);
    return p ? (p.codigo || '—') : '—';
  };

  // Reconstruir filas igual que en el detalle
  let filas;
  if (esCemepla) {
    filas = regs.map(r => ({
      fecha:r.fecha, prestacion:r.prestacion||'Consulta', plan:r.plan||'',
      exenta: exentaReg(r, os),
      valorUnit:r.valorUnit, cant:r.cantidad, copagoAdel:copagoAdelantoReg(r),
      codigo: codigoDe(os, r.prestacion||'Consulta'),
      paciente:r.paciente||r.apellido||'—', dni:r.dni||'—', empresa:r.empresa||'—',
      autorizacion: r.autorizacion || ''
    })).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  } else {
    const grupos = {};
    regs.forEach(r => {
      const exenta = exentaReg(r, os);
      const desc = r.prestacion||'Consulta';
      const codigo = codigoDe(os, desc);
      const key = `${codigo}||${desc}||${r.plan||''}||${exenta}||${r.valorUnit}`;
      if (!grupos[key]) grupos[key] = { codigo, prestacion:desc, plan:r.plan||'', exenta, valorUnit:r.valorUnit, cant:0, copagoAdel:0 };
      grupos[key].cant += r.cantidad;
      grupos[key].copagoAdel += copagoAdelantoReg(r);
    });
    filas = Object.values(grupos).sort((a,b) =>
      (a.exenta === b.exenta ? 0 : (a.exenta ? -1 : 1)) ||
      String(a.codigo).localeCompare(String(b.codigo))
    );
  }

  const { netoExento, netoGravado, iva: ivaGravado, copagoAdelanto: totalCopagoAdel, total } = totOS;
  const resEx={}, resGr={};
  const tdS='padding:6px 10px;border:1px solid #d0d7de;font-size:13px;';
  const thS='padding:7px 10px;border:1px solid #2563eb;background:#2563eb;color:#fff;font-size:13px;font-weight:700;';
  const filasHTML = filas.map(f=>{
    const primCol = esCemepla && f.fecha ? (()=>{ const [y,m,d]=f.fecha.split('-'); return `${d}/${m}`; })() : (f.codigo||'—');
    const neto=f.cant*(f.valorUnit||0);
    const iva=ivaReg({ os, cantidad: f.cant, valorUnit: f.valorUnit, exenta: f.exenta });
    const tot=neto+iva;
    const cop=f.copagoAdel||0;
    const dst=f.exenta?resEx:resGr; const nom=f.prestacion||'Consulta'; dst[nom]=(dst[nom]||0)+f.cant;
    return `<tr>
      <td style="${tdS}">${primCol}</td>
      ${esCemepla?`<td style="${tdS}">${f.paciente}</td><td style="${tdS}">${f.dni}</td><td style="${tdS}">${f.empresa}</td><td style="${tdS}">${f.autorizacion||'—'}</td>`:''}
      <td style="${tdS}">${f.prestacion}${f.plan?' ('+f.plan+')':''}</td>
      <td style="${tdS}text-align:center;">${f.cant}</td>
      <td style="${tdS}text-align:right;">${fmt(f.valorUnit)}</td>
      <td style="${tdS}text-align:center;">${f.exenta?'Exento':pctLabel}</td>
      <td style="${tdS}text-align:right;">${iva>0?fmt(iva):'—'}</td>
      ${manejaCopago?`<td style="${tdS}text-align:right;">${cop>0?'− '+fmt(cop):'—'}</td>`:''}
      <td style="${tdS}text-align:right;font-weight:700;">${fmt(tot-cop)}</td>
    </tr>`;
  }).join('');
  const fmtRes = (o)=>Object.keys(o).sort((a,b)=>o[b]-o[a]).map(k=>`${o[k]} ${k}`).join(', ');
  const txtEx=fmtRes(resEx), txtGr=fmtRes(resGr);

  // Detalle paciente + N° de autorización aparte (sobre todo cirugías) — igual criterio
  // que renderOSDetalle: solo para OS que agrupan por código (CEMEPLA ya va sin agrupar).
  const regsConDato = !esCemepla ? regs.filter(r => r.paciente || r.autorizacion).sort((a,b) => a.fecha.localeCompare(b.fecha)) : [];

  const html = `<div style="font-family:Arial,sans-serif;max-width:760px;color:#1f2937;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">OIP OFTALMOLOGÍA INTEGRAL</div>
    <div style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:2px;">${os} — ${mesLabel}</div>
    <div style="font-size:13px;color:#4b5563;margin-bottom:12px;">Detalle de prestaciones a facturar</div>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="${thS}text-align:left;">${esCemepla?'Fecha':'Código'}</th>
        ${esCemepla?`<th style="${thS}text-align:left;">Paciente</th><th style="${thS}text-align:left;">DNI</th><th style="${thS}text-align:left;">Empresa</th><th style="${thS}text-align:left;">N° Autorización</th>`:''}
        <th style="${thS}text-align:left;">Prestación</th>
        <th style="${thS}text-align:center;">Cant.</th>
        <th style="${thS}text-align:right;">Valor unit.</th>
        <th style="${thS}text-align:center;">IVA</th>
        <th style="${thS}text-align:right;">IVA $</th>
        ${manejaCopago?`<th style="${thS}text-align:right;">Copago a cuenta</th>`:''}
        <th style="${thS}text-align:right;">Total</th>
      </tr></thead>
      <tbody>${filasHTML}</tbody>
    </table>
    <div style="margin-top:14px;font-size:14px;">
      ${txtEx?`<div style="margin-bottom:4px;"><b style="color:#15803d;">EXENTAS:</b> ${txtEx}</div>`:''}
      ${txtGr?`<div style="margin-bottom:4px;"><b style="color:#b45309;">GRAVADAS ${pctLabel}:</b> ${txtGr}</div>`:''}
    </div>
    <table style="border-collapse:collapse;margin-top:12px;font-size:15px;">
      ${netoExento>0?`<tr><td style="padding:4px 16px 4px 0;">Neto exento:</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmt(netoExento)}</td></tr>`:''}
      ${netoGravado>0?`<tr><td style="padding:4px 16px 4px 0;">Neto gravado:</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmt(netoGravado)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;">IVA ${pctLabel}:</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#b45309;">${fmt(ivaGravado)}</td></tr>`:''}
      ${manejaCopago&&totalCopagoAdel>0?`<tr><td style="padding:4px 16px 4px 0;">Subtotal prestaciones:</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmt(total)}</td></tr>
      <tr><td style="padding:4px 16px 4px 0;color:#7c3aed;">− Copago a cuenta:</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#7c3aed;">${fmt(totalCopagoAdel)}</td></tr>`:''}
      <tr><td style="padding:8px 16px 4px 0;font-size:19px;font-weight:800;border-top:2px solid #1e3a5f;">${manejaCopago&&totalCopagoAdel>0?'A facturar a la OS:':'TOTAL:'}</td><td style="padding:8px 0 4px 0;text-align:right;font-size:19px;font-weight:800;color:#1d4ed8;border-top:2px solid #1e3a5f;">${fmt(total-totalCopagoAdel)}</td></tr>
    </table>
    ${regsConDato.length ? `
    <div style="font-size:14px;font-weight:700;margin-top:18px;margin-bottom:6px;">Pacientes / N° de autorización</div>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="${thS}text-align:left;">Fecha</th>
        <th style="${thS}text-align:left;">Paciente</th>
        <th style="${thS}text-align:left;">Prestación</th>
        <th style="${thS}text-align:left;">N° Autorización</th>
      </tr></thead>
      <tbody>${regsConDato.map(r => {
        const [y,m,d] = r.fecha.split('-');
        return `<tr>
          <td style="${tdS}">${d}/${m}</td>
          <td style="${tdS}">${r.paciente || '—'}</td>
          <td style="${tdS}">${r.prestacion || 'Consulta'}</td>
          <td style="${tdS}">${r.autorizacion || '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : ''}
  </div>`;

  // Texto plano de respaldo
  const lineas = [
    `OIP OFTALMOLOGÍA INTEGRAL`,
    `${os} — ${mesLabel} — Detalle de prestaciones a facturar`,
    '',
    ...filas.map(f=>{
      const primCol = esCemepla && f.fecha ? (()=>{ const [y,m,d]=f.fecha.split('-'); return `${d}/${m}`; })() : (f.codigo||'—');
      const neto=f.cant*(f.valorUnit||0);
      const iva=ivaReg({ os, cantidad: f.cant, valorUnit: f.valorUnit, exenta: f.exenta });
      const tot=neto+iva-(f.copagoAdel||0);
      return `${primCol}  ${esCemepla?(f.paciente+' '+f.dni+' '+f.empresa+(f.autorizacion?' Autoriz.'+f.autorizacion:'')+'  '):''}${f.prestacion}${f.plan?' ('+f.plan+')':''}  x${f.cant}  ${fmt(f.valorUnit)}  ${f.exenta?'Exento':pctLabel}  IVA ${iva>0?fmt(iva):'-'}  Total ${fmt(tot)}`;
    }),
    '',
    txtEx?`EXENTAS: ${txtEx}`:'',
    txtGr?`GRAVADAS ${pctLabel}: ${txtGr}`:'',
    '',
    netoExento>0?`Neto exento: ${fmt(netoExento)}`:'',
    netoGravado>0?`Neto gravado: ${fmt(netoGravado)}`:'',
    netoGravado>0?`IVA ${pctLabel}: ${fmt(ivaGravado)}`:'',
    manejaCopago&&totalCopagoAdel>0?`Subtotal: ${fmt(total)}`:'',
    manejaCopago&&totalCopagoAdel>0?`− Copago a cuenta: ${fmt(totalCopagoAdel)}`:'',
    `${manejaCopago&&totalCopagoAdel>0?'A FACTURAR A LA OS':'TOTAL'}: ${fmt(total-totalCopagoAdel)}`,
    ...(regsConDato.length ? [
      '',
      'PACIENTES / N° DE AUTORIZACIÓN:',
      ...regsConDato.map(r => {
        const [y,m,d] = r.fecha.split('-');
        return `${d}/${m}  ${r.paciente || '—'}  ${r.prestacion || 'Consulta'}  Autoriz. ${r.autorizacion || '—'}`;
      }),
    ] : []),
  ].filter(l=>l!=='').join('\n');

  try {
    const blob = new Blob([html], { type:'text/html' });
    const blobP = new Blob([lineas], { type:'text/plain' });
    const item = new ClipboardItem({ 'text/html':blob, 'text/plain':blobP });
    navigator.clipboard.write([item])
      .then(()=>showToast('📧 Cuadro copiado con formato — pegalo en el mail'))
      .catch(()=>navigator.clipboard.writeText(lineas).then(()=>showToast('📧 Cuadro copiado (texto plano)')));
  } catch(e) {
    navigator.clipboard.writeText(lineas).then(()=>showToast('📧 Cuadro copiado (texto plano)'));
  }
}

// ── Abrir modal de confirmación de factura ────────────────────────────────────
function abrirConfirmarFactura(os, mes, mesLabel, total, netoExento, netoGravado, ivaGravado, cant, copagoAdel) {
  const pctIVA  = os === 'CEMEPLA' ? 21 : 10.5;

  document.getElementById('cf-os-nombre').textContent = os;

  // Store data in hidden fields on the modal
  const modal = document.getElementById('modal-confirmar-factura');
  modal.dataset.os       = os;
  modal.dataset.mes      = mes;
  modal.dataset.mesLabel = mesLabel;
  modal.dataset.total    = total;
  modal.dataset.netoEx   = netoExento;
  modal.dataset.netoGrav = netoGravado;
  modal.dataset.ivaGrav  = ivaGravado;
  modal.dataset.cant     = cant;
  modal.dataset.copagoAdel = copagoAdel || 0;
  modal.dataset.pctIVA   = pctIVA;

  // Fill resumen
  document.getElementById('cf-resumen').innerHTML = `
    <div style="font-size:13px;line-height:2;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--text3);">Período:</span>
        <strong>${mesLabel}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--text3);">Prestaciones:</span>
        <strong>${cant}</strong>
      </div>
      ${netoExento>0?`<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
        <span style="color:var(--success);">✓ Monto exento:</span>
        <span style="font-family:monospace;font-weight:700;">${fmt(netoExento)}</span>
      </div>`:''}
      ${netoGravado>0?`<div style="display:flex;justify-content:space-between;margin-bottom:2px;">
        <span style="color:var(--warn);">⚡ Monto gravado:</span>
        <span style="font-family:monospace;">${fmt(netoGravado)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--warn);">IVA ${pctIVA}%:</span>
        <span style="font-family:monospace;color:var(--warn);">${fmt(ivaGravado)}</span>
      </div>`:''}
      ${copagoAdel>0?`<div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:var(--accent);">− Copago a cuenta:</span>
        <span style="font-family:monospace;color:var(--accent);">${fmt(copagoAdel)}</span>
      </div>`:''}
      <div style="display:flex;justify-content:space-between;border-top:2px solid var(--border2);padding-top:8px;margin-top:4px;font-size:15px;font-weight:800;">
        <span>Total factura:</span>
        <span style="font-family:monospace;color:var(--accent2);">${fmt(total)}</span>
      </div>
    </div>`;

  // Default values
  document.getElementById('cf-nro-factura').value = '';
  document.getElementById('cf-fecha-emision').value = hoyISO();
  document.getElementById('cf-dias-vencimiento').value = '60';
  document.getElementById('cf-obs').value = '';

  openModal('modal-confirmar-factura');
}

// ── Confirmar y registrar la factura ─────────────────────────────────────────
function confirmarFacturaOS() {
  const nro = document.getElementById('cf-nro-factura').value.trim();
  if (!nro) { showToast('⚠️ Ingresá el número de factura'); return; }

  const modal     = document.getElementById('modal-confirmar-factura');
  const os        = modal.dataset.os;
  const mes       = modal.dataset.mes;
  const mesLabel  = modal.dataset.mesLabel;
  const total     = parseFloat(modal.dataset.total);
  const netoEx    = parseFloat(modal.dataset.netoEx);
  const netoGrav  = parseFloat(modal.dataset.netoGrav);
  const ivaGrav   = parseFloat(modal.dataset.ivaGrav);
  const cant      = parseInt(modal.dataset.cant);
  const pctIVA    = parseFloat(modal.dataset.pctIVA);
  const fecha     = document.getElementById('cf-fecha-emision').value;
  const dias      = parseInt(document.getElementById('cf-dias-vencimiento').value) || 60;
  const obs       = document.getElementById('cf-obs').value;
  const vence     = new Date(fecha);
  vence.setDate(vence.getDate() + dias);
  const venceStr  = vence.toISOString().split('T')[0];

  // Remove any preliquidada placeholder for this OS/mes
  DB.facturas = DB.facturas.filter(f =>
    !(f.dest === os && f.mes === mesLabel && f.estado === 'Preliquidada')
  );

  marcarCambios('facturas'); DB.facturas.push({
    id:           DB.nextId++,
    num:          nro,
    fecha,
    dest:         os,
    mes:          mesLabel,
    concepto:     `Prestaciones ${mesLabel}`,
    prestaciones: cant,
    netoExento:   netoEx,
    netoGravado:  netoGrav,
    ivaGravado:   ivaGrav,
    copagoAdelanto: parseFloat(modal.dataset.copagoAdel) || 0,
    pctIVA,
    monto:        total,
    estado:       'Pendiente',
    vence:        venceStr,
    fechaPago:    '',
    obs,
  });

  closeModal('modal-confirmar-factura');
  renderOS();
  showToast(`✓ Factura ${nro} — ${os} · ${fmt(total)} → Pendiente de cobro`);
}

// ── Stats y tabla general de OS ───────────────────────────────────────────────
function renderOSStats() {
  const pendientes = DB.facturas.filter(facturaPendiente);
  const totalPend  = pendientes.reduce((s,f) => s+f.monto, 0);
  const vencidas   = DB.facturas.filter(f => f.estado === 'Vencida');
  const stats = document.getElementById('os-stats-row');
  if (!stats) return;
  stats.innerHTML = `
    <div class="stat-card" style="border-left:3px solid var(--accent2);">
      <div class="stat-label">OS activas</div>
      <div class="stat-value">${DB.obrasSociales.filter(o=>o.estado==='Activa').length}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--warn);">
      <div class="stat-label">Total pendiente cobro</div>
      <div class="stat-value finance-num" style="font-size:20px;">${fmt(totalPend)}</div>
      <div class="stat-sub">${pendientes.length} factura${pendientes.length!==1?'s':''}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--danger);">
      <div class="stat-label">Facturas vencidas</div>
      <div class="stat-value">${vencidas.length}</div>
      <div class="stat-sub finance-num">${fmt(vencidas.reduce((s,f)=>s+f.monto,0))}</div>
    </div>
    <div class="stat-card" style="border-left:3px solid var(--success);">
      <div class="stat-label">Cobrado acumulado</div>
      <div class="stat-value finance-num" style="font-size:18px;">${fmt(DB.facturas.filter(f=>f.estado==='Pagada').reduce((s,f)=>s+f.monto,0))}</div>
    </div>`;
}

function renderOSTbody() {
  const tbody = document.getElementById('os-tbody');
  if (!tbody) return;
  tbody.innerHTML = DB.obrasSociales.map(os => {
    const facturasOS = DB.facturas.filter(f => f.dest === os.nombre);
    // 'Preliquidada' cuenta como pendiente en TODA la app (stats de arriba, Finanzas,
    // Dashboard) — si se excluye acá, el total por-OS no suma igual que el total general.
    const pendOS     = facturasOS.filter(facturaPendiente);
    const montoPend  = pendOS.reduce((s,f) => s+f.monto, 0);
    const hayVencida = pendOS.some(f => f.estado === 'Vencida');
    return `<tr>
      <td style="font-weight:600;">${os.nombre}</td>
      <td>${os.pago}</td>
      <td style="${new Date(os.vencimiento) < new Date(Date.now()+30*86400000) ? 'color:var(--danger);font-weight:600;' : ''}">${os.vencimiento}</td>
      <td style="font-weight:600;">${os.consultas||'—'}</td>
      <td class="finance-num">${fmt((os.facturado||0))}</td>
      <td>
        <span class="finance-num" style="font-weight:700;color:${montoPend>0?(hayVencida?'var(--danger)':'var(--warn)'):'var(--success)'};">
          ${montoPend>0?fmt(montoPend):'✓ Al día'}
        </span>
        ${montoPend>0?`<div style="font-size:11px;color:var(--text3);">${pendOS.length} factura${pendOS.length>1?'s':''}</div>`:''}
      </td>
      <td><span class="pill ${os.estado==='Activa'?'pill-paid':os.estado==='Vencida'?'pill-overdue':'pill-pending'}">${os.estado}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="verCobranzasOS('${os.nombre.replace(/'/g,"\\'")}')">Ver cobros</button>
        <button class="btn btn-secondary btn-sm" onclick="editarOS(${os.id})">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="eliminarOS(${os.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}


function verCobranzasOS(nombre) {
  // Ir al tab Cobranzas de OS/Pagos y filtrar por OS
  switchOSPagosTab('cobranzas', document.querySelector('#ospagos-tabs .tab[data-tab="cobranzas"]'));
  setTimeout(() => {
    const sel = document.getElementById('cob-filter-os');
    if (sel) { sel.value = nombre; renderCobranzas(); }
  }, 50);
}

function renderCobranzas() {
  const osFilter = document.getElementById('cob-filter-os')?.value || '';
  const estadoFilter = document.getElementById('cob-filter-estado')?.value || '';

  // Sincronizar estado de facturas vencidas por fecha (KPIs, filtros y filas consistentes).
  actualizarVencimientos();

  let data = DB.facturas.filter(facturaPendiente);
  if (osFilter) data = data.filter(f => f.dest === osFilter);
  if (estadoFilter) data = data.filter(f => f.estado === estadoFilter);
  data.sort((a,b) => a.vence.localeCompare(b.vence));

  const total = data.reduce((s,f) => s+f.monto, 0);
  const el = document.getElementById('cob-total-count');
  const em = document.getElementById('cob-total-monto');
  if (el) el.textContent = `${data.length} factura${data.length!==1?'s':''}`;
  if (em) em.textContent = `${fmt(total)}`;

  // Stats resumen por estado
  const stats = document.getElementById('cobranzas-stats');
  if (stats) {
    const preliq = DB.facturas.filter(f=>f.estado==='Preliquidada');
    const pend = DB.facturas.filter(f=>f.estado==='Pendiente');
    const venc = DB.facturas.filter(f=>f.estado==='Vencida');
    stats.innerHTML = `
      <div class="stat-card" style="border-left:3px solid #8b5cf6;">
        <div class="stat-label">Preliquidadas</div>
        <div class="stat-value">${preliq.length}</div>
        <div class="stat-sub finance-num">${fmt(preliq.reduce((s,f)=>s+f.monto,0))}</div>
        <div style="font-size:11px; color:var(--text3); margin-top:3px;">Enviadas a OS, esperando</div>
      </div>
      <div class="stat-card" style="border-left:3px solid var(--warn);">
        <div class="stat-label">Pendientes cobro</div>
        <div class="stat-value">${pend.length}</div>
        <div class="stat-sub finance-num">${fmt(pend.reduce((s,f)=>s+f.monto,0))}</div>
        <div style="font-size:11px; color:var(--text3); margin-top:3px;">Aceptadas, no pagadas aún</div>
      </div>
      <div class="stat-card" style="border-left:3px solid var(--danger);">
        <div class="stat-label">Vencidas</div>
        <div class="stat-value">${venc.length}</div>
        <div class="stat-sub finance-num">${fmt(venc.reduce((s,f)=>s+f.monto,0))}</div>
        <div style="font-size:11px; color:var(--danger); margin-top:3px;">⚠ Requieren gestión urgente</div>
      </div>
      <div class="stat-card" style="border-left:3px solid var(--success);">
        <div class="stat-label">Cobrado este año</div>
        <div class="stat-value finance-num" style="font-size:18px;">${fmt(DB.facturas.filter(f=>f.estado==='Pagada').reduce((s,f)=>s+f.monto,0))}</div>
        <div class="stat-sub">${DB.facturas.filter(f=>f.estado==='Pagada').length} facturas cobradas</div>
      </div>`;
  }

  const tbody = document.getElementById('cobranzas-tbody');
  if (!tbody) return;

  const estadoConfig = {
    'Preliquidada': { cls:'pill', style:'background:#ede8ff; color:#5a3a99;', label:'Preliquidada' },
    'Pendiente':    { cls:'pill pill-pending', style:'', label:'Pendiente cobro' },
    'Vencida':      { cls:'pill pill-overdue', style:'', label:'⚠ Vencida' },
  };

  tbody.innerHTML = data.map(f => {
    const dias = diasHasta(f.vence);
    const diasLabel = dias < 0
      ? `<span style="color:var(--danger);font-weight:700;">${Math.abs(dias)}d VENCIDA</span>`
      : dias === 0
        ? `<span style="color:var(--danger);font-weight:700;">HOY</span>`
        : dias <= 10
          ? `<span style="color:var(--warn);font-weight:600;">${dias} días</span>`
          : `<span>${dias} días</span>`;
    const cfg = estadoConfig[f.estado] || {};

    // Desglose exento / gravado
    let desgloseHTML = '';
    const hasEx   = f.netoExento  > 0;
    const hasGrav = f.netoGravado > 0;
    if (hasEx || hasGrav) {
      desgloseHTML = `<div style="font-size:10px;color:var(--text3);margin-top:3px;line-height:1.6;">`;
      if (hasEx)   desgloseHTML += `<span style="color:var(--success);">✓ Exento ${fmt(f.netoExento)}</span>`;
      if (hasEx && hasGrav) desgloseHTML += ' · ';
      if (hasGrav) desgloseHTML += `<span style="color:var(--warn);">⚡ Gravado ${fmt(f.netoGravado)} + IVA ${f.pctIVA||10.5}% ${fmt(f.ivaGravado)}</span>`;
      desgloseHTML += `</div>`;
    }

    return `
      <tr class="${f.estado==='Vencida'?'row-alert':dias<=10&&f.estado!=='Vencida'?'row-warn':''}">
        <td style="font-family:monospace;font-size:12px;font-weight:700;">${f.num}</td>
        <td style="font-weight:600;">${f.dest}</td>
        <td>${f.mes}</td>
        <td style="text-align:center;">${f.prestaciones}</td>
        <td class="finance-num" style="font-weight:700;">${fmt(f.monto)}${desgloseHTML}</td>
        <td>${f.fecha}</td>
        <td style="font-weight:500;">${f.vence}</td>
        <td>${diasLabel}</td>
        <td><span class="${cfg.cls}" style="${cfg.style}">${cfg.label}</span></td>
        <td style="max-width:140px;font-size:11px;color:var(--text2);">${f.obs||'—'}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${f.estado !== 'Pagada' ? `<button class="btn btn-primary btn-sm" onclick="abrirConfirmarCobro(${f.id})">✓ Cobrado</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="editarFactura(${f.id})">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="abrirNota(${f.id})">📝</button>
            ${f.estado === 'Preliquidada' ? `<button class="btn btn-warn btn-sm" onclick="marcarEnviada(${f.id})">Enviar a OS</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  if (data.length === 0) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;color:var(--text3);">Sin facturas pendientes para este filtro</td></tr>';
}

function renderHistorialPagos() {
  const tbody = document.getElementById('historial-pagos-tbody');
  if (!tbody) return;
  const pagados = DB.facturas.filter(f => f.estado === 'Pagada').sort((a,b) => b.fechaPago.localeCompare(a.fechaPago));
  tbody.innerHTML = pagados.map(f => {
    const pago = DB.pagosRecibidos.find(p => p.facturaId === f.id);
    // La factura (f.monto) queda tal cual se emitió; lo realmente cobrado se guarda aparte
    // en pagosRecibidos (confirmarCobro no sincroniza f.monto — ver AUDITORIA.md, D3). Si
    // difieren, se avisa acá en vez de pisar el monto facturado en silencio.
    const difiere = pago && Math.abs(pago.monto - f.monto) > 0.01;
    const avisoDif = difiere
      ? `<div style="font-size:11px; color:var(--warn); font-weight:600; margin-top:2px;" title="Facturado ${fmt(f.monto)} — Cobrado ${fmt(pago.monto)}">⚠ Cobrado ${fmt(pago.monto)}</div>`
      : '';
    return `
      <tr>
        <td style="font-weight:600;">${f.fechaPago || '—'}</td>
        <td style="font-family:monospace; font-size:12px; font-weight:700;">${f.num}</td>
        <td style="font-weight:600;">${f.dest}</td>
        <td>${f.mes}</td>
        <td class="finance-num" style="font-weight:700; color:var(--success);">${fmt(f.monto)}${avisoDif}</td>
        <td>${pago?.medioPago || 'Transferencia'}</td>
        <td style="font-family:monospace; font-size:11px; color:var(--text3);">${pago?.referencia || '—'}</td>
      </tr>`;
  }).join('');
}

function abrirConfirmarCobro(facturaId) {
  const f = DB.facturas.find(x => x.id === facturaId);
  if (!f) return;
  document.getElementById('cobro-factura-id').value = facturaId;
  document.getElementById('cobro-monto').value = f.monto;
  document.getElementById('cobro-fecha').value = hoyISO();
  document.getElementById('cobro-ref').value = '';
  document.getElementById('cobro-obs').value = '';
  document.getElementById('cobro-factura-info').innerHTML = `
    <div style="display:flex; gap:20px; flex-wrap:wrap;">
      <div><span style="font-size:11px; color:var(--text3);">N° Factura</span><div style="font-weight:700; font-family:monospace;">${f.num}</div></div>
      <div><span style="font-size:11px; color:var(--text3);">Obra Social</span><div style="font-weight:700;">${f.dest}</div></div>
      <div><span style="font-size:11px; color:var(--text3);">Período</span><div style="font-weight:600;">${f.mes}</div></div>
      <div><span style="font-size:11px; color:var(--text3);">Monto facturado</span><div style="font-weight:700; font-family:monospace; color:var(--accent);">${fmt(f.monto)}</div></div>
      <div><span style="font-size:11px; color:var(--text3);">Vencimiento</span><div style="font-weight:600;">${f.vence}</div></div>
    </div>`;
  openModal('modal-confirmar-cobro');
}

function confirmarCobro() {
  const id = parseInt(document.getElementById('cobro-factura-id').value);
  const f = DB.facturas.find(x => x.id === id);
  if (!f) return;
  const monto = parseFloat(document.getElementById('cobro-monto').value);
  const fecha = document.getElementById('cobro-fecha').value;
  const medio = document.getElementById('cobro-medio').value;
  const ref = document.getElementById('cobro-ref').value;
  const obs = document.getElementById('cobro-obs').value;

  f.estado = 'Pagada';
  f.fechaPago = fecha;
  if (obs) f.obs = obs;

  DB.pagosRecibidos.push({
    id: DB.nextId++, facturaId: id, num: f.num, os: f.dest,
    fecha, monto, medioPago: medio, referencia: ref,
  });

  // Registrar en movimientos de caja
  DB.movimientos.unshift({
    id: DB.nextId++,
    fecha,
    desc: `Cobro ${f.num} — ${f.dest} (${f.mes})`,
    consultorio: 'General',
    tipo: 'Ingreso',
    monto,
    saldo: 0,
    facturaId: id,
    origen: 'Factura',
  });

  closeModal('modal-confirmar-cobro');
  marcarCambios('facturas');
  showToast(`✓ Cobro de ${f.num} confirmado — ${fmt(monto)}`);
  renderCobranzas();
  renderOS();
}

function editarFactura(id) {
  const f = DB.facturas.find(x => x.id === id);
  if (!f) return;
  document.getElementById('ef-id').value = id;
  document.getElementById('ef-num').value = f.num || '';
  document.getElementById('ef-dest').value = f.dest || '';
  document.getElementById('ef-mes').value = f.mes || '';
  document.getElementById('ef-monto').value = f.monto || 0;
  document.getElementById('ef-fecha').value = f.fecha || '';
  document.getElementById('ef-vence').value = f.vence || '';
  document.getElementById('ef-obs').value = f.obs || '';
  document.getElementById('ef-aviso-cobrada').style.display = f.estado === 'Pagada' ? '' : 'none';
  openModal('modal-editar-factura');
}

function guardarEdicionFactura() {
  const id = parseInt(document.getElementById('ef-id').value);
  const f = DB.facturas.find(x => x.id === id);
  if (!f) return;
  const montoNuevo = parseFloat(document.getElementById('ef-monto').value) || 0;
  const numNuevo  = document.getElementById('ef-num').value.trim();
  const destNuevo = document.getElementById('ef-dest').value.trim();
  const mesNuevo  = document.getElementById('ef-mes').value.trim();

  f.num   = numNuevo;
  f.dest  = destNuevo;
  f.mes   = mesNuevo;
  f.monto = montoNuevo;
  f.fecha = document.getElementById('ef-fecha').value;
  f.vence = document.getElementById('ef-vence').value;
  f.obs   = document.getElementById('ef-obs').value;
  marcarCambios('facturas');

  // Si la factura ya fue cobrada, ajustar el ingreso correspondiente en Caja
  if (f.estado === 'Pagada') {
    const mov = DB.movimientos.find(m => m.facturaId === id);
    if (mov) {
      mov.monto = montoNuevo;
      mov.desc = `Cobro ${numNuevo} — ${destNuevo} (${mesNuevo})`;
      marcarCambios('movimientos');
    }
    // ajustar también el pago registrado
    const pago = (DB.pagosRecibidos || []).find(p => p.facturaId === id);
    if (pago) { pago.monto = montoNuevo; pago.num = numNuevo; pago.os = destNuevo; marcarCambios('pagosRecibidos'); }
  }

  closeModal('modal-editar-factura');
  renderCobranzas();
  renderOS();
  renderFinanzas();
  showToast(`✓ Factura ${numNuevo} actualizada`);
}

function eliminarFactura() {
  const id = parseInt(document.getElementById('ef-id').value);
  const f = DB.facturas.find(x => x.id === id);
  if (!f) return;
  const cobrada = f.estado === 'Pagada';
  let msg = `¿Eliminar la factura ${f.num} (${f.dest} · ${f.mes})?`;
  if (cobrada) msg += `\n\nComo ya estaba cobrada, también se eliminará el ingreso de ${fmt(f.monto)} en Caja, para no dejar rastro del error.`;
  if (!confirm(msg)) return;

  DB.facturas = DB.facturas.filter(x => x.id !== id);
  marcarCambios('facturas');

  // Borrar el ingreso en Caja y el pago registrado, si existían
  const movs = DB.movimientos.filter(m => m.facturaId === id);
  if (movs.length > 0) {
    const ids = new Set(movs.map(m => m.id));
    DB.movimientos = DB.movimientos.filter(m => !ids.has(m.id));
    marcarCambios('movimientos');
  }
  if (DB.pagosRecibidos && DB.pagosRecibidos.some(p => p.facturaId === id)) {
    DB.pagosRecibidos = DB.pagosRecibidos.filter(p => p.facturaId !== id);
    marcarCambios('pagosRecibidos');
  }

  closeModal('modal-editar-factura');
  renderCobranzas();
  renderOS();
  renderFinanzas();
  showToast(cobrada ? '✓ Factura e ingreso en Caja eliminados' : '✓ Factura eliminada');
}

function abrirNota(facturaId) {
  const f = DB.facturas.find(x => x.id === facturaId);
  if (!f) return;
  document.getElementById('nota-factura-id').value = facturaId;
  document.getElementById('nota-texto').value = f.obs || '';
  document.getElementById('nota-factura-info').innerHTML = `<strong>${f.num}</strong> · ${f.dest} · ${f.mes} · ${fmt(f.monto)}`;
  openModal('modal-nota-seguimiento');
}

function guardarNota() {
  const id = parseInt(document.getElementById('nota-factura-id').value);
  const f = DB.facturas.find(x => x.id === id);
  if (!f) return;
  f.obs = document.getElementById('nota-texto').value;
  closeModal('modal-nota-seguimiento');
  showToast('✓ Nota guardada');
  renderCobranzas();
}

function marcarEnviada(facturaId) {
  const f = DB.facturas.find(x => x.id === facturaId);
  if (!f) return;
  f.estado = 'Pendiente';
  marcarCambios('facturas');
  showToast(`✓ ${f.num} marcada como enviada a ${f.dest}`);
  renderCobranzas();
}

function exportarCobranzas() {
  if (typeof XLSX === 'undefined') { showToast('⚠️ No se pudo cargar el módulo de Excel'); return; }
  if (!DB.facturas.length) { showToast('No hay facturas para exportar'); return; }
  const rows = DB.facturas.map(f => ({
    Número: f.num || '',
    Fecha: f.fecha || '',
    Destino: f.dest || '',
    Período: f.mes || '',
    Estado: f.estado || '',
    Monto: round2(f.monto),
  }));
  exportarLibroExcel({ Cobranzas: rows }, 'cobranzas');
  showToast(`✓ ${rows.length} facturas exportadas`);
}

// ══════════════════════════════════════
//  MÉDICOS GRID
// ══════════════════════════════════════

// ── renderMedicosGrid() movido a js/ui-medicos.js (Etapa 2) ─────────────────


// ══════════════════════════════════════
//  FINANZAS
// ══════════════════════════════════════

function renderFinanzas() {
  // ── KPIs dinámicos ──────────────────────────────────────────────────────────
  const mes = new Date().toISOString().slice(0,7);

  // Caja chica (efectivo en consultorios) — uno por cada consultorio ACTIVO
  const consultoriosFin = getConsultoriosList();
  const saldosPorConsultorio = consultoriosFin.map(c => ({ nombre: c, saldo: saldoCajaChica(c) }));
  const saldoTotal = saldosPorConsultorio.reduce((s,c)=>s+c.saldo, 0);

  // Facturado del mes (facturas emitidas = Pendiente o Pagada)
  const factMes    = DB.facturas.filter(f => f.fecha?.startsWith(mes));
  const montoFact  = factMes.reduce((s,f)=>s+f.monto,0);

  // Cobros pendientes (antes excluía Preliquidada acá — no coincidía con Obras Sociales)
  const pendientes = DB.facturas.filter(facturaPendiente);
  const totalPend  = pendientes.reduce((s,f)=>s+f.monto,0);
  const vencidas   = pendientes.filter(f=>f.estado==='Vencida');

  if (g('fin-caja-total'))  g('fin-caja-total').textContent  = fmt(saldoTotal);
  if (g('fin-caja-sub'))    g('fin-caja-sub').textContent    = saldosPorConsultorio.map(c=>`${c.nombre}: ${fmt(c.saldo)}`).join(' · ');
  if (g('fin-fact-mes'))    g('fin-fact-mes').textContent    = fmt(montoFact);
  if (g('fin-fact-sub'))    g('fin-fact-sub').textContent    = `${factMes.length} factura${factMes.length!==1?'s':''} emitida${factMes.length!==1?'s':''}`;
  if (g('fin-cobros-pend')) g('fin-cobros-pend').textContent = fmt(totalPend);
  if (g('fin-cobros-sub'))  g('fin-cobros-sub').textContent  = `${pendientes.length} factura${pendientes.length!==1?'s':''}${vencidas.length>0?' · '+vencidas.length+' vencida'+( vencidas.length!==1?'s':''):''}`;

  // Caja — saldo corriente calculado (los movimientos guardan saldo:0; se recalcula acá)
  const cajaTbody = document.getElementById('caja-tbody');
  if (cajaTbody) {
    const movs = [...DB.movimientos].sort((a,b) => b.fecha.localeCompare(a.fecha));
    // Saldo acumulado: del más viejo al más nuevo
    let sCaja = 0;
    const movsSaldo = [...movs].reverse().map(m => {
      sCaja += m.tipo === 'Ingreso' ? m.monto : -m.monto;
      return { ...m, saldoAcum: sCaja };
    }).reverse();
    // sCaja ahora es el saldo total de banco (suma de todos los movimientos)
    const saldoBanco = sCaja;
    const saldoEfectivo = getConsultoriosList().reduce((s,c)=>s+saldoCajaChica(c), 0);
    const saldoTotal = saldoBanco + saldoEfectivo;
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
    setTxt('caja-saldo-banco', saldoBanco);
    setTxt('caja-saldo-efectivo', saldoEfectivo);
    setTxt('caja-saldo-total', saldoTotal);

    cajaTbody.innerHTML = movsSaldo.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3);">Sin movimientos de banco</td></tr>`
      : movsSaldo.map(m => `
        <tr>
          <td>${m.fecha}</td>
          <td>${m.desc}</td>
          <td>${m.consultorio}</td>
          <td><span class="pill ${m.tipo==='Ingreso'?'pill-paid':'pill-overdue'}">${m.tipo}</span></td>
          <td class="finance-num" style="color:${m.tipo==='Ingreso'?'var(--success)':'var(--danger)'};">${m.tipo==='Ingreso'?'+':'-'}${fmt(m.monto)}</td>
          <td class="finance-num" style="font-weight:600; color:${m.saldoAcum>=0?'var(--text)':'var(--danger)'};">${fmt(m.saldoAcum)}</td>
        </tr>`).join('');
  }

  // Facturas
  renderFacturasOS();

  // Cobranzas/pagos pendientes
  renderPagosPendientes();
}

function renderFacturasOS() {
  const mesFilter = document.getElementById('fin-fact-filtro-mes')?.value || '';
  const estadoFilter = document.getElementById('fin-fact-estado')?.value || '';
  let data = [...DB.facturas];
  if (mesFilter) data = data.filter(f => f.mes === mesFilter);
  if (estadoFilter) data = data.filter(f => f.estado === estadoFilter);
  data.sort((a,b) => b.fecha.localeCompare(a.fecha));

  const resumen = document.getElementById('fin-fact-resumen');
  if (resumen) {
    const tot = data.reduce((s,f)=>s+f.monto,0);
    resumen.textContent = `${data.length} facturas · ${fmt(tot)} total`;
  }

  const estadoCfg = {
    'Preliquidada': 'background:#ede8ff;color:#5a3a99;',
    'Pendiente':    'background:var(--warn-light);color:var(--warn);',
    'Vencida':      'background:var(--danger-light);color:var(--danger);',
    'Pagada':       'background:var(--success-light);color:var(--success);',
  };

  const tbody = document.getElementById('facturas-tbody');
  if (!tbody) return;
  tbody.innerHTML = data.map(f => `
    <tr class="${f.estado==='Vencida'?'row-alert':''}">
      <td style="font-family:monospace; font-size:12px; font-weight:700;">${f.num}</td>
      <td style="font-weight:600;">${f.mes}</td>
      <td style="font-weight:600;">${f.dest}</td>
      <td style="text-align:center;">${f.prestaciones}</td>
      <td class="finance-num" style="font-weight:700;">${fmt(f.monto)}</td>
      <td>${f.fecha}</td>
      <td>${f.vence}</td>
      <td><span class="pill" style="${estadoCfg[f.estado]||''}">${f.estado}</span></td>
      <td style="color:var(--success); font-weight:600;">${f.fechaPago || '—'}</td>
      <td>
        <div style="display:flex; gap:4px;">
          ${f.estado !== 'Pagada' ? `<button class="btn btn-primary btn-sm" onclick="abrirConfirmarCobro(${f.id})">✓ Cobrado</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="abrirNota(${f.id})">📝 Nota</button>
        </div>
      </td>
    </tr>`).join('');
}

function renderPagosPendientes() {
  // Sincronizar vencidas antes de calcular nada.
  actualizarVencimientos();

  // Resumen por OS — todas las OS que tengan facturas pendientes (no una lista fija)
  const resumen = document.getElementById('fin-cob-resumen');
  if (resumen) {
    const porOS = {};
    DB.facturas
      .filter(facturaPendiente)
      .forEach(f => {
        if (!porOS[f.dest]) porOS[f.dest] = { total:0, n:0, venc:false };
        porOS[f.dest].total += f.monto;
        porOS[f.dest].n++;
        if (f.estado === 'Vencida') porOS[f.dest].venc = true;
      });
    const entries = Object.entries(porOS).sort((a,b) => b[1].total - a[1].total);
    resumen.innerHTML = entries.map(([os, d]) => {
      const hayVencida = d.venc;
      return `<div class="stat-card" style="border-left:3px solid ${hayVencida?'var(--danger)':'var(--warn)'};">
        <div class="stat-label">${os}</div>
        <div class="stat-value finance-num" style="font-size:18px; color:${hayVencida?'var(--danger)':'var(--warn)'};">${fmt(d.total)}</div>
        <div class="stat-sub">${d.n} factura${d.n>1?'s':''} pendiente${d.n>1?'s':''}</div>
        ${hayVencida ? `<div style="font-size:11px; color:var(--danger); margin-top:3px; font-weight:600;">⚠ Tiene vencidas</div>` : ''}
      </div>`;
    }).join('');
    if (!resumen.innerHTML) resumen.innerHTML = '<div style="padding:16px; color:var(--success); font-weight:600;">✓ Sin cobranzas pendientes</div>';
  }

  // Timeline de vencimientos próximos — incluye vencidas (son las más urgentes)
  const timeline = document.getElementById('fin-vencimientos-timeline');
  if (timeline) {
    const prox = DB.facturas
      .filter(facturaPendiente)
      .sort((a,b) => a.vence.localeCompare(b.vence))
      .slice(0,5);
    timeline.innerHTML = prox.length === 0
      ? '<div style="color:var(--text3); font-size:13px;">Sin vencimientos próximos</div>'
      : `<div style="display:flex; gap:0; overflow-x:auto; padding-bottom:4px;">` +
        prox.map(f => {
          const dias = diasHasta(f.vence);
          const color = dias < 0 ? 'var(--danger)' : dias <= 10 ? 'var(--warn)' : 'var(--accent2)';
          return `<div style="flex:0 0 auto; min-width:150px; border-left:3px solid ${color}; padding:10px 14px; margin-right:12px; background:var(--surface2); border-radius:0 6px 6px 0;">
            <div style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:600; margin-bottom:3px;">${f.dest}</div>
            <div style="font-family:monospace; font-size:11px; color:var(--text2);">${f.num}</div>
            <div style="font-weight:700; font-family:monospace; font-size:14px;">${fmt(f.monto)}</div>
            <div style="font-size:11px; font-weight:600; color:${color}; margin-top:4px;">${dias<0?Math.abs(dias)+'d vencida':dias===0?'Hoy':dias+'d'}</div>
          </div>`;
        }).join('') + '</div>';
  }

  // Tabla detallada
  const pending = DB.facturas.filter(facturaPendiente)
    .sort((a,b) => a.vence.localeCompare(b.vence));

  const tbody = document.getElementById('pagos-tbody');
  if (!tbody) return;

  const estadoCfg = {
    'Preliquidada': { label:'Preliquidada', style:'background:#ede8ff;color:#5a3a99;' },
    'Pendiente':    { label:'Pendiente cobro', style:'background:var(--warn-light);color:var(--warn);' },
    'Vencida':      { label:'⚠ Vencida', style:'background:var(--danger-light);color:var(--danger);' },
  };

  tbody.innerHTML = pending.map(f => {
    const dias = diasHasta(f.vence);
    const diasLabel = dias < 0
      ? `<span style="color:var(--danger);font-weight:700;">${Math.abs(dias)}d VENCIDA</span>`
      : dias <= 10
        ? `<span style="color:var(--warn);font-weight:600;">${dias}d</span>`
        : `<span>${dias}d</span>`;
    const cfg = estadoCfg[f.estado] || {};
    return `
      <tr class="${f.estado==='Vencida'?'row-alert':dias<=10?'row-warn':''}">
        <td style="font-family:monospace; font-size:12px; font-weight:700; white-space:nowrap;">${f.num}</td>
        <td style="font-weight:600;">${f.dest}</td>
        <td>${f.mes}</td>
        <td style="text-align:center;">${f.prestaciones}</td>
        <td class="finance-num" style="font-weight:700;">${fmt(f.monto)}</td>
        <td style="white-space:nowrap;">${f.vence}</td>
        <td>${diasLabel}</td>
        <td><span class="pill" style="${cfg.style||''}">${cfg.label||f.estado}</span></td>
        <td style="max-width:140px; font-size:11px; color:var(--text2);">${f.obs || '—'}</td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="abrirConfirmarCobro(${f.id})">✓ Cobrado</button>
            <button class="btn btn-secondary btn-sm" onclick="editarFactura(${f.id})">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="abrirNota(${f.id})">📝</button>
            ${f.estado==='Preliquidada'?`<button class="btn btn-warn btn-sm" onclick="marcarEnviada(${f.id})">Enviar</button>`:''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function switchFinTab(tab, el) {
  document.querySelectorAll('#section-finanzas .tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['mensual','caja','facturas','pagos','cajachica','debitos'].forEach(t => {
    const d = document.getElementById(`fin-${t}`);
    if (d) d.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'cajachica') renderCajaChica();
  if (tab === 'mensual') renderResumenMensual();
}

// Resumen mensual: por período (mes calendario), cuánto entró en efectivo (caja chica),
// cuánto en banco/transferencia (movimientos), y cuánto de lo facturado a las OS ese mes
// sigue sin cobrarse (Pendiente/Vencida/Preliquidada). Se agrupa todo por r.fecha/m.fecha/
// f.fecha (mismo criterio: "cuándo pasó el movimiento de plata"), no por período de atención.
function renderResumenMensual() {
  const tbody = document.getElementById('fin-mensual-tbody');
  if (!tbody) return;

  const porMes = {};  // 'YYYY-MM' → { efectivo, banco, egresos, pendiente, facturasPend:[] }
  const ensureMes = (m) => { if (!porMes[m]) porMes[m] = { efectivo:0, banco:0, egresos:0, pendiente:0, facturasPend:[] }; return porMes[m]; };

  DB.cajaChica.filter(m => m.fecha).forEach(m => {
    const dst = ensureMes(m.fecha.slice(0,7));
    if (m.tipo === 'Ingreso') dst.efectivo += m.monto; else dst.egresos += m.monto;
  });
  DB.movimientos.filter(m => m.fecha).forEach(m => {
    const dst = ensureMes(m.fecha.slice(0,7));
    // Egresos de banco (incluye el pago de liquidaciones a médicos, ver confirmarPagoEnviado)
    // cuentan acá igual que cualquier otro egreso — todos bajan la caja disponible.
    if (m.tipo === 'Ingreso') dst.banco += m.monto; else dst.egresos += m.monto;
  });
  DB.facturas.filter(f => facturaPendiente(f) && f.fecha).forEach(f => {
    const dst = ensureMes(f.fecha.slice(0,7));
    dst.pendiente += f.monto;
    dst.facturasPend.push(f);
  });

  const meses = Object.keys(porMes).sort().reverse();  // más reciente primero
  const estadoConfig = {
    'Preliquidada': { style:'background:#ede8ff; color:#5a3a99;', label:'Preliquidada' },
    'Pendiente':    { style:'', label:'Pendiente cobro' },
    'Vencida':      { style:'', label:'⚠ Vencida' },
  };
  const claseEstado = { 'Preliquidada':'pill', 'Pendiente':'pill pill-pending', 'Vencida':'pill pill-overdue' };

  tbody.innerHTML = meses.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);">Sin movimientos</td></tr>`
    : meses.map(mes => {
        const { efectivo, banco, egresos, pendiente, facturasPend } = porMes[mes];
        const total = efectivo + banco;
        const neto = total - egresos;
        const idDet = `fin-mensual-det-${mes}`;
        const celdaPendiente = pendiente > 0
          ? `<span onclick="toggleDetallePendienteMes('${mes}')" style="cursor:pointer; color:var(--warn); text-decoration:underline dotted; text-underline-offset:3px;" title="Ver detalle de facturas pendientes">${fmt(pendiente)} <span id="${idDet}-flecha">▾</span></span>`
          : '—';
        const filaDetalle = pendiente > 0 ? `
        <tr id="${idDet}" style="display:none;">
          <td colspan="7" style="background:var(--surface2); padding:10px 16px;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead><tr style="color:var(--text3);">
                <th style="text-align:left; padding:4px 8px;">N° Factura</th>
                <th style="text-align:left; padding:4px 8px;">OS</th>
                <th style="text-align:left; padding:4px 8px;">Período</th>
                <th style="text-align:right; padding:4px 8px;">Monto</th>
                <th style="text-align:left; padding:4px 8px;">Vencimiento</th>
                <th style="text-align:left; padding:4px 8px;">Estado</th>
              </tr></thead>
              <tbody>
                ${facturasPend.sort((a,b)=>a.vence.localeCompare(b.vence)).map(f => `
                <tr style="border-top:1px solid var(--border);">
                  <td style="padding:4px 8px; font-family:monospace;">${f.num}</td>
                  <td style="padding:4px 8px; font-weight:600;">${f.dest}</td>
                  <td style="padding:4px 8px;">${f.mes}</td>
                  <td class="finance-num" style="padding:4px 8px; text-align:right;">${fmt(f.monto)}</td>
                  <td style="padding:4px 8px;">${f.vence}</td>
                  <td style="padding:4px 8px;"><span class="${claseEstado[f.estado]||'pill'}" style="${estadoConfig[f.estado]?.style||''}">${estadoConfig[f.estado]?.label||f.estado}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </td>
        </tr>` : '';
        return `<tr>
          <td style="font-weight:600;">${getMesLabel(mes)}</td>
          <td class="finance-num" style="text-align:right;color:var(--success);">${efectivo>0?fmt(efectivo):'—'}</td>
          <td class="finance-num" style="text-align:right;color:var(--accent2);">${banco>0?fmt(banco):'—'}</td>
          <td class="finance-num" style="text-align:right;font-weight:700;">${fmt(total)}</td>
          <td class="finance-num" style="text-align:right;color:var(--danger);">${egresos>0?'− '+fmt(egresos):'—'}</td>
          <td class="finance-num" style="text-align:right;font-weight:700;color:${neto>=0?'var(--accent2)':'var(--danger)'};">${fmt(neto)}</td>
          <td class="finance-num" style="text-align:right;">${celdaPendiente}</td>
        </tr>${filaDetalle}`;
      }).join('');
}

// Mostrar/ocultar el detalle de facturas pendientes de un mes en Resumen mensual
function toggleDetallePendienteMes(mes) {
  const fila = document.getElementById(`fin-mensual-det-${mes}`);
  const flecha = document.getElementById(`fin-mensual-det-${mes}-flecha`);
  if (!fila) return;
  const abierta = fila.style.display !== 'none';
  fila.style.display = abierta ? 'none' : '';
  if (flecha) flecha.textContent = abierta ? '▾' : '▴';
}

// ══════════════════════════════════════
//  CAJA CHICA
// ══════════════════════════════════════

function saldoCajaChica(consultorio) {
  return DB.cajaChica
    .filter(m => m.consultorio === consultorio)
    .reduce((s, m) => m.tipo === 'Ingreso' ? s + m.monto : s - m.monto, 0);
}

// Id de tbody seguro para un consultorio (puede tener espacios/acentos/etc.)
function _slugConsultorio(nombre) {
  return String(nombre || '').replace(/[^a-zA-Z0-9]/g, '_');
}

function renderCajaChica() {
  // Una tarjeta por cada consultorio ACTIVO (Configuración → Consultorios): si se
  // crea uno nuevo (o "Extra"), aparece acá solo, sin tocar HTML ni esta función.
  const consultorios = getConsultoriosList();

  // ── Stats: saldo + desglose por consultorio ──────────────────────────────
  const statsEl = document.getElementById('cajachica-stats');
  if (statsEl) {
    statsEl.innerHTML = consultorios.map(cons => {
      const saldo = saldoCajaChica(cons);
      const ing = DB.cajaChica.filter(m => m.consultorio === cons && m.tipo === 'Ingreso');
      const copagos   = ing.filter(m => m.origen === 'Copago').reduce((s,m)=>s+m.monto,0);
      const efectivo  = ing.filter(m => m.origen === 'Efectivo').reduce((s,m)=>s+m.monto,0);
      const egresos   = DB.cajaChica.filter(m => m.consultorio === cons && m.tipo === 'Egreso').reduce((s,m)=>s+m.monto,0);
      const color = cons === 'Palpa' ? 'var(--palpa)' : cons === 'Haedo' ? 'var(--haedo)' : 'var(--accent2)';
      return `<div class="stat-card" style="border-left:3px solid ${color};">
        <div class="stat-label">Saldo caja chica ${cons}</div>
        <div class="stat-value finance-num" style="color:${saldo>=0?'var(--success)':'var(--danger)'};">${fmt(saldo)}</div>
        <div class="stat-sub">
          ${efectivo>0?`💵 Part: ${fmt(efectivo)} · `:''}
          ${copagos>0?`Copagos: ${fmt(copagos)} · `:''}
          Egresos: ${fmt(egresos)}
        </div>
      </div>`;
    }).join('');
  }

  // ── Una tarjeta con tabla por consultorio ────────────────────────────────
  const cardsEl = document.getElementById('cajachica-cards-container');
  if (cardsEl) {
    cardsEl.innerHTML = consultorios.map(cons => {
      const slug = _slugConsultorio(cons);
      const pillClass = cons === 'Palpa' ? 'pill-palpa' : cons === 'Haedo' ? 'pill-haedo' : 'pill-os';
      return `<div class="card" style="flex:1 1 420px; min-width:340px;">
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="pill ${pillClass}">${cons}</span>
            <span class="card-title">Caja chica ${cons}</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="openModalCajaChica('${cons.replace(/'/g,"\\'")}')">+ Movimiento</button>
        </div>
        <div class="card-body" style="padding:0; max-height:420px; overflow-y:auto;">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Origen</th><th>Monto</th><th>Saldo</th><th></th></tr></thead>
            <tbody id="cajachica-tbody-${slug}"></tbody>
          </table>
        </div>
      </div>`;
    }).join('');
  }
  consultorios.forEach(cons => renderTablaCajaChica(cons, `cajachica-tbody-${_slugConsultorio(cons)}`));

  // Rescate: movimientos con un consultorio que NO está en la lista de consultorios
  // activos (vacío, borrado, mal tipeado, o dado de baja) quedarían invisibles en
  // las tablas de arriba. Los mostramos para reasignar a un consultorio válido.
  const huerfanos = DB.cajaChica.filter(m => !consultorios.includes(m.consultorio));
  let avisoEl = document.getElementById('cajachica-huerfanos');
  if (!avisoEl) {
    const cont = document.getElementById('cajachica-cards-container');
    if (cont) {
      avisoEl = document.createElement('div');
      avisoEl.id = 'cajachica-huerfanos';
      avisoEl.style.cssText = 'margin-bottom:16px;';
      cont.parentNode.insertBefore(avisoEl, cont);
    }
  }
  if (avisoEl) {
    if (huerfanos.length === 0) {
      avisoEl.innerHTML = '';
    } else {
      const botones = consultorios.map(cons =>
        `<button class="btn btn-sm" style="background:var(--accent2);color:#fff;" onclick="asignarConsultorioCaja(%ID%,'${cons.replace(/'/g,"\\'")}')">→ ${cons}</button>`
      ).join(' ');
      avisoEl.innerHTML = `
        <div class="card" style="border:1px solid var(--danger); background:var(--danger-light, #fff5f5);">
          <div class="card-header"><span class="card-title" style="color:var(--danger);">⚠️ Movimientos sin consultorio asignado (${huerfanos.length})</span></div>
          <div class="card-body">
            <div style="font-size:13px; color:var(--text2); margin-bottom:10px;">Estos movimientos no tienen un consultorio activo válido, por eso no aparecían en las tablas. Asignalos a su consultorio:</div>
            ${huerfanos.map(m => `
              <div style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap;">
                <span style="flex:1; font-size:13px;">${m.fecha} · ${m.tipo} · ${m.concepto} · <b>${fmt(m.monto)}</b>${m.consultorio?` · <span style="color:var(--text3);">(actual: ${m.consultorio})</span>`:''}</span>
                ${botones.replace(/%ID%/g, m.id)}
              </div>`).join('')}
          </div>
        </div>`;
    }
  }
}

// Reasigna un movimiento de caja huérfano a un consultorio válido
function asignarConsultorioCaja(id, consultorio) {
  const m = DB.cajaChica.find(x => x.id === id);
  if (!m) return;
  m.consultorio = consultorio;
  marcarCambios('cajaChica');
  renderCajaChica();
  showToast(`✓ Movimiento asignado a ${consultorio}`);
}

function renderTablaCajaChica(consultorio, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const movs = DB.cajaChica
    .filter(m => m.consultorio === consultorio)
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  // Calcular saldo corriente
  let saldo = 0;
  const conSaldo = [...movs].reverse().map(m => {
    saldo += m.tipo === 'Ingreso' ? m.monto : -m.monto;
    return { ...m, saldoAcum: saldo };
  }).reverse();

  const origenColors = {
    'Copago':   'background:var(--success-light);color:var(--success);',
    'Efectivo': 'background:#dcfce7;color:#16a34a;',
    'Retiro':   'background:var(--danger-light);color:var(--danger);',
    'Gasto':    'background:var(--warn-light);color:var(--warn);',
    'Manual':   'background:var(--surface2);color:var(--text3);',
  };

  tbody.innerHTML = conSaldo.length === 0
    ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);">Sin movimientos</td></tr>`
    : conSaldo.map(m => `
      <tr>
        <td>${m.fecha}</td>
        <td style="font-size:13px;">${m.concepto}</td>
        <td><span class="pill ${m.tipo==='Ingreso'?'pill-paid':'pill-overdue'}">${m.tipo}</span></td>
        <td><span class="pill" style="${origenColors[m.origen]||''}">${m.origen}</span></td>
        <td class="finance-num" style="font-weight:700; color:${m.tipo==='Ingreso'?'var(--success)':'var(--danger)'};">
          ${m.tipo==='Ingreso'?'+':'-'}${fmt(m.monto)}
        </td>
        <td class="finance-num" style="font-weight:600; color:${m.saldoAcum>=0?'var(--text)':'var(--danger)'};">
          ${fmt(m.saldoAcum)}
        </td>
        <td style="white-space:nowrap; text-align:right;">
          <button class="btn-icon" title="Editar" onclick="editarCajaChica(${m.id})" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;">✏️</button>
          <button class="btn-icon" title="Eliminar" onclick="eliminarCajaChica(${m.id})" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;">🗑️</button>
        </td>
      </tr>`).join('');
}

let _editCajaId = null;  // id del movimiento en edición (null = alta nueva)

function openModalCajaChica(consultorio) {
  _editCajaId = null;
  document.getElementById('cajachica-modal-consultorio').textContent = consultorio;
  document.getElementById('cc-fecha').value = hoyISO();
  document.getElementById('cc-consultorio').value = consultorio;
  document.getElementById('cc-origen').value = 'Manual';
  document.getElementById('cc-tipo').value = 'Ingreso';
  document.getElementById('cc-monto').value = '';
  document.getElementById('cc-concepto').value = '';
  openModal('modal-cajachica');
}

// Abrir el modal cargado con los datos de un movimiento existente
function editarCajaChica(id) {
  const m = DB.cajaChica.find(x => x.id === id);
  if (!m) { showToast('⚠️ No se encontró el movimiento'); return; }
  if (m.origen && m.origen !== 'Manual') {
    if (!confirm(`Este movimiento se generó automáticamente (${m.origen}) a partir de una atención.\n\nEditarlo cambia solo la caja, no la atención que lo originó. ¿Continuar?`)) return;
  }
  _editCajaId = id;
  document.getElementById('cajachica-modal-consultorio').textContent = m.consultorio;
  document.getElementById('cc-fecha').value = m.fecha;
  document.getElementById('cc-consultorio').value = m.consultorio;
  document.getElementById('cc-origen').value = m.origen || 'Manual';
  document.getElementById('cc-tipo').value = m.tipo;
  document.getElementById('cc-monto').value = m.monto;
  document.getElementById('cc-concepto').value = m.concepto;
  openModal('modal-cajachica');
}

function eliminarCajaChica(id) {
  const m = DB.cajaChica.find(x => x.id === id);
  if (!m) return;
  const aviso = (m.origen && m.origen !== 'Manual')
    ? `\n\n⚠️ Este movimiento se generó automáticamente (${m.origen}). Eliminarlo no modifica la atención que lo originó.`
    : '';
  if (!confirm(`¿Eliminar este movimiento?\n\n${m.tipo} · ${m.concepto} · ${fmt(m.monto)}${aviso}`)) return;
  DB.cajaChica = DB.cajaChica.filter(x => x.id !== id);
  marcarCambios('cajaChica');
  renderCajaChica();
  showToast('✓ Movimiento eliminado');
}

function guardarMovCajaChica() {
  const tipo = document.getElementById('cc-tipo').value;
  const fecha = document.getElementById('cc-fecha').value;
  const concepto = document.getElementById('cc-concepto').value.trim();
  const monto = parseFloat(document.getElementById('cc-monto').value) || 0;
  const consultorio = document.getElementById('cc-consultorio').value;
  if (!concepto) { showToast('⚠️ Completá el concepto'); return; }
  const errMontoCC = validarMonto(monto, 'El monto');
  if (errMontoCC) { showToast('⚠️ ' + errMontoCC); return; }

  if (_editCajaId != null) {
    // Editar movimiento existente (conserva su origen)
    const m = DB.cajaChica.find(x => x.id === _editCajaId);
    if (m) { m.tipo = tipo; m.fecha = fecha; m.concepto = concepto; m.monto = monto; m.consultorio = consultorio; }
    _editCajaId = null;
    marcarCambios('cajaChica');
    closeModal('modal-cajachica');
    renderCajaChica();
    showToast(`✓ Movimiento actualizado`);
    return;
  }

  DB.cajaChica.push({ id: DB.nextId++, fecha, consultorio, tipo, concepto, origen: 'Manual', monto }); marcarCambios('cajaChica');
  closeModal('modal-cajachica');
  renderCajaChica();
  showToast(`✓ ${tipo} de ${fmt(monto)} registrado en caja chica ${consultorio}`);
}
