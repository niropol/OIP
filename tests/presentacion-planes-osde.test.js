// La presentación agrupa por código, PERO prestaciones distintas que comparten código (las
// consultas OSDE por plan: todas código 420162, precios distintos) deben ir en filas separadas
// —cada plan con su precio real y su nombre— en vez de colapsar en una sola con precio promedio.
// Las variantes triviales de texto del MISMO ítem, y un ítem repreciado en el mes, sí se unen.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

describe('filasPresentacionOS — planes OSDE con código compartido', () => {
  it('planes distintos (mismo código 420162) → una fila por plan, con su precio', () => {
    app.DB.registros = [
      { id: 1, os: 'OSDE', medico: 'M', consultorio: 'Palpa', fecha: '2026-08-05', prestacion: 'Consulta (Plan 210)', codigo: '420162', cantidad: 1, valorUnit: 21536, exenta: true, categoria: 'consulta' },
      { id: 2, os: 'OSDE', medico: 'M', consultorio: 'Palpa', fecha: '2026-08-06', prestacion: 'Consulta (Plan 510)', codigo: '420162', cantidad: 1, valorUnit: 55679, exenta: true, categoria: 'consulta' },
    ];
    const filas = app.filasPresentacionOS(app.DB.registros, 'OSDE');
    expect(filas.length).toBe(2);
    const p210 = filas.find(f => f.prestacion.includes('210'));
    const p510 = filas.find(f => f.prestacion.includes('510'));
    expect(p210.valorUnit).toBe(21536);
    expect(p510.valorUnit).toBe(55679);
    expect(p210.valorMixto).toBe(false);
    // El total no cambia respecto de totalesOS
    const t = app.totalesOS(app.DB.registros, 'OSDE');
    expect(filas.reduce((s, f) => s + f.neto + f.iva, 0)).toBeCloseTo(t.total, 2);
  });

  it('MISMO plan repreciado en el mes → UNA fila con promedio ponderado (flag mixto)', () => {
    app.DB.registros = [
      { id: 1, os: 'OSDE', fecha: '2026-08-05', prestacion: 'Consulta (Plan 210)', codigo: '420162', cantidad: 2, valorUnit: 21536, exenta: true, categoria: 'consulta' },
      { id: 2, os: 'OSDE', fecha: '2026-08-20', prestacion: 'Consulta (Plan 210)', codigo: '420162', cantidad: 1, valorUnit: 23000, exenta: true, categoria: 'consulta' },
    ];
    const filas = app.filasPresentacionOS(app.DB.registros, 'OSDE');
    expect(filas.length).toBe(1);
    expect(filas[0].valorMixto).toBe(true);
    expect(filas[0].cant).toBe(3);
  });

  it('variantes triviales de texto del mismo ítem se siguen uniendo', () => {
    app.DB.registros = [
      { id: 1, os: 'OSDE', fecha: '2026-08-05', prestacion: 'Consulta (Plan 210)', codigo: '420162', cantidad: 1, valorUnit: 21536, exenta: true, categoria: 'consulta' },
      { id: 2, os: 'OSDE', fecha: '2026-08-06', prestacion: 'consulta (plan 210)', codigo: '420162', cantidad: 1, valorUnit: 21536, exenta: true, categoria: 'consulta' },
    ];
    const filas = app.filasPresentacionOS(app.DB.registros, 'OSDE');
    expect(filas.length).toBe(1);
    expect(filas[0].cant).toBe(2);
  });
});
