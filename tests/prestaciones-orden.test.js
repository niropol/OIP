// El listado de prestaciones (Configuración → Prestaciones) muestra las prestaciones
// de cada OS ordenadas por CÓDIGO (numérico-aware). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  // Prestaciones desordenadas, con códigos de distinta longitud para probar orden numérico.
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta OSDE', os: 'OSDE', valOS: 55679 },
    { id: 2, codigo: '20',     desc: 'Cirugía OSDE',  os: 'OSDE', valOS: 900000 },
    { id: 3, codigo: '100',    desc: 'Estudio OSDE',  os: 'OSDE', valOS: 30000 },
    { id: 4, codigo: '9',      desc: 'Otra OSDE',     os: 'OSDE', valOS: 10000 },
    { id: 5, codigo: '300102', desc: 'Consulta IOMA', os: 'IOMA', valOS: 11000 },
    { id: 6, codigo: '50',     desc: 'Estudio IOMA',  os: 'IOMA', valOS: 8000 },
  ];
});

function ordenCodigosVisibles() {
  const html = document.getElementById('cfg-prestaciones-tbody').innerHTML;
  // Extraer los códigos en el orden en que aparecen en el HTML de la tabla.
  return [...html.matchAll(/font-weight:600;">(\d+)</g)].map(m => m[1]);
}

describe('Listado de prestaciones ordenado por código', () => {
  it('filtrado por una OS: ordena por código numérico-aware (9 < 20 < 100 < 420162)', () => {
    setInput(window, 'cfg-prest-os-filter', 'OSDE');
    app.renderConfiguracion();
    expect(ordenCodigosVisibles()).toEqual(['9', '20', '100', '420162']);
  });

  it('sin filtro: agrupa por OS y dentro de cada OS ordena por código', () => {
    setInput(window, 'cfg-prest-os-filter', '');
    app.renderConfiguracion();
    // IOMA primero (alfabético), sus códigos ordenados; después OSDE, ordenados.
    expect(ordenCodigosVisibles()).toEqual(['50', '300102', '9', '20', '100', '420162']);
  });
});
