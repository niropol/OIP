// Reparación: cuando quedan atenciones/liquidaciones/derivaciones apuntando a un médico
// que ya no existe (renombre viejo o borrado), reconectarMedicoHuerfano abre un modal con
// un desplegable por cada nombre huérfano para elegir el médico destino con un clic, y
// confirmarReconexionMedicos aplica la reasignación. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'renderMedicosGrid', 'renderConfiguracion', 'initDashboard', 'openModal', 'closeModal'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
  window.alert = () => {};
  // Médico actual con el nombre NUEVO
  app.DB.medicos = [{ id: 1, nombre: 'Dr. Nuevo, Nombre', color: '#333' }];
  // Referencias que quedaron con el nombre VIEJO (huérfanas)
  app.DB.registros = [
    { id: 10, os: 'OSDE', medico: 'Dr. Viejo, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 },
    { id: 11, os: 'IOMA', medico: 'Dr. Viejo, Nombre', consultorio: 'Palpa', cantidad: 2, valorUnit: 200 },
    { id: 12, os: 'OSDE', medico: 'Dr. Nuevo, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }, // ya OK
  ];
  app.DB.liquidaciones = [{ id: 20, mes: '2026-06', medico: 'Dr. Viejo, Nombre', estado: 'Cerrada' }];
  app.DB.derivaciones = [{ id: 30, medico: 'Dr. Viejo, Nombre', paciente: 'X', estado: 'Realizada' }];
});

describe('reconectarMedicoHuerfano (modal con desplegable)', () => {
  it('llena el modal con un desplegable por cada nombre huérfano', () => {
    app.reconectarMedicoHuerfano();
    const body = document.getElementById('reconectar-body').innerHTML;
    expect(body).toContain('Dr. Viejo, Nombre');       // el nombre huérfano
    const sel = document.getElementById('reconectar-sel-0');
    expect(sel).not.toBeNull();
    // el desplegable ofrece a los médicos actuales
    expect(sel.innerHTML).toContain('Dr. Nuevo, Nombre');
  });

  it('elegir el médico y confirmar reasigna TODO al médico elegido', () => {
    app.reconectarMedicoHuerfano();
    setInput(window, 'reconectar-sel-0', '0');   // índice 0 = Dr. Nuevo
    const n = app.confirmarReconexionMedicos();
    expect(n).toBe(1);
    expect(app.DB.registros.find(r => r.id === 10).medico).toBe('Dr. Nuevo, Nombre');
    expect(app.DB.registros.find(r => r.id === 11).medico).toBe('Dr. Nuevo, Nombre');
    expect(app.DB.liquidaciones[0].medico).toBe('Dr. Nuevo, Nombre');
    expect(app.DB.derivaciones[0].medico).toBe('Dr. Nuevo, Nombre');
    expect(app.DB.registros.find(r => r.id === 12).medico).toBe('Dr. Nuevo, Nombre'); // la que ya estaba OK, intacta
    expect(app.__dirtyCols()).toContain('registros');
  });

  it('si se deja "sin cambiar", no reasigna nada', () => {
    app.reconectarMedicoHuerfano();
    setInput(window, 'reconectar-sel-0', '');   // dejar sin cambiar
    const n = app.confirmarReconexionMedicos();
    expect(n).toBe(0);
    expect(app.DB.registros.find(r => r.id === 10).medico).toBe('Dr. Viejo, Nombre'); // intacto
  });

  it('sin huérfanos: no abre el modal', () => {
    app.DB.registros = [{ id: 12, os: 'OSDE', medico: 'Dr. Nuevo, Nombre', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }];
    app.DB.liquidaciones = [];
    app.DB.derivaciones = [];
    let abrio = false;
    window.openModal = () => { abrio = true; };
    app.reconectarMedicoHuerfano();
    expect(abrio).toBe(false);
  });
});
