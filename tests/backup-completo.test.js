// "Datos y respaldo" (Configuración): el backup JSON debe ser una copia fiel y completa
// de TODA la base (para poder reconstruir la app si algo se pierde), y el Excel legible
// debe incluir todas las colecciones (no solo un subconjunto). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('construirDatosExportacion (Excel legible): incluye TODAS las colecciones', () => {
  it('genera una hoja para cada colección real de DB, no solo un subconjunto', () => {
    app.DB.movimientos.push({ id: 1, fecha: '2026-06-01', desc: 'Cobro X', consultorio: 'General', tipo: 'Ingreso', monto: 1000 });
    app.DB.pagosRecibidos.push({ id: 2, facturaId: 1, num: 'A-1', os: 'OSDE', fecha: '2026-06-01', monto: 1000, medioPago: 'Transferencia', referencia: 'TRF' });
    app.DB.contratos.push({ id: 3, os: 'OSDE', vigencia: '2026-06', prestaciones: 5, estado: 'Vigente', fechaCarga: '2026-06-01' });
    app.DB.alarmas.push({ id: 4, tipo: 'Pago', titulo: 'Test', desc: '', fecha: '2026-06-01', hora: '10:00', rel: '', repeat: 'No', estado: 'activa' });

    const data = app.construirDatosExportacion();

    ['Atenciones', 'Facturas', 'Liquidaciones', 'Caja chica', 'Movimientos banco',
     'Pagos recibidos', 'Médicos', 'Derivaciones', 'Prestaciones',
     'Consultorios', 'Obras Sociales', 'Contratos', 'Alarmas', 'Config']
      .forEach(hoja => expect(data[hoja]).toBeDefined());

    expect(data['Movimientos banco'].length).toBe(1);
    expect(data['Movimientos banco'][0].Monto).toBe(1000);
    expect(data['Pagos recibidos'].length).toBe(1);
    expect(data['Contratos'].length).toBe(1);
    // DB.alarmas trae 1 alarma de bienvenida por seed (resetDatos no la toca) + la que agregamos
    expect(data['Alarmas'].length).toBe(2);
    expect(data['Obras Sociales'].length).toBe(app.DB.obrasSociales.length);
    expect(data['Config'][0]['Honorario OS']).toBe(app.DB.config.honorarioOS);
  });

  it('las filas incluyen el ID original (trazabilidad, antes se perdía)', () => {
    app.DB.registros.push({ id: 555, os: 'OSDE', medico: 'Dr. X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100, exenta: true });
    const data = app.construirDatosExportacion();
    expect(data['Atenciones'].find(r => r.ID === 555)).toBeTruthy();
  });
});

describe('exportarBackupJSON: backup fiel y completo, restaurable', () => {
  it('descarga un JSON con TODO el objeto DB (todas las colecciones, sin recortar)', () => {
    let capturado = null;
    const OrigBlob = window.Blob;
    window.Blob = function (parts, opts) { capturado = parts[0]; return new OrigBlob(parts, opts); };
    window.URL.createObjectURL = () => 'blob:mock';
    window.URL.revokeObjectURL = () => {};
    // jsdom no soporta la descarga real de un <a download>: intenta "navegar" al href
    // y loguea un error. No hay nada que descargar en un test; se anula el click.
    window.HTMLAnchorElement.prototype.click = () => {};

    app.DB.registros.push({ id: 777, os: 'OSDE', medico: 'Dr. X', fecha: '2026-06-01', cantidad: 1, valorUnit: 100, exenta: true });
    app.DB.movimientos.push({ id: 1, fecha: '2026-06-01', desc: 'x', consultorio: 'General', tipo: 'Ingreso', monto: 500 });
    app.exportarBackupJSON();

    expect(capturado).toBeTruthy();
    const backup = JSON.parse(capturado);
    expect(backup.app).toBe('OIP');
    expect(backup.DB.registros.some(r => r.id === 777)).toBe(true);
    expect(backup.DB.movimientos.some(m => m.id === 1)).toBe(true);
    // Colecciones que el Excel de antes NO incluía en absoluto
    expect(backup.DB.pagosRecibidos).toBeDefined();
    expect(backup.DB.contratos).toBeDefined();
    expect(backup.DB.obrasSociales.length).toBeGreaterThan(0);
    expect(backup.DB.alarmas).toBeDefined();
    expect(backup.DB.config.honorarioOS).toBe(app.DB.config.honorarioOS);
  });
});
