// Los ingresos por consultas van a donde corresponde SEGÚN el medio de pago y el
// consultorio: EFECTIVO (particular y copago) → caja chica del consultorio;
// TRANSFERENCIA → Caja/banco (movimientos). Y el ingreso en efectivo marca la caja
// chica como pendiente de guardar (se sincroniza ya, no solo por la red de 3s).
// Cubre atención rápida y carga masiva. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'renderAtenciones', 'closeModal', 'showToast'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
  window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
  setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
  setInput(window, 'at-fecha', '2026-06-10');
  setInput(window, 'at-consultorio-sel', 'Haedo');   // consultorio no-default a propósito
  window.confirm = () => false;   // no pagar honorario en el acto
});

describe('Atención rápida — Particular', () => {
  it('EFECTIVO → caja chica del consultorio correcto (Haedo), no al banco', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const ing = app.DB.cajaChica.filter(m => m.tipo === 'Ingreso' && m.origen === 'Efectivo');
    expect(ing.length).toBe(1);
    expect(ing[0].consultorio).toBe('Haedo');
    expect(ing[0].monto).toBe(60000);
    expect(app.DB.movimientos.length).toBe(0);   // NO va al banco
    expect(app.__dirtyCols()).toContain('cajaChica');
  });

  it('TRANSFERENCIA → Caja/banco (movimientos) del consultorio, no a caja chica', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Transferencia';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const mov = app.DB.movimientos.filter(m => m.tipo === 'Ingreso' && m.origen === 'Particular');
    expect(mov.length).toBe(1);
    expect(mov[0].consultorio).toBe('Haedo');
    expect(mov[0].monto).toBe(60000);
    expect(app.DB.cajaChica.length).toBe(0);   // NO va a caja chica
    expect(app.__dirtyCols()).toContain('movimientos');
  });
});

describe('Atención rápida — OS con copago', () => {
  beforeEach(() => {
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta vestida oftalmológica', os: 'OSDE', valOS: 55679, valPart: 60000 }];
    const sel = document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Consulta vestida oftalmológica — $55.679</option>';
    sel.selectedIndex = 0;
    app.AT.tipo = 'OS'; app.AT.os = 'OSDE'; app.AT.categoria = 'consulta';
    setInput(window, 'at-monto', 55679);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '1');
    document.getElementById('at-tiene-copago').checked = true;
    setInput(window, 'at-copago-monto', 5000);
    setInput(window, 'at-copago-tipo', 'adelanto');
  });

  it('copago EFECTIVO → caja chica del consultorio + marca cajaChica pendiente (el bug corregido)', () => {
    setInput(window, 'at-copago-medio', 'Efectivo');
    app.guardarAtencion();
    const cop = app.DB.cajaChica.filter(m => m.origen === 'Copago' && m.tipo === 'Ingreso');
    expect(cop.length).toBe(1);
    expect(cop[0].consultorio).toBe('Haedo');
    expect(cop[0].monto).toBe(5000);
    expect(app.__dirtyCols()).toContain('cajaChica');   // ← antes NO se marcaba
  });

  it('copago TRANSFERENCIA → banco (movimientos), no a caja chica', () => {
    setInput(window, 'at-copago-medio', 'Transferencia');
    app.guardarAtencion();
    const cop = app.DB.movimientos.filter(m => m.origen === 'Copago' && m.tipo === 'Ingreso');
    expect(cop.length).toBe(1);
    expect(cop[0].consultorio).toBe('Haedo');
    expect(app.DB.cajaChica.some(m => m.origen === 'Copago')).toBe(false);
  });
});
