// Autocorrección de nextId: el contador del próximo id nunca puede quedar por detrás
// del id más alto realmente en uso (si no, la próxima alta choca y rompe el guardado).
// _corregirNextId() lo deja en máx(id)+1 sobre TODAS las colecciones. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => {
  const h = loadApp();
  app = h.app;
  resetDatos(app);
});

describe('_corregirNextId', () => {
  it('corrige cuando nextId quedó por detrás del id más alto en uso', () => {
    app.DB.medicos = [{ id: 2560, nombre: 'X' }];
    app.DB.registros = [{ id: 2500, os: 'OSDE', medico: 'X', cantidad: 1 }];
    app.DB.nextId = 2530;                 // < 2560
    const corrigio = app._corregirNextId();
    expect(corrigio).toBe(true);
    expect(app.DB.nextId).toBe(2561);     // máx(2560) + 1
  });

  it('mira TODAS las colecciones para el id más alto', () => {
    app.DB.registros = [{ id: 100, os: 'OSDE', medico: 'X', cantidad: 1 }];
    app.DB.facturas = [{ id: 9999, estado: 'Pendiente' }];
    app.DB.movimientos = [{ id: 3000, tipo: 'Ingreso', monto: 1 }];
    app.DB.nextId = 500;
    app._corregirNextId();
    expect(app.DB.nextId).toBe(10000);    // máx(9999) + 1
  });

  it('no toca nextId si ya está por delante', () => {
    app.DB.medicos = [{ id: 100, nombre: 'X' }];
    app.DB.nextId = 3000;
    const corrigio = app._corregirNextId();
    expect(corrigio).toBe(false);
    expect(app.DB.nextId).toBe(3000);
  });

  it('base vacía: no rompe', () => {
    app.DB.nextId = 2000;
    const corrigio = app._corregirNextId();
    expect(corrigio).toBe(false);
    expect(app.DB.nextId).toBe(2000);
  });

  it('el diagnóstico deja de quejarse tras corregir', () => {
    app.DB.medicos = [{ id: 2560, nombre: 'X' }];
    app.DB.nextId = 2530;
    // antes: el diagnóstico marca el error de nextId
    const antes = app.runDiagnosticoDatos();
    expect(antes.errores.some(e => /nextId/.test(e.msg))).toBe(true);
    // corregir y re-diagnosticar
    app._corregirNextId();
    const despues = app.runDiagnosticoDatos();
    expect(despues.errores.some(e => /nextId/.test(e.msg))).toBe(false);
  });
});
