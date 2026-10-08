// "Otra prestación (a presupuesto)": permite cargar una prestación NO convenida con nombre
// libre + monto a mano, SIN agregarla al nomenclador de la OS. Se guarda como una atención
// normal (factura, IVA, presentación) pero sin código y con la categoría elegida.
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

function elegirOtra() {
  const sel = document.getElementById('at-prestacion-sel');
  sel.innerHTML = '<option value="__otra__" data-val="0" data-exenta="1">➕ Otra prestación…</option>';
  sel.selectedIndex = 0;
  app.AT.tipo = 'OS'; app.AT.os = 'OSDE'; app.AT.categoria = 'practica';
}

describe('Otra prestación a presupuesto', () => {
  it('guarda con nombre libre + monto, sin código, como práctica, y NO ensucia el nomenclador', () => {
    elegirOtra();
    setInput(window, 'at-prest-otra', 'Cirugía especial no convenida');
    setInput(window, 'at-monto', 750000);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '1');   // gravada

    app.guardarAtencion();

    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(reg.os).toBe('OSDE');
    expect(reg.prestacion).toBe('Cirugía especial no convenida');
    expect(reg.valorUnit).toBe(750000);
    expect(reg.codigo).toBe('');            // sin código de nomenclador
    expect(reg.categoria).toBe('practica'); // categoría congelada
    expect(reg.exenta).toBe(false);         // gravada
    // NO se agregó al catálogo de la OS
    expect(app.DB.prestaciones.some(p => p.desc === 'Cirugía especial no convenida')).toBe(false);
  });

  it('factura correctamente (neto + IVA) como cualquier atención de OS', () => {
    elegirOtra();
    setInput(window, 'at-prest-otra', 'Estudio raro');
    setInput(window, 'at-monto', 100000);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '1');   // gravada 10.5% (OSDE)

    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(app.subtotalNeto(reg)).toBe(100000);
    expect(app.ivaReg(reg)).toBeCloseTo(10500);        // 10.5% OSDE
    expect(app.facturadoReg(reg)).toBeCloseTo(110500);
  });

  it('sin nombre no guarda nada', () => {
    elegirOtra();
    setInput(window, 'at-prest-otra', '   ');   // solo espacios
    setInput(window, 'at-monto', 750000);
    const antes = app.DB.registros.length;
    app.guardarAtencion();
    expect(app.DB.registros.length).toBe(antes);
  });

  it('sin monto no guarda (es "por presupuesto")', () => {
    elegirOtra();
    setInput(window, 'at-prest-otra', 'Algo');
    setInput(window, 'at-monto', 0);
    const antes = app.DB.registros.length;
    app.guardarAtencion();
    expect(app.DB.registros.length).toBe(antes);
  });

  it('APARECE en la presentación a la OS con su nombre y su valor', () => {
    // El objetivo del feature: que la prestación a presupuesto se vea en la liquidación de la OS.
    app.DB.registros = [{
      id: 900, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      prestacion: 'Cirugía especial no convenida', codigo: '', cantidad: 1, valorUnit: 750000,
      exenta: false, categoria: 'practica', fecha: '2026-06-12',
    }];
    const filas = app.filasPresentacionOS(app.DB.registros, 'OSDE');
    const fila = filas.find(f => f.prestacion === 'Cirugía especial no convenida');
    expect(fila).toBeTruthy();               // aparece como una fila
    expect(fila.neto).toBe(750000);          // con su valor
    expect(fila.iva).toBeCloseTo(78750);     // 10.5% OSDE
  });
});
