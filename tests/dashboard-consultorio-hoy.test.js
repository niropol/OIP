// La card "Atenciones por médico — hoy" del dashboard debe mostrar el/los consultorio(s)
// REAL(es) de las atenciones del día, NO el consultorio de la ficha del médico. Antes un
// médico con ficha "Palpa" que atendía en Haedo aparecía con la etiqueta "Palpa".
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, hoy;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  hoy = app.hoyISO();
});

const consulta = (over) => ({
  fecha: hoy, medico: 'Dr. Polisky, Nicolás', os: 'OSDE', plan: '', prestacion: 'Consulta',
  cantidad: 1, valorUnit: 20000, exenta: true, partEfectivo: 0, partTransf: 0, ...over,
});

describe('Dashboard — consultorio de las atenciones de hoy', () => {
  it('muestra el consultorio REAL de hoy, no el de la ficha del médico', () => {
    // Dr. Polisky tiene ficha "Palpa", pero HOY atendió en Haedo
    app.DB.registros.push(consulta({ id: 5001, consultorio: 'Haedo' }));
    app.initDashboard();
    const html = window.document.getElementById('medico-hoy-list').innerHTML;
    expect(html).toContain('Haedo');        // el consultorio real de hoy
    expect(html).toContain('pill-haedo');
    expect(html).not.toContain('pill-palpa'); // NO la ficha (Palpa)
  });

  it('si atendió en dos consultorios el mismo día, muestra ambos con su conteo', () => {
    app.DB.registros.push(consulta({ id: 5002, consultorio: 'Haedo', cantidad: 3 }));
    app.DB.registros.push(consulta({ id: 5003, consultorio: 'Palpa', cantidad: 2 }));
    app.initDashboard();
    const html = window.document.getElementById('medico-hoy-list').innerHTML;
    expect(html).toContain('pill-haedo');
    expect(html).toContain('pill-palpa');
    expect(html).toContain('Haedo 3');   // consultorio + conteo (se desambigua)
    expect(html).toContain('Palpa 2');
  });
});
