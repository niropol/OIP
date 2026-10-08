// El banner "Valor de consulta por OS" (Configuración → Prestaciones) se arma DINÁMICO desde el
// nomenclador cargado, no de valores hardcodeados. Cada OS muestra SU valor; sin mezclar OS ni
// inventar un "$22.000 convenio general". Las OS sin consulta cargada van aparte como "sin cargar".
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  app.DB.config.valorConsultaParticular = 60000;
  app.DB.obrasSociales = [
    { id: 1, nombre: 'OSDE', estado: 'Activa' },
    { id: 2, nombre: 'IOMA', estado: 'Activa' },
    { id: 3, nombre: 'Medicus', estado: 'Activa' },   // sin consulta cargada
  ];
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta (Plan 210)', os: 'OSDE', valOS: 21536 },
    { id: 2, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679 },
    { id: 3, codigo: '—', desc: 'Consulta vestida oftalmológica', os: 'IOMA', valOS: 18000 },
    // Medicus: sin consulta
  ];
});

describe('Banner de valores vigentes (dinámico)', () => {
  it('muestra el valor real de cada OS desde el nomenclador (rango si hay varios planes)', () => {
    app.renderValoresVigentes();
    const html = document.getElementById('cfg-valores-vigentes').innerHTML;
    expect(html).toContain('OSDE');
    expect(html).toMatch(/OSDE[^·]*21\.536[^·]*55\.679/);   // rango de OSDE (sus dos planes)
    expect(html).toContain('IOMA');
    expect(html).toContain('18.000');
    expect(html).toContain('Particular');
    expect(html).toContain('60.000');
  });

  it('NO inventa "convenio general" ni un valor genérico', () => {
    app.renderValoresVigentes();
    const html = document.getElementById('cfg-valores-vigentes').innerHTML;
    expect(html.toLowerCase()).not.toContain('convenio general');
    expect(html.toLowerCase()).not.toContain('conv. general');
  });

  it('las OS sin consulta cargada van aparte como "sin cargar", no con un valor inventado', () => {
    app.renderValoresVigentes();
    const html = document.getElementById('cfg-valores-vigentes').innerHTML;
    expect(html.toLowerCase()).toContain('sin consulta cargada');
    expect(html).toContain('Medicus');
    // Medicus NO debe aparecer con un $22.000 ni ningún monto inventado en la parte principal
    expect(html).not.toMatch(/Medicus \$?22\.000/);
  });

  it('escapa nombres de OS con caracteres especiales', () => {
    app.DB.obrasSociales.push({ id: 4, nombre: '<img src=x>', estado: 'Activa' });
    app.renderValoresVigentes();
    const html = document.getElementById('cfg-valores-vigentes').innerHTML;
    expect(html).not.toContain('<img src=x>');
  });
});
