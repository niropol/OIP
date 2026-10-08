// Tests de los cálculos puros de facturación, IVA, honorarios y copagos.
// Corren contra el código ACTUAL de index.html sin modificarlo.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

describe('Facturación e IVA por tipo de OS', () => {
  it('OS exenta (OSDE): factura el neto, sin IVA', () => {
    const r = { os: 'OSDE', cantidad: 1, valorUnit: 55679, exenta: true };
    expect(app.subtotalNeto(r)).toBe(55679);
    expect(app.ivaReg(r)).toBe(0);
    expect(app.totalReg(r)).toBe(55679);
    expect(app.facturadoReg(r)).toBe(55679);
  });

  it('OS gravada al 10.5% (CoberMed) sin flag exenta usa el default', () => {
    const r = { os: 'CoberMed', cantidad: 1, valorUnit: 16442 };
    expect(app.getExentaForOS('CoberMed')).toBe(false);
    expect(app.ivaReg(r)).toBeCloseTo(16442 * 0.105, 2);
    expect(app.totalReg(r)).toBeCloseTo(16442 * 1.105, 2);
  });

  it('CEMEPLA lleva IVA 21%', () => {
    const r = { os: 'CEMEPLA', cantidad: 1, valorUnit: 50000 };
    expect(app.getExentaForOS('CEMEPLA')).toBe(false);
    expect(app.ivaReg(r)).toBeCloseTo(50000 * 0.21, 2);
    expect(app.totalReg(r)).toBeCloseTo(60500, 2);
  });

  it('flag exenta=false fuerza 10.5% aunque la OS sea exenta por defecto', () => {
    const r = { os: 'IOMA', cantidad: 2, valorUnit: 10000, exenta: false };
    expect(app.ivaReg(r)).toBeCloseTo(2 * 10000 * 0.105, 2);
  });

  it('flag exenta=true fuerza exención aunque la OS sea gravada por defecto', () => {
    const r = { os: 'CoberMed', cantidad: 1, valorUnit: 16442, exenta: true };
    expect(app.ivaReg(r)).toBe(0);
  });

  it('Particular: factura efectivo×valor + transferencia×valor, sin IVA', () => {
    const r = { os: 'Particular', partEfectivo: 1, partEfVal: 60000, partTransf: 1, partTrVal: 50000 };
    expect(app.ivaReg(r)).toBe(0);
    expect(app.facturadoReg(r)).toBe(110000);
  });
});

describe('Honorarios médicos', () => {
  it('OS consulta paga honorario fijo por consulta', () => {
    const hon = app.DB.config.honorarioOS;
    const r = { os: 'OSDE', cantidad: 2, valorUnit: 55679, prestacion: 'Consulta' };
    expect(app.cantConsultaHon(r)).toBe(2);
    expect(app.honorMedicoReg(r)).toBe(2 * hon);
  });

  it('Particular sin monto explícito usa el valor estándar (default) → 50%', () => {
    const base = app.DB.config.valorConsultaParticular / 2;
    const r = { os: 'Particular', partEfectivo: 1, partTransf: 1 };
    expect(app.honorMedicoReg(r)).toBe(2 * base);
  });

  it('Particular con monto especial → 50% de LO COBRADO (no del estándar)', () => {
    // efectivo $40.000 + transferencia $50.000 → honorario = 20.000 + 25.000 = 45.000
    const r = { os: 'Particular', partEfectivo: 1, partEfVal: 40000, partTransf: 1, partTrVal: 50000 };
    expect(app.honorMedicoReg(r)).toBe(45000);
  });

  it('SinCargo: el médico cobra lo que paga el paciente (≈$0,1), no el fijo', () => {
    const r = { os: 'SinCargo', cantidad: 1, valorUnit: 0.1 };
    expect(app.cantConsultaHon(r)).toBe(0);
    expect(app.honorMedicoReg(r)).toBeCloseTo(0.1, 5);
  });

  it('cirugía/estudio OS (no consulta) no paga honorario fijo de consulta', () => {
    const r = { os: 'OSDE', cantidad: 1, valorUnit: 1351970, prestacion: 'Catarata / facoemulsificación c/IOL' };
    expect(app.esConsultaReg(r)).toBe(false);
    expect(app.honorMedicoReg(r)).toBe(0);
  });
});

describe('Copagos (adelanto vs complementario)', () => {
  it('copago adelanto se descuenta de lo que paga la OS', () => {
    const r = { os: 'CoberMed', cantidad: 1, valorUnit: 16442, copago: 5000, copagoTipo: 'adelanto' };
    expect(app.copagoAdelantoReg(r)).toBe(5000);
    expect(app.netoOS(r)).toBeCloseTo(app.totalReg(r) - 5000, 2);
  });

  it('copago complementario NO se descuenta (la OS paga el total)', () => {
    const r = { os: 'CoberMed', cantidad: 1, valorUnit: 16442, copago: 5000, copagoTipo: 'complementario' };
    expect(app.copagoAdelantoReg(r)).toBe(0);
    expect(app.netoOS(r)).toBeCloseTo(app.totalReg(r), 2);
  });

  it('OS fuera del grupo de adelanto no descuenta copago', () => {
    const r = { os: 'OSDE', cantidad: 1, valorUnit: 55679, copago: 5000, copagoTipo: 'adelanto', exenta: true };
    expect(app.copagoAdelantoReg(r)).toBe(0);
  });
});

describe('totalesOS (fuente única de los totales de una preliquidación OS)', () => {
  it('agrega neto gravado, IVA 10.5% y copago adelanto', () => {
    const regs = [
      { os: 'CoberMed', cantidad: 1, valorUnit: 16442, copago: 2000, copagoTipo: 'adelanto' },
      { os: 'CoberMed', cantidad: 1, valorUnit: 10000 },
    ];
    const t = app.totalesOS(regs, 'CoberMed');
    expect(t.netoGravado).toBeCloseTo(26442, 2);
    expect(t.iva).toBeCloseTo(26442 * 0.105, 2);
    expect(t.total).toBeCloseTo(26442 * 1.105, 2);
    expect(t.copagoAdelanto).toBe(2000);
    expect(t.aFacturar).toBeCloseTo(t.total - 2000, 2);
  });

  it('CEMEPLA usa 21% en totalesOS', () => {
    const regs = [{ os: 'CEMEPLA', cantidad: 1, valorUnit: 50000, exenta: false }];
    const t = app.totalesOS(regs, 'CEMEPLA');
    expect(t.iva).toBeCloseTo(50000 * 0.21, 2);
    expect(t.total).toBeCloseTo(60500, 2);
  });

  it('OS exenta acumula en netoExento sin IVA', () => {
    const regs = [{ os: 'OSDE', cantidad: 1, valorUnit: 55679, exenta: true }];
    const t = app.totalesOS(regs, 'OSDE');
    expect(t.netoExento).toBe(55679);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(55679);
  });
});
