// Auditoría "una madre que distribuye los datos": renderAtenciones() (tab Resumen) y
// renderMedicosGrid() (sección Médicos) recalculaban el honorario de particulares a
// mano con el precio ESTÁNDAR de config, en vez de con honorALiquidarReg()/
// honorariosMedico() (el precio REALMENTE cobrado — fix ya aplicado a esas funciones
// en una sesión anterior, pero nunca propagado acá). También sumaban el efectivo
// (ya pagado) al "a liquidar", y en Médicos el conteo de "pacientes hoy" no incluía
// cirugías. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
const MEDICO = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('renderAtenciones (tab Resumen): honorario de particulares con precio real', () => {
  it('un particular cobrado a precio ESPECIAL (no estándar) muestra el honorario real en "Hon. Part."', () => {
    // Precio especial: 100.000 por transferencia (el estándar de config es 60.000)
    app.DB.registros.push({
      id: 1, os: 'Particular', medico: MEDICO, fecha: app.hoyISO(), consultorio: 'Palpa',
      cantidad: 0, valorUnit: 0, partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 100000,
    });
    app.renderAtenciones();
    const html = window.document.getElementById('at-resumen-tbody').innerHTML;
    // 50% de 100.000 = 50.000 (no 50% de 60.000 = 30.000, que era lo que daba antes)
    expect(html).toContain('50.000');
    expect(html).not.toContain('30.000');
  });

  it('el efectivo (ya cobrado en el momento) NO suma a "Hon. Part." (a liquidar)', () => {
    app.DB.registros.push({
      id: 2, os: 'Particular', medico: MEDICO, fecha: app.hoyISO(), consultorio: 'Palpa',
      cantidad: 0, valorUnit: 0, partEfectivo: 1, partEfVal: 80000, partTransf: 0, partTrVal: 60000,
    });
    app.renderAtenciones();
    const html = window.document.getElementById('at-resumen-tbody').innerHTML;
    // Antes: 50% de 80.000 = 40.000 aparecía en "Hon. Part." (mal, ya estaba cobrado).
    // Ahora: 0, porque honorALiquidarReg excluye el efectivo.
    expect(html).not.toContain('40.000');
  });

  it('desglose por OS: una atención sin exenta definido usa el default de la OS (no "gravada" a ciegas)', () => {
    // OSDE es exenta por defecto (getExentaForOS) — sin exenta definido debe contarse como exenta.
    app.DB.registros.push({
      id: 3, os: 'OSDE', medico: MEDICO, fecha: app.hoyISO(), consultorio: 'Palpa',
      cantidad: 1, valorUnit: 55679, prestacion: 'Consulta', plan: '', partEfectivo: 0, partTransf: 0,
      // exenta: sin definir a propósito
    });
    app.renderAtenciones();
    const html = window.document.getElementById('at-os-tbody').innerHTML;
    expect(html).toContain('Exenta');
    // No debe haber IVA calculado si es exenta
    expect(html).not.toContain('5.846');  // 55679*0.105 redondeado, lo que daría si se tratara mal como gravada
  });
});

describe('renderMedicosGrid: honorario de particulares con precio real + total pacientes correcto', () => {
  it('un particular con precio especial muestra el honorario real, no el estándar', () => {
    app.DB.registros.push({
      id: 10, os: 'Particular', medico: MEDICO, fecha: app.hoyISO(), consultorio: 'Palpa',
      cantidad: 0, valorUnit: 0, partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 100000,
    });
    app.renderMedicosGrid();
    const html = window.document.getElementById('medicos-grid').innerHTML;
    expect(html).toContain('50.000');
  });

  it('"Hoy" cuenta también las cirugías (antes solo contaba consultas, quedaba inconsistente con "Mes")', () => {
    const hoy = app.hoyISO();
    app.DB.registros.push({
      id: 11, os: 'OSDE', medico: MEDICO, fecha: hoy, consultorio: 'Palpa',
      cantidad: 1, valorUnit: 1351970, exenta: true, prestacion: 'Catarata c/IOL', partEfectivo: 0, partTransf: 0,
    });
    app.renderMedicosGrid();
    const html = window.document.getElementById('medicos-grid').innerHTML;
    expect(html).toContain('Hoy — 1 paciente');
  });

  it('"A liquidar este mes" incluye SinCargo (antes solo sumaba honOS + honTransf)', () => {
    app.DB.registros.push({
      id: 12, os: 'SinCargo', medico: MEDICO, fecha: app.hoyISO(), consultorio: 'Palpa',
      cantidad: 3, valorUnit: 0.1, partEfectivo: 0, partTransf: 0,
    });
    app.renderMedicosGrid();
    const html = window.document.getElementById('medicos-grid').innerHTML;
    expect(html).toContain('0,30');
  });
});
