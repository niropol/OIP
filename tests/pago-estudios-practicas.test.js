// Pago por estudios y prácticas/cirugías a cada médico (configurable $ fijo o % del
// valor). Cubre: cálculo honorPracticaReg, integración en honorariosMedico/aLiquidar,
// alta y edición del médico (sin duplicar), y que el pago respete la categoría.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
const MEDICO = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'closeModal', 'renderMedicosGrid', 'renderConfiguracion'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
});

describe('honorPracticaReg: cálculo por médico', () => {
  const medFijo = { nombre: MEDICO, pagoEstudio: { modo: 'fijo', valor: 5000 }, pagoPractica: { modo: 'fijo', valor: 8000 } };
  const medPct  = { nombre: MEDICO, pagoEstudio: { modo: 'pct', valor: 40 },    pagoPractica: { modo: 'pct', valor: 30 } };

  it('$ fijo = valor × cantidad (estudio)', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'OCT macular', cantidad: 3, valorUnit: 30000 }, medFijo)).toBe(15000);
  });
  it('% del neto (estudio)', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'OCT macular', cantidad: 1, valorUnit: 30000 }, medPct)).toBe(12000);
  });
  it('$ fijo (práctica)', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'Catarata c/IOL', cantidad: 1, valorUnit: 900000 }, medFijo)).toBe(8000);
  });
  it('% del neto (práctica) con redondeo a 2 decimales', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'Vitrectomía', cantidad: 1, valorUnit: 123456.78 }, medPct)).toBe(37037.03);
  });
  it('una CONSULTA no paga por práctica', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'Consulta (Plan 510)', cantidad: 1, valorUnit: 55679 }, medFijo)).toBe(0);
  });
  it('Particular / SinCargo / derivación no pasan por acá', () => {
    expect(app.honorPracticaReg({ os: 'Particular', partEfectivo: 1 }, medFijo)).toBe(0);
    expect(app.honorPracticaReg({ os: 'SinCargo', cantidad: 1, valorUnit: 0.1 }, medFijo)).toBe(0);
    expect(app.honorPracticaReg({ os: 'OSDE', pagoExtra: 45000 }, medFijo)).toBe(0);
  });
  it('sin config o valor 0 → 0 (comportamiento previo: no pagaba nada)', () => {
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'OCT macular', cantidad: 1, valorUnit: 30000 }, { nombre: MEDICO })).toBe(0);
    expect(app.honorPracticaReg({ os: 'OSDE', prestacion: 'OCT macular', cantidad: 1, valorUnit: 30000 }, { nombre: MEDICO, pagoEstudio: { modo: 'fijo', valor: 0 } })).toBe(0);
  });
});

describe('Integración en la liquidación del médico', () => {
  beforeEach(() => {
    app.DB.medicos = [{ id: 1, nombre: MEDICO, consultorio: 'Palpa',
      pagoEstudio: { modo: 'fijo', valor: 5000 }, pagoPractica: { modo: 'pct', valor: 30 } }];
  });

  it('honorariosMedico devuelve honPract y lo incluye en aLiquidar', () => {
    const regs = [
      { os: 'OSDE', medico: MEDICO, prestacion: 'Consulta (Plan 510)', cantidad: 2, valorUnit: 55679, exenta: true },
      { os: 'OSDE', medico: MEDICO, prestacion: 'OCT macular', cantidad: 1, valorUnit: 30000, exenta: true },      // estudio: 5000
      { os: 'OSDE', medico: MEDICO, prestacion: 'Catarata c/IOL', cantidad: 1, valorUnit: 900000, exenta: true },  // práctica: 30% = 270000
    ];
    const h = app.honorariosMedico(regs);
    expect(h.honOS).toBe(2 * app.DB.config.honorarioOS);   // solo las consultas
    expect(h.honPract).toBe(5000 + 270000);
    expect(h.aLiquidar).toBe(h.honOS + h.honPract);
  });

  it('honorMedicoReg de un estudio/práctica busca al médico en DB por nombre', () => {
    // Sin pasar med: lo resuelve por r.medico contra DB.medicos
    expect(app.honorMedicoReg({ os: 'OSDE', medico: MEDICO, prestacion: 'OCT macular', cantidad: 2, valorUnit: 30000 })).toBe(10000);
  });

  it('la suma de honorALiquidarReg por registro == aLiquidar (invariante intacto)', () => {
    const regs = [
      { os: 'OSDE', medico: MEDICO, prestacion: 'Consulta (Plan 510)', cantidad: 1, valorUnit: 55679, exenta: true },
      { os: 'OSDE', medico: MEDICO, prestacion: 'OCT macular', cantidad: 2, valorUnit: 30000, exenta: true },
      { os: 'Particular', medico: MEDICO, partEfectivo: 1, partEfVal: 60000, partTransf: 1, partTrVal: 60000 },
    ];
    const suma = regs.reduce((s, r) => s + app.honorALiquidarReg(r), 0);
    expect(suma).toBeCloseTo(app.honorariosMedico(regs).aLiquidar, 5);
  });
});

describe('ABM de médico: alta y edición sin duplicar + tarifa de estudios/prácticas', () => {
  function setPago(prefijo, modo, valor) {
    document.getElementById(`med-pago-${prefijo}-modo`).value = modo;
    setInput(window, `med-pago-${prefijo}-valor`, valor);
  }

  it('alta nueva guarda pagoEstudio y pagoPractica', () => {
    app.abrirNuevoMedico();
    setInput(window, 'med-nombre', 'Dra. Nueva');
    setPago('estudio', 'fijo', 5000);
    setPago('practica', 'pct', 25);
    app.guardarMedico();
    const med = app.DB.medicos.find(m => m.nombre === 'Dra. Nueva');
    expect(med).toBeTruthy();
    expect(med.pagoEstudio).toEqual({ modo: 'fijo', valor: 5000 });
    expect(med.pagoPractica).toEqual({ modo: 'pct', valor: 25 });
  });

  it('editar un médico NO lo duplica y actualiza su tarifa', () => {
    app.DB.medicos = [{ id: 7, nombre: MEDICO, consultorio: 'Palpa', color: '#123456' }];
    const antes = app.DB.medicos.length;
    app.editarMedico(7);
    // editarMedico usa setTimeout(50) para poblar; forzamos los valores directamente
    document.getElementById('med-edit-id').value = '7';
    setInput(window, 'med-nombre', MEDICO);
    setPago('estudio', 'pct', 40);
    setPago('practica', 'fijo', 12000);
    app.guardarMedico();
    expect(app.DB.medicos.length).toBe(antes);                 // no duplicó
    const med = app.DB.medicos.find(m => m.id === 7);
    expect(med.color).toBe('#123456');                          // conservó el id/color
    expect(med.pagoEstudio).toEqual({ modo: 'pct', valor: 40 });
    expect(med.pagoPractica).toEqual({ modo: 'fijo', valor: 12000 });
  });

  it('sin tarifa cargada, los estudios/prácticas siguen pagando 0 (default seguro)', () => {
    app.DB.medicos = [{ id: 9, nombre: MEDICO, consultorio: 'Palpa' }];
    expect(app.honorMedicoReg({ os: 'OSDE', medico: MEDICO, prestacion: 'OCT macular', cantidad: 1, valorUnit: 30000 })).toBe(0);
  });
});
