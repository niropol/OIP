// Auditoría D3: confirmarCobro() NO sincroniza f.monto si el monto cobrado difiere del
// facturado (decisión del usuario: dejar la factura como estaba, pero avisar la diferencia
// en Historial de pagos). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  app.DB.facturas.push({
    id: 500, num: 'A-0001-00000500', fecha: '2026-06-01', dest: 'OSDE', mes: 'Junio 2026',
    concepto: 'Prestaciones Junio 2026', prestaciones: 3, netoExento: 100000, netoGravado: 0,
    ivaGravado: 0, monto: 100000, estado: 'Pendiente', vence: '2026-07-01',
  });
});

function confirmar(monto) {
  setInput(window, 'cobro-factura-id', 500);
  setInput(window, 'cobro-monto', monto);
  setInput(window, 'cobro-fecha', '2026-06-15');
  window.document.getElementById('cobro-medio').value = 'Transferencia';
  setInput(window, 'cobro-ref', 'TRF-1');
  setInput(window, 'cobro-obs', '');
  app.confirmarCobro();
}

describe('confirmarCobro: no pisa el monto facturado cuando difiere del cobrado', () => {
  it('cobro igual al facturado: factura y pago quedan con el mismo monto, sin aviso', () => {
    confirmar(100000);
    const f = app.DB.facturas.find(x => x.id === 500);
    expect(f.monto).toBe(100000);
    app.renderHistorialPagos();
    const html = window.document.getElementById('historial-pagos-tbody').innerHTML;
    expect(html).not.toContain('⚠');
  });

  it('cobro parcial: f.monto NO se toca (sigue siendo lo facturado)', () => {
    confirmar(95000);
    const f = app.DB.facturas.find(x => x.id === 500);
    expect(f.monto).toBe(100000);
    const pago = app.DB.pagosRecibidos.find(p => p.facturaId === 500);
    expect(pago.monto).toBe(95000);
  });

  it('cobro con diferencia: Historial de pagos muestra la señal de diferencia con ambos montos', () => {
    confirmar(95000);
    app.renderHistorialPagos();
    const html = window.document.getElementById('historial-pagos-tbody').innerHTML;
    expect(html).toContain('⚠');
    expect(html).toContain('Cobrado');
  });

  it('ANTI DOBLE-COBRO: confirmar dos veces NO duplica el pago ni el ingreso en Caja', () => {
    window.__stubbedToast = window.showToast; window.showToast = () => {};
    confirmar(100000);   // primer cobro
    confirmar(100000);   // segundo (doble click) → debe rechazarse
    expect(app.DB.pagosRecibidos.filter(p => p.facturaId === 500).length).toBe(1);
    expect(app.DB.movimientos.filter(m => m.facturaId === 500).length).toBe(1);
  });
});
