// Backup diario automático en la nube: una foto completa por día, guardada en app_data
// como coleccion 'backup' (excluida de la carga). Se crea sola tras cargar; se puede listar
// y restaurar. Todo best-effort. Estos tests cubren la lógica con un mock de Supabase.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window;
  await new Promise(r => setTimeout(r, 0));   // dejar correr arranque() (modo DEV, sb=null)
  resetDatos(app);
  window.showToast = () => {};
});

// Mock que actúa como la tabla app_data para los backups (coleccion='backup').
function mockBackups(existentes = {}) {
  const store = { ...existentes };   // { docId: fila.data }
  const ops = { upserts: [], deletes: [] };
  const api = { from() { return {
    upsert(rows) {
      ops.upserts.push(rows);
      (Array.isArray(rows) ? rows : [rows]).forEach(r => { if (r.coleccion === 'backup') store[r.doc_id] = r.data; });
      return Promise.resolve({ error: null });
    },
    select() {
      let filtroCol = null, filtroDoc = null;
      const b = {
        eq(col, val) { if (col === 'coleccion') filtroCol = val; if (col === 'doc_id') filtroDoc = val; return b; },
        neq() { return b; }, order() { return b; },
        range() {
          const keys = Object.keys(store).map(Number).sort((a, z) => z - a);
          return Promise.resolve({ data: keys.map(k => ({ doc_id: k })), error: null });
        },
        maybeSingle() {
          if (filtroDoc != null) {
            const row = store[filtroDoc];
            return Promise.resolve({ data: row ? { doc_id: filtroDoc, data: row } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
    delete() { const b = { eq() { return b; }, lt(col, val) { ops.deletes.push(val); Object.keys(store).forEach(k => { if (Number(k) < val) delete store[k]; }); return Promise.resolve({ error: null }); } }; return b; },
  }; } };
  return { api, ops, store };
}

describe('Backup diario — fecha ↔ docId', () => {
  it('_fechaNum convierte AAAA-MM-DD a AAAAMMDD', () => {
    expect(app._fechaNum('2026-07-20')).toBe(20260720);
    expect(app._fechaNum('2026-01-05')).toBe(20260105);
  });
});

describe('Backup diario — creación automática', () => {
  it('crea el backup de HOY si no existe (foto completa de DB)', async () => {
    const m = mockBackups();
    app.__setSb(m.api); app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'Dr. X' }];
    await app._backupDiarioSiCorresponde();
    const hoyNum = app._fechaNum(app.hoyISO());
    expect(m.store[hoyNum]).toBeTruthy();
    expect(m.store[hoyNum].DB.registros).toHaveLength(1);   // guardó la foto de DB
    expect(m.store[hoyNum].dia).toBe(app.hoyISO());
  });

  it('NO re-crea el backup si el de hoy ya existe', async () => {
    const hoyNum = app._fechaNum(app.hoyISO());
    const m = mockBackups({ [hoyNum]: { DB: { registros: [] }, dia: app.hoyISO() } });
    app.__setSb(m.api); app.__setDatosCargados(true);
    await app._backupDiarioSiCorresponde();
    expect(m.ops.upserts.length).toBe(0);   // no subió nada nuevo
  });
});

describe('Backup diario — listar y restaurar', () => {
  it('listarBackupsNube devuelve las fechas (docId) ordenadas', async () => {
    const m = mockBackups({ 20260718: {}, 20260720: {}, 20260719: {} });
    app.__setSb(m.api);
    const lista = await app.listarBackupsNube();
    expect(lista).toEqual([20260720, 20260719, 20260718]);   // más nuevo primero
  });

  it('restaurarBackupNube reemplaza DB por la foto de ese día', async () => {
    const snap = { registros: [{ id: 99, os: 'IOMA', fecha: '2026-06-10' }], medicos: [], config: { honorarioOS: 10500 }, nextId: 500 };
    const m = mockBackups({ 20260715: { DB: snap } });
    app.__setSb(m.api); app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }];   // estado actual distinto
    window.confirm = () => true;
    const ok = await app.restaurarBackupNube(20260715);
    expect(ok).toBe(true);
    expect(app.DB.registros).toEqual([{ id: 99, os: 'IOMA', fecha: '2026-06-10' }]);   // quedó la foto restaurada
  });

  it('RED ANTI-ERROR: guarda una copia del estado ACTUAL antes de restaurar', async () => {
    const snap = { registros: [{ id: 99, os: 'IOMA', fecha: '2026-06-10' }], config: {}, nextId: 500 };
    const m = mockBackups({ 20260715: { DB: snap } });
    app.__setSb(m.api); app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }, { id: 2, os: 'CEMEPLA' }];   // estado actual (2 atenciones)
    window.confirm = () => true;
    const hoyNum = app._fechaNum(app.hoyISO());

    await app.restaurarBackupNube(20260715);

    // El backup de HOY quedó con el estado que había ANTES de restaurar (2 atenciones) → se puede deshacer.
    expect(m.store[hoyNum]).toBeTruthy();
    expect(m.store[hoyNum].DB.registros).toHaveLength(2);
    // Y DB ya quedó con la foto restaurada (1 atención).
    expect(app.DB.registros).toEqual([{ id: 99, os: 'IOMA', fecha: '2026-06-10' }]);
  });
});

describe('Backup a la nube A DEMANDA (botón)', () => {
  it('backupNubeAhora fuerza la foto de HOY con el estado actual, aunque ya exista', async () => {
    const hoyNum = app._fechaNum(app.hoyISO());
    // ya hay un backup viejo de hoy (estado del inicio del día)
    const m = mockBackups({ [hoyNum]: { DB: { registros: [] }, dia: app.hoyISO() } });
    app.__setSb(m.api); app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }, { id: 2, os: 'IOMA' }];   // cargué cosas durante el día
    const ok = await app.backupNubeAhora();
    expect(ok).toBe(true);
    expect(m.store[hoyNum].DB.registros).toHaveLength(2);   // sobrescribió con el estado ACTUAL
  });

  it('no hace backup si los datos no se cargaron bien', async () => {
    const m = mockBackups();
    app.__setSb(m.api); app.__setDatosCargados(false);
    const ok = await app.backupNubeAhora();
    expect(ok).toBe(false);
    expect(m.ops.upserts.length).toBe(0);
  });
});
