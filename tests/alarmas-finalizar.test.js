// Alarmas: una vez dadas por FINALIZADAS (desde el cartel emergente que aparece al abrir la
// app), no deben volver a sonar/aparecer. avisarAlarmasVencidas solo muestra las 'activa'.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['openModal', 'closeModal', 'showToast', 'sonarAlarma', 'renderAlarmas', 'updateAlarmBadge']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

function cartelBody() { return document.getElementById('alarma-cartel-body').innerHTML; }
function alarmaVencida(extra = {}) {
  return { id: 1, tipo: 'importante', titulo: 'Vence OSDE', desc: 'renovar convenio', fecha: '2020-01-01', estado: 'activa', ...extra };
}

describe('Finalizar desde el cartel', () => {
  it('finalizarAlarmaDesdeCartel deja la alarma como resuelta', () => {
    app.DB.alarmas = [alarmaVencida()];
    app.mostrarCartelAlarma(app.DB.alarmas);
    app.finalizarAlarmaDesdeCartel(1);
    expect(app.DB.alarmas[0].estado).toBe('resuelta');
  });

  it('finalizarTodasAlarmasCartel resuelve todas las del cartel', () => {
    app.DB.alarmas = [alarmaVencida({ id: 1 }), alarmaVencida({ id: 2, titulo: 'Otra' })];
    app.mostrarCartelAlarma(app.DB.alarmas);
    app.finalizarTodasAlarmasCartel();
    expect(app.DB.alarmas.every(a => a.estado === 'resuelta')).toBe(true);
  });
});

describe('Seguridad: el texto de la alarma se escapa', () => {
  it('un título con HTML se escapa en el cartel y en la lista (no se inyecta)', () => {
    app.DB.alarmas = [alarmaVencida({ titulo: '<img src=x onerror=alert(1)>', desc: '<b>x</b>' })];
    app.mostrarCartelAlarma(app.DB.alarmas);
    const cartel = document.getElementById('alarma-cartel-body').innerHTML;
    expect(cartel).not.toContain('<img src=x');
    expect(cartel).toContain('&lt;img');
    app.renderAlarmas();
    const lista = document.getElementById('alarms-container').innerHTML;
    expect(lista).not.toContain('<img src=x');
    expect(lista).toContain('&lt;img');
  });
});

describe('Cartel abierto: una alarma nueva se agrega, no pisa (fix C)', () => {
  it('si suena otra alarma con el cartel abierto, se agregan ambas', () => {
    app.DB.alarmas = [alarmaVencida({ id: 1, titulo: 'Primera' }), alarmaVencida({ id: 2, titulo: 'Segunda' })];
    app.mostrarCartelAlarma([app.DB.alarmas[0]]);                 // muestra la 1
    document.getElementById('modal-alarma-cartel').classList.add('open');  // openModal está stubbeado
    app.mostrarCartelAlarma([app.DB.alarmas[1]]);                 // suena la 2 con el cartel abierto
    const body = document.getElementById('alarma-cartel-body').innerHTML;
    expect(body).toContain('Primera');   // la anterior sigue
    expect(body).toContain('Segunda');   // la nueva se agregó
  });

  it('re-mostrar la misma alarma abierta no la duplica', () => {
    app.DB.alarmas = [alarmaVencida({ id: 1, titulo: 'Unica' })];
    app.mostrarCartelAlarma([app.DB.alarmas[0]]);
    document.getElementById('modal-alarma-cartel').classList.add('open');
    app.mostrarCartelAlarma([app.DB.alarmas[0]]);   // misma otra vez
    const body = document.getElementById('alarma-cartel-body').innerHTML;
    expect((body.match(/cartel-alarma-1/g) || []).length).toBe(1);   // no duplicada
  });
});

describe('No vuelve a sonar al abrir la app', () => {
  it('una alarma ACTIVA vencida aparece en el cartel', () => {
    app.DB.alarmas = [alarmaVencida()];
    app.avisarAlarmasVencidas();
    expect(cartelBody()).toContain('Vence OSDE');
  });

  it('una alarma FINALIZADA (resuelta) NO vuelve a aparecer', () => {
    app.DB.alarmas = [alarmaVencida()];
    // el usuario la da por finalizada
    app.mostrarCartelAlarma(app.DB.alarmas);
    app.finalizarAlarmaDesdeCartel(1);
    // se vacía el cartel y se vuelve a abrir la app
    document.getElementById('alarma-cartel-body').innerHTML = '';
    app.avisarAlarmasVencidas();
    expect(cartelBody()).toBe('');   // no reaparece
  });
});
