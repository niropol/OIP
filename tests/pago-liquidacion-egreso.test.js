// El pago de la liquidación mensual a un médico (confirmarPagoEnviado) no generaba
// ningún egreso en Caja/Banco — el saldo de banco quedaba de más porque no descontaba
// lo pagado a médicos. Se registra como egreso (siempre por transferencia, a pedido del
// usuario) al confirmar el pago, y el Resumen mensual de Finanzas ahora también muestra
// egresos y neto del mes. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
const MEDICO = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['generarPreliq', 'showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

function prepararLiquidacionLista(mes) {
  app.DB.registros.push(
    { id: 1, os: 'OSDE', medico: MEDICO, fecha: `${mes}-05`, cantidad: 2, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
  );
  app.cerrarMesMedico(MEDICO, mes);
  app.marcarFacturaRecibida(MEDICO, mes);
}

describe('confirmarPagoEnviado: registra el pago como egreso de banco', () => {
  it('crea un movimiento Egreso por el monto de aLiquidar', () => {
    prepararLiquidacionLista('2026-06');
    const honorarioOS = app.DB.config.honorarioOS;
    const esperado = 2 * honorarioOS;  // 2 consultas OS, sin particulares/sin cargo/derivaciones

    app.confirmarPagoEnviado(MEDICO, '2026-06');

    const mov = app.DB.movimientos.find(m => m.origen === 'Honorario' && m.desc.includes('Polisky'));
    expect(mov).toBeTruthy();
    expect(mov.tipo).toBe('Egreso');
    expect(mov.monto).toBe(esperado);
    expect(mov.consultorio).toBe('General');
  });

  it('marca la liquidación como pagada (comportamiento previo, sin romper)', () => {
    prepararLiquidacionLista('2026-06');
    app.confirmarPagoEnviado(MEDICO, '2026-06');
    const liq = app.getLiquidacion('2026-06', MEDICO);
    expect(liq.pagoEnviado).toBe(true);
    expect(liq.fechaPago).toBeTruthy();
  });

  it('sin nada a liquidar (aLiquidar = 0), no crea egreso', () => {
    // Cierra un mes sin registros: aLiquidar = 0
    app.cerrarMesMedico(MEDICO, '2026-06');
    app.marcarFacturaRecibida(MEDICO, '2026-06');
    app.confirmarPagoEnviado(MEDICO, '2026-06');
    expect(app.DB.movimientos.some(m => m.origen === 'Honorario')).toBe(false);
  });

  it('liquidaciones históricas ya marcadas pagoEnviado=true (antes de este cambio) no generan egreso retroactivo', () => {
    // Simula el estado histórico: pagoEnviado ya en true, sin pasar por confirmarPagoEnviado.
    app.DB.liquidaciones.push({ id: 999, mes: '2026-05', medico: MEDICO, estado: 'Cerrada', pagoEnviado: true, fechaPago: '2026-05-10', facturaRecibida: true });
    app.renderResumenMensual && app.renderResumenMensual();
    expect(app.DB.movimientos.length).toBe(0);
  });
});

describe('renderResumenMensual: refleja egresos (incluye pagos a médicos) y el neto del mes', () => {
  it('el egreso de la liquidación aparece en la columna Egresos y descuenta del Neto', () => {
    // confirmarPagoEnviado fecha el egreso con HOY (día real del pago, no el período
    // facturado — un médico de junio puede cobrarse recién en julio). Se compara contra
    // un ingreso fechado el mismo día para verificar que ambos caen en la misma fila.
    prepararLiquidacionLista('2026-06');
    const hoy = app.hoyISO();
    app.DB.movimientos.push({ id: 500, fecha: hoy, tipo: 'Ingreso', monto: 300000, desc: 'Cobro OS' });
    // 2 consultas OSDE × honorarioOS (10.500 por defecto) = 21.000
    const pagoLiq = 2 * app.DB.config.honorarioOS;
    expect(pagoLiq).toBe(21000);

    app.confirmarPagoEnviado(MEDICO, '2026-06');
    app.renderResumenMensual();

    const filaMesPago = window.document.getElementById('fin-mensual-tbody').innerHTML;
    expect(filaMesPago).toContain('300.000');   // banco (ingreso)
    expect(filaMesPago).toContain('21.000');    // egresos (pago de la liquidación)
    expect(filaMesPago).toContain('279.000');   // neto: 300.000 - 21.000
  });
});
