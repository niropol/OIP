// Tests de la capa de persistencia (guardarEnNube) con un Supabase SIMULADO.
// Blindan los fixes de pérdida de datos:
//  - no guardar si la carga no fue exitosa (datosCargados=false)
//  - borrado SEGURO: solo se borra de la nube lo que el usuario eliminó en la sesión
//    (estaba en el snapshot y ya no está local); nunca registros de otro usuario.
//  - subida SOLO de las colecciones modificadas (más rápido).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

// Supabase simulado: registra upserts y deletes, sin red.
// opts.onUpsert(): hook que corre DENTRO de cada upsert (para simular un cambio
//   concurrente mientras el guardado está "en vuelo").
// opts.selectData / opts.selectError: respuesta de .select() por tabla.
function mockSb(opts = {}) {
  const ops = { upserts: [], deletes: [] };
  const api = {
    from(table) {
      return {
        upsert(rows) { ops.upserts.push({ table, rows }); if (opts.onUpsert) opts.onUpsert(); return Promise.resolve({ error: null }); },
        select() {
          const sd = opts.selectData || {};
          const se = opts.selectError || {};
          // Builder que soporta la carga paginada real: .eq().order().range() y también
          // await directo (app_meta). Resuelve { data, error, count }.
          let rows = () => sd[table] ?? [];
          const res = () => ({ data: rows(), error: se[table] ?? null, count: (rows() || []).length });
          const builder = {
            eq(col, val) { const p = rows; rows = () => (p() || []).filter(r => r && r[col] === val); return builder; },
            neq() { return builder; },
            order() { return builder; },
            range() { return Promise.resolve(res()); },
            // Lectura del syncTick (candado anti-pisada): sin dato → sin conflicto en estos tests.
            maybeSingle() { return Promise.resolve({ data: (opts.remoteSyncTick !== undefined ? { valor: opts.remoteSyncTick } : null), error: null }); },
            then(resolve, reject) { return Promise.resolve(res()).then(resolve, reject); },
          };
          return builder;
        },
        delete() {
          const f = {};
          const builder = {
            eq(col, val) { f[col] = val; return builder; },
            then(resolve, reject) {
              ops.deletes.push({ table, ...f });
              return Promise.resolve({ error: null }).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
  return { api, ops };
}

let app, window, ops;
beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window;
  // Dejar correr arranque() (modo DEV pone sb=null) ANTES de inyectar el mock,
  // si no nos pisa el sb a mitad del guardado.
  await new Promise(r => setTimeout(r, 0));
  resetDatos(app);
  const m = mockSb(); ops = m.ops;
  app.__setSb(m.api);
  app.__setAutosaveActivo(false); // no autosave en tests; llamamos guardarEnNube a mano
  app.__setDatosCargados(true);
});

// upserts de app_data aplanados a "coleccion:doc_id"
function upsertedKeys() {
  const keys = [];
  ops.upserts.filter(u => u.table === 'app_data').forEach(u => u.rows.forEach(r => keys.push(r.coleccion + ':' + r.doc_id)));
  return keys;
}

describe('A: los valores globales (config) se detectan y se guardan', () => {
  it('la red de seguridad detecta un cambio de DB.config', () => {
    app._guardarSnapshot();                 // snapshot incluye config actual
    app.DB.config.honorarioOS = 99999;      // como guardarValoresGlobales
    expect(app._chequearCambiosNoMarcados()).toBe(true);  // antes no lo detectaba
  });

  it('guardarEnNube sube config en app_meta con el valor nuevo', async () => {
    app._guardarSnapshot();
    app.DB.config.honorarioOS = 88888;
    app.DB.config.valorConsultaParticular = 77777;
    await app.guardarEnNube(true);
    const meta = ops.upserts.find(u => u.table === 'app_meta');
    const cfg = meta?.rows.find(r => r.clave === 'config');
    expect(cfg).toBeTruthy();
    expect(cfg.valor.honorarioOS).toBe(88888);
    expect(cfg.valor.valorConsultaParticular).toBe(77777);
  });
});

describe('C+D: el reprecio sube seguro (no borra todo el nomenclador)', () => {
  it('actualizarPreciosPrestaciones usa guardarEnNube (upsert), sin delete masivo de prestaciones', async () => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 60000, valPart: 60000 },
    ];
    app.DB.registros = [
      { id: 7001, fecha: '2026-06-20', os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)',
        plan: '510', cantidad: 1, valorUnit: 55679, exenta: true, partEfVal: 55679, partTrVal: 55679 },
    ];
    app._guardarSnapshot();
    window.confirm = () => true;
    window.alert = () => {};

    await app.actualizarPreciosPrestaciones('OSDE', '2026-06-01');

    // 1) re-aplicó el precio a la atención
    expect(app.DB.registros[0].valorUnit).toBe(60000);
    // 2) subió por guardarEnNube (upsert de prestaciones y del registro recalculado)
    const keys = ops.upserts.filter(u => u.table === 'app_data').flatMap(u => u.rows.map(r => r.coleccion + ':' + r.doc_id));
    expect(keys).toContain('prestaciones:1');
    expect(keys).toContain('registros:7001');
    // 3) NO hizo un delete masivo de toda la colección prestaciones (el bug viejo)
    const bulkDelete = ops.deletes.find(d => d.coleccion === 'prestaciones' && d.doc_id === undefined);
    expect(bulkDelete).toBeUndefined();
  });
});

describe('D-A: un cambio hecho DURANTE el guardado no se pierde', () => {
  it('una colección tocada mientras el guardado está en vuelo queda pendiente y se sube después', async () => {
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app.DB.medicos = [{ id: 9, nombre: 'Dr. Test' }];
    app._guardarSnapshot();
    app.marcarCambios('registros');

    // Durante el upsert del primer guardado, el usuario cambia OTRA colección (medicos).
    let inject = () => { app.DB.medicos.push({ id: 10, nombre: 'Dr. Nuevo' }); app.marcarCambios('medicos'); inject = () => {}; };
    const m1 = mockSb({ onUpsert: () => inject() });
    app.__setSb(m1.api);
    await app.guardarEnNube(true);

    // El primer guardado subió registros pero NO medicos (cambió después de capturar dirty)
    const keys1 = m1.ops.upserts.filter(u => u.table === 'app_data').flatMap(u => u.rows.map(r => r.coleccion + ':' + r.doc_id));
    expect(keys1.some(k => k.startsWith('registros:'))).toBe(true);
    expect(keys1.some(k => k.startsWith('medicos:'))).toBe(false);

    // medicos quedó pendiente → el siguiente guardado SÍ lo sube (no se perdió)
    const m2 = mockSb();
    app.__setSb(m2.api);
    await app.guardarEnNube(true);
    const keys2 = m2.ops.upserts.filter(u => u.table === 'app_data').flatMap(u => u.rows.map(r => r.coleccion + ':' + r.doc_id));
    expect(keys2.some(k => k.startsWith('medicos:'))).toBe(true);
  });
});

describe('D-B: carga con app_meta fallida no debe seguir', () => {
  it('cargarDesdeNube lanza error si falla app_meta (no arranca con config/nextId semilla)', async () => {
    const m = mockSb({
      selectData: { app_data: [{ coleccion: 'registros', doc_id: 1, data: { id: 1 } }] },
      selectError: { app_meta: { message: 'meta fail' } },
    });
    app.__setSb(m.api);
    app.__setDatosCargados(false);
    await expect(app.cargarDesdeNube()).rejects.toBeTruthy();
  });
});

describe('Anti-reseed: app_data vacío + app_meta con datos no debe re-sembrar', () => {
  it('lanza error (no pisa producción) si app_data vino vacío pero hay meta guardada', async () => {
    // Escenario peligroso: el select de app_data falla/vuelve [] por un problema
    // transitorio, pero app_meta tiene config/nextId → la base NO es nueva.
    const m = mockSb({
      selectData: { app_data: [], app_meta: [{ clave: 'nextId', valor: 5000 }] },
    });
    app.__setSb(m.api);
    app.__setDatosCargados(false);
    await expect(app.cargarDesdeNube()).rejects.toBeTruthy();
    // No debe haber subido NADA (sembrarInicial no corrió).
    expect(m.ops.upserts.length).toBe(0);
  });

  it('SÍ siembra si de verdad está todo vacío (app_data y app_meta sin datos)', async () => {
    const m = mockSb({ selectData: { app_data: [], app_meta: [] } });
    app.__setSb(m.api);
    app.__setDatosCargados(false);
    await app.cargarDesdeNube();
    // sembrarInicial corrió: subió filas (el nomenclador semilla, médicos, etc.).
    expect(m.ops.upserts.length).toBeGreaterThan(0);
  });

  it('CARGA INCOMPLETA aborta (no arranca con datos parciales que pisarían la nube)', async () => {
    // Simula el bug real: la nube tiene 100 filas (count) pero el select devolvió solo 2.
    // cargarDesdeNube debe TIRAR error y NO seguir → ningún guardado puede pisar la nube.
    const api = {
      from(table) {
        return {
          upsert() { return Promise.resolve({ error: null }); },
          select() {
            const res = () => (table === 'app_meta'
              ? { data: [], error: null, count: 0 }
              : { data: [{ coleccion: 'registros', doc_id: 1, data: { id: 1 } },
                          { coleccion: 'registros', doc_id: 2, data: { id: 2 } }], error: null, count: 100 });
            const b = { eq() { return b; }, neq() { return b; }, order() { return b; },
              range() { return Promise.resolve(res()); },
              then(r, j) { return Promise.resolve(res()).then(r, j); } };
            return b;
          },
        };
      },
    };
    app.__setSb(api);
    app.__setDatosCargados(false);
    await expect(app.cargarDesdeNube()).rejects.toThrow(/incompleta|2 de 100/i);
  });
});

describe('Candado anti-pisada (concurrencia multi-dispositivo)', () => {
  it('si OTRA computadora guardó (token distinto), guardarEnNube ABORTA y no sube nada', async () => {
    const m = mockSb({ remoteSyncTick: { token: 'OTRA-COMPU', by: 'otra-sesion' } });
    app.__setSb(m.api);
    app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }];
    app.marcarCambios('registros');
    const r = await app.guardarEnNube(true);
    expect(r).toBe(false);                                   // abortó el guardado
    expect(m.ops.upserts.some(u => u.table === 'app_data')).toBe(false);  // NO pisó la nube
    expect(m.ops.deletes.length).toBe(0);                   // ni borró nada
  });

  it('sin sello remoto (nadie guardó) el guardado procede normal', async () => {
    const m = mockSb();   // remoteSyncTick undefined → maybeSingle devuelve null → sin conflicto
    app.__setSb(m.api);
    app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }];
    app.marcarCambios('registros');
    const r = await app.guardarEnNube(true);
    expect(r).toBe(true);
    expect(m.ops.upserts.some(u => u.table === 'app_data')).toBe(true);   // subió
  });

  it('dos guardados seguidos de la MISMA sesión no se auto-bloquean', async () => {
    let remoteTick = null;
    const ops = { upserts: [], deletes: [] };
    const api = { from(table) { return {
      upsert(rows) {
        ops.upserts.push({ table, rows });
        const t = Array.isArray(rows) ? rows.find(r => r.clave === 'syncTick') : null;
        if (t) remoteTick = t.valor;   // la nube refleja el sello que acabamos de escribir
        return Promise.resolve({ error: null });
      },
      select() { const b = { eq() { return b; }, order() { return b; },
        range() { return Promise.resolve({ data: [], error: null, count: 0 }); },
        maybeSingle() { return Promise.resolve({ data: remoteTick ? { valor: remoteTick } : null, error: null }); },
        then(r, j) { return Promise.resolve({ data: [], error: null }).then(r, j); } }; return b; },
      delete() { const b = { eq() { return b; }, then(r, j) { return Promise.resolve({ error: null }).then(r, j); } }; return b; },
    }; } };
    app.__setSb(api);
    app.__setDatosCargados(true);
    app.DB.registros = [{ id: 1, os: 'OSDE' }]; app.marcarCambios('registros');
    const r1 = await app.guardarEnNube(true);
    app.DB.registros.push({ id: 2, os: 'IOMA' }); app.marcarCambios('registros');
    const r2 = await app.guardarEnNube(true);   // lee NUESTRO propio sello → no debe bloquear
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });
});

describe('guardarEnNube — evita el error 21000 (claves duplicadas)', () => {
  it('deduplica filas con el mismo (coleccion, doc_id) antes de subir', async () => {
    // Dos registros con el MISMO id en la misma colección → sin dedupe, Postgres
    // tiraría "ON CONFLICT DO UPDATE command cannot affect row a second time" (21000)
    // y NO se guardaría nada (lo que el usuario veía como "error de conexión").
    app.DB.registros = [
      { id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 },
      { id: 1, os: 'IOMA', medico: 'X', fecha: '2026-06-02', cantidad: 1, valorUnit: 200 }, // id repetido
    ];
    app._guardarSnapshot();
    app.marcarCambios('registros');
    await app.guardarEnNube(true);
    const keys = upsertedKeys();
    expect(keys.filter(k => k === 'registros:1').length).toBe(1); // una sola vez en el lote
    expect(new Set(keys).size).toBe(keys.length);                  // sin claves duplicadas
  });
});

describe('guardarEnNube — guard de seguridad', () => {
  it('NO guarda nada si los datos no se cargaron (datosCargados=false)', async () => {
    app.__setDatosCargados(false);
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app.marcarCambios('registros');
    await app.guardarEnNube(true);
    expect(ops.upserts.length).toBe(0);
    expect(ops.deletes.length).toBe(0);
  });
});

describe('guardarEnNube — borrado SEGURO (no perder datos sincronizados)', () => {
  it('NO borra registros que no estaban en el snapshot (ej: cargados por otro usuario)', async () => {
    // Estado "cargado": teníamos el registro 1
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app._guardarSnapshot();
    // El usuario agrega el registro 2 (otro usuario podría haber agregado el 99 en la nube,
    // que nosotros nunca tuvimos: no debe borrarse).
    app.DB.registros.push({ id: 2, os: 'IOMA', medico: 'X', fecha: '2026-06-02', cantidad: 1, valorUnit: 200 });
    app.marcarCambios('registros');

    await app.guardarEnNube(true);

    // No se borra NADA (no eliminamos nada localmente)
    expect(ops.deletes.length).toBe(0);
    // Se suben los registros locales (1 y 2)
    expect(upsertedKeys()).toEqual(expect.arrayContaining(['registros:1', 'registros:2']));
  });

  it('SÍ borra lo que el usuario eliminó en la sesión (estaba en snapshot, ya no está local)', async () => {
    app.DB.registros = [
      { id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 },
      { id: 2, os: 'IOMA', medico: 'X', fecha: '2026-06-02', cantidad: 1, valorUnit: 200 },
    ];
    app._guardarSnapshot();
    // El usuario borra el registro 2
    app.DB.registros = app.DB.registros.filter(r => r.id !== 2);
    app.marcarCambios('registros');

    await app.guardarEnNube(true);

    expect(ops.deletes).toEqual([{ table: 'app_data', coleccion: 'registros', doc_id: 2 }]);
  });
});

describe('guardarEnNube — sube solo lo modificado (más veloz)', () => {
  it('solo sube las colecciones marcadas como dirty', async () => {
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 }];
    app.DB.medicos = [{ id: 9, nombre: 'Dr. Test' }];
    app._guardarSnapshot();
    // Solo cambia registros; medicos NO
    app.DB.registros.push({ id: 2, os: 'IOMA', medico: 'X', fecha: '2026-06-02', cantidad: 1, valorUnit: 200 });
    app.marcarCambios('registros');

    await app.guardarEnNube(true);

    const keys = upsertedKeys();
    expect(keys.some(k => k.startsWith('registros:'))).toBe(true);
    expect(keys.some(k => k.startsWith('medicos:'))).toBe(false); // medicos no se re-subió
  });
});
