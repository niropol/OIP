// Importar/actualizar contratos de OS es sensible: hay que asegurarse de que se cargan
// TODOS los códigos, con ids válidos y únicos. Este test cubre la raíz del bug histórico:
// los ids se asignaban con Math.max(...ids)+i, que daba NaN si alguna prestación existente
// tenía id nulo → todas las nuevas quedaban con el mismo id y al subir la nube colapsaba
// (deduplicación) y "no subían todos los códigos". Ahora se asignan desde nextId.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'renderConfiguracion'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.alert = () => {};
  app.DB.prestaciones = [];
  app.DB.contratos = [];
});

function preview(os, filas) {
  window._contratoPreview = {
    os, vigencia: '2026-07',
    rows: filas.map(f => ({ codigo: f.cod, desc: f.desc, valor: f.val, exenta: true, incluir: true, categoria: 'consulta' })),
    descartadas: 0,
  };
}

describe('confirmarImportContrato: ids válidos y únicos (raíz del bug)', () => {
  it('asigna ids desde nextId aunque exista una prestación con id NULO (antes → NaN)', async () => {
    // La "trampa": una prestación existente de OTRA OS con id nulo. Con Math.max daba NaN.
    app.DB.prestaciones = [{ id: null, os: 'OtraOS', codigo: 'X', desc: 'vieja', valOS: 1 }];
    app.DB.nextId = 3000;
    // "agregar sin borrar" = decir NO a "¿Reemplazar…"; SÍ a la confirmación final y demás.
    window.confirm = (msg) => !/¿Reemplazar/.test(msg);
    preview('OSDE', [
      { cod: '420101', desc: 'Consulta', val: 50000 },
      { cod: '420114', desc: 'Consulta vestida', val: 55000 },
      { cod: '170101', desc: 'Cirugía', val: 900000 },
    ]);
    await app.confirmarImportContrato();

    const nuevas = app.DB.prestaciones.filter(p => p.os === 'OSDE');
    expect(nuevas.length).toBe(3);
    // Todos los ids: numéricos, definidos y ÚNICOS
    const ids = nuevas.map(p => p.id);
    ids.forEach(id => expect(Number.isFinite(id)).toBe(true));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([3000, 3001, 3002]);
    // nextId avanzó por las 3 prestaciones + el contrato
    expect(app.DB.nextId).toBe(3004);
  });

  it('modo reemplazar: borra las de esa OS y deja solo las nuevas, con ids únicos', async () => {
    app.DB.prestaciones = [
      { id: 10, os: 'OSDE', codigo: 'viejo1', desc: 'a', valOS: 1 },
      { id: 11, os: 'OSDE', codigo: 'viejo2', desc: 'b', valOS: 2 },
      { id: 12, os: 'IOMA', codigo: 'otra',   desc: 'c', valOS: 3 },  // otra OS: se conserva
    ];
    app.DB.nextId = 5000;
    window.confirm = () => true;    // reemplazar (y confirmar el cambio)
    preview('OSDE', [
      { cod: 'A', desc: 'nueva1', val: 100 },
      { cod: 'B', desc: 'nueva2', val: 200 },
    ]);
    await app.confirmarImportContrato();

    const osde = app.DB.prestaciones.filter(p => p.os === 'OSDE');
    expect(osde.length).toBe(2);
    expect(osde.map(p => p.codigo).sort()).toEqual(['A', 'B']);
    expect(app.DB.prestaciones.some(p => p.os === 'IOMA')).toBe(true);   // no se tocó
    const ids = app.DB.prestaciones.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);   // todos únicos
  });

  it('todas las prestaciones importadas quedan con ids únicos en toda la colección', async () => {
    app.DB.prestaciones = [{ id: 900, os: 'IOMA', codigo: 'z', desc: 'z', valOS: 1 }];
    app.DB.nextId = 901;
    window.confirm = (msg) => !/¿Reemplazar/.test(msg);   // agregar sin borrar; confirmar el resto
    preview('OSDE', Array.from({ length: 50 }, (_, i) => ({ cod: 'C' + i, desc: 'p' + i, val: 1000 + i })));
    await app.confirmarImportContrato();
    const ids = app.DB.prestaciones.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);   // sin repetidos
    expect(ids.every(id => Number.isFinite(id))).toBe(true);
    expect(app.DB.prestaciones.filter(p => p.os === 'OSDE').length).toBe(50);
  });

  it('si se CANCELA la confirmación final, NO se toca nada (ni prestaciones ni atenciones)', async () => {
    app.DB.prestaciones = [{ id: 10, os: 'OSDE', codigo: 'viejo', desc: 'a', valOS: 50000 }];
    app.DB.registros = [{ id: 20, os: 'OSDE', codigo: 'viejo', prestacion: 'a', fecha: '2026-07-10', cantidad: 1, valorUnit: 50000 }];
    app.DB.contratos = [];
    app.DB.nextId = 6000;
    const antesPrest = JSON.stringify(app.DB.prestaciones);
    const antesReg = JSON.stringify(app.DB.registros);
    // Reemplazar = SÍ, pero cancelar la confirmación final ("Confirmá el cambio")
    window.confirm = (msg) => !/Confirmá el cambio/.test(msg);
    preview('OSDE', [{ cod: 'nuevo', desc: 'b', val: 90000 }]);
    await app.confirmarImportContrato();

    expect(JSON.stringify(app.DB.prestaciones)).toBe(antesPrest);  // prestaciones intactas
    expect(JSON.stringify(app.DB.registros)).toBe(antesReg);       // atenciones intactas
    expect(app.DB.contratos.length).toBe(0);                       // no se registró contrato
    expect(app.DB.nextId).toBe(6000);                              // nextId no avanzó
  });
});
