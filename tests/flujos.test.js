// Tests de flujos con efectos: cobro de factura, borrado sin movimientos
// huérfanos, y reprecio por fecha de vigencia. Contra el código actual, sin tocarlo.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  // Evitar que los re-render de UI rompan (tocan mucho DOM); no afectan los datos.
  ['renderCobranzas', 'renderOS', 'renderFinanzas', 'renderCajaChica',
   'renderAtenciones', 'renderConfiguracion', 'initDashboard'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
});

describe('Cobrar una factura → el ingreso entra a Caja', () => {
  it('marca la factura Pagada, registra el pago y crea el ingreso en movimientos', () => {
    app.DB.facturas.push({
      id: 5000, num: 'A-0001', dest: 'OSDE', mes: 'Junio 2026',
      monto: 100000, estado: 'Pendiente', vence: '2026-08-01',
    });
    setInput(window, 'cobro-factura-id', 5000);
    setInput(window, 'cobro-monto', 100000);
    setInput(window, 'cobro-fecha', '2026-06-15');
    setInput(window, 'cobro-medio', 'Transferencia');
    setInput(window, 'cobro-ref', 'TRF-123');
    setInput(window, 'cobro-obs', '');

    app.confirmarCobro();

    const f = app.DB.facturas.find(x => x.id === 5000);
    expect(f.estado).toBe('Pagada');
    expect(f.fechaPago).toBe('2026-06-15');

    const pago = app.DB.pagosRecibidos.find(p => p.facturaId === 5000);
    expect(pago).toBeTruthy();
    expect(pago.monto).toBe(100000);

    const mov = app.DB.movimientos.find(m => m.facturaId === 5000);
    expect(mov).toBeTruthy();
    expect(mov.tipo).toBe('Ingreso');
    expect(mov.monto).toBe(100000);
    expect(mov.origen).toBe('Factura');
  });
});

describe('Borrar una factura cobrada → no deja rastro en Caja', () => {
  it('elimina factura, su ingreso en movimientos y el pago recibido', () => {
    app.DB.facturas.push({ id: 5001, num: 'A-0002', dest: 'OSDE', mes: 'Junio 2026', monto: 80000, estado: 'Pendiente' });
    setInput(window, 'cobro-factura-id', 5001);
    setInput(window, 'cobro-monto', 80000);
    setInput(window, 'cobro-fecha', '2026-06-15');
    setInput(window, 'cobro-medio', 'Transferencia');
    setInput(window, 'cobro-ref', '');
    setInput(window, 'cobro-obs', '');
    app.confirmarCobro();

    // sanity: quedó cobrada con su movimiento
    expect(app.DB.movimientos.some(m => m.facturaId === 5001)).toBe(true);

    setInput(window, 'ef-id', 5001);
    app.eliminarFactura();

    expect(app.DB.facturas.some(f => f.id === 5001)).toBe(false);
    expect(app.DB.movimientos.some(m => m.facturaId === 5001)).toBe(false);
    expect(app.DB.pagosRecibidos.some(p => p.facturaId === 5001)).toBe(false);
  });
});

describe('Cargar y borrar una atención → sin movimientos huérfanos en caja', () => {
  it('al borrar el registro se elimina el movimiento de caja chica vinculado por regId', () => {
    app.DB.registros.push({
      id: 6000, fecha: '2026-06-10', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'Particular', partEfectivo: 1, partEfVal: 60000, partTransf: 0, partTrVal: 60000,
    });
    app.DB.cajaChica.push({
      id: 6001, fecha: '2026-06-10', consultorio: 'Palpa', tipo: 'Ingreso',
      concepto: 'Particular efectivo — Polisky', origen: 'Efectivo', monto: 60000, regId: 6000,
    });

    app.eliminarRegistro(6000);

    expect(app.DB.registros.some(r => r.id === 6000)).toBe(false);
    // no debe quedar ningún movimiento de caja apuntando al registro borrado
    expect(app.DB.cajaChica.some(m => m.regId === 6000)).toBe(false);
    expect(app.DB.cajaChica.length).toBe(0);
  });

  it('borra también el movimiento de banco (transferencia particular) vinculado', () => {
    app.DB.registros.push({
      id: 6100, fecha: '2026-06-11', medico: 'Dra. Mateo, Agustina', consultorio: 'Palpa',
      os: 'Particular', partEfectivo: 0, partEfVal: 60000, partTransf: 1, partTrVal: 60000,
    });
    app.DB.movimientos.push({
      id: 6101, fecha: '2026-06-11', consultorio: 'Palpa', tipo: 'Ingreso',
      desc: 'Particular transferencia — Mateo', monto: 60000, origen: 'Particular', regId: 6100,
    });

    app.eliminarRegistro(6100);

    expect(app.DB.registros.some(r => r.id === 6100)).toBe(false);
    expect(app.DB.movimientos.some(m => m.regId === 6100)).toBe(false);
  });
});

describe('Reprecio de atenciones por fecha de vigencia', () => {
  it('reprecia desde la vigencia y deja intactas las anteriores', async () => {
    // Catálogo: una consulta OSDE a un valor nuevo (fuente de verdad = config)
    app.DB.prestaciones = [
      { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 60000, valPart: 60000 },
    ];
    // Dos atenciones con el valor VIEJO: una antes y una después de la vigencia
    app.DB.registros = [
      { id: 7000, fecha: '2026-05-20', os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)',
        plan: '510', cantidad: 1, valorUnit: 55679, exenta: true, partEfVal: 55679, partTrVal: 55679 },
      { id: 7001, fecha: '2026-06-20', os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)',
        plan: '510', cantidad: 1, valorUnit: 55679, exenta: true, partEfVal: 55679, partTrVal: 55679 },
    ];
    window.confirm = () => true;
    window.alert = () => {};

    await app.actualizarPreciosPrestaciones('OSDE', '2026-06-01');

    const antes = app.DB.registros.find(r => r.id === 7000);
    const despues = app.DB.registros.find(r => r.id === 7001);
    expect(antes.valorUnit).toBe(55679);   // anterior a la vigencia: intacta
    expect(despues.valorUnit).toBe(60000); // desde la vigencia: repreciada al valor de config
  });

  it('no toca atenciones Particular ni CEMEPLA', async () => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 60000, valPart: 60000 },
    ];
    app.DB.registros = [
      { id: 7100, fecha: '2026-06-20', os: 'Particular', partEfectivo: 1, partEfVal: 50000, partTransf: 0, partTrVal: 50000 },
      { id: 7101, fecha: '2026-06-20', os: 'CEMEPLA', codigo: '—', prestacion: 'Consulta', cantidad: 1, valorUnit: 50000 },
    ];
    window.confirm = () => true;
    window.alert = () => {};

    // Aunque se repricie, Particular y CEMEPLA nunca se tocan (guarda en _repreciarRegistros).
    await app.actualizarPreciosPrestaciones('OSDE', '2026-06-01');
    app._repreciarRegistros('2026-06-01', 'CEMEPLA');   // ni siquiera con su propia OS

    expect(app.DB.registros.find(r => r.id === 7100).partEfVal).toBe(50000);
    expect(app.DB.registros.find(r => r.id === 7101).valorUnit).toBe(50000);
  });
});
