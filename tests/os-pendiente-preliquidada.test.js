// Auditoría F5: el monto "pendiente" por OS (tabla de Obras Sociales) debe incluir
// facturas en estado 'Preliquidada', igual que el resto de la app (stats de Obras
// Sociales, KPIs de Finanzas, Dashboard). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('renderOSTbody: el pendiente por OS incluye facturas Preliquidada', () => {
  it('una factura Preliquidada de OSDE cuenta en el monto pendiente de esa fila', () => {
    app.DB.facturas.push({
      id: 700, num: 'A-0001-00000700', fecha: '2026-06-01', dest: 'OSDE', mes: 'Junio 2026',
      concepto: 'Prestaciones Junio 2026', prestaciones: 2, netoExento: 50000, netoGravado: 0,
      ivaGravado: 0, monto: 50000, estado: 'Preliquidada', vence: '2026-07-01',
    });
    app.renderOSTbody();
    const html = window.document.getElementById('os-tbody').innerHTML;
    // La fila de OSDE debe mostrar el monto pendiente (no "✓ Al día")
    const filaOSDE = html.split('</tr>').find(fila => fila.includes('>OSDE<'));
    expect(filaOSDE).toContain('50.000');
    expect(filaOSDE).not.toContain('✓ Al día');
  });
});
