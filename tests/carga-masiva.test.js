// Tests de la carga masiva por pegado: helpers puros de parseo + el flujo completo
// parsearResumenPegado (texto pegado → formulario del modal). Contra el código
// actual, sin modificarlo. Cubre el hueco de cobertura previo a refactorizar Atenciones.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('Consultorio "Extra" en la carga masiva', () => {
  it('actualizarCMConsultorio NO pisa "Extra" elegido a mano', () => {
    const g = id => window.document.getElementById(id);
    g('cm-medico').innerHTML = app.DB.medicos.map(m => `<option>${m.nombre}</option>`).join('');
    setInput(window, 'cm-medico', 'Dr. Polisky, Nicolás'); // Polisky = Palpa
    setInput(window, 'cm-consultorio', 'Extra');
    app.actualizarCMConsultorio();
    expect(g('cm-consultorio').value).toBe('Extra'); // se respeta, no vuelve a Palpa
  });

  it('sin elección manual, sigue autocompletando la sede del médico', () => {
    const g = id => window.document.getElementById(id);
    g('cm-medico').innerHTML = app.DB.medicos.map(m => `<option>${m.nombre}</option>`).join('');
    setInput(window, 'cm-medico', 'Dr. Polisky, Nicolás');
    setInput(window, 'cm-consultorio', 'Palpa');
    app.actualizarCMConsultorio();
    expect(g('cm-consultorio').value).toBe('Palpa');
  });

  it('la carga masiva guarda los registros con consultorio "Extra"', () => {
    const g = id => window.document.getElementById(id);
    g('cm-medico').innerHTML = app.DB.medicos.map(m => `<option>${m.nombre}</option>`).join('');
    ['renderAtenciones', 'renderCajaChica', 'initDashboard', 'closeModal', 'showToast']
      .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
    setInput(window, 'cm-medico', 'Dr. Polisky, Nicolás');
    setInput(window, 'cm-consultorio', 'Extra');
    setInput(window, 'cm-fecha', '2026-06-23');
    window.agregarFilaConsulta();
    const row = window.document.querySelector('#cm-consultas-tbody tr');
    row.querySelector('select').value = 'OSDE';
    row.querySelector('.cm-cant-input').value = '3';
    window._ejecutarGuardarCargaMasiva();
    expect(app.DB.registros.length).toBe(1);
    expect(app.DB.registros[0].consultorio).toBe('Extra');
  });
});

describe('normalizarOSAlias (alias de obras sociales)', () => {
  it('mapea alias comunes al nombre del sistema', () => {
    expect(app.normalizarOSAlias('OSMECON').os).toBe('SAMI');
    expect(app.normalizarOSAlias('cober').os).toBe('CoberMed');
    expect(app.normalizarOSAlias('medicals').os).toBe("Medical's");
    expect(app.normalizarOSAlias('MEDIFE').os).toBe('Medifé');
  });

  it('detecta OSDE con plan', () => {
    const r = app.normalizarOSAlias('OSDE - 210');
    expect(r.os).toBe('OSDE');
    expect(r.plan).toBe('210');
  });

  it('OS desconocida cae en Particular (no crea fila de OS)', () => {
    expect(app.normalizarOSAlias('CualquierCosaSA').os).toBe('Particular');
  });
});

describe('parsearFecha (varios formatos)', () => {
  it('"15 de mayo" usa el año dado', () => {
    expect(app.parsearFecha('15 de mayo', '2026')).toBe('2026-05-15');
  });
  it('"15/05" usa el año dado; "15/05/2025" usa el año explícito', () => {
    expect(app.parsearFecha('atendido 15/05', '2026')).toBe('2026-05-15');
    expect(app.parsearFecha('15/05/2025', '2026')).toBe('2025-05-15');
  });
  it('ISO se devuelve tal cual', () => {
    expect(app.parsearFecha('fecha 2026-05-15 ok', '2026')).toBe('2026-05-15');
  });
  it('sin fecha devuelve cadena vacía', () => {
    expect(app.parsearFecha('sin fecha aquí', '2026')).toBe('');
  });
});

describe('detección de médico / consultorio en líneas', () => {
  it('reconoce al médico por apellido en las primeras líneas', () => {
    expect(app.detectarMedicoEnLineas(['Polisky, Nicolas', 'otra cosa'])).toBe('Dr. Polisky, Nicolás');
  });
  it('detecta consultorio por palabra clave', () => {
    expect(app.detectarConsultorioEnLineas(['algo Haedo algo'], '')).toBe('Haedo');
    expect(app.detectarConsultorioEnLineas(['en Palpa'], '')).toBe('Palpa');
  });
  it('si no hay palabra clave, usa el consultorio del médico detectado', () => {
    // Dra. Sacks es de Haedo según los datos semilla
    expect(app.detectarConsultorioEnLineas(['sin sede'], 'Dra. Sacks, Camila')).toBe('Haedo');
  });
});

describe('parsearResumenPegado (flujo completo texto → formulario)', () => {
  beforeEach(() => {
    // El select de médicos se llena en init(); lo poblamos para poder verificar la detección.
    window.document.getElementById('cm-medico').innerHTML =
      app.DB.medicos.map(m => `<option>${m.nombre}</option>`).join('');
  });

  it('parsea médico, fecha, consultorio, filas de OS y particulares con medio de pago', () => {
    const texto = [
      'Polisky, Nicolas',
      '📍 Centro Integral de Salud — Haedo  ·  15 de mayo',
      'Obra social\tCant.',
      'OSMECON\t6',
      'MEDICUS\t5',
      'Particulares (2)',
      'Juan Perez (E)',
      'Maria Lopez (T)',
    ].join('\n');
    setInput(window, 'cm-paste-text', texto);

    app.parsearResumenPegado();

    const g = id => window.document.getElementById(id);
    expect(g('cm-medico').value).toBe('Dr. Polisky, Nicolás');
    expect(g('cm-fecha').value).toBe('2026-05-15');
    expect(g('cm-consultorio').value).toBe('Haedo');

    // Dos filas de OS: OSMECON→SAMI (6) y MEDICUS→Medicus (5)
    const filas = window.document.querySelectorAll('#cm-consultas-tbody tr');
    expect(filas.length).toBe(2);

    // Particulares: 1 efectivo (Juan), 1 transferencia (Maria)
    expect(parseInt(g('cm-part-ef-cant').value)).toBe(1);
    expect(parseInt(g('cm-part-tr-cant').value)).toBe(1);
  });

  it('OS desconocidas no generan fila y suman a particulares', () => {
    const texto = [
      'Sacks, Camila',
      'Haedo · 2026-05-20',
      'Obra social\tCant.',
      'CoberMed\t3',
      'ObraInexistenteSA\t2',
    ].join('\n');
    setInput(window, 'cm-paste-text', texto);

    app.parsearResumenPegado();

    const filas = window.document.querySelectorAll('#cm-consultas-tbody tr');
    expect(filas.length).toBe(1); // solo CoberMed
    // las 2 desconocidas pasan a particulares (transferencia por defecto)
    const ef = parseInt(window.document.getElementById('cm-part-ef-cant').value);
    const tr = parseInt(window.document.getElementById('cm-part-tr-cant').value);
    expect(ef + tr).toBe(2);
  });
});
