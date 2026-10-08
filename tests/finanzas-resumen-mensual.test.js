// Finanzas → "Resumen mensual": por período, cuánto entró en efectivo (caja chica),
// cuánto en banco/transferencia (movimientos), y cuánto de lo facturado a las OS sigue
// pendiente de cobro. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('renderResumenMensual', () => {
  it('agrupa efectivo (caja chica) y banco (movimientos) por mes, solo ingresos', () => {
    app.DB.cajaChica.push(
      { id: 1, fecha: '2026-06-05', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Efectivo', monto: 100000 },
      { id: 2, fecha: '2026-06-20', consultorio: 'Haedo', tipo: 'Ingreso', origen: 'Copago', monto: 20000 },
      { id: 3, fecha: '2026-06-10', consultorio: 'Palpa', tipo: 'Egreso', monto: 50000 },  // no debe sumar a "efectivo"
    );
    app.DB.movimientos.push(
      { id: 4, fecha: '2026-06-15', tipo: 'Ingreso', monto: 60000, desc: 'Transferencia particular' },
      { id: 5, fecha: '2026-06-18', tipo: 'Egreso', monto: 15000, desc: 'Pago proveedor' },  // no debe sumar a "banco"
    );
    app.renderResumenMensual();
    const html = window.document.getElementById('fin-mensual-tbody').innerHTML;
    expect(html).toContain('Junio 2026');
    expect(html).toContain('120.000');  // efectivo: 100.000 + 20.000
    expect(html).toContain('60.000');   // banco
    expect(html).toContain('180.000');  // total cobrado: 120.000 + 60.000
  });

  it('pendiente de cobrar suma facturas Pendiente/Vencida/Preliquidada, no Pagada, agrupadas por mes de la factura', () => {
    app.DB.facturas.push(
      { id: 10, num: 'A-1', fecha: '2026-06-03', dest: 'OSDE', mes: 'Mayo 2026', monto: 200000, estado: 'Pendiente', vence: '2026-07-03' },
      { id: 11, num: 'A-2', fecha: '2026-06-10', dest: 'IOMA', mes: 'Mayo 2026', monto: 50000, estado: 'Vencida', vence: '2026-06-05' },
      { id: 12, num: 'A-3', fecha: '2026-06-12', dest: 'CoberMed', mes: 'Mayo 2026', monto: 30000, estado: 'Preliquidada', vence: '2026-07-12' },
      { id: 13, num: 'A-4', fecha: '2026-06-15', dest: 'Medifé', mes: 'Mayo 2026', monto: 999999, estado: 'Pagada', vence: '2026-07-15', fechaPago: '2026-06-20' },
    );
    app.renderResumenMensual();
    const html = window.document.getElementById('fin-mensual-tbody').innerHTML;
    expect(html).toContain('280.000');  // 200.000 + 50.000 + 30.000, sin la Pagada
    expect(html).not.toContain('999.999');
  });

  it('ordena los meses de más reciente a más antiguo', () => {
    app.DB.cajaChica.push(
      { id: 20, fecha: '2026-04-01', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Efectivo', monto: 1000 },
      { id: 21, fecha: '2026-06-01', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Efectivo', monto: 2000 },
      { id: 22, fecha: '2026-05-01', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Efectivo', monto: 3000 },
    );
    app.renderResumenMensual();
    const html = window.document.getElementById('fin-mensual-tbody').innerHTML;
    const iJunio = html.indexOf('Junio 2026');
    const iMayo = html.indexOf('Mayo 2026');
    const iAbril = html.indexOf('Abril 2026');
    expect(iJunio).toBeGreaterThan(-1);
    expect(iMayo).toBeGreaterThan(iJunio);
    expect(iAbril).toBeGreaterThan(iMayo);
  });

  it('sin movimientos, muestra el mensaje vacío', () => {
    app.renderResumenMensual();
    const html = window.document.getElementById('fin-mensual-tbody').innerHTML;
    expect(html).toContain('Sin movimientos');
  });
});

describe('renderResumenMensual: detalle de facturas pendientes por mes', () => {
  beforeEach(() => {
    app.DB.facturas.push(
      { id: 30, num: 'A-0001-00000030', fecha: '2026-06-03', dest: 'OSDE', mes: 'Mayo 2026', monto: 200000, estado: 'Pendiente', vence: '2026-07-10' },
      { id: 31, num: 'A-0001-00000031', fecha: '2026-06-10', dest: 'IOMA', mes: 'Mayo 2026', monto: 50000, estado: 'Vencida', vence: '2026-06-05' },
    );
  });

  it('la fila de detalle existe oculta y lista cada factura pendiente del mes', () => {
    app.renderResumenMensual();
    const fila = window.document.getElementById('fin-mensual-det-2026-06');
    expect(fila).toBeTruthy();
    expect(fila.style.display).toBe('none');
    expect(fila.innerHTML).toContain('A-0001-00000030');
    expect(fila.innerHTML).toContain('OSDE');
    expect(fila.innerHTML).toContain('200.000');
    expect(fila.innerHTML).toContain('A-0001-00000031');
    expect(fila.innerHTML).toContain('IOMA');
  });

  it('toggleDetallePendienteMes muestra y oculta la fila', () => {
    app.renderResumenMensual();
    app.toggleDetallePendienteMes('2026-06');
    expect(window.document.getElementById('fin-mensual-det-2026-06').style.display).toBe('');
    app.toggleDetallePendienteMes('2026-06');
    expect(window.document.getElementById('fin-mensual-det-2026-06').style.display).toBe('none');
  });

  it('sin pendiente ese mes, no genera fila de detalle', () => {
    app.DB.cajaChica.push({ id: 40, fecha: '2026-07-01', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Efectivo', monto: 1000 });
    app.renderResumenMensual();
    expect(window.document.getElementById('fin-mensual-det-2026-07')).toBeNull();
  });
});
