// Auditoría F1/F2: Caja chica (Finanzas), KPIs de Finanzas, Dashboard y Estadísticas
// deben agregar por TODOS los consultorios activos (getConsultoriosList()), no solo
// Palpa/Haedo/Extra hardcodeados. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  app.DB.consultorios.push({ id: 9001, nombre: 'Sucursal Test', estado: 'Activa' });
});

describe('renderCajaChica: cubre TODOS los consultorios activos', () => {
  it('genera una tarjeta y un tbody para un consultorio custom, no solo Palpa/Haedo', () => {
    app.DB.cajaChica.push({ id: 1, fecha: '2026-06-01', consultorio: 'Sucursal Test', tipo: 'Ingreso', origen: 'Manual', monto: 5000, concepto: 'x' });
    app.renderCajaChica();
    const tbody = window.document.getElementById('cajachica-tbody-Sucursal_Test');
    expect(tbody).toBeTruthy();
    expect(tbody.innerHTML).toContain('5.000');
  });

  it('el saldo del consultorio custom aparece en cajachica-stats', () => {
    app.DB.cajaChica.push({ id: 2, fecha: '2026-06-01', consultorio: 'Sucursal Test', tipo: 'Ingreso', origen: 'Manual', monto: 7000, concepto: 'x' });
    app.renderCajaChica();
    const stats = window.document.getElementById('cajachica-stats').innerHTML;
    expect(stats).toContain('Sucursal Test');
    expect(stats).toContain('7.000');
  });

  it('un movimiento en un consultorio custom activo NO aparece como huérfano', () => {
    app.DB.cajaChica.push({ id: 3, fecha: '2026-06-01', consultorio: 'Sucursal Test', tipo: 'Ingreso', origen: 'Manual', monto: 1000, concepto: 'x' });
    app.renderCajaChica();
    const aviso = window.document.getElementById('cajachica-huerfanos');
    expect(aviso.innerHTML).toBe('');
  });

  it('un movimiento con consultorio inválido/inactivo se marca huérfano con botón para CADA consultorio activo', () => {
    app.DB.cajaChica.push({ id: 4, fecha: '2026-06-01', consultorio: 'Sede Borrada', tipo: 'Ingreso', origen: 'Manual', monto: 1000, concepto: 'x' });
    app.renderCajaChica();
    const aviso = window.document.getElementById('cajachica-huerfanos').innerHTML;
    expect(aviso).toContain('Sede Borrada');
    ['Palpa', 'Haedo', 'Extra', 'Sucursal Test'].forEach(c => {
      expect(aviso).toContain(`asignarConsultorioCaja(4,'${c}')`);
    });
  });
});

describe('renderFinanzas: KPI de caja chica suma TODOS los consultorios activos', () => {
  it('fin-caja-total incluye el saldo de un consultorio custom', () => {
    app.DB.cajaChica.push({ id: 5, fecha: '2026-06-01', consultorio: 'Palpa', tipo: 'Ingreso', origen: 'Manual', monto: 1000, concepto: 'x' });
    app.DB.cajaChica.push({ id: 6, fecha: '2026-06-01', consultorio: 'Sucursal Test', tipo: 'Ingreso', origen: 'Manual', monto: 2000, concepto: 'x' });
    app.renderFinanzas();
    expect(window.document.getElementById('fin-caja-total').textContent).toContain('3.000');
    expect(window.document.getElementById('fin-caja-sub').textContent).toContain('Sucursal Test');
  });

  it('caja-saldo-efectivo (tab Caja) incluye el saldo de un consultorio custom', () => {
    app.DB.cajaChica.push({ id: 7, fecha: '2026-06-01', consultorio: 'Sucursal Test', tipo: 'Ingreso', origen: 'Manual', monto: 4000, concepto: 'x' });
    app.renderFinanzas();
    expect(window.document.getElementById('caja-saldo-efectivo').textContent).toContain('4.000');
  });
});

describe('initDashboard: consultas de hoy/mes suman TODOS los consultorios activos', () => {
  it('un registro en un consultorio custom cuenta en el total de hoy', () => {
    const hoy = app.hoyISO();
    app.DB.registros.push({ id: 10, fecha: hoy, medico: 'Dr. X', consultorio: 'Sucursal Test', os: 'OSDE', cantidad: 1, valorUnit: 100, tipoPrestacion: 'consulta', partEfectivo: 0, partTransf: 0 });
    app.initDashboard();
    const kpis = window.document.getElementById('dash-kpis').innerHTML;
    expect(kpis).toContain('Sucursal Test');
    expect(kpis).toMatch(/Consultas hoy[\s\S]*?>1</);
  });
});

describe('renderEstadisticas: el gráfico de consultorio incluye consultorios custom', () => {
  it('un registro en un consultorio custom aparece en est-consultorio-chart', () => {
    app.DB.registros.push({ id: 11, fecha: app.hoyISO(), medico: 'Dr. X', consultorio: 'Sucursal Test', os: 'OSDE', cantidad: 1, valorUnit: 100, tipoPrestacion: 'consulta', partEfectivo: 0, partTransf: 0 });
    app.renderEstadisticas();
    const chart = window.document.getElementById('est-consultorio-chart').innerHTML;
    expect(chart).toContain('Sucursal Test');
  });
});
