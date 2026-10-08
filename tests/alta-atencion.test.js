// Tests del ALTA de atención (guardarAtencion): el lado que CREA los registros y
// los movimientos de caja, complemento de los tests de borrado. Contra el código
// actual, sin modificarlo.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'renderAtenciones', 'closeModal', 'showToast']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  // El select de médicos se llena en init() (que no corre); lo poblamos a mano.
  window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
  setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
  setInput(window, 'at-fecha', '2026-06-10');
  setInput(window, 'at-consultorio-sel', 'Palpa');
});

describe('Atención rápida: el valor se ve en cada opción de prestación', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '420162', desc: 'Consulta (Plan 510)', valOS: 55679, valPart: 60000 },
      { id: 2, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 1351970, valPart: 60000 },
    ];
    app.AT.os = 'OSDE';
  });

  it('las opciones de CONSULTA muestran el precio', () => {
    app.atSelCategoria('consulta');
    const opt = window.document.querySelector('#at-prestacion-sel option');
    expect(opt.text).toContain('Consulta (Plan 510)');
    expect(opt.text).toContain('55.679'); // precio a la vista
  });

  it('las opciones de PRÁCTICA muestran el precio', () => {
    app.atSelCategoria('prestacion');
    const opt = window.document.querySelector('#at-prestacion-sel option');
    expect(opt.text).toContain('Catarata c/IOL');
    expect(opt.text).toContain('1.351.970'); // precio a la vista
  });
});

describe('Alta Particular efectivo', () => {
  it('crea el registro y el ingreso en caja chica, vinculado por regId', () => {
    app.AT.tipo = 'Particular';
    app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    window.confirm = () => false; // no pagar honorario al médico en el acto

    app.guardarAtencion();

    expect(app.DB.registros.length).toBe(1);
    const reg = app.DB.registros[0];
    expect(reg.os).toBe('Particular');
    expect(app.facturadoReg(reg)).toBe(60000);

    const ing = app.DB.cajaChica.filter(m => m.regId === reg.id && m.tipo === 'Ingreso');
    expect(ing.length).toBe(1);
    expect(ing[0].monto).toBe(60000);
    // como confirm fue false, NO se pagó honorario → no hay egreso
    expect(app.DB.cajaChica.some(m => m.tipo === 'Egreso')).toBe(false);
  });

  it('si se confirma, paga el 50% al médico como egreso de caja chica', () => {
    app.AT.tipo = 'Particular';
    app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    window.confirm = () => true; // sí pagar honorario en el acto

    app.guardarAtencion();

    const reg = app.DB.registros[0];
    const egr = app.DB.cajaChica.filter(m => m.regId === reg.id && m.tipo === 'Egreso');
    expect(egr.length).toBe(1);
    expect(egr[0].monto).toBe(30000); // 50% de 60000
    expect(reg.honorarioPagadoEfectivo).toBe(true);
  });
});

describe('Alta Particular transferencia', () => {
  it('crea el ingreso en movimientos (banco), no en caja chica', () => {
    app.AT.tipo = 'Particular';
    app.AT.medioPago = 'Transferencia';
    setInput(window, 'at-part-monto', 50000);

    app.guardarAtencion();

    const reg = app.DB.registros[0];
    expect(app.DB.cajaChica.length).toBe(0);
    const mov = app.DB.movimientos.filter(m => m.regId === reg.id);
    expect(mov.length).toBe(1);
    expect(mov[0].tipo).toBe('Ingreso');
    expect(mov[0].monto).toBe(50000);
    expect(mov[0].origen).toBe('Particular');
  });
});

describe('Alta OS con copago', () => {
  beforeEach(() => {
    // Necesita una prestación en el catálogo para resolver código/descripción
    app.DB.prestaciones = [
      { id: 1, codigo: '420114', desc: 'Consulta vestida oftalmológica', os: 'CoberMed', valOS: 16442, valPart: 60000 },
    ];
    const sel = window.document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Consulta vestida oftalmológica — $16.442</option>';
    sel.selectedIndex = 0;
    app.AT.tipo = 'OS';
    app.AT.os = 'CoberMed';
    app.AT.categoria = 'consulta';
    setInput(window, 'at-monto', 16442);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '1'); // gravada
  });

  it('copago efectivo entra a caja chica vinculado al registro', () => {
    window.document.getElementById('at-tiene-copago').checked = true;
    setInput(window, 'at-copago-monto', 3000);
    setInput(window, 'at-copago-medio', 'Efectivo');
    setInput(window, 'at-copago-tipo', 'adelanto');

    app.guardarAtencion();

    const reg = app.DB.registros[0];
    expect(reg.os).toBe('CoberMed');
    expect(reg.copago).toBe(3000);
    const cop = app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Copago');
    expect(cop.length).toBe(1);
    expect(cop[0].monto).toBe(3000);
  });
});

describe('Alta SinCargo', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420101', desc: 'Consulta', os: 'SinCargo', valOS: 0.1, valPart: 60000 },
    ];
    const sel = window.document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Consulta — $0,1</option>';
    sel.selectedIndex = 0;
    app.AT.tipo = 'OS';
    app.AT.os = 'SinCargo';
    app.AT.categoria = 'consulta';
    setInput(window, 'at-monto', 0.1);
    setInput(window, 'at-cantidad', 1);
  });

  it('exige nombre y apellido: sin ellos no crea el registro', () => {
    app.guardarAtencion();
    expect(app.DB.registros.length).toBe(0);
  });

  it('con paciente, crea ingreso y egreso de $0,1 (neto cero) vinculados al registro', () => {
    setInput(window, 'at-pac-apellido', 'Pérez');
    setInput(window, 'at-pac-nombre', 'Juan');

    app.guardarAtencion();

    expect(app.DB.registros.length).toBe(1);
    const reg = app.DB.registros[0];
    const movs = app.DB.movimientos.filter(m => m.regId === reg.id);
    expect(movs.length).toBe(2);
    const ingreso = movs.find(m => m.tipo === 'Ingreso');
    const egreso = movs.find(m => m.tipo === 'Egreso');
    expect(ingreso.monto).toBeCloseTo(0.1, 5);
    expect(egreso.monto).toBeCloseTo(0.1, 5);
    // neto cero
    const neto = movs.reduce((s, m) => s + (m.tipo === 'Ingreso' ? m.monto : -m.monto), 0);
    expect(neto).toBeCloseTo(0, 5);
  });
});
