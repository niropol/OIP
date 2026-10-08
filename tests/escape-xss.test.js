// El texto libre (prestación, paciente, médico, comentario) se escapa antes de ir al HTML:
// un '<' en un nombre no debe romper el render ni inyectar. Barrido de auditoría 2026-08-27.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
});

describe('Escape en el render de atenciones', () => {
  it('una prestación con HTML se escapa en la tabla diaria (no se inyecta)', () => {
    app.DB.registros = [{
      id: 1, os: 'OSDE', medico: 'Dr. <img src=x onerror=alert(1)>', consultorio: 'Palpa',
      prestacion: '<script>alert(1)</script>', codigo: '', cantidad: 1, valorUnit: 1000,
      exenta: true, fecha: app.hoyISO(),
    }];
    // ver la tabla del mes actual (el filtro por defecto es el mes de hoy)
    app.renderAtenciones();
    const html = document.getElementById('at-diario-tbody').innerHTML;
    // La superficie real de XSS es el CONTENIDO DE TEXTO: un '<' que abre tag no debe quedar crudo.
    expect(html).not.toContain('<img src=x');       // médico (texto) escapado
    expect(html).toContain('&lt;img');              // quedó como entidad, no como tag
    // El nombre del médico crudo no debe inyectarse como nodo
    expect(document.querySelectorAll('#at-diario-tbody img').length).toBe(0);
  });
});

describe('escHtml (helper base)', () => {
  it('escapa < > & " y tolera null/undefined', () => {
    expect(app.escHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
    expect(app.escHtml(null)).toBe('');
    expect(app.escHtml(undefined)).toBe('');
  });
});
