// La vigencia (mes) de un contrato/aumento reprecia las atenciones de ESA OS de ese
// mes EN ADELANTE (las ya cargadas y las futuras). Las anteriores no se tocan, y otras
// OS no se tocan. Fuente única _repreciarRegistros. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'renderConfiguracion', 'initDashboard'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.alert = () => {};
});

describe('_repreciarRegistros: vigencia y alcance', () => {
  beforeEach(() => {
    // Nomenclador nuevo: OSDE consulta = 60000 (por código 420114)
    app.DB.prestaciones = [
      { id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 60000 },
      { id: 2, codigo: '300102', desc: 'Consulta', os: 'IOMA', valOS: 30000 },
    ];
    // Atenciones con el valor VIEJO (50000 OSDE)
    app.DB.registros = [
      { id: 10, os: 'OSDE', codigo: '420114', prestacion: 'Consulta', fecha: '2026-05-20', cantidad: 1, valorUnit: 50000 }, // ANTES de vigencia
      { id: 11, os: 'OSDE', codigo: '420114', prestacion: 'Consulta', fecha: '2026-06-05', cantidad: 1, valorUnit: 50000 }, // en el mes
      { id: 12, os: 'OSDE', codigo: '420114', prestacion: 'Consulta', fecha: '2026-07-10', cantidad: 1, valorUnit: 50000 }, // posterior
      { id: 13, os: 'IOMA', codigo: '300102', prestacion: 'Consulta', fecha: '2026-06-15', cantidad: 1, valorUnit: 30000 }, // otra OS
    ];
  });

  it('reprecia SOLO la OS indicada, desde el mes de vigencia en adelante', () => {
    const rep = app._repreciarRegistros('2026-06', 'OSDE');
    expect(rep.actualizadas).toBe(2);   // junio y julio
    expect(app.DB.registros.find(r => r.id === 10).valorUnit).toBe(50000); // mayo: intacto
    expect(app.DB.registros.find(r => r.id === 11).valorUnit).toBe(60000); // junio: nuevo
    expect(app.DB.registros.find(r => r.id === 12).valorUnit).toBe(60000); // julio: nuevo
    expect(app.DB.registros.find(r => r.id === 13).valorUnit).toBe(30000); // IOMA: intacto
  });

  it('actualiza también partEfVal/partTrVal', () => {
    app._repreciarRegistros('2026-06', 'OSDE');
    const r = app.DB.registros.find(r => r.id === 11);
    expect(r.partEfVal).toBe(60000);
    expect(r.partTrVal).toBe(60000);
  });

  it('sin filtro de OS reprecia todas (pero respeta la vigencia)', () => {
    app.DB.prestaciones[1].valOS = 33000;   // IOMA sube
    const rep = app._repreciarRegistros('2026-06', null);
    expect(app.DB.registros.find(r => r.id === 13).valorUnit).toBe(33000);  // IOMA repreciada
    expect(app.DB.registros.find(r => r.id === 10).valorUnit).toBe(50000);  // mayo intacto
  });

  it('Particular y CEMEPLA nunca se tocan', () => {
    app.DB.prestaciones.push({ id: 3, codigo: 'X', desc: 'Consulta', os: 'CEMEPLA', valOS: 99999 });
    app.DB.registros.push(
      { id: 20, os: 'CEMEPLA', codigo: 'X', prestacion: 'Consulta', fecha: '2026-07-01', cantidad: 1, valorUnit: 40000 },
      { id: 21, os: 'Particular', fecha: '2026-07-01', partEfectivo: 1, partEfVal: 60000, valorUnit: 0 },
    );
    app._repreciarRegistros('2026-06', null);
    expect(app.DB.registros.find(r => r.id === 20).valorUnit).toBe(40000);  // CEMEPLA intacta
    expect(app.DB.registros.find(r => r.id === 21).partEfVal).toBe(60000);  // Particular intacta
  });

  it('reporta las que no encontraron su código en el nuevo contrato', () => {
    app.DB.registros.push({ id: 30, os: 'OSDE', codigo: 'NO-EXISTE', prestacion: 'Rareza', fecha: '2026-06-20', cantidad: 1, valorUnit: 12345 });
    const rep = app._repreciarRegistros('2026-06', 'OSDE');
    expect(rep.noEncontradas.some(r => r.id === 30)).toBe(true);
    expect(app.DB.registros.find(r => r.id === 30).valorUnit).toBe(12345); // no se tocó
  });
});

describe('_repreciarRegistros: el reprecio NUNCA cambia el IVA (solo el precio)', () => {
  // Crítico para facturación: el estado exenta/gravada de una atención lo decide el usuario y
  // NO se toca al actualizar precios, aunque el contrato del nomenclador diga otra cosa.
  it('contrato GRAVADA + atención EXENTA → sigue EXENTA (pero el precio se actualiza)', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '170101', desc: 'Cirugía', os: 'OSDE', valOS: 120000, exenta: false }];
    app.DB.registros = [{ id: 10, os: 'OSDE', codigo: '170101', prestacion: 'Cirugía', fecha: '2026-06-10', cantidad: 1, valorUnit: 100000, exenta: true }];
    const rep = app._repreciarRegistros('2026-06', 'OSDE');
    expect(rep.ivaCambiado).toBe(0);
    expect(app.DB.registros[0].exenta).toBe(true);      // IVA intacto (decisión del usuario)
    expect(app.DB.registros[0].valorUnit).toBe(120000); // precio sí se actualiza
  });

  it('contrato EXENTA + atención GRAVADA → sigue GRAVADA (precio actualizado)', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'Medifé', valOS: 55000, exenta: true }];
    app.DB.registros = [{ id: 10, os: 'Medifé', codigo: '420114', prestacion: 'Consulta', fecha: '2026-06-10', cantidad: 1, valorUnit: 50000, exenta: false }];
    const rep = app._repreciarRegistros('2026-06', 'Medifé');
    expect(rep.ivaCambiado).toBe(0);
    expect(app.DB.registros[0].exenta).toBe(false);     // IVA intacto
    expect(app.DB.registros[0].valorUnit).toBe(55000);
  });

  it('CEMEPLA no se toca (ni precio ni IVA)', () => {
    app.DB.prestaciones = [{ id: 1, codigo: 'X', desc: 'Consulta', os: 'CEMEPLA', valOS: 40000, exenta: true }];
    app.DB.registros = [{ id: 10, os: 'CEMEPLA', codigo: 'X', prestacion: 'Consulta', fecha: '2026-06-10', cantidad: 1, valorUnit: 30000, exenta: false }];
    const rep = app._repreciarRegistros('2026-06', 'CEMEPLA');
    expect(app.DB.registros[0].exenta).toBe(false);
    expect(app.DB.registros[0].valorUnit).toBe(30000);  // CEMEPLA excluido del reprecio
  });
});

describe('confirmarAumentoContrato reprecia las atenciones del mes', () => {
  it('un +20% en OSDE con vigencia junio actualiza prestaciones Y atenciones de junio+', async () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 }];
    app.DB.registros = [
      { id: 10, os: 'OSDE', codigo: '420114', prestacion: 'Consulta', fecha: '2026-05-10', cantidad: 1, valorUnit: 50000 },
      { id: 11, os: 'OSDE', codigo: '420114', prestacion: 'Consulta', fecha: '2026-06-10', cantidad: 1, valorUnit: 50000 },
    ];
    app.DB.contratos = [];
    app.DB.nextId = 5000;
    window.confirm = () => true;
    // Preparar la vista previa como lo hace calcularAumentoContrato
    setInput(window, 'aumento-os-sel', 'OSDE');
    setInput(window, 'aumento-pct', '20');
    setInput(window, 'aumento-vigencia', '2026-06');
    app.calcularAumentoContrato();
    await app.confirmarAumentoContrato();

    // Prestación al nuevo valor
    expect(app.DB.prestaciones.find(p => p.id === 1).valOS).toBe(60000);
    // Atención de junio repreciada; la de mayo intacta
    expect(app.DB.registros.find(r => r.id === 11).valorUnit).toBe(60000);
    expect(app.DB.registros.find(r => r.id === 10).valorUnit).toBe(50000);
  });
});
