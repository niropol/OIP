// Tests de derivaciones quirúrgicas: registrar un pago suma a la liquidación del
// médico (registro con pagoExtra + derivId), y borrar la derivación arrastra esos
// pagos (sin huérfanos). Contra el código actual, sin modificarlo.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['renderDerivKPIs', 'renderDerivaciones', 'closeModal', 'showToast']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

function nuevaDerivacion() {
  const d = {
    id: 8000, fecha: '2026-06-01', consultorio: 'Palpa', paciente: 'Test Paciente',
    medico: 'Dr. Polisky, Nicolás', os: 'OSDE', cirugia: 'Catarata', ojo: 'OD',
    estado: 'Programada', pagos: [],
  };
  app.DB.derivaciones.push(d);
  return d;
}

describe('Pago de derivación: valor de contrato + 5% sugerido + suma a liquidación', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 1000000, valPart: 60000 },
      { id: 2, os: 'OSDE', codigo: '20260', desc: 'Cirugía simple', valOS: 200000, valPart: 60000 },
    ];
  });

  it('abrir el modal prefija el 5% del valor de contrato de la cirugía', () => {
    const d = nuevaDerivacion();  // os OSDE, cirugia "Catarata"
    window.abrirPagoDerivacion(d.id);
    const g = id => window.document.getElementById(id);
    // matcheó "Catarata c/IOL" (valor 1.000.000) → sugerido 5% = 50.000
    expect(parseFloat(g('pago-deriv-monto').value)).toBe(50000);
    expect(g('pago-deriv-valor-contrato').textContent).not.toBe('—');
  });

  it('recalcula el 5% al cambiar la prestación elegida', () => {
    const d = nuevaDerivacion();
    window.abrirPagoDerivacion(d.id);
    const sel = window.document.getElementById('pago-deriv-prest');
    sel.value = '2';                 // Cirugía simple, valOS 200.000
    window.recalcPagoDerivacion();
    expect(parseFloat(window.document.getElementById('pago-deriv-monto').value)).toBe(10000); // 5% de 200.000
  });

  it('el pago confirmado suma a la liquidación del médico (honExtra)', () => {
    const d = nuevaDerivacion();
    window.abrirPagoDerivacion(d.id);   // prefija 50.000
    app.confirmarPagoDerivacion();
    const regsMed = app.DB.registros.filter(r => r.medico === d.medico);
    const h = app.honorariosMedico(regsMed);
    expect(h.honExtra).toBe(50000);
    expect(h.aLiquidar).toBe(50000);
    const reg = app.DB.registros.find(r => r.derivId === d.id);
    expect(reg.pagoExtra).toBe(50000);
    expect(reg.valorContrato).toBe(1000000);
    // honorMedicoReg del registro de pago = el pagoExtra
    expect(app.honorMedicoReg(reg)).toBe(50000);
  });

  it('el monto es editable: si se cambia, se guarda lo editado', () => {
    const d = nuevaDerivacion();
    window.abrirPagoDerivacion(d.id);
    setInput(window, 'pago-deriv-monto', 33333);  // el usuario edita el sugerido
    app.confirmarPagoDerivacion();
    const reg = app.DB.registros.find(r => r.derivId === d.id);
    expect(reg.pagoExtra).toBe(33333);
  });
});

describe('Pago de derivación → suma a la liquidación del médico', () => {
  it('agrega el pago y crea un registro pagoExtra vinculado por derivId', () => {
    const d = nuevaDerivacion();
    setInput(window, 'pago-deriv-id', d.id);
    setInput(window, 'pago-deriv-monto', 150000);
    setInput(window, 'pago-deriv-concepto', 'Pago por derivación quirúrgica');
    setInput(window, 'pago-deriv-nota', 'Cirugía realizada');

    app.confirmarPagoDerivacion();

    expect(d.pagos.length).toBe(1);
    expect(d.pagos[0].monto).toBe(150000);

    const regPago = app.DB.registros.filter(r => r.derivId === d.id);
    expect(regPago.length).toBe(1);
    expect(regPago[0].os).toBe('Pago derivación');
    expect(regPago[0].pagoExtra).toBe(150000);
    expect(regPago[0].medico).toBe(d.medico);
  });

  it('rechaza monto inválido (no crea pago ni registro)', () => {
    const d = nuevaDerivacion();
    setInput(window, 'pago-deriv-id', d.id);
    setInput(window, 'pago-deriv-monto', 0);
    setInput(window, 'pago-deriv-concepto', 'x');
    setInput(window, 'pago-deriv-nota', '');

    app.confirmarPagoDerivacion();

    expect(d.pagos.length).toBe(0);
    expect(app.DB.registros.some(r => r.derivId === d.id)).toBe(false);
  });
});

describe('Borrar derivación → arrastra sus pagos de la liquidación', () => {
  it('elimina la derivación y los registros pagoExtra que generó', () => {
    const d = nuevaDerivacion();
    setInput(window, 'pago-deriv-id', d.id);
    setInput(window, 'pago-deriv-monto', 150000);
    setInput(window, 'pago-deriv-concepto', 'Pago por derivación quirúrgica');
    setInput(window, 'pago-deriv-nota', '');
    app.confirmarPagoDerivacion();
    expect(app.DB.registros.some(r => r.derivId === d.id)).toBe(true);

    window.confirm = () => true;
    app.eliminarDerivacion(d.id);

    expect(app.DB.derivaciones.some(x => x.id === d.id)).toBe(false);
    expect(app.DB.registros.some(r => r.derivId === d.id)).toBe(false);
  });
});
