// Unir médicos duplicados: si por el uso multi-dispositivo quedaron dos fichas del MISMO
// médico (mismo nombre, distinto id), se unen en una sola. Las atenciones se referencian por
// NOMBRE, así que al unir NO hay que re-vincular nada — solo eliminar la ficha repetida.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['renderMedicosGrid', 'renderConfiguracion', 'showToast'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
  window.confirm = () => true;
});

describe('_gruposMedicosDuplicados (detección pura)', () => {
  it('detecta fichas con el mismo nombre (distinto id) y las ordena por id', () => {
    const meds = [
      { id: 2, nombre: 'Dra. Mateo, Agustina' },
      { id: 11, nombre: 'Dra. Mateo, Agustina' },   // duplicada
      { id: 1, nombre: 'Dr. Polisky, Nicolás' },
    ];
    const grupos = app._gruposMedicosDuplicados(meds);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].map(m => m.id)).toEqual([2, 11]);   // ordenado por id (la original primero)
  });

  it('ignora mayúsculas y espacios de más al comparar nombres', () => {
    const meds = [{ id: 1, nombre: 'Dr. X' }, { id: 2, nombre: '  dr. x ' }];
    expect(app._gruposMedicosDuplicados(meds)).toHaveLength(1);
  });

  it('sin duplicados devuelve vacío', () => {
    expect(app._gruposMedicosDuplicados(app.DB.medicos)).toHaveLength(0);   // el seed está limpio
  });
});

describe('unirMedicosDuplicados (limpieza)', () => {
  it('elimina la ficha repetida y conserva una sola; no toca las atenciones', () => {
    // Duplicar a Mateo con un id nuevo (como habría pasado con 2 dispositivos)
    const mateo = app.DB.medicos.find(m => m.nombre === 'Dra. Mateo, Agustina');
    app.DB.medicos.push({ id: 9999, nombre: 'Dra. Mateo, Agustina', consultorio: 'Palpa', color: '#000' });
    app.DB.registros = [
      { id: 1, medico: 'Dra. Mateo, Agustina', os: 'OSDE', cantidad: 1, valorUnit: 100, fecha: '2026-06-01' },
    ];
    const antes = app.DB.medicos.filter(m => m.nombre === 'Dra. Mateo, Agustina').length;
    expect(antes).toBe(2);

    app.unirMedicosDuplicados();

    const despues = app.DB.medicos.filter(m => m.nombre === 'Dra. Mateo, Agustina');
    expect(despues).toHaveLength(1);          // quedó una sola ficha
    expect(despues[0].id).toBe(mateo.id);     // se conservó la original (id más bajo)
    // La atención sigue apuntando al mismo nombre → sigue vinculada
    expect(app.DB.registros[0].medico).toBe('Dra. Mateo, Agustina');
  });

  it('completa datos vacíos de la ficha conservada con los de la duplicada', () => {
    // La original tiene el CBU vacío; la duplicada lo trae cargado
    const poli = app.DB.medicos.find(m => m.nombre === 'Dr. Polisky, Nicolás');
    poli.cbu = '';
    app.DB.medicos.push({ id: 9998, nombre: 'Dr. Polisky, Nicolás', cbu: '0000-1111', pagoEstudio: { modo: 'fijo', valor: 5000 } });

    app.unirMedicosDuplicados();

    const kept = app.DB.medicos.find(m => m.nombre === 'Dr. Polisky, Nicolás');
    expect(app.DB.medicos.filter(m => m.nombre === 'Dr. Polisky, Nicolás')).toHaveLength(1);
    expect(kept.cbu).toBe('0000-1111');                 // completó el vacío
    expect(kept.pagoEstudio).toEqual({ modo: 'fijo', valor: 5000 });
  });

  it('no pisa datos que la ficha conservada YA tiene', () => {
    const poli = app.DB.medicos.find(m => m.nombre === 'Dr. Polisky, Nicolás');
    poli.consultorio = 'Palpa';
    app.DB.medicos.push({ id: 9997, nombre: 'Dr. Polisky, Nicolás', consultorio: 'Haedo' });
    app.unirMedicosDuplicados();
    expect(app.DB.medicos.find(m => m.nombre === 'Dr. Polisky, Nicolás').consultorio).toBe('Palpa');  // no se pisó
  });
});
