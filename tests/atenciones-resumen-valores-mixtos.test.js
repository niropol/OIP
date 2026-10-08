// BUG: la vista "Resumen (por OS)" de Atenciones agrupaba por OS+plan+exenta y calculaba
// el neto como cantidad_total × UN solo valor unitario (el de la primera atención del grupo).
// Si en el grupo había atenciones con valores DISTINTOS (ej. una práctica con valor especial),
// ese valor se perdía. La presentación a la OS sí lo mostraba (suma el neto real). Ahora el
// resumen también suma el neto real de cada atención.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  // Filtro de Atenciones: mes junio 2026, sin otros filtros.
  const mesSel = document.getElementById('at-f-mes');
  if (mesSel) { mesSel.innerHTML = '<option value="2026-06">Junio 2026</option>'; mesSel.value = '2026-06'; }
  ['at-f-fecha', 'at-f-consultorio', 'at-f-medico', 'at-f-cobertura', 'at-f-buscar'].forEach(id => setInput(window, id, ''));
});

describe('Resumen por OS — valores mixtos en el mismo grupo', () => {
  it('suma el neto REAL cuando hay atenciones con distinto valor (no pierde el valor especial)', () => {
    // Dos OSDE, mismo plan y misma exención, pero valores MUY distintos.
    app.DB.registros = [
      { id: 1, os: 'OSDE', plan: '', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', prestacion: 'Consulta', cantidad: 1, valorUnit: 22000, exenta: true, fecha: '2026-06-10' },
      { id: 2, os: 'OSDE', plan: '', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', prestacion: 'Catarata', cantidad: 1, valorUnit: 900000, exenta: true, fecha: '2026-06-11' },
    ];
    app.renderAtenciones();
    const tbody = document.getElementById('at-os-tbody');
    const html = tbody.innerHTML;
    // El neto del grupo tiene que ser 22.000 + 900.000 = 922.000 (no 2×22.000 ni 2×900.000).
    expect(html).toContain('922.000');
    expect(html).not.toContain('44.000');       // el bug viejo (2 × 22.000)
    // Marca ~ porque el valor unitario no es único.
    expect(html).toContain('~');
  });

  it('valor único: sigue mostrando el valor unitario normal, sin ~', () => {
    app.DB.registros = [
      { id: 1, os: 'IOMA', plan: '', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', prestacion: 'Consulta', cantidad: 2, valorUnit: 11000, exenta: true, fecha: '2026-06-10' },
    ];
    app.renderAtenciones();
    const html = document.getElementById('at-os-tbody').innerHTML;
    expect(html).toContain('22.000');   // 2 × 11.000
    expect(html).not.toContain('~');    // valor único → sin marca de mixto
  });

  it('el label de IVA del resumen respeta la alícuota de la OS (21%), no 10,5% fijo', () => {
    app.DB.obrasSociales.push({ id: 7777, nombre: 'MutualTest', estado: 'Activa', exentaDefault: false, alicuota: 21 });
    app.DB.registros = [
      { id: 1, os: 'MutualTest', plan: '', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', prestacion: 'Práctica', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10' },
    ];
    app.renderAtenciones();
    const html = document.getElementById('at-os-tbody').innerHTML;
    expect(html).toContain('21%');
    expect(html).not.toContain('10.5%');
  });
});
