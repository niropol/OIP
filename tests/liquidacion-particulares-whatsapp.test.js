// El mensaje de WhatsApp de cierre de liquidación (enviarLiquidacionCierre) no decía
// cuántos pacientes particulares hubo en el mes ni el desglose efectivo/transferencia
// (el impreso sí lo tenía, el mensaje de WhatsApp no). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
const MEDICO = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

function mockClipboard(window) {
  let capturado = '';
  window.navigator.clipboard = { writeText: (t) => { capturado = t; return Promise.resolve(); } };
  window.showToast = () => {};
  return () => capturado;
}

describe('enviarLiquidacionCierre: desglose de particulares en el mensaje de WhatsApp', () => {
  it('con particulares efectivo y transferencia, muestra el total y el desglose', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 1, os: 'Particular', medico: MEDICO, fecha: '2026-06-03', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
      { id: 2, os: 'Particular', medico: MEDICO, fecha: '2026-06-04', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
      { id: 3, os: 'Particular', medico: MEDICO, fecha: '2026-06-05', cantidad: 0, valorUnit: 0, partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 60000 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).toContain('👤 Particulares: 3 (💵 2 efectivo · 🏦 1 transferencia)');
  });

  it('sin particulares en el mes, no aparece la línea', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 4, os: 'OSDE', medico: MEDICO, fecha: '2026-06-03', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta' },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).not.toContain('Particulares:');
  });

  it('solo efectivo (sin transferencia): igual muestra el desglose completo', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 5, os: 'Particular', medico: MEDICO, fecha: '2026-06-03', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).toContain('👤 Particulares: 1 (💵 1 efectivo · 🏦 0 transferencia)');
  });
});

describe('enviarLiquidacionCierre: TOTAL de pacientes atendidos en general', () => {
  it('suma OS consultas + cirugías (no solo consultas) + particulares + SinCargo', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      // 2 consultas OS
      { id: 10, os: 'OSDE', medico: MEDICO, fecha: '2026-06-01', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 11, os: 'OSDE', medico: MEDICO, fecha: '2026-06-02', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      // 1 cirugía OS (no es "consulta" — no debe faltar en el total aunque no sume en "OS: X consultas")
      { id: 12, os: 'OSDE', medico: MEDICO, fecha: '2026-06-03', cantidad: 1, valorUnit: 1351970, exenta: true, prestacion: 'Catarata c/IOL', partEfectivo: 0, partTransf: 0 },
      // 2 particulares (1 efectivo + 1 transferencia)
      { id: 13, os: 'Particular', medico: MEDICO, fecha: '2026-06-04', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
      { id: 14, os: 'Particular', medico: MEDICO, fecha: '2026-06-05', cantidad: 0, valorUnit: 0, partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 60000 },
      // 1 SinCargo
      { id: 15, os: 'SinCargo', medico: MEDICO, fecha: '2026-06-06', cantidad: 1, valorUnit: 0.1, partEfectivo: 0, partTransf: 0 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    // total = 2 (consultas) + 1 (cirugía) + 2 (particulares) + 1 (SinCargo) = 6
    expect(msg).toContain('👥 *Total de pacientes: 6*');
    // y sigue mostrando "Total obra social: 2 consultas" (sin la cirugía, que no paga honorario fijo)
    expect(msg).toContain('🏥 Total obra social: 2 consultas');
  });

  it('sin ningún registro en el mes, no aparece la línea de total', () => {
    const getMsg = mockClipboard(window);
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).not.toContain('Total de pacientes');
  });
});

describe('enviarLiquidacionCierre: orden del mensaje — cantidades primero, honorarios después', () => {
  it('Total de pacientes, por consultorio, total OS y particulares aparecen ANTES del bloque de Honorarios', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 20, os: 'OSDE', medico: MEDICO, fecha: '2026-06-01', consultorio: 'Palpa', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 21, os: 'OSDE', medico: MEDICO, fecha: '2026-06-02', consultorio: 'Haedo', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 22, os: 'Particular', medico: MEDICO, fecha: '2026-06-03', consultorio: 'Palpa', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    const iTotal = msg.indexOf('Total de pacientes');
    const iSede = msg.indexOf('Por consultorio');
    const iOS = msg.indexOf('Total obra social');
    const iPart = msg.indexOf('Particulares:');
    const iHonorarios = msg.indexOf('*Honorarios:*');
    expect(iTotal).toBeGreaterThan(-1);
    expect(iSede).toBeGreaterThan(iTotal);
    expect(iOS).toBeGreaterThan(iSede);
    expect(iPart).toBeGreaterThan(iOS);
    expect(iHonorarios).toBeGreaterThan(iPart);
  });

  it('Por consultorio NO aparece si atendió en un solo consultorio', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 23, os: 'OSDE', medico: MEDICO, fecha: '2026-06-01', consultorio: 'Palpa', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 24, os: 'OSDE', medico: MEDICO, fecha: '2026-06-02', consultorio: 'Palpa', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).not.toContain('Por consultorio');
  });

  it('Por consultorio suma lo mismo que Total de pacientes (incluye particulares, no solo OS)', () => {
    const getMsg = mockClipboard(window);
    app.DB.registros.push(
      { id: 25, os: 'OSDE', medico: MEDICO, fecha: '2026-06-01', consultorio: 'Palpa', cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
      { id: 26, os: 'Particular', medico: MEDICO, fecha: '2026-06-02', consultorio: 'Haedo', cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000 },
    );
    app.enviarLiquidacionCierre(MEDICO, '2026-06');
    const msg = getMsg();
    expect(msg).toContain('👥 *Total de pacientes: 2*');
    expect(msg).toContain('Palpa: 1 pacientes');
    expect(msg).toContain('Haedo: 1 pacientes');
  });
});
