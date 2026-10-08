// Tests de Preliquidación: cálculo de honorarios por médico y la máquina de estados
// del cierre de mes (cerrar / reabrir / factura recibida / pago enviado), incluyendo
// que un mes cerrado bloquea la edición de sus atenciones. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  // Evitar que los re-render de UI rompan (tocan mucho DOM); no afectan los datos.
  ['generarPreliq', 'renderFinanzas', 'renderCajaChica', 'renderAtenciones', 'showToast']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.confirm = () => true;
});

const MEDICO = 'Dr. Polisky, Nicolás';

describe('Honorario por médico (suma de honorMedicoReg)', () => {
  it('suma honorarios OS por consulta + 50% de particulares transferencia', () => {
    const hon = app.DB.config.honorarioOS;                      // 10500
    const base = app.DB.config.valorConsultaParticular / 2;     // 30000
    const regs = [
      { os: 'OSDE', medico: MEDICO, fecha: '2026-06-03', cantidad: 2, valorUnit: 55679, exenta: true, prestacion: 'Consulta' },
      { os: 'IOMA', medico: MEDICO, fecha: '2026-06-04', cantidad: 1, valorUnit: 11000, exenta: true, prestacion: 'Consulta' },
      { os: 'Particular', medico: MEDICO, fecha: '2026-06-05', partEfectivo: 0, partTransf: 1, partEfVal: 60000, partTrVal: 60000 },
    ];
    const total = regs.reduce((s, r) => s + app.honorMedicoReg(r), 0);
    expect(total).toBe(3 * hon + 1 * base); // 3 consultas OS + 1 particular = 31500 + 30000
  });

  it('cirugías OS no suman honorario de consulta', () => {
    const r = { os: 'OSDE', medico: MEDICO, fecha: '2026-06-06', cantidad: 1, valorUnit: 1351970, prestacion: 'Catarata / facoemulsificación c/IOL' };
    expect(app.honorMedicoReg(r)).toBe(0);
  });
});

describe('honorariosMedico (fuente única) y honorALiquidarReg', () => {
  const hon = () => app.DB.config.honorarioOS;            // 10500
  const half = () => app.DB.config.valorConsultaParticular / 2; // 30000

  it('desglosa honOS/honSC/honEf/honTr y aLiquidar EXCLUYE el efectivo (ya pagado)', () => {
    const regs = [
      { os: 'OSDE', cantidad: 2, valorUnit: 55679, exenta: true, prestacion: 'Consulta' },     // honOS = 2×10500
      { os: 'SinCargo', cantidad: 1, valorUnit: 0.1 },                                          // honSC = 0.1
      { os: 'Particular', partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 }, // honEf = 30000
      { os: 'Particular', partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 60000 }, // honTr = 30000
    ];
    const h = app.honorariosMedico(regs);
    expect(h.honOS).toBe(2 * hon());
    expect(h.honSC).toBeCloseTo(0.1, 5);
    expect(h.honEf).toBe(half());
    expect(h.honTr).toBe(half());
    // aLiquidar = honOS + honTr + honSC (sin honEf)
    expect(h.aLiquidar).toBeCloseTo(2 * hon() + half() + 0.1, 5);
  });

  it('H1: aLiquidar incluye SinCargo (no se omite)', () => {
    const h = app.honorariosMedico([{ os: 'SinCargo', cantidad: 3, valorUnit: 0.1 }]);
    expect(h.aLiquidar).toBeCloseTo(0.3, 5);
  });

  it('H2: honorALiquidarReg de un Particular excluye el efectivo (solo transferencia)', () => {
    const efectivo = { os: 'Particular', partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 };
    const transfer = { os: 'Particular', partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 60000 };
    expect(app.honorALiquidarReg(efectivo)).toBe(0);        // efectivo ya pagado → no se liquida
    expect(app.honorALiquidarReg(transfer)).toBe(half());   // transferencia sí
  });

  it('H2: suma de honorALiquidarReg por registro == aLiquidar de honorariosMedico', () => {
    const regs = [
      { os: 'OSDE', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta' },
      { os: 'Particular', partEfectivo: 2, partEfVal: 60000, partTransf: 1, partTrVal: 60000 },
      { os: 'SinCargo', cantidad: 1, valorUnit: 0.1 },
    ];
    const suma = regs.reduce((s, r) => s + app.honorALiquidarReg(r), 0);
    expect(suma).toBeCloseTo(app.honorariosMedico(regs).aLiquidar, 5);
  });
});

describe('Cierre de mes (máquina de estados)', () => {
  it('cerrarMesMedico crea la liquidación en estado Cerrada', () => {
    app.cerrarMesMedico(MEDICO, '2026-06');
    const liq = app.getLiquidacion('2026-06', MEDICO);
    expect(liq).toBeTruthy();
    expect(liq.estado).toBe('Cerrada');
    expect(liq.facturaRecibida).toBe(false);
    expect(liq.pagoEnviado).toBe(false);
  });

  it('un mes cerrado bloquea la edición/borrado de sus atenciones (regBloqueado)', () => {
    const reg = { id: 9000, os: 'OSDE', medico: MEDICO, fecha: '2026-06-10', cantidad: 1, valorUnit: 55679, exenta: true };
    app.DB.registros.push(reg);
    expect(app.regBloqueado(reg)).toBe(false);
    app.cerrarMesMedico(MEDICO, '2026-06');
    expect(app.regBloqueado(reg)).toBe(true);
    // y eliminarRegistro NO debe borrarlo
    app.eliminarRegistro(9000);
    expect(app.DB.registros.some(r => r.id === 9000)).toBe(true);
  });

  it('flujo completo: cerrar → factura recibida → pago enviado', () => {
    app.cerrarMesMedico(MEDICO, '2026-06');
    app.marcarFacturaRecibida(MEDICO, '2026-06');
    expect(app.getLiquidacion('2026-06', MEDICO).facturaRecibida).toBe(true);
    app.confirmarPagoEnviado(MEDICO, '2026-06');
    expect(app.getLiquidacion('2026-06', MEDICO).pagoEnviado).toBe(true);
  });

  it('reabrir vuelve a Abierta y desmarca factura', () => {
    app.cerrarMesMedico(MEDICO, '2026-06');
    app.marcarFacturaRecibida(MEDICO, '2026-06');
    app.reabrirMesMedico(MEDICO, '2026-06');
    const liq = app.getLiquidacion('2026-06', MEDICO);
    expect(liq.estado).toBe('Abierta');
    expect(liq.facturaRecibida).toBe(false);
  });

  it('reabrir tras el pago (para corregir un error): vuelve a Abierta y revierte el egreso de Caja', () => {
    app.cerrarMesMedico(MEDICO, '2026-06');
    app.confirmarPagoEnviado(MEDICO, '2026-06');
    const liq = app.getLiquidacion('2026-06', MEDICO);
    const habiaEgreso = app.DB.movimientos.some(m => m.liqId === liq.id && m.origen === 'Honorario');
    app.reabrirMesMedico(MEDICO, '2026-06');
    expect(liq.estado).toBe('Abierta');
    expect(liq.pagoEnviado).toBe(false);
    expect(liq.fechaPago).toBe(null);
    // el egreso de Caja del pago se revirtió (si lo había)
    if (habiaEgreso) expect(app.DB.movimientos.some(m => m.liqId === liq.id)).toBe(false);
  });
});
