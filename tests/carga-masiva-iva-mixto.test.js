// Carga masiva: se puede tener IVA MIXTO para la misma OS/prestación (ej. 3 OSDE 310,
// 2 exentos + 1 gravado). Cada fila lleva su propio IVA y es un registro aparte; el botón
// "duplicar fila" facilita partir un grupo en dos filas con IVA distinto.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, g;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; g = id => window.document.getElementById(id);
  resetDatos(app);
  ['showToast', 'recalcCM', 'initDashboard', 'renderCajaChica', 'renderAtenciones', 'closeModal']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  g('cm-medico').innerHTML = app.DB.medicos.map(m => `<option>${m.nombre}</option>`).join('');
  setInput(window, 'cm-medico', 'Dr. Polisky, Nicolás');
  setInput(window, 'cm-fecha', '2026-06-10');
  setInput(window, 'cm-consultorio', 'Palpa');
});

// Prepara una fila de consulta con OS, cantidad e IVA (exenta true/false) dados.
function filaConsulta(os, cantidad, exenta) {
  app.agregarFilaConsulta();
  const row = g('cm-consultas-tbody').lastElementChild;
  const sel = row.querySelector('select');
  sel.value = os;
  app.onCMConsultaOSChange(sel, row.id);   // repuebla prestaciones/valor de esa OS
  row.querySelector('.cm-cant-input').value = String(cantidad);
  row.querySelector('.iva-hidden').value = exenta ? '1' : '0';
  return row;
}

describe('Carga masiva — IVA mixto por fila', () => {
  it('dos filas de la misma OS con IVA distinto → dos registros con exenta distinta', () => {
    filaConsulta('OSDE', 2, true);    // 2 exentos
    filaConsulta('OSDE', 1, false);   // 1 gravado
    app._ejecutarGuardarCargaMasiva();

    const osde = app.DB.registros.filter(r => r.os === 'OSDE');
    expect(osde.length).toBe(2);
    const exentos  = osde.filter(r => r.exenta === true);
    const gravados = osde.filter(r => r.exenta === false);
    expect(exentos.length).toBe(1);  expect(exentos[0].cantidad).toBe(2);
    expect(gravados.length).toBe(1); expect(gravados[0].cantidad).toBe(1);
  });

  it('filas creadas seguidas tienen ids distintos (no colisionan con Date.now)', () => {
    // Regresión: antes se usaba Date.now() y dos filas en el mismo ms compartían id,
    // haciendo que eliminar/togglear IVA actuara sobre la fila equivocada.
    app.agregarFilaConsulta();
    app.agregarFilaConsulta();
    app.agregarFilaPrestacion();
    const ids = [
      ...g('cm-consultas-tbody').querySelectorAll('tr'),
      ...g('cm-prest-tbody').querySelectorAll('tr'),
    ].map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);   // todos únicos
  });

  it('duplicarFilaCM copia la fila (misma OS) y permite cambiarle el IVA', () => {
    const row1 = filaConsulta('OSDE', 3, true);   // 3 exentos
    app.duplicarFilaCM(row1.id);
    const filas = g('cm-consultas-tbody').querySelectorAll('tr');
    expect(filas.length).toBe(2);                 // se duplicó
    const row2 = g('cm-consultas-tbody').lastElementChild;
    expect(row2.querySelector('select').value).toBe('OSDE');   // copió la OS
    // En la copia: 1 paciente, gravado
    row2.querySelector('.cm-cant-input').value = '1';
    row2.querySelector('.iva-hidden').value = '0';
    // Y en la original quedan 2
    row1.querySelector('.cm-cant-input').value = '2';
    app._ejecutarGuardarCargaMasiva();

    const osde = app.DB.registros.filter(r => r.os === 'OSDE');
    expect(osde.reduce((s, r) => s + r.cantidad, 0)).toBe(3);   // 2 + 1
    expect(osde.filter(r => r.exenta === true)[0].cantidad).toBe(2);
    expect(osde.filter(r => r.exenta === false)[0].cantidad).toBe(1);
  });
});
