// Auditoría "una madre que distribuye los datos": se encontraron varios lugares que
// reimplementaban a mano fórmulas que ya existían como fuente única en calculos.js, y
// dos de esas reimplementaciones habían quedado desactualizadas (bugs reales, no solo
// duplicación). Este archivo cubre los arreglos a nivel de calculos.js. Contra el
// código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('exentaReg / ivaReg / totalesOS: CEMEPLA siempre gravada al 21%, ignora r.exenta', () => {
  it('exentaReg(r, "CEMEPLA") devuelve false aunque r.exenta sea true', () => {
    expect(app.exentaReg({ exenta: true }, 'CEMEPLA')).toBe(false);
    expect(app.exentaReg({ exenta: false }, 'CEMEPLA')).toBe(false);
    expect(app.exentaReg({}, 'CEMEPLA')).toBe(false);
  });

  it('para otras OS, exentaReg respeta r.exenta si está definido, si no usa el default de la OS', () => {
    expect(app.exentaReg({ exenta: true }, 'OSDE')).toBe(true);
    expect(app.exentaReg({ exenta: false }, 'OSDE')).toBe(false);
    expect(app.exentaReg({}, 'OSDE')).toBe(app.getExentaForOS('OSDE'));
    expect(app.exentaReg({}, 'CoberMed')).toBe(app.getExentaForOS('CoberMed'));
  });

  it('totalesOS ahora da el MISMO iva que ivaReg para un registro CEMEPLA con exenta=true a mano (antes divergían)', () => {
    const r = { os: 'CEMEPLA', cantidad: 1, valorUnit: 50000, exenta: true };
    const ivaIndividual = app.ivaReg(r);          // ya daba 21% (CEMEPLA manda sobre exenta)
    const t = app.totalesOS([r], 'CEMEPLA');       // antes daba 0 (respetaba exenta=true)
    expect(ivaIndividual).toBe(10500);             // 50000 * 0.21
    expect(t.iva).toBe(ivaIndividual);
    expect(t.netoExento).toBe(0);
    expect(t.netoGravado).toBe(50000);
  });

  it('sin exenta manual, CEMEPLA sigue dando el mismo resultado que antes (no cambia el caso normal)', () => {
    const r = { os: 'CEMEPLA', cantidad: 2, valorUnit: 20000 };
    const t = app.totalesOS([r], 'CEMEPLA');
    expect(t.netoGravado).toBe(40000);
    expect(t.iva).toBe(8400);
    expect(t.netoExento).toBe(0);
  });
});

describe('facturaPendiente / ESTADOS_FACTURA_PENDIENTE: fuente única de "pendiente de cobro"', () => {
  it('incluye Pendiente, Vencida y Preliquidada; excluye Pagada', () => {
    expect(app.facturaPendiente({ estado: 'Pendiente' })).toBe(true);
    expect(app.facturaPendiente({ estado: 'Vencida' })).toBe(true);
    expect(app.facturaPendiente({ estado: 'Preliquidada' })).toBe(true);
    expect(app.facturaPendiente({ estado: 'Pagada' })).toBe(false);
  });

  it('renderFinanzas: "Cobros pendientes" ahora incluye facturas Preliquidada (antes las excluía)', () => {
    app.DB.facturas.push({
      id: 1, num: 'A-1', fecha: '2026-06-01', dest: 'OSDE', mes: 'Junio 2026',
      monto: 150000, estado: 'Preliquidada', vence: '2026-07-01',
    });
    app.renderFinanzas();
    expect(window.document.getElementById('fin-cobros-pend').textContent).toContain('150.000');
  });

  it('Dashboard: "Cobros pendientes" ahora incluye facturas Vencida (antes las excluía)', () => {
    app.DB.facturas.push({
      id: 2, num: 'A-2', fecha: '2026-05-01', dest: 'IOMA', mes: 'Mayo 2026',
      monto: 90000, estado: 'Vencida', vence: '2026-06-01',
    });
    app.initDashboard();
    const kpis = window.document.getElementById('dash-kpis').innerHTML;
    expect(kpis).toContain('90.000');
  });
});
