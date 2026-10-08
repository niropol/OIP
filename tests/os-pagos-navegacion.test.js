// Fusión de las secciones Obras sociales + Médicos + Derivaciones en una sola
// "OS/Pagos" con 5 tabs (Preliquidaciones médicos / Resumen obras sociales /
// Cobranzas pendientes / Historial de pagos / Derivaciones). Los IDs internos de
// cada tab se conservan tal cual eran, así los render existentes no cambian.
// Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
});

const PANES = ['ospagos-tab-medicos', 'os-tab-resumen', 'os-tab-cobranzas', 'os-tab-historial', 'ospagos-tab-derivaciones'];

function visibles() {
  return PANES.filter(id => document.getElementById(id).style.display !== 'none');
}

describe('Sección OS/Pagos: estructura', () => {
  it('las 3 secciones viejas ya no existen; existe section-os-pagos con los 5 panes', () => {
    expect(document.getElementById('section-obras-sociales')).toBeNull();
    expect(document.getElementById('section-medicos')).toBeNull();
    expect(document.getElementById('section-derivaciones')).toBeNull();
    expect(document.getElementById('section-os-pagos')).toBeTruthy();
    PANES.forEach(id => expect(document.getElementById(id)).toBeTruthy());
  });

  it('el tab bar tiene los 5 tabs con su data-tab', () => {
    const tabs = [...document.querySelectorAll('#ospagos-tabs .tab')].map(t => t.dataset.tab);
    expect(tabs).toEqual(['medicos', 'os-resumen', 'cobranzas', 'historial', 'derivaciones']);
  });

  it('los contenidos clave siguen existiendo dentro de la sección (IDs intactos)', () => {
    const seccion = document.getElementById('section-os-pagos');
    ['medicos-grid', 'os-cards-grid', 'os-tbody', 'cobranzas-tbody',
     'historial-pagos-tbody', 'deriv-tbody', 'deriv-kpis', 'deriv-subtabs']
      .forEach(id => {
        const el = document.getElementById(id);
        expect(el, id).toBeTruthy();
        expect(seccion.contains(el), `${id} dentro de section-os-pagos`).toBe(true);
      });
  });
});

describe('switchOSPagosTab: muestra un pane por vez y dispara su render', () => {
  it('por defecto el pane visible es Preliquidaciones médicos', () => {
    expect(visibles()).toEqual(['ospagos-tab-medicos']);
  });

  it('cambiar a cada tab deja visible SOLO su pane', () => {
    const casos = [
      ['os-resumen', 'os-tab-resumen'],
      ['cobranzas', 'os-tab-cobranzas'],
      ['historial', 'os-tab-historial'],
      ['derivaciones', 'ospagos-tab-derivaciones'],
      ['medicos', 'ospagos-tab-medicos'],
    ];
    casos.forEach(([tab, paneEsperado]) => {
      app.switchOSPagosTab(tab, document.querySelector(`#ospagos-tabs .tab[data-tab="${tab}"]`));
      expect(visibles(), tab).toEqual([paneEsperado]);
      expect(document.querySelector('#ospagos-tabs .tab.active').dataset.tab).toBe(tab);
    });
  });

  it('el tab Derivaciones renderiza KPIs y listado al entrar', () => {
    app.DB.derivaciones.push({ id: 1, fecha: '2026-06-01', consultorio: 'Palpa', paciente: 'Test P', dni: '123',
      medico: 'Dr. Polisky, Nicolás', os: 'OSDE', cirugia: 'Catarata / Faco', estado: 'Programada', pagos: [] });
    app.switchOSPagosTab('derivaciones', document.querySelector('#ospagos-tabs .tab[data-tab="derivaciones"]'));
    expect(document.getElementById('deriv-kpis').innerHTML).toContain('Total derivaciones');
    expect(document.getElementById('deriv-tbody').innerHTML).toContain('Test P');
  });
});

describe('showSection: alias de compatibilidad para las secciones fusionadas', () => {
  it("showSection('medicos') abre OS/Pagos con el tab Preliquidaciones médicos", () => {
    app.showSection('medicos');
    expect(document.getElementById('section-os-pagos').classList.contains('active')).toBe(true);
    expect(visibles()).toEqual(['ospagos-tab-medicos']);
  });

  it("showSection('obras-sociales') abre OS/Pagos con el tab Resumen obras sociales", () => {
    app.showSection('obras-sociales');
    expect(document.getElementById('section-os-pagos').classList.contains('active')).toBe(true);
    expect(visibles()).toEqual(['os-tab-resumen']);
  });

  it("showSection('derivaciones') abre OS/Pagos con el tab Derivaciones", () => {
    app.showSection('derivaciones');
    expect(document.getElementById('section-os-pagos').classList.contains('active')).toBe(true);
    expect(visibles()).toEqual(['ospagos-tab-derivaciones']);
  });

  it("showSection('os-pagos') re-renderiza el tab activo y actualiza el título", () => {
    app.showSection('os-pagos');
    expect(document.getElementById('topbar-title').textContent).toBe('OS / Pagos');
  });
});

describe('Cross-links entre tabs siguen funcionando', () => {
  it('verCobranzasOS salta al tab Cobranzas y filtra por la OS', async () => {
    app.DB.facturas.push({ id: 1, num: 'A-1', fecha: '2026-06-01', dest: 'IOMA', mes: 'Junio 2026',
      monto: 50000, estado: 'Pendiente', vence: '2026-07-01' });
    app.showSection('os-pagos');
    app.verCobranzasOS('IOMA');
    await new Promise(r => setTimeout(r, 80));
    expect(visibles()).toEqual(['os-tab-cobranzas']);
    expect(document.getElementById('cob-filter-os').value).toBe('IOMA');
    expect(document.getElementById('cobranzas-tbody').innerHTML).toContain('IOMA');
  });

  it('los sub-tabs internos de Derivaciones (Listado/Por médico/Por cirugía) siguen andando', () => {
    app.switchOSPagosTab('derivaciones', document.querySelector('#ospagos-tabs .tab[data-tab="derivaciones"]'));
    const subtabs = document.querySelectorAll('#deriv-subtabs .tab');
    expect(subtabs.length).toBe(3);
    app.switchDerivTab('por-medico', subtabs[1]);
    expect(document.getElementById('deriv-tab-por-medico').style.display).toBe('');
    expect(document.getElementById('deriv-tab-listado').style.display).toBe('none');
    app.switchDerivTab('listado', subtabs[0]);
    expect(document.getElementById('deriv-tab-listado').style.display).toBe('');
  });
});
