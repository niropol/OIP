// Rename de OS: al cambiarle el nombre a una obra social, se propaga a TODO lo que la referencia
// por nombre (facturas.dest, registros.os, prestaciones.os, pagosRecibidos.os, derivaciones.os).
// Sin esto, esos registros quedaban huérfanos de la ficha (y de su config de IVA/copago).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  await new Promise(r => setTimeout(r, 0));
  resetDatos(app);
  ['closeModal', 'renderOS', 'showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

it('renombrar una OS propaga a registros, facturas, prestaciones, pagos Y derivaciones', async () => {
  app.DB.obrasSociales = [{ id: 1, nombre: 'Bristol', codigo: 'BR', estado: 'Activa' }];
  app.DB.registros = [{ id: 10, os: 'Bristol', medico: 'X', fecha: '2026-06-10', cantidad: 1, valorUnit: 1000 }];
  app.DB.facturas = [{ id: 20, dest: 'Bristol', mes: 'Junio 2026', monto: 1000, estado: 'Pendiente' }];
  app.DB.prestaciones = [{ id: 30, os: 'Bristol', codigo: 'X', desc: 'Consulta', valOS: 1000 }];
  app.DB.pagosRecibidos = [{ id: 40, os: 'Bristol', monto: 1000 }];
  app.DB.derivaciones = [{ id: 50, os: 'Bristol', medico: 'X', paciente: 'P', estado: 'Pendiente' }];

  setInput(window, 'os-edit-id', '1');
  setInput(window, 'os-nombre', 'Bristol SA');
  setInput(window, 'os-codigo', 'BR');
  await app.guardarOS();

  expect(app.DB.obrasSociales[0].nombre).toBe('Bristol SA');
  expect(app.DB.registros[0].os).toBe('Bristol SA');
  expect(app.DB.facturas[0].dest).toBe('Bristol SA');
  expect(app.DB.prestaciones[0].os).toBe('Bristol SA');
  expect(app.DB.pagosRecibidos[0].os).toBe('Bristol SA');
  expect(app.DB.derivaciones[0].os).toBe('Bristol SA');   // el que faltaba antes del fix
});
