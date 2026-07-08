// ═══════════════════════════════════════════════════════════════════════════
//  UI — CONFIGURACIÓN: valores globales, nomenclador (prestaciones),
//  importación de contratos (Excel/PDF/manual).
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. Comportamiento idéntico (código movido
//  tal cual). Se carga antes de persistencia.js. Usa helpers globales (DB, fmt,
//  fmtN, marcarCambios, poblarSelectoresOS, populateMedicoSelects, esConsulta, …).
//  El reprecio (actualizarPreciosPrestaciones) vive en js/persistencia.js.
// ═══════════════════════════════════════════════════════════════════════════

function renderConfiguracion() {
  populateMedicoSelects();
  poblarSelectoresOS();
  poblarSelectoresConsultorio();
  // Médicos tabla
  const tbody = document.getElementById('cfg-medicos-tbody');
  if (tbody) tbody.innerHTML = DB.medicos.map(m => `
    <tr>
      <td style="font-weight:600;">${m.nombre}</td>
      <td>${m.especialidad}</td>
      <td><span class="pill ${m.consultorio==='Palpa'?'pill-palpa':m.consultorio==='Haedo'?'pill-haedo':'pill-os'}">${m.consultorio}</span></td>
      <td class="finance-num" style="font-weight:600;">${fmt(DB.config.honorarioOS)} / paciente OS</td>
      <td class="finance-num" style="font-weight:600;">${fmt((DB.config.valorConsultaParticular/2))} / consulta (50%)</td>
      <td>${m.formaPago}</td>
      <td>${m.diaPago}</td>
      <td style="font-family:monospace; font-size:12px;">${m.cuit}</td>
      <td><div style="display:flex; gap:4px;">
        <button class="btn btn-secondary btn-sm" onclick="editarMedico(${m.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarMedico(${m.id})">Borrar</button>
      </div></td>
    </tr>`).join('');

  // Prestaciones tabla
  const ptbody = document.getElementById('cfg-prestaciones-tbody');
  if (ptbody) {
    const filterOS = document.getElementById('cfg-prest-os-filter')?.value || '';
    // Ordenar por OS y, dentro de cada OS, por CÓDIGO (numérico-aware: '20' antes que '100',
    // y tolera códigos alfanuméricos). Sin filtro, quedan agrupadas por OS.
    const filtered = (filterOS ? DB.prestaciones.filter(p => p.os === filterOS) : [...DB.prestaciones])
      .sort((a, b) =>
        String(a.os || '').localeCompare(String(b.os || '')) ||
        String(a.codigo || '').localeCompare(String(b.codigo || ''), undefined, { numeric: true })
      );
    ptbody.innerHTML = filtered.map(p => {
      // exentaPrestacion (fuente única): override p.exenta si existe, si no default de la OS
      const esExenta = exentaPrestacion(p);
      // categoriaPrestacion (fuente única): override p.categoria o detección por descripción
      const cat = categoriaPrestacion(p);
      const catCfg = {
        consulta: { label: '🩺 Consulta', style: 'background:var(--accent2-light);color:var(--accent2);' },
        estudio:  { label: '🔬 Estudio',  style: 'background:#ede8ff;color:#5a3a99;' },
        practica: { label: '⚕️ Práctica', style: 'background:var(--warn-light);color:var(--warn);' },
      }[cat];
      return `<tr>
        <td style="font-family:monospace; font-size:11px; font-weight:600;">${p.codigo}</td>
        <td style="font-size:12px;">${p.desc}</td>
        <td><span class="pill pill-os" style="font-size:10px;">${p.os}</span></td>
        <td>
          <button onclick="togglePrestCategoria(${p.id})" class="pill" title="Clic para cambiar la categoría"
            style="border:none;cursor:pointer;font-size:10px;${catCfg.style}">${catCfg.label}</button>
        </td>
        <td class="finance-num" style="font-weight:600;">${p.valOS > 0 ? fmt(p.valOS) : '—'}</td>
        <td class="finance-num">${p.valPart > 0 ? fmt(p.valPart) : '—'}</td>
        <td style="font-size:11px;">${p.nomenclador}</td>
        <td style="font-size:11px; color:var(--text3);">${p.vigencia || '—'}</td>
        <td>
          <button onclick="togglePrestIVA(${p.id})" class="pill" style="border:none;cursor:pointer;${esExenta?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}">
            ${esExenta ? '✓ Exenta' : (p.os === 'CEMEPLA' ? '⚡ 21%' : '⚡ 10.5%')}
          </button>
        </td>
        <td><button class="btn btn-secondary btn-sm" onclick="editarPrestacion(${p.id})">Editar</button></td>
      </tr>`;
    }).join('');
  }

  // Contratos
  const ctbody = document.getElementById('cfg-contratos-tbody');
  if (ctbody) {
    if (!DB.contratos.length) {
      ctbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--text3);">Sin contratos registrados — subí un archivo arriba para importar</td></tr>';
    } else {
      ctbody.innerHTML = DB.contratos.map(c => {
        const prestCount = DB.prestaciones.filter(p => p.os === c.os).length;
        return `<tr>
          <td style="font-weight:600;">${c.os}</td>
          <td style="font-size:12px; color:var(--text3);">${c.vigencia || '—'}${c.obs ? `<div style="font-size:10px; color:var(--success);">${c.obs}</div>` : ''}</td>
          <td style="text-align:center; font-weight:700;">${prestCount}</td>
          <td><span class="pill ${c.estado==='Vigente'?'pill-paid':c.estado==='Vencido'?'pill-overdue':'pill-pending'}">${c.estado}</span></td>
          <td>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-secondary btn-sm" onclick="verPrestacionesOS('${c.os}')">Ver prestaciones</button>
              <button class="btn btn-danger btn-sm" onclick="eliminarContrato(${c.id})">✕</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }
  }

  // Consultorios tabla
  const cotbody = document.getElementById('cfg-consultorios-tbody');
  if (cotbody) {
    cotbody.innerHTML = (DB.consultorios || []).map(c => {
      const activo = c.estado !== 'Inactiva';
      return `<tr>
        <td style="font-weight:600;">${c.nombre}</td>
        <td>
          <button onclick="toggleConsultorioEstado(${c.id})" class="pill" style="border:none;cursor:pointer;${activo?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}">
            ${activo ? '✓ Activo' : '⏸ Inactivo'}
          </button>
        </td>
        <td><div style="display:flex; gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="editarConsultorio(${c.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarConsultorio(${c.id})">Borrar</button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="3" style="text-align:center; padding:24px; color:var(--text3);">Sin consultorios cargados</td></tr>';
  }
}

function switchConfigTab(tab, el) {
  document.querySelectorAll('#section-configuracion .tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['medicos','prestaciones','contratos','valores','consultorio'].forEach(t => {
    const el2 = document.getElementById(`cfg-${t}`);
    if (el2) el2.style.display = t === tab ? '' : 'none';
  });
}

// ── ABM de Consultorios (base única: nombre + activo/inactivo) ──────────────
function nuevoConsultorio() {
  document.getElementById('co-edit-id').value = '';
  document.getElementById('co-nombre').value = '';
  openModal('modal-consultorio');
}

function editarConsultorio(id) {
  const c = (DB.consultorios || []).find(x => x.id === id);
  if (!c) return;
  document.getElementById('co-edit-id').value = id;
  document.getElementById('co-nombre').value = c.nombre || '';
  openModal('modal-consultorio');
}

function guardarConsultorio() {
  const editId = document.getElementById('co-edit-id').value;
  const nombre = document.getElementById('co-nombre').value.trim();
  if (!nombre) { showToast('⚠️ Ingresá el nombre del consultorio'); return; }
  if (!DB.consultorios) DB.consultorios = [];

  if (editId) {
    // ── Edición: renombrar y propagar el nombre nuevo a los datos existentes ──
    const c = DB.consultorios.find(x => x.id === parseInt(editId));
    if (!c) return;
    const nombreViejo = c.nombre;
    if (DB.consultorios.some(x => x.id !== c.id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
      showToast('⚠️ Ya existe un consultorio con ese nombre'); return;
    }
    c.nombre = nombre;
    marcarCambios('consultorios');
    if (nombreViejo !== nombre) {
      // Propagar el nombre nuevo a lo que apuntaba al viejo. Cada colección se marca
      // como cambiada SOLO si efectivamente cambió algo (antes se sobre-marcaban todas).
      const propagar = (arr, col) => {
        let n = 0;
        (arr || []).forEach(r => { if (r.consultorio === nombreViejo) { r.consultorio = nombre; n++; } });
        if (n > 0) marcarCambios(col);
      };
      propagar(DB.registros, 'registros');
      propagar(DB.cajaChica, 'cajaChica');
      propagar(DB.movimientos, 'movimientos');
      propagar(DB.derivaciones, 'derivaciones');
    }
    closeModal('modal-consultorio');
    renderConfiguracion();
    showToast(`✓ Consultorio actualizado a "${nombre}"`);
    return;
  }

  // ── Alta ──
  if (DB.consultorios.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) {
    showToast('⚠️ Ya existe un consultorio con ese nombre'); return;
  }
  DB.consultorios.push({ id: DB.nextId++, nombre, estado: 'Activa' });
  marcarCambios('consultorios');
  closeModal('modal-consultorio');
  renderConfiguracion();
  showToast(`✓ Consultorio "${nombre}" creado`);
}

function toggleConsultorioEstado(id) {
  const c = (DB.consultorios || []).find(x => x.id === id);
  if (!c) return;
  c.estado = c.estado === 'Inactiva' ? 'Activa' : 'Inactiva';
  marcarCambios('consultorios');
  renderConfiguracion();
  showToast(`✓ ${c.nombre} → ${c.estado === 'Inactiva' ? 'Inactivo' : 'Activo'}`);
}

function eliminarConsultorio(id) {
  const c = (DB.consultorios || []).find(x => x.id === id);
  if (!c) return;
  const atenciones   = DB.registros.filter(r => r.consultorio === c.nombre).length;
  const cajaChica     = DB.cajaChica.filter(m => m.consultorio === c.nombre).length;
  const movimientos   = DB.movimientos.filter(m => m.consultorio === c.nombre).length;

  let msg = `¿Eliminar el consultorio "${c.nombre}"?`;
  const avisos = [];
  if (atenciones > 0)  avisos.push(`${atenciones} atención(es) cargada(s) en este consultorio`);
  if (cajaChica > 0)   avisos.push(`${cajaChica} movimiento(s) de caja chica`);
  if (movimientos > 0) avisos.push(`${movimientos} movimiento(s) de caja`);
  if (avisos.length > 0) {
    msg += `\n\n⚠️ Atención: hay datos asociados:\n• ${avisos.join('\n• ')}\n\nLos registros históricos NO se borran (para no perder datos ya cargados). Solo se quita el consultorio de la lista para elegir en atenciones nuevas.\n\nSi solo querés dejar de usarlo (pero conservarlo para referencia histórica), mejor tocá "Activo/Inactivo" en vez de borrar.\n\n¿Continuar?`;
  }
  if (!confirm(msg)) return;

  DB.consultorios = DB.consultorios.filter(x => x.id !== id);
  marcarCambios('consultorios');
  renderConfiguracion();
  showToast('✓ Consultorio eliminado de la lista');
}

function togglePrestIVA(id) {
  const p = DB.prestaciones.find(x => x.id === id);
  if (!p) return;
  const current = exentaPrestacion(p);
  p.exenta = !current;
  marcarCambios('prestaciones');
  renderConfiguracion();
  showToast(`✓ ${p.desc} → ${p.exenta ? 'Exenta' : 'Gravada'}`);
}

// Ciclar la categoría de una prestación: consulta → estudio → práctica → consulta.
// Guarda el override p.categoria (categoriaPrestacion lo respeta en toda la app).
function togglePrestCategoria(id) {
  const p = DB.prestaciones.find(x => x.id === id);
  if (!p) return;
  const orden = ['consulta', 'estudio', 'practica'];
  const actual = categoriaPrestacion(p);
  p.categoria = orden[(orden.indexOf(actual) + 1) % orden.length];
  marcarCambios('prestaciones');
  renderConfiguracion();
  const labels = { consulta: '🩺 Consulta', estudio: '🔬 Estudio', practica: '⚕️ Práctica' };
  showToast(`✓ ${p.desc} → ${labels[p.categoria]}`);
}

function editarPrestacion(id) {
  const p = DB.prestaciones.find(x => x.id === id);
  if (!p) return;
  // Use new dedicated edit modal
  document.getElementById('ep-id').value = id;
  document.getElementById('ep-os').value = p.os;
  document.getElementById('ep-codigo').value = p.codigo;
  document.getElementById('ep-desc').value = p.desc;
  document.getElementById('ep-valOS').value = p.valOS;
  document.getElementById('ep-valPart').value = p.valPart;
  document.getElementById('ep-nomenclador').value = p.nomenclador || '';
  document.getElementById('ep-vigencia').value = p.vigencia || '';
  // IVA: exentaPrestacion (fuente única) — override p.exenta o default por OS; CEMEPLA nunca exenta.
  const esExenta = exentaPrestacion(p);
  // Ajustar la etiqueta del % según la OS (CEMEPLA 21%, resto 10.5%)
  const selIVA = document.getElementById('ep-exenta');
  const optGrav = selIVA?.querySelector('option[value="false"]');
  if (optGrav) optGrav.textContent = p.os === 'CEMEPLA' ? '⚡ Gravada 21%' : '⚡ Gravada 10.5%';
  selIVA.value = esExenta ? 'true' : 'false';
  openModal('modal-editar-prestacion');
}

function guardarEdicionPrestacion() {
  const id = parseInt(document.getElementById('ep-id').value);
  const p  = DB.prestaciones.find(x => x.id === id);
  if (!p) return;
  p.codigo      = document.getElementById('ep-codigo').value.trim();
  p.desc        = document.getElementById('ep-desc').value.trim();
  p.valOS       = parseFloat(document.getElementById('ep-valOS').value) || 0;
  p.valPart     = parseFloat(document.getElementById('ep-valPart').value) || 0;
  p.nomenclador = document.getElementById('ep-nomenclador').value.trim();
  p.vigencia    = document.getElementById('ep-vigencia').value.trim();
  p.exenta      = document.getElementById('ep-exenta').value === 'true';
  marcarCambios('prestaciones');
  closeModal('modal-editar-prestacion');
  renderConfiguracion();
  showToast(`✓ Prestación actualizada — ${p.os} · ${p.desc.slice(0,30)}`);
}

function eliminarPrestacion(id) {
  if (!confirm('¿Eliminar esta prestación?')) return;
  DB.prestaciones = DB.prestaciones.filter(x => x.id !== id); marcarCambios('prestaciones');
  closeModal('modal-editar-prestacion');
  renderConfiguracion();
  showToast('✓ Prestación eliminada');
}

// ── Importar contrato desde archivo ──────────────────────────────────────────

// Parsea un monto de texto preservando hasta 2 decimales, detectando el formato:
//  - Argentino "1.234.567,89"  → punto = miles, coma = decimal
//  - Inglés    "1234567.89"    → punto = decimal
//  - Entero    "1234567"       → sin decimales
// Devuelve un número redondeado a 2 decimales, o 0 si no es válido.
function parseMonto(txt) {
  if (txt == null) return 0;
  let s = String(txt).trim().replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return 0;
  const tieneComa = s.includes(',');
  const tienePunto = s.includes('.');
  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // formato argentino: 1.234,56 → quitar puntos (miles), coma = decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // formato inglés con miles: 1,234.56 → quitar comas (miles)
      s = s.replace(/,/g, '');
    }
  } else if (tieneComa) {
    // solo coma → es el decimal: 1234,56
    s = s.replace(',', '.');
  } else if (tienePunto) {
    // solo punto: puede ser decimal (2.61) o miles (146.535)
    const partes = s.split('.');
    if (partes.length === 2 && partes[1].length <= 2) {
      // un solo punto con 1-2 dígitos finales → decimal, dejar como está
    } else {
      // varios puntos, o grupo final de 3 dígitos → separador de miles
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return Math.round(n * 100) / 100;  // máximo 2 decimales
}

function procesarArchivoContrato(input) {
  const file = input.files[0];
  if (!file) return;
  const nameEl = document.getElementById('contrato-file-name');
  if (nameEl) nameEl.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;

  const os       = document.getElementById('contrato-os-sel').value;
  const vigencia = document.getElementById('contrato-vigencia').value;
  if (!os)       { showToast('⚠️ Seleccioná la Obra Social primero'); input.value=''; return; }
  if (!vigencia) { showToast('⚠️ Seleccioná la vigencia del contrato'); input.value=''; return; }

  const ext = file.name.split('.').pop().toLowerCase();

  // Show loading
  const panel = document.getElementById('contrato-preview-panel');
  const tbody = document.getElementById('contrato-preview-tbody');
  const stats = document.getElementById('contrato-preview-stats');
  const title = document.getElementById('contrato-preview-title');
  if (title) title.textContent = `Vista previa — ${os} · ${vigencia}`;

  if (ext === 'csv' || ext === 'txt') {
    const reader = new FileReader();
    reader.onload = e => _parsearTextoContrato(e.target.result, os, vigencia, ',');
    reader.readAsText(file);
  } else if (ext === 'xlsx' || ext === 'xls') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        if (typeof XLSX !== 'undefined') {
          const wb = XLSX.read(e.target.result, { type:'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // Leer celda por celda (NO convertir a CSV: la coma decimal rompería las columnas)
          const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
          _parsearFilasContrato(filas, os, vigencia);
        } else {
          showToast('⚠️ Para Excel usá CSV. Exportá el archivo como .csv desde Excel y volvé a subir.');
        }
      } catch(err) {
        console.error('Error leyendo Excel:', err);
        showToast('⚠️ No se pudo leer el Excel. Exportalo como CSV e intentá de nuevo.');
      }
    };
    reader.readAsBinaryString(file);
  } else if (ext === 'pdf') {
    // PDF: prompt to use the AI extraction approach
    _mostrarPDFManual(os, vigencia, file.name);
  } else {
    const reader = new FileReader();
    reader.onload = e => _parsearTextoContrato(e.target.result, os, vigencia, '\t');
    reader.readAsText(file);
  }
}

// Detecta código / descripción / valor a partir de un array de celdas (ya separadas).
// Usa parseMonto para preservar 2 decimales. Devuelve {codigo, desc, valor} o null.
function _detectarFilaContrato(cols) {
  cols = cols.map(c => String(c == null ? '' : c).trim().replace(/^["']|["']$/g, ''));
  if (cols.length < 2) return null;
  let codigo = '', desc = '', valor = 0;
  if (cols.length >= 3) {
    const firstIsCode = /^\d/.test(cols[0]) && cols[0].length < 20;
    if (firstIsCode) {
      codigo = cols[0].replace(/\.0+$/, '');  // 20103.0 → 20103
      desc   = cols[1];
      for (let i = 2; i < cols.length; i++) { const v = parseMonto(cols[i]); if (v > 0) { valor = v; break; } }
    } else {
      desc = cols[0];
      for (let i = 1; i < cols.length; i++) { const v = parseMonto(cols[i]); if (v > 0) { valor = v; break; } }
    }
  } else if (cols.length === 2) {
    desc = cols[0];
    valor = parseMonto(cols[1]);
  }
  if (!desc || valor <= 0) return null;
  if (/^(código|codigo|descripcion|descripción|prestacion|valor|código prestador|practica|vigencia|realizadas)/i.test(desc)) return null;
  return { codigo: codigo || '—', desc, valor };
}

// Señas de cirugía/procedimiento para la heurística de "duda" del preview: si una fila
// cayó en 'practica' por descarte (no es consulta, no matchea estudios) y TAMPOCO tiene
// ninguna de estas señas, se marca en amarillo para que el usuario confirme la categoría.
// Es solo un aviso visual del import — la clasificación real es categoriaDesc (calculos.js).
const _CIRUGIA_HINTS = ['cirugia','catarata','faco','lasik','excimer','vitrectomia','iridotomia',
  'pterigion','chalazion','blefaro','ptosis','entropion','inyeccion','intravitre','capsulotomia',
  'laser','sutura','dacrio','estrabismo','trasplante','glaucoma','valvula','implante','sonda',
  'exeresis','biopsia','crosslinking','queratoplastia','lente'];
function _categoriaDudosa(desc, categoria) {
  if (categoria !== 'practica') return false;   // consulta/estudio: detección positiva, sin duda
  const d = _normCat(desc);
  return !_CIRUGIA_HINTS.some(h => d.includes(h));
}

// Parsea filas de Excel (cada fila = array de celdas). No pasa por CSV, así la coma
// decimal de los valores ($285322,41) no se confunde con separador de columnas.
// Cuenta como "descartada sospechosa" una fila que PARECÍA datos (2+ celdas con
// contenido) pero no se reconoció (código/desc/valor). Así el usuario ve si el parser
// se comió filas en silencio, en vez de descubrirlo al facturar.
function _noVaciasCount(cols) {
  return cols.filter(c => String(c == null ? '' : c).trim() !== '').length;
}

function _parsearFilasContrato(filas, os, vigencia) {
  const exentaOS = getExentaForOS(os);
  const rows = [];
  let descartadas = 0;
  filas.forEach(cols => {
    if (!Array.isArray(cols)) return;
    const det = _detectarFilaContrato(cols);
    if (det) rows.push({ ...det, exenta: exentaOS, incluir: true, categoria: categoriaDesc(det.desc) });
    else if (_noVaciasCount(cols) >= 2) descartadas++;   // parecía datos y no se reconoció
  });
  _mostrarPreviewContrato(rows, os, vigencia, descartadas);
}

function _parsearTextoContrato(texto, os, vigencia, sep) {
  const exentaOS = getExentaForOS(os);
  const lines = texto.split('\n').filter(l => l.trim());
  const rows = [];
  let descartadas = 0;
  lines.forEach(line => {
    const cols = line.split(sep);
    const det = _detectarFilaContrato(cols);
    if (det) rows.push({ ...det, exenta: exentaOS, incluir: true, categoria: categoriaDesc(det.desc) });
    else if (_noVaciasCount(cols) >= 2) descartadas++;
  });
  _mostrarPreviewContrato(rows, os, vigencia, descartadas);
}

function _mostrarPreviewContrato(rows, os, vigencia, descartadas = 0) {
  const panel = document.getElementById('contrato-preview-panel');
  const tbody = document.getElementById('contrato-preview-tbody');
  const stats = document.getElementById('contrato-preview-stats');

  // Store in window for confirmar
  window._contratoPreview = { rows, os, vigencia, descartadas };

  tbody.innerHTML = rows.map((r, i) => {
    const dudosa = _categoriaDudosa(r.desc, r.categoria);
    return `
    <tr>
      <td style="font-family:monospace; font-size:11px;">${r.codigo}</td>
      <td style="font-size:12px;">${r.desc}</td>
      <td style="font-family:monospace; text-align:right; font-weight:700;">${fmt(r.valor)}</td>
      <td>
        <select onchange="window._contratoPreview.rows[${i}].categoria = this.value"
          title="${dudosa ? 'No pude clasificarla con seguridad — confirmá dónde va' : 'Categoría detectada automáticamente'}"
          style="font-size:11px; padding:3px 6px; border-radius:6px; ${dudosa ? 'border:2px solid var(--warn); background:var(--warn-light);' : 'border:1px solid var(--border2);'}">
          <option value="consulta" ${r.categoria==='consulta'?'selected':''}>🩺 Consulta</option>
          <option value="estudio" ${r.categoria==='estudio'?'selected':''}>🔬 Estudio</option>
          <option value="practica" ${r.categoria==='practica'?'selected':''}>⚕️ Práctica</option>
        </select>${dudosa ? ' <span title="Revisar categoría">⚠️</span>' : ''}
      </td>
      <td>
        <button onclick="toggleContratoRowIVA(${i})" class="pill" style="border:none;cursor:pointer;${r.exenta?'background:var(--success-light);color:var(--success);':'background:var(--warn-light);color:var(--warn);'}font-size:10px;" id="cp-iva-${i}">
          ${getIVALabel(os, r.exenta)}
        </button>
      </td>
      <td style="text-align:center;">
        <input type="checkbox" checked onchange="window._contratoPreview.rows[${i}].incluir = this.checked">
      </td>
    </tr>`;
  }).join('');

  if (stats) {
    const nCon = rows.filter(r => r.categoria === 'consulta').length;
    const nEst = rows.filter(r => r.categoria === 'estudio').length;
    const nPra = rows.filter(r => r.categoria === 'practica').length;
    const nDud = rows.filter(r => _categoriaDudosa(r.desc, r.categoria)).length;
    // Códigos repetidos DENTRO del archivo (aviso temprano)
    const conteoCod = {};
    rows.forEach(r => { const k = String(r.codigo||'').trim(); if (k && k !== '—') conteoCod[k] = (conteoCod[k]||0)+1; });
    const dupCods = Object.keys(conteoCod).filter(k => conteoCod[k] > 1);
    stats.innerHTML = `${rows.length} filas reconocidas · 🩺 ${nCon} consultas · 🔬 ${nEst} estudios · ⚕️ ${nPra} prácticas — OS: ${os} · Vigencia: ${vigencia}`
      + (descartadas > 0 ? `<br><span style="color:var(--danger); font-weight:700;">⚠️ Se descartaron ${descartadas} fila${descartadas>1?'s':''} que parecían datos (sin código/valor válido). Revisá el archivo: puede que falten códigos.</span>` : '')
      + (dupCods.length > 0 ? `<br><span style="color:var(--danger); font-weight:700;">⚠️ ${dupCods.length} código(s) REPETIDO(S) en el archivo: ${dupCods.slice(0,8).join(', ')}${dupCods.length>8?'…':''}</span>` : '')
      + (nDud > 0 ? `<br><span style="color:var(--warn); font-weight:700;">⚠️ ${nDud} fila${nDud>1?'s':''} con categoría dudosa (en amarillo): confirmá dónde va${nDud>1?'n':''} antes de importar.</span>` : '');
  }
  if (panel) panel.style.display = '';
}

function toggleContratoRowIVA(i) {
  if (!window._contratoPreview) return;
  const r = window._contratoPreview.rows[i];
  r.exenta = !r.exenta;
  const btn = document.getElementById(`cp-iva-${i}`);
  if (btn) {
    btn.textContent   = getIVALabel(window._contratoPreview.os, r.exenta);   // CEMEPLA → 21%
    btn.style.background = r.exenta ? 'var(--success-light)' : 'var(--warn-light)';
    btn.style.color   = r.exenta ? 'var(--success)' : 'var(--warn)';
  }
}

async function confirmarImportContrato() {
  const data = window._contratoPreview;
  if (!data) return;
  const { rows, os, vigencia } = data;
  const activas = rows.filter(r => r.incluir);
  if (!activas.length) { showToast('⚠️ No hay prestaciones seleccionadas'); return; }

  // CONTROL 1 (antes de tocar nada): no importar códigos repetidos DENTRO del archivo.
  // Un código repetido en el archivo terminaría como dos prestaciones "iguales" y
  // confunde al facturar. Se avisa y se corta para que el usuario limpie el archivo.
  const vistos = new Map();
  const dupsArchivo = [];
  activas.forEach(r => {
    const k = String(r.codigo || '').trim();
    if (k && k !== '—') { if (vistos.has(k)) dupsArchivo.push(k); else vistos.set(k, true); }
  });
  if (dupsArchivo.length) {
    if (!confirm(`⚠️ El archivo trae ${dupsArchivo.length} código(s) REPETIDO(S): ${[...new Set(dupsArchivo)].slice(0,10).join(', ')}${dupsArchivo.length>10?'…':''}\n\nSi seguís, se van a cargar duplicados. ¿Continuar igual?`)) return;
  }

  // ── Elegir modo (reemplazar / agregar). Todavía NO se toca nada. ──
  const antesDeOS = DB.prestaciones.filter(p => p.os === os).length;
  const keepOthers = !confirm(`¿Reemplazar las prestaciones existentes de ${os}?\n\nAceptar → reemplaza las ${antesDeOS} actuales\nCancelar → agrega sin borrar las anteriores`);

  // CONTROL: en modo "agregar", avisar de códigos que YA existen para esta OS (quedarían
  // duplicados). El chequeo previo solo miraba duplicados DENTRO del archivo; este mira
  // contra lo ya cargado.
  if (keepOthers) {
    const existentes = new Set(DB.prestaciones.filter(p => p.os === os).map(p => String(p.codigo || '').trim()));
    const choquan = [...new Set(activas.map(r => String(r.codigo || '').trim()).filter(k => k && k !== '—' && existentes.has(k)))];
    if (choquan.length && !confirm(`⚠️ ${choquan.length} código(s) YA existen para ${os} y quedarían DUPLICADOS (estás agregando sin borrar): ${choquan.slice(0,10).join(', ')}${choquan.length>10?'…':''}\n\n¿Continuar igual? (para actualizar precios conviene "Reemplazar")`)) return;
  }

  // ── CONFIRMACIÓN FINAL del cambio completo. Recién DESPUÉS de aceptar acá se aplica
  //    algo (borrado/alta de prestaciones y reprecio de atenciones). Con Cancelar, aborta
  //    sin tocar nada. Se muestra cuántas atenciones se van a revisar por la vigencia.
  const vigDesde = (vigencia && vigencia.length === 7) ? vigencia + '-01' : vigencia;
  const atARepreciar = (DB.registros || []).filter(r => r.os === os && r.fecha && (!vigDesde || r.fecha >= vigDesde)).length;
  const modoTxt = keepOthers ? `agregando a las ${antesDeOS} actuales` : `reemplazando las ${antesDeOS} actuales`;
  if (!confirm(
    `Confirmá el cambio de ${os}:\n\n` +
    `• Importar ${activas.length} prestación(es) (${modoTxt}).\n` +
    `• Vigencia ${vigencia}: se repreciarán (valor e IVA) las atenciones de ${os} de ese mes en adelante ` +
    `(${atARepreciar} atención(es) a revisar; las anteriores no se tocan).\n\n¿Aplicar?`
  )) return;

  // A partir de acá SÍ se modifica.
  if (!keepOthers) DB.prestaciones = DB.prestaciones.filter(p => p.os !== os);

  // CONTROL 2: asegurar que el contador de ids esté sano ANTES de asignar (si quedó
  // por detrás, un id nuevo podría chocar con uno existente). _corregirNextId vive en
  // persistencia.js; si no estuviera, seguimos igual (nextId ya suele estar bien).
  if (typeof _corregirNextId === 'function') _corregirNextId();

  // Agregar. IDs SIEMPRE desde el contador global nextId (nunca Math.max, que daba NaN
  // si alguna prestación existente tenía id nulo → todas quedaban con el mismo id y al
  // subir la nube colapsaba y "no subían todos los códigos").
  const idsNuevos = [];
  activas.forEach((r) => {
    const id = DB.nextId++;
    idsNuevos.push(id);
    DB.prestaciones.push({
      id,
      codigo:      r.codigo,
      desc:        r.desc,
      os,
      valOS:       r.valor,
      valPart:     DB.config.valorConsultaParticular,
      exenta:      r.exenta,
      categoria:   r.categoria,   // consulta / estudio / practica (confirmada en el preview)
      nomenclador: os,
      vigencia:    vigencia,
    });
  });

  // Registrar el contrato
  DB.contratos.push({
    id:          DB.nextId++,
    os, vigencia,
    prestaciones: activas.length,
    estado:      'Vigente',
    fechaCarga:  hoyISO(),
  });

  // CONTROL 3 (en memoria, antes de subir): que se hayan agregado TODAS y con ids únicos.
  const idsUnicos = new Set(idsNuevos);
  const totalOSahora = DB.prestaciones.filter(p => p.os === os).length;
  const esperadas = (keepOthers ? antesDeOS : 0) + activas.length;
  const problemasMem = [];
  if (idsUnicos.size !== activas.length) problemasMem.push('se generaron ids repetidos');
  if (idsNuevos.some(id => id == null || isNaN(id))) problemasMem.push('hay ids inválidos');
  if (totalOSahora !== esperadas) problemasMem.push(`quedaron ${totalOSahora} y se esperaban ${esperadas}`);

  // Reset UI
  document.getElementById('contrato-preview-panel').style.display = 'none';
  document.getElementById('contrato-file-name').textContent = '';
  document.getElementById('contrato-file-input').value = '';
  window._contratoPreview = null;

  // Reprecio automático: la vigencia dice DESDE qué mes rigen estos valores. Se re-aplican
  // a las atenciones YA CARGADAS de ESTA OS de ese mes en adelante (y las futuras usarán el
  // nuevo valor del nomenclador al cargarse). Antes esto era un paso manual aparte.
  const rep = _repreciarAtencionesOS(os, vigencia);

  renderConfiguracion();
  marcarCambios('prestaciones'); marcarCambios('contratos');
  if (rep.actualizadas > 0 || rep.ivaCambiado > 0) marcarCambios('registros');

  if (problemasMem.length) {
    // No debería pasar con los controles previos, pero si pasa NO lo ocultamos.
    alert(`⚠️ Revisar la importación de ${os}:\n\n· ${problemasMem.join('\n· ')}\n\nNo cierres sin verificar.`);
  }
  _avisarReprecio(os, vigencia, rep);

  // CONTROL 4 (el más importante): guardar y VERIFICAR contra la nube que subieron TODOS.
  showToast(`Importando ${activas.length} prestaciones de ${os} y verificando en la nube…`);
  await _verificarImportContraNube(os, activas.length);
}

// Reprecio scopeado a una OS desde una vigencia (mes AAAA-MM). Usa la fuente única
// _repreciarRegistros (persistencia.js). Si no estuviera disponible, no rompe.
function _repreciarAtencionesOS(os, vigencia) {
  if (typeof _repreciarRegistros !== 'function') return { actualizadas: 0, ambiguas: [], noEncontradas: [] };
  return _repreciarRegistros(vigencia, os);
}

// Aviso claro del resultado del reprecio de atenciones (cuántas cambiaron, cuáles quedaron
// para revisar). Se muestra solo si hubo algo para contar.
function _avisarReprecio(os, vigencia, rep) {
  if (!rep) return;
  const partes = [];
  if (rep.actualizadas > 0) partes.push(`✓ ${rep.actualizadas} atención(es) de ${os} desde ${vigencia} quedaron con el nuevo valor.`);
  if (rep.ivaCambiado > 0) partes.push(`✓ ${rep.ivaCambiado} atención(es) cambiaron su IVA (exenta/gravada) según el nuevo contrato.`);
  if (rep.ambiguas && rep.ambiguas.length)
    partes.push(`⚠️ ${rep.ambiguas.length} no se repreciaron por nombre repetido con distinto valor (revisá esas atenciones a mano).`);
  if (rep.noEncontradas && rep.noEncontradas.length)
    partes.push(`⚠️ ${rep.noEncontradas.length} no encontraron su código/prestación en el nuevo contrato y quedaron con el valor anterior: ${rep.noEncontradas.slice(0,6).map(r=>r.codigo||r.prestacion).join(', ')}${rep.noEncontradas.length>6?'…':''}`);
  if (partes.length) {
    const hayDudas = (rep.ambiguas && rep.ambiguas.length) || (rep.noEncontradas && rep.noEncontradas.length);
    if (hayDudas) alert(`Reprecio de atenciones — ${os}:\n\n${partes.join('\n\n')}`);
    else showToast(partes[0]);
  }
}

// Chequeo manual (botón en Configuración): compara TODAS las prestaciones locales con
// la nube y reporta claramente si falta subir algo, si quedó distinto o si sobró.
async function verificarSyncPrestacionesUI() {
  if (typeof verificarSyncPrestaciones !== 'function') { showToast('⚠️ Verificación no disponible en este contexto'); return; }
  showToast('🔎 Verificando prestaciones contra la nube…');
  const res = await verificarSyncPrestaciones();   // sin filtro: todas las OS
  if (res.error) { alert(`⚠️ No se pudo verificar contra la nube:\n${res.error}`); return; }
  if (res.ok) {
    alert(`✅ Todo en orden.\n\nTenés ${res.local} prestaciones cargadas y las ${res.nube} de la nube coinciden exactamente (mismos códigos y valores).`);
    return;
  }
  // Agrupar las discrepancias por OS para que sea legible.
  const porOS = (arr) => {
    const m = {};
    arr.forEach(p => { (m[p.os] = m[p.os] || []).push(p.codigo); });
    return Object.keys(m).sort().map(os => `   ${os}: ${m[os].slice(0,10).join(', ')}${m[os].length>10?` …(+${m[os].length-10})`:''}`).join('\n');
  };
  const bloques = [];
  if (res.faltan.length)      bloques.push(`❌ ${res.faltan.length} NO subieron a la nube:\n${porOS(res.faltan)}`);
  if (res.distintos.length)   bloques.push(`⚠️ ${res.distintos.length} con distinto valor/código en la nube:\n${porOS(res.distintos)}`);
  if (res.sobran.length)      bloques.push(`🗑️ ${res.sobran.length} viejas siguen en la nube (no se borraron):\n${porOS(res.sobran)}`);
  if (res.idsInvalidos.length) bloques.push(`🚫 ${res.idsInvalidos.length} con id inválido (no se pueden guardar).`);
  alert(`⚠️ La nube NO coincide con lo cargado.\nLocal: ${res.local} · Nube: ${res.nube}\n\n${bloques.join('\n\n')}\n\nTocá 💾 Guardar y volvé a verificar. Si sigue igual, avisá.`);
}

// Verifica contra la nube que las prestaciones de una OS estén todas subidas e iguales,
// y muestra un resultado claro (verde/rojo). Reutilizable desde el botón manual.
async function _verificarImportContraNube(os, cuantasEsperadas) {
  if (typeof verificarSyncPrestaciones !== 'function') {
    showToast(`✓ ${cuantasEsperadas} prestaciones de ${os} cargadas (sin verificación de nube disponible)`);
    return;
  }
  const res = await verificarSyncPrestaciones(os);
  if (res.error) {
    alert(`⚠️ ${os}: se cargaron localmente, pero NO se pudo verificar contra la nube:\n${res.error}\n\nRevisá la conexión y usá "Verificar sincronización" cuando vuelva.`);
    return;
  }
  if (res.ok) {
    showToast(`✓ ${os}: ${res.local} prestaciones cargadas y verificadas en la nube`);
    return;
  }
  const lineas = [];
  if (res.faltan.length)      lineas.push(`· ${res.faltan.length} NO subieron a la nube: ${res.faltan.slice(0,8).map(p=>p.codigo).join(', ')}${res.faltan.length>8?'…':''}`);
  if (res.distintos.length)   lineas.push(`· ${res.distintos.length} quedaron con distinto valor/código en la nube: ${res.distintos.slice(0,8).map(p=>p.codigo).join(', ')}${res.distintos.length>8?'…':''}`);
  if (res.sobran.length)      lineas.push(`· ${res.sobran.length} viejas siguen en la nube sin borrarse`);
  if (res.idsInvalidos.length) lineas.push(`· ${res.idsInvalidos.length} con id inválido`);
  alert(`⚠️ ${os}: la nube NO coincide con lo cargado (local ${res.local} · nube ${res.nube}):\n\n${lineas.join('\n')}\n\nProbá guardar de nuevo (botón 💾) y volvé a verificar. Si sigue, avisá.`);
}

function _mostrarPDFManual(os, vigencia, filename) {
  showToast(`📄 ${filename}: Los PDFs no se pueden parsear directamente. Copiá los datos a un CSV y subilo.`);
}

// ── Aumento por porcentaje: aplica ±X% a TODO el contrato (prestaciones) de una OS ──
// Alternativa a subir el archivo: cuando la OS comunica "aumento del 10%", se aplica
// sobre los valores vigentes. Redondeo a 2 decimales por prestación (mismo criterio
// que parseMonto). Las atenciones ya cargadas NO se tocan: para repreciarlas está
// "Actualizar precios en la nube" (actualizarPreciosPrestaciones), igual que tras
// subir un contrato por archivo.
function calcularAumentoContrato() {
  const os       = document.getElementById('aumento-os-sel')?.value || '';
  const pct      = parseFloat(document.getElementById('aumento-pct')?.value);
  const vigencia = document.getElementById('aumento-vigencia')?.value || '';
  if (!os)                     { showToast('⚠️ Seleccioná la Obra Social'); return; }
  if (isNaN(pct) || pct === 0) { showToast('⚠️ Ingresá el porcentaje de aumento (ej: 10)'); return; }
  if (pct <= -100)             { showToast('⚠️ El porcentaje no puede ser -100% o menor'); return; }
  if (!vigencia)               { showToast('⚠️ Seleccioná la vigencia del aumento'); return; }

  const prests = DB.prestaciones.filter(p => p.os === os);
  if (!prests.length) { showToast(`⚠️ ${os} no tiene prestaciones cargadas — subí primero el contrato por archivo`); return; }

  const rows = prests.map(p => ({
    id: p.id, codigo: p.codigo, desc: p.desc,
    valorActual: p.valOS || 0,
    valorNuevo: aplicarPorcentaje(p.valOS, pct),   // fuente única (js/calculos.js)
  }));
  window._aumentoPreview = { os, pct, vigencia, rows };

  const title = document.getElementById('aumento-preview-title');
  const tbody = document.getElementById('aumento-preview-tbody');
  const stats = document.getElementById('aumento-preview-stats');
  const panel = document.getElementById('aumento-preview-panel');
  if (title) title.textContent = `Aumento ${pct > 0 ? '+' : ''}${pct}% — ${os} · vigencia ${vigencia}`;
  if (tbody) tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-family:monospace; font-size:11px;">${r.codigo}</td>
      <td style="font-size:12px;">${r.desc}</td>
      <td class="finance-num" style="text-align:right;">${fmt(r.valorActual)}</td>
      <td class="finance-num" style="text-align:right; font-weight:700; color:var(--success);">${fmt(r.valorNuevo)}</td>
      <td class="finance-num" style="text-align:right; color:${r.valorNuevo>=r.valorActual?'var(--success)':'var(--danger)'};">${r.valorNuevo>=r.valorActual?'+':'−'}${fmt(Math.abs(r.valorNuevo - r.valorActual))}</td>
    </tr>`).join('');
  const totActual = rows.reduce((s,r)=>s+r.valorActual,0);
  const totNuevo  = rows.reduce((s,r)=>s+r.valorNuevo,0);
  if (stats) stats.textContent = `${rows.length} ${rows.length !== 1 ? 'prestaciones' : 'prestación'} de ${os} · suma actual ${fmt(totActual)} → nueva ${fmt(totNuevo)} (${pct>0?'+':''}${pct}%)`;
  if (panel) panel.style.display = '';
}

async function confirmarAumentoContrato() {
  const data = window._aumentoPreview;
  if (!data) return;
  const { os, pct, vigencia, rows } = data;
  if (!confirm(`Se van a actualizar ${rows.length} prestaciones de ${os} con un ajuste del ${pct > 0 ? '+' : ''}${pct}% (vigencia ${vigencia}).\n\nAdemás se van a repreciar las atenciones de ${os} de ${vigencia} en adelante (las anteriores no se tocan).\n\n¿Aplicar?`)) return;

  // Aplicar por id (no por posición): solo las prestaciones de la vista previa.
  // Contamos cuántas se aplicaron para verificar que sean TODAS las esperadas.
  const porId = new Map(rows.map(r => [r.id, r]));
  let aplicadas = 0;
  DB.prestaciones.forEach(p => {
    const r = porId.get(p.id);
    if (r && p.os === os) { p.valOS = r.valorNuevo; p.vigencia = vigencia; aplicadas++; }
  });

  // CONTROL en memoria: se tienen que haber actualizado TODAS las de la vista previa.
  if (aplicadas !== rows.length) {
    alert(`⚠️ ${os}: se esperaba actualizar ${rows.length} prestaciones pero se actualizaron ${aplicadas}.\n\n(Puede haber ids duplicados o prestaciones que cambiaron de OS.) Revisá el listado antes de seguir.`);
  }

  // Registrar el aumento como un contrato más (queda en el historial y en el export)
  DB.contratos.push({
    id: DB.nextId++, os, vigencia,
    prestaciones: rows.length, estado: 'Vigente',
    obs: `Aumento ${pct > 0 ? '+' : ''}${pct}% por porcentaje sobre el contrato anterior`,
    fechaCarga: hoyISO(),
  });

  // Reprecio automático de las atenciones de esta OS desde la vigencia (el mes elegido):
  // las ya cargadas de ese mes en adelante pasan a valer el nuevo monto aumentado.
  const rep = _repreciarAtencionesOS(os, vigencia);

  const panel = document.getElementById('aumento-preview-panel');
  if (panel) panel.style.display = 'none';
  const pctInp = document.getElementById('aumento-pct');
  if (pctInp) pctInp.value = '';
  window._aumentoPreview = null;

  marcarCambios('prestaciones'); marcarCambios('contratos');
  if (rep.actualizadas > 0 || rep.ivaCambiado > 0) marcarCambios('registros');
  renderConfiguracion();
  _avisarReprecio(os, vigencia, rep);

  // CONTROL contra la nube: que los valores nuevos hayan quedado guardados en TODAS.
  showToast(`Aplicando aumento a ${rows.length} prestaciones de ${os} y verificando en la nube…`);
  await _verificarImportContraNube(os, aplicadas);
}

function abrirNuevoContrato() {
  openModal('modal-contrato-manual');
}

function guardarContratoManual() {
  const os = document.getElementById('cm2-os').value;
  if (!os) { showToast('⚠️ Seleccioná la OS'); return; }
  const vigencia = document.getElementById('cm2-vigencia').value;
  const estado   = document.getElementById('cm2-estado').value;
  const obs      = document.getElementById('cm2-obs').value;
  DB.contratos.push({
    id: DB.nextId++, os, vigencia, prestaciones: DB.prestaciones.filter(p=>p.os===os).length,
    estado, obs, fechaCarga: hoyISO(),
  });
  closeModal('modal-contrato-manual');
  marcarCambios('contratos');
  renderConfiguracion();
  showToast(`✓ Contrato registrado — ${os}`);
}

function verPrestacionesOS(os) {
  // Switch to prestaciones tab and filter by OS
  const tabs = document.querySelectorAll('#section-configuracion .tabs .tab');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[1]?.classList.add('active');
  switchConfigTab('prestaciones', tabs[1]);
  setTimeout(() => {
    const sel = document.getElementById('cfg-prest-os-filter');
    if (sel) { sel.value = os; renderConfiguracion(); }
  }, 50);
}

function eliminarContrato(id) {
  if (!confirm('¿Eliminar este contrato registrado? Las prestaciones cargadas no se borran.')) return;
  DB.contratos = DB.contratos.filter(c => c.id !== id);
  marcarCambios('contratos');
  renderConfiguracion();
  showToast('Contrato eliminado');
}


function guardarValoresGlobales() {
  const honOS = parseFloat(document.getElementById('cfg-hon-os').value);
  const valPart = parseFloat(document.getElementById('cfg-val-part').value);
  if (!honOS || !valPart) { showToast('⚠️ Ingresá valores válidos'); return; }
  DB.config.honorarioOS = honOS;
  DB.config.valorConsultaParticular = valPart;
  // config va en app_meta (no es una colección). marcarCambios() agenda el guardado:
  // sin esto, el cambio NO se sube a la nube y se pierde al recargar.
  marcarCambios();
  // Actualizar campo calculado
  document.getElementById('cfg-hon-part').value = valPart / 2;
  document.getElementById('cfg-preview-os').textContent = fmtN(honOS);
  document.getElementById('cfg-preview-efec').textContent = fmtN(valPart/2);
  document.getElementById('cfg-preview-transf').textContent = fmtN(valPart/2);
  showToast(`✓ Valores actualizados: OS ${fmt(honOS)} · Particular ${fmt((valPart/2))}`);
}
