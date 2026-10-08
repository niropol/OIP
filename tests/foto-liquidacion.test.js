// FOTO DE LIQUIDACIÓN (ALTO 1): al cerrar el mes de un médico se guarda una "foto"
// (liq.foto) de sus honorarios. Si después algo cambia (se edita/agrega/borra una
// atención, o cambia honorarioOS), la vista de cierre AVISA que los números ya no
// coinciden con lo que se cerró (drift), para poder reabrir antes de pagar.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
const MEDICO = 'Dr. Polisky, Nicolás';
const MES = '2026-06';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['generarPreliq', 'showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.confirm = () => true;
});

function cargarConsultas(n) {
  app.DB.registros.push({
    id: 1, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: `${MES}-05`,
    cantidad: n, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0,
  });
}

describe('La foto se guarda al cerrar', () => {
  it('cerrarMesMedico guarda liq.foto con el aLiquidar del momento', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    const liq = app.getLiquidacion(MES, MEDICO);
    expect(liq.foto).toBeTruthy();
    expect(liq.foto.aLiquidar).toBe(2 * app.DB.config.honorarioOS);
    expect(liq.foto.nRegistros).toBe(1);
    expect(liq.foto.honorarioOS).toBe(app.DB.config.honorarioOS);
  });
});

describe('Detección de drift (la foto ya no coincide)', () => {
  it('sin cambios después del cierre → no hay drift', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    expect(app._driftLiquidacion(MEDICO, MES)).toBeNull();
  });

  it('agregar una atención después del cierre → avisa drift con el delta', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    // llega una atención más de ese médico/mes (p. ej. cargada tarde)
    app.DB.registros.push({
      id: 2, os: 'OSDE', medico: MEDICO, consultorio: 'Haedo', fecha: `${MES}-20`,
      cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0,
    });
    const drift = app._driftLiquidacion(MEDICO, MES);
    expect(drift).toBeTruthy();
    expect(drift.antes).toBe(2 * app.DB.config.honorarioOS);
    expect(drift.ahora).toBe(3 * app.DB.config.honorarioOS);
    expect(drift.delta).toBe(app.DB.config.honorarioOS);
    expect(drift.nAntes).toBe(1);
    expect(drift.nAhora).toBe(2);
  });

  it('editar la cantidad de una atención cerrada → drift (aunque no cambie el nº de registros)', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    app.DB.registros[0].cantidad = 5;   // secretaria corrige: eran 5 consultas
    const drift = app._driftLiquidacion(MEDICO, MES);
    expect(drift).toBeTruthy();
    expect(drift.ahora).toBe(5 * app.DB.config.honorarioOS);
    expect(drift.nAntes).toBe(drift.nAhora);   // misma cantidad de registros
    expect(drift.configCambio).toBe(false);
  });

  it('cambiar el honorario por consulta global → drift marcado como configCambio', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    app.DB.config.honorarioOS = app.DB.config.honorarioOS + 1000;
    const drift = app._driftLiquidacion(MEDICO, MES);
    expect(drift).toBeTruthy();
    expect(drift.configCambio).toBe(true);
    expect(drift.delta).toBe(2 * 1000);   // 2 consultas × +1000
  });

  it('reabrir y volver a cerrar toma una foto NUEVA → el drift se resetea', () => {
    cargarConsultas(2);
    app.cerrarMesMedico(MEDICO, MES);
    app.DB.registros[0].cantidad = 5;
    expect(app._driftLiquidacion(MEDICO, MES)).toBeTruthy();   // hay drift
    app.reabrirMesMedico(MEDICO, MES);
    app.cerrarMesMedico(MEDICO, MES);                          // re-cierre = foto nueva
    expect(app._driftLiquidacion(MEDICO, MES)).toBeNull();     // ya no hay drift
    expect(app.getLiquidacion(MES, MEDICO).foto.aLiquidar).toBe(5 * app.DB.config.honorarioOS);
  });
});

describe('Compatibilidad y bordes', () => {
  it('una liquidación cerrada VIEJA (sin foto) no dispara falsos avisos', () => {
    cargarConsultas(2);
    // Simula un cierre anterior a esta feature: liq cerrada sin foto
    app.DB.liquidaciones.push({ id: 99, mes: MES, medico: MEDICO, estado: 'Cerrada' });
    expect(app._driftLiquidacion(MEDICO, MES)).toBeNull();
  });

  it('una liquidación ABIERTA no evalúa drift', () => {
    cargarConsultas(2);
    app.DB.liquidaciones.push({ id: 98, mes: MES, medico: MEDICO, estado: 'Abierta', foto: { aLiquidar: 0, nRegistros: 0 } });
    expect(app._driftLiquidacion(MEDICO, MES)).toBeNull();
  });

  it('la foto toma TODOS los consultorios del médico (la liquidación es por mes, no por sede)', () => {
    app.DB.registros.push(
      { id: 1, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: `${MES}-05`, cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 2, os: 'OSDE', medico: MEDICO, consultorio: 'Haedo', fecha: `${MES}-06`, cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
    );
    const foto = app._fotoLiquidacion(MEDICO, MES);
    expect(foto.nRegistros).toBe(2);
    expect(foto.aLiquidar).toBe(2 * app.DB.config.honorarioOS);
  });
});
