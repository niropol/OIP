// Auditoría D1: renderOSCards, renderOSDetalle, copiarDetalleOSMail (js/ui-finanzas.js) y
// generarPreliqOS (js/ui-os-crud.js) recalculaban neto/IVA/copago cada uno por su cuenta en
// vez de usar totalesOS() (fuente única, js/calculos.js). Ahora los 4 llaman a totalesOS().
// Caso de prueba clave: un registro con `exenta` SIN DEFINIR (nunca se seteó el flag) en una
// OS exenta por default (IOMA). El código viejo de renderOSCards usaba `if (r.exenta)`
// (truthy) y lo trataba como GRAVADO por error; totalesOS() usa el fallback correcto
// (getExentaForOS) y lo trata como EXENTO. Si esto pasa, la unificación está bien cableada.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
const HOY = '2026-06-15';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  // IOMA es exenta por default (no está en OS_GRAVADAS_SIEMPRE); `exenta` queda sin definir.
  app.DB.registros.push({
    id: 1, fecha: HOY, medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
    os: 'IOMA', prestacion: 'Consulta', cantidad: 1, valorUnit: 11000,
    partEfectivo: 0, partTransf: 0,
  });
});

describe('renderOSCards: usa totalesOS(), no "if (r.exenta)" (que trataba undefined como gravado)', () => {
  it('un registro con exenta sin definir en IOMA se cuenta como exento', () => {
    setInput(window, 'os-fact-mes', '2026-06');
    app.renderOSCards();
    const html = window.document.getElementById('os-cards-grid').innerHTML;
    expect(html).toContain('✓ Exento');
    expect(html).toContain('11.000');
    expect(html).not.toContain('⚡ Gravado');
  });
});

describe('renderOSDetalle: totales salen de totalesOS(), coinciden con el registro cargado', () => {
  it('muestra Neto exento correcto para IOMA', () => {
    app.renderOSDetalle('IOMA', '2026-06');
    const html = window.document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('Neto exento');
    expect(html).toContain('11.000');
  });
});

describe('copiarDetalleOSMail: el texto copiado usa los mismos totales', () => {
  it('el texto plano copiado incluye "Neto exento: $11.000,00"', async () => {
    let copiado = '';
    window.navigator.clipboard = { writeText: (t) => { copiado = t; return Promise.resolve(); } };
    window.showToast = () => {};
    app.copiarDetalleOSMail('IOMA', '2026-06');
    await new Promise(r => setTimeout(r, 0));
    expect(copiado).toContain('Neto exento: $11.000,00');
  });
});

describe('generarPreliqOS: el panel de preliquidación por OS usa totalesOS()', () => {
  it('muestra Neto exento correcto y TOTAL = aFacturar', () => {
    setInput(window, 'preliq-mes', '2026-06');
    window.document.getElementById('preliq-os-select').value = '';
    app.generarPreliqOS();
    const html = window.document.getElementById('preliq-os-resultado').innerHTML;
    expect(html).toContain('Neto exento');
    expect(html).toContain('11.000');
  });
});
