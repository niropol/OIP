// Actualizar precios: es POR OBRA SOCIAL y POR MES. Se re-aplican los valores de Configuración
// SOLO a la OS elegida y solo desde el mes elegido en adelante. Otras OS y meses anteriores
// quedan intactos. El preview (dryRun) cuenta sin modificar.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window;
  await new Promise(r => setTimeout(r, 0));   // dejar correr arranque (sb=null en DEV)
  resetDatos(app);
  ['showToast', 'renderConfiguracion', 'initDashboard', 'openModal', 'closeModal']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.confirm = () => true; window.alert = () => {};
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 60000 },
    { id: 2, codigo: '001',    desc: 'Consulta',            os: 'IOMA', valOS: 20000 },
  ];
});

function reg(o) { return { cantidad: 1, exenta: true, plan: '', ...o }; }

describe('Alcance: SOLO la obra social elegida', () => {
  it('reprecia OSDE y deja intacta IOMA', async () => {
    app.DB.registros = [
      reg({ id: 10, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-10', valorUnit: 55679 }),
      reg({ id: 11, os: 'IOMA', codigo: '001', prestacion: 'Consulta', fecha: '2026-06-10', valorUnit: 11000 }),
    ];
    await app.actualizarPreciosPrestaciones('OSDE', '2026-06-01');
    expect(app.DB.registros.find(r => r.id === 10).valorUnit).toBe(60000);   // OSDE actualizada
    expect(app.DB.registros.find(r => r.id === 11).valorUnit).toBe(11000);   // IOMA intacta
  });
});

describe('Alcance: SOLO desde el mes elegido en adelante', () => {
  it('junio cambia, mayo no', async () => {
    app.DB.registros = [
      reg({ id: 20, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-05-20', valorUnit: 55679 }),
      reg({ id: 21, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-20', valorUnit: 55679 }),
    ];
    await app.actualizarPreciosPrestaciones('OSDE', '2026-06-01');
    expect(app.DB.registros.find(r => r.id === 20).valorUnit).toBe(55679);   // mayo intacta
    expect(app.DB.registros.find(r => r.id === 21).valorUnit).toBe(60000);   // junio actualizada
  });
});

describe('Preview (dryRun) y guardas', () => {
  it('dryRun cuenta las que cambiarían SIN modificar', () => {
    app.DB.registros = [reg({ id: 30, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-10', valorUnit: 55679 })];
    const prev = app._repreciarRegistros('2026-06-01', 'OSDE', true);
    expect(prev.actualizadas).toBe(1);
    expect(app.DB.registros[0].valorUnit).toBe(55679);   // NO tocó nada
  });

  it('no cuenta las que ya tienen el precio nuevo (solo los cambios reales)', () => {
    app.DB.registros = [reg({ id: 31, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-10', valorUnit: 60000 })];
    const prev = app._repreciarRegistros('2026-06-01', 'OSDE', true);
    expect(prev.actualizadas).toBe(0);
  });

  it('el worker sin OS o sin mes no hace nada', async () => {
    app.DB.registros = [reg({ id: 40, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-10', valorUnit: 55679 })];
    await app.actualizarPreciosPrestaciones('', '');
    expect(app.DB.registros[0].valorUnit).toBe(55679);
  });
});

describe('Desde el modal (confirmarActualizarPreciosOS)', () => {
  it('toma la OS y el mes del modal y aplica solo eso', async () => {
    app.DB.registros = [
      reg({ id: 50, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-06-10', valorUnit: 55679 }),
      reg({ id: 51, os: 'IOMA', codigo: '001', prestacion: 'Consulta', fecha: '2026-06-10', valorUnit: 11000 }),
    ];
    app.abrirActualizarPreciosOS();                 // puebla el select de OS + mes actual
    setInput(window, 'actu-precios-os', 'OSDE');
    setInput(window, 'actu-precios-mes', '2026-06');
    await app.confirmarActualizarPreciosOS();
    expect(app.DB.registros.find(r => r.id === 50).valorUnit).toBe(60000);
    expect(app.DB.registros.find(r => r.id === 51).valorUnit).toBe(11000);
  });
});
