// Contratos OS: además de subir un archivo con valores nuevos, se puede aplicar un
// AUMENTO POR PORCENTAJE a todo el contrato de una OS (todas sus prestaciones).
// Cubre: cálculo con redondeo a 2 decimales, aplicación por id sin tocar otras OS,
// registro del aumento en DB.contratos, y que el export refleje los valores nuevos.
// Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['renderConfiguracion', 'showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.confirm = () => true;
  // Nomenclador controlado: 3 prestaciones OSDE (una con decimales) + 1 de IOMA (no debe tocarse)
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679,     valPart: 60000, nomenclador: 'OSDE', vigencia: '2026-04' },
    { id: 2, codigo: '20167',  desc: 'Catarata c/IOL',      os: 'OSDE', valOS: 1351970,   valPart: 60000, nomenclador: 'OSDE', vigencia: '2026-04' },
    { id: 3, codigo: '20661',  desc: 'Iridotomía Láser',    os: 'OSDE', valOS: 16442.33,  valPart: 60000, nomenclador: 'OSDE', vigencia: '2026-04' },
    { id: 4, codigo: '420101', desc: 'Consulta',            os: 'IOMA', valOS: 11000,     valPart: 60000, nomenclador: 'IOMA', vigencia: '2026-04' },
  ];
  app.poblarSelectoresOS();
  setInput(window, 'aumento-os-sel', 'OSDE');
  setInput(window, 'aumento-pct', 10);
  setInput(window, 'aumento-vigencia', '2026-08');
});

describe('calcularAumentoContrato: vista previa con redondeo correcto', () => {
  it('calcula valor nuevo = valor × (1 + %/100), redondeado a 2 decimales', () => {
    app.calcularAumentoContrato();
    const rows = window._aumentoPreview.rows;
    expect(rows.length).toBe(3);  // solo las de OSDE
    expect(rows.find(r => r.id === 1).valorNuevo).toBe(61246.9);     // 55679 × 1.1
    expect(rows.find(r => r.id === 2).valorNuevo).toBe(1487167);     // 1351970 × 1.1
    expect(rows.find(r => r.id === 3).valorNuevo).toBe(18086.56);    // 16442.33 × 1.1 = 18086.563 → redondea
  });

  it('la vista previa muestra valores actuales y nuevos', () => {
    app.calcularAumentoContrato();
    const html = document.getElementById('aumento-preview-tbody').innerHTML;
    expect(html).toContain('55.679');
    expect(html).toContain('61.246,90');
    expect(document.getElementById('aumento-preview-panel').style.display).toBe('');
  });

  it('sin OS, sin % o con % inválido no genera vista previa', () => {
    setInput(window, 'aumento-os-sel', '');
    app.calcularAumentoContrato();
    expect(window._aumentoPreview ?? null).toBeNull();
    setInput(window, 'aumento-os-sel', 'OSDE');
    setInput(window, 'aumento-pct', 0);
    app.calcularAumentoContrato();
    expect(window._aumentoPreview ?? null).toBeNull();
    setInput(window, 'aumento-pct', -150);
    app.calcularAumentoContrato();
    expect(window._aumentoPreview ?? null).toBeNull();
  });

  it('OS sin prestaciones cargadas no genera vista previa', () => {
    document.getElementById('aumento-os-sel').innerHTML += '<option>Sancor</option>';
    setInput(window, 'aumento-os-sel', 'Sancor');
    app.calcularAumentoContrato();
    expect(window._aumentoPreview ?? null).toBeNull();
  });
});

describe('confirmarAumentoContrato: aplica a la OS entera sin tocar las demás', () => {
  it('actualiza valOS y vigencia de TODAS las prestaciones de la OS', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    expect(app.DB.prestaciones.find(p => p.id === 1).valOS).toBe(61246.9);
    expect(app.DB.prestaciones.find(p => p.id === 2).valOS).toBe(1487167);
    expect(app.DB.prestaciones.find(p => p.id === 3).valOS).toBe(18086.56);
    expect(app.DB.prestaciones.find(p => p.id === 1).vigencia).toBe('2026-08');
  });

  it('NO toca las prestaciones de otras OS', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    const ioma = app.DB.prestaciones.find(p => p.id === 4);
    expect(ioma.valOS).toBe(11000);
    expect(ioma.vigencia).toBe('2026-04');
  });

  it('registra el aumento en DB.contratos con obs y cantidad', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    const c = app.DB.contratos.find(x => x.os === 'OSDE');
    expect(c).toBeTruthy();
    expect(c.vigencia).toBe('2026-08');
    expect(c.prestaciones).toBe(3);
    expect(c.obs).toContain('+10%');
  });

  it('si el usuario cancela la confirmación, no cambia nada', () => {
    window.confirm = () => false;
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    expect(app.DB.prestaciones.find(p => p.id === 1).valOS).toBe(55679);
    expect(app.DB.contratos.length).toBe(0);
  });

  it('valorConsultaOS (fuente única) devuelve el valor aumentado', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    expect(app.valorConsultaOS('OSDE')).toBe(61246.9);
  });

  it('acepta porcentaje negativo (ajuste a la baja) con redondeo correcto', () => {
    setInput(window, 'aumento-pct', -5);
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    expect(app.DB.prestaciones.find(p => p.id === 1).valOS).toBe(52895.05);  // 55679 × 0.95
  });
});

describe('Export: los valores aumentados salen como corresponde', () => {
  it('construirDatosExportacion refleja el valor nuevo y el contrato del aumento con su obs', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    const data = app.construirDatosExportacion();
    const prest = data['Prestaciones'].find(p => p.ID === 1);
    expect(prest['Valor OS']).toBe(61246.9);
    expect(prest.Vigencia).toBe('2026-08');
    const contrato = data['Contratos'].find(c => c.OS === 'OSDE');
    expect(contrato.Obs).toContain('+10%');
    expect(contrato.Prestaciones).toBe(3);
  });

  it('el backup JSON completo incluye los valores aumentados', () => {
    app.calcularAumentoContrato();
    app.confirmarAumentoContrato();
    let capturado = null;
    const OrigBlob = window.Blob;
    window.Blob = function (parts, opts) { capturado = parts[0]; return new OrigBlob(parts, opts); };
    window.URL.createObjectURL = () => 'blob:mock';
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = () => {};
    app.exportarBackupJSON();
    const backup = JSON.parse(capturado);
    expect(backup.DB.prestaciones.find(p => p.id === 1).valOS).toBe(61246.9);
    expect(backup.DB.contratos.some(c => (c.obs || '').includes('+10%'))).toBe(true);
  });
});
