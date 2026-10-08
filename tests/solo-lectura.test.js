// MODO_EXPORTAR_BACKUP / solo lectura: la app carga de la nube pero el guardado queda
// BLOQUEADO por completo — imposible escribir. Es la red de seguridad para hacer el
// backup de producción sin riesgo. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

function mockSb() {
  const ops = { upserts: [], deletes: [] };
  const api = {
    from(table) {
      return {
        upsert(rows) { ops.upserts.push({ table, rows }); return Promise.resolve({ error: null }); },
        select() { return Promise.resolve({ data: [], error: null }); },
        delete() {
          const b = { eq() { return b; }, then(res) { ops.deletes.push({ table }); return Promise.resolve({ error: null }).then(res); } };
          return b;
        },
      };
    },
  };
  return { api, ops };
}

let app, window;
beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window;
  await new Promise(r => setTimeout(r, 0));
  resetDatos(app);
  window.showToast = () => {};
});

describe('Modo solo lectura: el guardado está bloqueado', () => {
  it('guardarEnNube NO escribe nada cuando _soloLectura=true', async () => {
    const m = mockSb();
    app.__setSb(m.api);
    app.__setDatosCargados(true);
    app.__setSoloLectura(true);
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app.marcarCambios('registros');
    await app.guardarEnNube(false);
    expect(m.ops.upserts.length).toBe(0);   // ninguna escritura
    expect(m.ops.deletes.length).toBe(0);
  });

  it('con _soloLectura=false el guardado SÍ funciona (control)', async () => {
    const m = mockSb();
    app.__setSb(m.api);
    app.__setDatosCargados(true);
    app.__setSoloLectura(false);
    app._guardarSnapshot();
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app.marcarCambios('registros');
    await app.guardarEnNube(true);
    expect(m.ops.upserts.length).toBeGreaterThan(0);
  });
});
