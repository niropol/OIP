// El comentario/observación de Atención Rápida (campo "Observaciones") ahora SE GUARDA en el
// registro y VIAJA a la presentación de la OS (detalle en pantalla + mail). Antes el campo se
// escribía y se perdía. Es útil sobre todo en prácticas/cirugías: una aclaración para la OS.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'renderAtenciones', 'closeModal', 'showToast']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
  setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
  setInput(window, 'at-fecha', '2026-06-10');
  setInput(window, 'at-consultorio-sel', 'Palpa');
});

describe('Comentario de Atención Rápida → registro', () => {
  it('guardarAtencion guarda el comentario de una práctica/cirugía en el registro', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 900000, valPart: 60000 }];
    const sel = document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Catarata c/IOL — $900.000</option>';
    sel.selectedIndex = 0;
    app.AT.tipo = 'OS'; app.AT.os = 'OSDE'; app.AT.categoria = 'practica';
    setInput(window, 'at-monto', 900000);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '1');
    setInput(window, 'at-obs', 'Ojo derecho — urgente por derivación');

    app.guardarAtencion();

    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(reg.os).toBe('OSDE');
    expect(reg.comentario).toBe('Ojo derecho — urgente por derivación');
  });

  it('sin comentario, el registro no queda con un campo comentario vacío', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 900000, valPart: 60000 }];
    const sel = document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Catarata c/IOL — $900.000</option>'; sel.selectedIndex = 0;
    app.AT.tipo = 'OS'; app.AT.os = 'OSDE'; app.AT.categoria = 'practica';
    setInput(window, 'at-monto', 900000); setInput(window, 'at-cantidad', 1); setInput(window, 'at-iva-val', '1');
    setInput(window, 'at-obs', '   ');   // solo espacios

    app.guardarAtencion();
    expect(app.DB.registros[app.DB.registros.length - 1].comentario).toBeUndefined();
  });
});

describe('Comentario → presentación de la OS', () => {
  it('el comentario aparece en el detalle de la OS (renderOSDetalle)', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 900000, valPart: 60000 }];
    app.DB.registros = [{
      id: 500, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      prestacion: 'Catarata c/IOL', codigo: '20167', cantidad: 1, valorUnit: 900000,
      exenta: false, categoria: 'practica', fecha: '2026-06-12',
      comentario: 'Requiere lente premium',
    }];
    app.renderOSDetalle('OSDE', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('Observación');            // la columna nueva
    expect(html).toContain('Requiere lente premium'); // el comentario
  });

  it('sin comentarios en el mes, no se agrega la columna Observación', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 900000, valPart: 60000 }];
    app.DB.registros = [{
      id: 501, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      prestacion: 'Catarata c/IOL', codigo: '20167', cantidad: 1, valorUnit: 900000,
      exenta: false, categoria: 'practica', fecha: '2026-06-12', paciente: 'Pérez, Juan',
    }];
    app.renderOSDetalle('OSDE', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    expect(html).not.toContain('Observación');
  });
});
