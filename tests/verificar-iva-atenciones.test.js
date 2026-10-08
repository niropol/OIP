// verificarIVAAtenciones: detecta (sin modificar nada) cuando una misma prestación de una OS
// quedó, dentro del mismo mes, PARTE exenta y PARTE gravada. Es el error de carga que aparecía
// a fin de mes. Read-only: el IVA solo lo cambia el usuario.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

const reg = (id, os, prest, fecha, exenta) =>
  ({ id, os, prestacion: prest, codigo: '420101', fecha, cantidad: 1, valorUnit: 50000, exenta });

describe('verificarIVAAtenciones', () => {
  it('marca OK cuando cada OS+prestación tiene un IVA único en el mes', () => {
    app.DB.registros = [
      reg(1, 'OSDE', 'Consulta', '2026-08-01', true),
      reg(2, 'OSDE', 'Consulta', '2026-08-05', true),
      reg(3, 'Medicus', 'Consulta', '2026-08-05', false),
    ];
    const res = app.verificarIVAAtenciones(null, '2026-08');
    expect(res.ok).toBe(true);
    expect(res.revisadas).toBe(3);
    expect(res.inconsistencias.length).toBe(0);
  });

  it('detecta IVA mezclado (exenta + gravada) en la misma OS+prestación+mes', () => {
    app.DB.registros = [
      reg(1, 'OSDE', 'Consulta', '2026-08-01', true),
      reg(2, 'OSDE', 'Consulta', '2026-08-02', true),
      reg(3, 'OSDE', 'Consulta', '2026-08-03', false),   // la díscola
    ];
    const res = app.verificarIVAAtenciones(null, '2026-08');
    expect(res.ok).toBe(false);
    expect(res.inconsistencias.length).toBe(1);
    const g = res.inconsistencias[0];
    expect(g.os).toBe('OSDE');
    expect(g.exentas).toBe(2);
    expect(g.gravadas).toBe(1);
  });

  it('NO marca mezcla entre MESES distintos (cada mes es su propio grupo)', () => {
    app.DB.registros = [
      reg(1, 'OSDE', 'Consulta', '2026-07-10', false),   // julio: gravada
      reg(2, 'OSDE', 'Consulta', '2026-08-10', true),    // agosto: exenta
    ];
    const res = app.verificarIVAAtenciones(null, undefined);  // todos los meses
    expect(res.ok).toBe(true);
  });

  it('ignora Particular (siempre exenta, no se presenta a OS)', () => {
    app.DB.registros = [
      { id: 1, os: 'Particular', prestacion: 'Consulta particular', fecha: '2026-08-01', exenta: true, valorUnit: 0 },
      { id: 2, os: 'Particular', prestacion: 'Consulta particular', fecha: '2026-08-02', exenta: false, valorUnit: 0 },
    ];
    const res = app.verificarIVAAtenciones(null, '2026-08');
    expect(res.ok).toBe(true);
    expect(res.revisadas).toBe(0);
  });
});
