// Limpieza de atenciones huérfanas (duplicados que quedaron con el nombre de un médico
// que ya no existe, tras recargar con el nombre corregido). eliminarAtencionesHuerfanas
// las borra junto con sus movimientos de caja vinculados por id, con doble confirmación.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['showToast', 'renderAtenciones', 'renderFinanzas', 'renderCajaChica', 'renderConfiguracion', 'initDashboard'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
  window.alert = () => {};
  app.DB.medicos = [{ id: 1, nombre: 'Dr. Correcto, Nombre', color: '#333' }];
  // Duplicados huérfanos (nombre viejo) + su caja + una buena (nombre correcto)
  app.DB.registros = [
    { id: 10, os: 'OSDE', medico: 'Dr. Viejo, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: true, fecha: '2026-06-05' },
    { id: 11, os: 'OSDE', medico: 'Dr. Viejo, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 200000, exenta: true, fecha: '2026-06-06' },
    { id: 12, os: 'OSDE', medico: 'Dr. Correcto, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: true, fecha: '2026-06-05' }, // la buena
  ];
  app.DB.cajaChica   = [{ id: 50, regId: 10, tipo: 'Ingreso', origen: 'Copago', concepto: 'x', monto: 5000, consultorio: 'Palpa', fecha: '2026-06-05' }];
  app.DB.movimientos = [{ id: 60, regId: 11, tipo: 'Ingreso', origen: 'Particular', desc: 'x', monto: 200000, consultorio: 'Palpa', fecha: '2026-06-06' }];
  app.DB.liquidaciones = [{ id: 70, mes: '2026-06', medico: 'Dr. Viejo, Nombre', estado: 'Cerrada' }];
});

describe('eliminarAtencionesHuerfanas', () => {
  it('elimina las huérfanas + su caja vinculada, sin tocar la atención válida', () => {
    window.confirm = () => true;   // los dos confirms
    const n = app.eliminarAtencionesHuerfanas();
    expect(n).toBe(2);
    // Las huérfanas se fueron; la buena queda
    expect(app.DB.registros.map(r => r.id)).toEqual([12]);
    // Caja vinculada por regId eliminada
    expect(app.DB.cajaChica.find(m => m.id === 50)).toBeUndefined();
    expect(app.DB.movimientos.find(m => m.id === 60)).toBeUndefined();
    // Liquidación huérfana eliminada
    expect(app.DB.liquidaciones.length).toBe(0);
    expect(app.__dirtyCols()).toContain('registros');
    expect(app.__dirtyCols()).toContain('cajaChica');
    expect(app.__dirtyCols()).toContain('movimientos');
  });

  it('cancelar cualquiera de las confirmaciones no borra nada', () => {
    window.confirm = () => false;  // cancela la primera
    const n = app.eliminarAtencionesHuerfanas();
    expect(n).toBe(0);
    expect(app.DB.registros.length).toBe(3);
    expect(app.DB.cajaChica.length).toBe(1);
  });

  it('cancelar SOLO la segunda confirmación tampoco borra', () => {
    let llamada = 0;
    window.confirm = () => { llamada++; return llamada === 1; };  // 1ª sí, 2ª no
    const n = app.eliminarAtencionesHuerfanas();
    expect(n).toBe(0);
    expect(app.DB.registros.length).toBe(3);
  });

  it('sin huérfanas no hace nada', () => {
    app.DB.registros = [{ id: 12, os: 'OSDE', medico: 'Dr. Correcto, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, fecha: '2026-06-05' }];
    app.DB.liquidaciones = [];
    window.confirm = () => true;
    const n = app.eliminarAtencionesHuerfanas();
    expect(n).toBe(0);
    expect(app.DB.registros.length).toBe(1);
  });
});

describe('verAtencionesHuerfanas (solo lectura)', () => {
  it('encuentra y cuenta todas las huérfanas sin modificar nada', () => {
    window.open = () => null;   // sin popup real en el test
    const antes = JSON.stringify(app.DB.registros);
    const n = app.verAtencionesHuerfanas();
    expect(n).toBe(2);                                   // id 10 y 11
    expect(JSON.stringify(app.DB.registros)).toBe(antes); // no toca nada
  });

  it('devuelve 0 cuando no hay huérfanas', () => {
    app.DB.registros = [{ id: 12, os: 'OSDE', medico: 'Dr. Correcto, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, fecha: '2026-06-05' }];
    app.DB.liquidaciones = [];
    expect(app.verAtencionesHuerfanas()).toBe(0);
  });
});
