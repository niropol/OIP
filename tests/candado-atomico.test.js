// CANDADO ATÓMICO (anti-carrera): el turno de guardado se reclama con un UPDATE condicional
// (compare-and-swap) sobre el syncTick. Si dos equipos guardan a la vez, uno solo gana y el
// otro aborta ANTES de escribir. FAIL-SAFE: si el mecanismo condicional no está disponible,
// cae a 'fallback' (best-effort de siempre) — nunca bloquea de más.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

// Nube COMPARTIDA simulada: modela app_meta.syncTick y el UPDATE condicional.
//   cloud = { syncTick: {token,by}|null, dataUpserts: n, brokenCAS, updateError }
function mkCloudMock(cloud) {
  return {
    from(table) {
      return {
        update(vals) {
          const cond = {};
          const b = {
            eq(col, val) { cond[col] = val; return b; },
            select() {
              return Promise.resolve().then(() => {
                if (cloud.updateError) return { data: null, error: { message: 'update no soportado' } };
                if (table === 'app_meta' && cond['clave'] === 'syncTick') {
                  const expected = cond['valor->>token'];
                  const cur = cloud.syncTick;
                  if (!cloud.brokenCAS && cur && cur.token === expected) {
                    cloud.syncTick = vals.valor;                 // CAS OK: avanza el sello
                    return { data: [{ clave: 'syncTick' }], error: null };
                  }
                  return { data: [], error: null };               // no matchea (o CAS "roto")
                }
                return { data: [], error: null };
              });
            },
          };
          return b;
        },
        upsert(rows) {
          const arr = Array.isArray(rows) ? rows : [rows];
          if (table === 'app_meta') arr.forEach(r => { if (r.clave === 'syncTick') cloud.syncTick = r.valor; });
          if (table === 'app_data') cloud.dataUpserts = (cloud.dataUpserts || 0) + arr.length;
          return Promise.resolve({ error: null });
        },
        select() {
          const b = {
            eq() { return b; }, neq() { return b; }, order() { return b; },
            range() { return Promise.resolve({ data: [], error: null, count: 0 }); },
            maybeSingle() { return Promise.resolve({ data: cloud.syncTick ? { valor: cloud.syncTick } : null, error: null }); },
            then(res, rej) { return Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej); },
          };
          return b;
        },
        delete() { const b = { eq() { return b; }, then(res, rej) { return Promise.resolve({ error: null }).then(res, rej); } }; return b; },
      };
    },
  };
}

async function nuevaApp(cloud) {
  const h = loadApp();
  await new Promise(r => setTimeout(r, 0));   // dejar correr arranque (pone sb=null en DEV)
  resetDatos(h.app);
  h.app.__setSb(mkCloudMock(cloud));
  h.app.__setAutosaveActivo(false);
  h.app.__setDatosCargados(true);
  return h.app;
}

describe('_reclamarTokenNube — máquina de estados', () => {
  it('CLAIMED: si el sello en la nube sigue en el esperado, lo avanza y gana el turno', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' } };
    const app = await nuevaApp(cloud);
    const r = await app._reclamarTokenNube('T0');
    expect(r.estado).toBe('claimed');
    expect(cloud.syncTick.token).not.toBe('T0');           // avanzó
    expect(app.__getSyncToken()).toBe(cloud.syncTick.token);
  });

  it('CONFLICT: si otra sesión ya cambió el sello, no reclama', async () => {
    const cloud = { syncTick: { token: 'CAMBIADO', by: 'otra-sesion' } };
    const app = await nuevaApp(cloud);
    const r = await app._reclamarTokenNube('T0');           // esperábamos T0, pero está CAMBIADO
    expect(r.estado).toBe('conflict');
    expect(cloud.syncTick.token).toBe('CAMBIADO');          // no lo tocó
  });

  it('FALLBACK: si el UPDATE condicional no matchea pero el sello NO cambió → no bloquea', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' }, brokenCAS: true };
    const app = await nuevaApp(cloud);
    const r = await app._reclamarTokenNube('T0');
    expect(r.estado).toBe('fallback');                      // filtro "roto" → best-effort, no conflicto
  });

  it('FALLBACK: si el UPDATE da error, no bloquea', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' }, updateError: true };
    const app = await nuevaApp(cloud);
    expect((await app._reclamarTokenNube('T0')).estado).toBe('fallback');
  });

  it('FALLBACK: nube fresca (nunca vimos un token) → best-effort', async () => {
    const cloud = { syncTick: null };
    const app = await nuevaApp(cloud);
    expect((await app._reclamarTokenNube(null)).estado).toBe('fallback');
  });
});

describe('Carrera real: dos equipos guardan a la vez', () => {
  it('uno solo gana el turno; el otro queda en conflicto', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' } };
    const A = await nuevaApp(cloud);
    const B = await nuevaApp(cloud);   // otra "compu": distinto _sessionId
    const a = await A._reclamarTokenNube('T0');   // A gana
    const b = await B._reclamarTokenNube('T0');   // B llega con el sello ya cambiado por A
    expect(a.estado).toBe('claimed');
    expect(b.estado).toBe('conflict');
  });
});

// Mock de app_meta con claves arbitrarias (para el diagnóstico, que usa 'syncTickDiag').
function mkKeyedMetaMock(store, opts = {}) {
  return {
    from(table) {
      return {
        upsert(rows) { (Array.isArray(rows) ? rows : [rows]).forEach(r => { if (table === 'app_meta') store[r.clave] = r.valor; }); return Promise.resolve({ error: null }); },
        update(vals) {
          const cond = {};
          const b = {
            eq(c, v) { cond[c] = v; return b; },
            select() {
              return Promise.resolve().then(() => {
                if (opts.updateError) return { data: null, error: { message: 'no soportado' } };
                const cur = store[cond['clave']];
                if (!opts.brokenCAS && cur && cur.token === cond['valor->>token']) { store[cond['clave']] = vals.valor; return { data: [{ clave: cond['clave'] }], error: null }; }
                return { data: [], error: null };
              });
            },
          };
          return b;
        },
        delete() { const f = {}; const b = { eq(c, v) { f[c] = v; return b; }, then(res, rej) { if (table === 'app_meta') delete store[f['clave']]; return Promise.resolve({ error: null }).then(res, rej); } }; return b; },
        select() { const b = { eq() { return b; }, maybeSingle() { return Promise.resolve({ data: null, error: null }); }, then(r, j) { return Promise.resolve({ data: [], error: null }).then(r, j); } }; return b; },
      };
    },
  };
}

async function appConMeta(store, opts) {
  const h = loadApp();
  await new Promise(r => setTimeout(r, 0));
  resetDatos(h.app);
  h.app.__setSb(mkKeyedMetaMock(store, opts));
  h.window.alert = () => {};   // el diagnóstico avisa por alert
  return h.app;
}

describe('diagnosticarCandadoAtomico', () => {
  it('ACTIVO cuando el UPDATE condicional funciona (y limpia la clave desechable)', async () => {
    const store = {};
    const app = await appConMeta(store, {});
    const r = await app.diagnosticarCandadoAtomico();
    expect(r).toBe(true);
    expect(store['syncTickDiag']).toBeUndefined();   // no dejó basura
  });

  it('FALLBACK cuando el condicional no matchea (CAS "roto")', async () => {
    const store = {};
    const app = await appConMeta(store, { brokenCAS: true });
    expect(await app.diagnosticarCandadoAtomico()).toBe(false);
    expect(store['syncTickDiag']).toBeUndefined();
  });

  it('devuelve null (y no rompe) si el UPDATE da error', async () => {
    const store = {};
    const app = await appConMeta(store, { updateError: true });
    expect(await app.diagnosticarCandadoAtomico()).toBe(null);
  });
});

describe('guardarEnNube — integración con el reclamo', () => {
  it('CLAIMED: guarda los datos y deja el sello a su nombre', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' } };
    const app = await nuevaApp(cloud);
    app.__setSyncToken('T0');                      // ya estábamos sincronizados en T0
    app.DB.registros.push({ id: 1, os: 'OSDE', medico: 'X', fecha: '2026-06-10', cantidad: 1, valorUnit: 1000, exenta: true });
    app.marcarCambios('registros');
    const ok = await app.guardarEnNube(true);
    expect(ok).toBe(true);
    expect(cloud.dataUpserts).toBeGreaterThan(0);          // subió datos
    expect(cloud.syncTick.token).not.toBe('T0');           // avanzó el sello
  });

  it('FALLBACK (CAS no disponible): igual guarda, no bloquea', async () => {
    const cloud = { syncTick: { token: 'T0', by: 'seed' }, brokenCAS: true };
    const app = await nuevaApp(cloud);
    app.__setSyncToken('T0');
    app.DB.registros.push({ id: 2, os: 'OSDE', medico: 'X', fecha: '2026-06-10', cantidad: 1, valorUnit: 1000, exenta: true });
    app.marcarCambios('registros');
    const ok = await app.guardarEnNube(true);
    expect(ok).toBe(true);
    expect(cloud.dataUpserts).toBeGreaterThan(0);          // guardó igual (best-effort)
  });

  it('CONFLICT: si otra sesión guardó, NO escribe datos', async () => {
    const cloud = { syncTick: { token: 'OTRA', by: 'otra-sesion' } };
    const app = await nuevaApp(cloud);
    app.__setSyncToken('T0');                      // vimos T0, pero la nube ya está en OTRA
    app.DB.registros.push({ id: 3, os: 'OSDE', medico: 'X', fecha: '2026-06-10', cantidad: 1, valorUnit: 1000, exenta: true });
    app.marcarCambios('registros');
    const ok = await app.guardarEnNube(true);
    expect(ok).toBe(false);
    expect(cloud.dataUpserts || 0).toBe(0);               // no pisó nada
  });
});
