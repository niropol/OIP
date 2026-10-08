// BUG DE PÉRDIDA (silencioso): si el usuario carga una atención MIENTRAS se está subiendo
// la anterior a la nube, esa atención nueva podía perderse. Causa: guardarEnNube arma la lista
// de filas a subir ANTES de los await de red; si durante esos await se agrega una atención a
// `registros` (colección que YA estaba en el lote), al terminar el guardado se limpiaba `dirty`
// y se snapshoteaba el estado NUEVO (con la atención) como si estuviera guardado — pero nunca se
// subió. Quedaba fuera de la nube y sin marca de "pendiente": se perdía hasta el próximo cambio.
// Fix: snapshotear/limpiar SOLO las colecciones que NO cambiaron durante el guardado; las que
// cambiaron en vuelo quedan dirty y se suben en la próxima vuelta.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

// Supabase simulado. Registra TODO lo que se sube a app_data. Permite inyectar una mutación
// (cargar una atención) DURANTE el primer upsert de datos, que es la ventana del bug.
function makeFakeSb(onFirstDataUpsert) {
  const dataUpserts = [];
  let firstDone = false;
  return {
    _dataUpserts: dataUpserts,
    from() {
      return {
        select() { return Promise.resolve({ data: [{ clave: 'syncTick' }], error: null }); },
        eq() { return this; },
        neq() { return this; },
        order() { return this; },
        range() { return Promise.resolve({ data: [], error: null, count: 0 }); },
        maybeSingle() { return Promise.resolve({ data: { valor: { token: app.__getSyncToken(), by: 'x' } }, error: null }); },
        update() { return this; },
        delete() { return { eq() { return { eq() { return Promise.resolve({ error: null }); } }; } }; },
        upsert(rows) {
          const arr = Array.isArray(rows) ? rows : [rows];
          const esData = arr.some(r => r && r.coleccion);   // app_data lleva {coleccion,doc_id,data}
          if (esData) {
            return (async () => {
              if (!firstDone && onFirstDataUpsert) { firstDone = true; await onFirstDataUpsert(); }
              dataUpserts.push(...arr);
              return { error: null };
            })();
          }
          return Promise.resolve({ error: null });   // app_meta
        },
      };
    },
  };
}

describe('Una atención cargada MIENTRAS se guarda otra NO se pierde', () => {
  it('la atención agregada durante el upsert termina subida a la nube', async () => {
    const regA = { id: 100, os: 'OSDE', prestacion: 'Consulta', fecha: '2026-09-01', valorUnit: 50000, exenta: true };
    const regB = { id: 101, os: 'OSDE', prestacion: 'Consulta', fecha: '2026-09-02', valorUnit: 50000, exenta: true };

    app.DB.registros = [regA];
    app.__setDatosCargados(true);
    app.__setAutosaveActivo(false);      // sin timers: probamos solo la lógica de guardado
    app.__setSyncToken('tok-0');
    // Inyección: al empezar a subir regA, el usuario carga regB (colección ya en el lote).
    const sb = makeFakeSb(async () => { app.DB.registros.push(regB); app.marcarCambios('registros'); });
    app.__setSb(sb);

    app.marcarCambios('registros');      // hay cambios para guardar (regA)
    await app.guardarEnNube(true);       // 1er guardado: sube regA, y regB entra en vuelo

    // regB debe seguir vivo: o ya subido, o marcado pendiente para la próxima vuelta.
    const subidoB1 = sb._dataUpserts.some(r => r.doc_id === 101);
    const pendienteB = app.__dirtyCols().includes('registros');
    expect(subidoB1 || pendienteB).toBe(true);   // NO se perdió

    // Garantía de punta a punta: un segundo guardado deja regB efectivamente en la nube.
    await app.guardarEnNube(true);
    expect(sb._dataUpserts.some(r => r.doc_id === 101)).toBe(true);
  });
});
