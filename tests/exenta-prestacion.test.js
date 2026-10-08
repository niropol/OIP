// Auditoría de flujo Contratos → atenciones: el nomenclador guarda un override de IVA
// por prestación (p.exenta, seteable al importar un contrato), pero los desplegables de
// Atención rápida y Carga masiva construían su data-exenta con el default de la OS —
// el override no viajaba al registro creado y una prestación gravada-por-override en
// una OS exenta se facturaba sin IVA por defecto. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'closeModal', 'initDashboard', 'renderCajaChica', 'renderAtenciones']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  // Nomenclador controlado: OSDE (exenta por default) con una prestación GRAVADA por override
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679,  valPart: 60000, nomenclador: 'OSDE' },
    { id: 2, codigo: '99999',  desc: 'Estudio gravado especial', os: 'OSDE', valOS: 100000, valPart: 60000, nomenclador: 'OSDE', exenta: false },
    { id: 3, codigo: '88888',  desc: 'Estudio exento común',     os: 'OSDE', valOS: 50000,  valPart: 60000, nomenclador: 'OSDE' },
  ];
});

describe('exentaPrestacion (fuente única)', () => {
  it('override manda; sin override cae al default de la OS; CEMEPLA nunca exenta', () => {
    expect(app.exentaPrestacion({ os: 'OSDE', exenta: false })).toBe(false);
    expect(app.exentaPrestacion({ os: 'OSDE' })).toBe(true);
    expect(app.exentaPrestacion({ os: 'CoberMed', exenta: true })).toBe(true);
    expect(app.exentaPrestacion({ os: 'CoberMed' })).toBe(false);
    expect(app.exentaPrestacion({ os: 'CEMEPLA', exenta: true })).toBe(false);
  });
});

describe('Atención rápida: el override de la prestación viaja al registro', () => {
  it('las opciones del desplegable llevan el data-exenta de CADA prestación', () => {
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    app.atSelTipo('OS'); app.atSelOS('OSDE'); app.atSelCategoria('prestacion');
    const opts = [...document.getElementById('at-prestacion-sel').options];
    const gravada = opts.find(o => o.text.includes('gravado especial'));
    const exenta  = opts.find(o => o.text.includes('exento común'));
    // Convención del modal: data-exenta='1' significa GRAVADA
    expect(gravada.getAttribute('data-exenta')).toBe('1');
    expect(exenta.getAttribute('data-exenta')).toBe('0');
  });

  it('guardar una atención de la prestación gravada-por-override crea el registro CON IVA', () => {
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
    setInput(window, 'at-fecha', '2026-06-10');
    setInput(window, 'at-consultorio-sel', 'Palpa');
    app.atSelTipo('OS'); app.atSelOS('OSDE'); app.atSelCategoria('prestacion');
    const sel = document.getElementById('at-prestacion-sel');
    sel.value = '2';  // Estudio gravado especial
    app.atOnPrestChange();
    app.guardarAtencion();
    const reg = app.DB.registros[0];
    expect(reg).toBeTruthy();
    expect(reg.exenta).toBe(false);                    // el override viajó al registro
    expect(app.ivaReg(reg)).toBeCloseTo(10500, 2);     // 100000 × 10.5%
  });
});

describe('Carga masiva: el override de la prestación viaja a la fila', () => {
  it('las opciones de la fila de prestaciones llevan el data-exenta de cada prestación', () => {
    app.agregarFilaPrestacion();
    const row = document.querySelector('#cm-prest-tbody tr');
    const osSel = row.querySelector('select');
    osSel.value = 'OSDE';
    app.onCMPrestOSChange(osSel, row.id);
    const opts = [...row.querySelector('.cm-prest-sel').options];
    const gravada = opts.find(o => o.text.includes('gravado especial'));
    const exenta  = opts.find(o => o.text.includes('exento común'));
    // Convención de carga masiva: data-exenta='1' significa EXENTA
    expect(gravada.getAttribute('data-exenta')).toBe('0');
    expect(exenta.getAttribute('data-exenta')).toBe('1');
  });
});

describe('Labels de IVA para CEMEPLA (21%, no 10.5%)', () => {
  it('el preview del contrato muestra 21% para CEMEPLA gravada', () => {
    window._contratoPreview = null;
    // Simular el flujo del preview directamente
    const rows = [{ codigo: '1', desc: 'Consulta', valor: 50000, exenta: false, incluir: true }];
    window._mostrarPreviewContrato(rows, 'CEMEPLA', '2026-08');
    const html = document.getElementById('contrato-preview-tbody').innerHTML;
    expect(html).toContain('21%');
    expect(html).not.toContain('10.5%');
  });
});
