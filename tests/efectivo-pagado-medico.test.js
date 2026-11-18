// BUG (reportado 2026-11): el reporte marcaba el honorario en EFECTIVO del médico como "ya cobró"
// aunque el usuario dijera que NO lo pagó. Ahora el cálculo respeta lo pagado/pendiente:
//  - honorarioPagadoEfectivo true/false (modal)  o  honorEfPagados nº (carga masiva)
//  - lo pagado = honEf (ya cobró, fuera de "a depositar"); lo NO pagado = honEfPend (a depositar)
//  - dato viejo sin marca = se asume pagado (no altera meses cerrados)
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

const VC = 60000;   // valorConsultaParticular por defecto; honorario = 50% = 30000
const part = (o) => ({ id: o.id, os: 'Particular', medico: 'Dra. Cervera, Silvia', consultorio: 'Palpa',
  fecha: '2026-11-17', prestacion: 'Consulta particular', cantidad: 0, valorUnit: 0, exenta: true,
  categoria: 'consulta', partEfectivo: 0, partEfVal: VC, partTransf: 0, partTrVal: VC, ...o });

describe('efPagadosReg: respeta la marca de pago', () => {
  it('honorarioPagadoEfectivo=false → 0 pagados', () => {
    expect(app.efPagadosReg(part({ id: 1, partEfectivo: 2, honorarioPagadoEfectivo: false }))).toBe(0);
  });
  it('honorarioPagadoEfectivo=true → todas pagadas', () => {
    expect(app.efPagadosReg(part({ id: 1, partEfectivo: 2, honorarioPagadoEfectivo: true }))).toBe(2);
  });
  it('honorEfPagados=1 de 3 → 1 pagada', () => {
    expect(app.efPagadosReg(part({ id: 1, partEfectivo: 3, honorEfPagados: 1 }))).toBe(1);
  });
  it('sin marca (dato viejo) → se asume pagado', () => {
    expect(app.efPagadosReg(part({ id: 1, partEfectivo: 2 }))).toBe(2);
  });
});

describe('honorariosMedico: efectivo no pagado va a "a depositar"', () => {
  it('2 efectivo marcados NO pagados → honEfPend=60000, honEf=0, suman a aLiquidar', () => {
    app.DB.registros = [part({ id: 1, partEfectivo: 2, honorEfPagados: 0 })];
    const h = app.honorariosMedico(app.DB.registros);
    expect(h.honEf).toBe(0);
    expect(h.honEfPend).toBe(60000);     // 2 × 30000
    expect(h.efPendCount).toBe(2);
    expect(h.efPagCount).toBe(0);
    expect(h.aLiquidar).toBe(60000);     // ahora SÍ se deposita
  });

  it('2 efectivo pagados → honEf=60000 (ya cobró), NO van a aLiquidar', () => {
    app.DB.registros = [part({ id: 1, partEfectivo: 2, honorarioPagadoEfectivo: true })];
    const h = app.honorariosMedico(app.DB.registros);
    expect(h.honEf).toBe(60000);
    expect(h.honEfPend).toBe(0);
    expect(h.aLiquidar).toBe(0);
  });

  it('mezcla: 3 efectivo, 1 pagado → honEf=30000, honEfPend=60000, aLiquidar=60000', () => {
    app.DB.registros = [part({ id: 1, partEfectivo: 3, honorEfPagados: 1 })];
    const h = app.honorariosMedico(app.DB.registros);
    expect(h.honEf).toBe(30000);
    expect(h.honEfPend).toBe(60000);
    expect(h.aLiquidar).toBe(60000);
  });

  it('honorALiquidarReg incluye el efectivo pendiente', () => {
    const r = part({ id: 1, partEfectivo: 2, honorEfPagados: 0 });
    expect(app.honorALiquidarReg(r)).toBe(60000);
    const rPag = part({ id: 2, partEfectivo: 2, honorarioPagadoEfectivo: true });
    expect(app.honorALiquidarReg(rPag)).toBe(0);
  });
});

describe('toggleEfectivoPagadoMedico: corrige y ajusta caja chica', () => {
  beforeEach(() => {
    app.DB.registros = [part({ id: 1, partEfectivo: 2, honorEfPagados: 0 })];  // 2 efectivo sin pagar
    app.DB.cajaChica = [];
    // stubs de render
    ['generarPreliq', 'renderCajaChica', 'showToast'].forEach(fn => { app.__APP__ && 0; });
  });

  it('marcar PAGADO → reg queda pagado y se crea egreso de honorario en caja chica', () => {
    app.toggleEfectivoPagadoMedico('Dra. Cervera, Silvia', '2026-11', true);
    const r = app.DB.registros[0];
    expect(app.efPagadosReg(r)).toBe(2);
    expect(r.honorarioPagadoEfectivo).toBe(true);
    const egreso = app.DB.cajaChica.filter(c => c.origen === 'Honorario' && c.tipo === 'Egreso');
    expect(egreso.length).toBe(1);
    expect(egreso[0].monto).toBe(60000);
    expect(app.honorariosMedico(app.DB.registros).aLiquidar).toBe(0);  // ya no se deposita
  });

  it('marcar NO pagado (revertir) → quita el egreso y vuelve a "a depositar"', () => {
    app.toggleEfectivoPagadoMedico('Dra. Cervera, Silvia', '2026-11', true);   // paga
    app.toggleEfectivoPagadoMedico('Dra. Cervera, Silvia', '2026-11', false);  // revierte
    const r = app.DB.registros[0];
    expect(app.efPagadosReg(r)).toBe(0);
    expect(app.DB.cajaChica.filter(c => c.origen === 'Honorario').length).toBe(0);
    expect(app.honorariosMedico(app.DB.registros).aLiquidar).toBe(60000);
  });

  it('no toca nada si el mes está cerrado', () => {
    app.DB.liquidaciones = [{ id: 99, mes: '2026-11', medico: 'Dra. Cervera, Silvia', estado: 'Cerrada' }];
    app.toggleEfectivoPagadoMedico('Dra. Cervera, Silvia', '2026-11', true);
    expect(app.efPagadosReg(app.DB.registros[0])).toBe(0);   // sin cambios
    expect(app.DB.cajaChica.length).toBe(0);
  });
});
