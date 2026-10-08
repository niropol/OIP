// Auditoría F3/F4: el multiplicador mostrado junto al honorario OS (mensaje de cierre,
// liquidación impresa, y columna "Honorario" del desglose por OS en el panel Admin) debe
// ser SIEMPRE la cantidad de consultas (cantConsultaHon), nunca la cantidad total de
// prestaciones OS — las cirugías no pagan honorario fijo. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
const MEDICO = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  const hoy = app.hoyISO();
  // 3 consultas OSDE (pagan honorario fijo) + 1 cirugía OSDE (NO paga honorario fijo).
  // Cantidad total de prestaciones OS = 4, pero solo 3 son consultas.
  app.DB.registros.push(
    { id: 1, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: hoy, cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
    { id: 2, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: hoy, cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
    { id: 3, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: hoy, cantidad: 1, valorUnit: 55679, exenta: true, prestacion: 'Consulta', partEfectivo: 0, partTransf: 0 },
    { id: 4, os: 'OSDE', medico: MEDICO, consultorio: 'Palpa', fecha: hoy, cantidad: 1, valorUnit: 1351970, exenta: true, prestacion: 'Catarata / facoemulsificación c/IOL', partEfectivo: 0, partTransf: 0 },
  );
});

describe('F4: _renderTabAdmin — columna Honorario del desglose por OS', () => {
  it('usa SOLO la cantidad de consultas (no las 4 prestaciones) para el honorario OSDE', () => {
    app.generarPreliq();
    const html = window.document.getElementById('preliq-tab-admin').innerHTML;
    const honorarioOS = app.DB.config.honorarioOS;
    // 3 consultas × honorarioOS, NO 4 × honorarioOS (que incluiría la cirugía)
    expect(html).toContain(`${(3 * honorarioOS).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
  });
});

describe('F3: enviarLiquidacionCierre — multiplicador del mensaje de WhatsApp', () => {
  it('muestra "3 consultas" (no "4"), consistente con el monto honOS', () => {
    let copiado = '';
    window.navigator.clipboard = { writeText: (t) => { copiado = t; return Promise.resolve(); } };
    window.showToast = () => {};
    app.enviarLiquidacionCierre(MEDICO, app.hoyISO().slice(0,7));
    expect(copiado).toContain('Total obra social: 3 consultas');
    expect(copiado).not.toContain('Total obra social: 4 consultas');
  });
});
