// El alta/edición de OS captura la forma del coseguro (adelanto/complementario) y la
// condición de IVA (exenta / 10,5% / 21%). Las funciones esCopagoAdelanto / getExentaForOS /
// pctIVAForOS leen esos campos de la ficha, con FALLBACK al comportamiento histórico para
// las OS que todavía no los tienen. Así una OS nueva se configura sin tocar código.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['renderOS', 'showToast', 'closeModal', 'renderConfiguracion', 'poblarSelectoresOS']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

describe('Config de facturación por OS (data-driven, con fallback)', () => {
  it('fallback histórico: OS sin config se comportan como antes', () => {
    expect(app.esCopagoAdelanto('Bristol')).toBe(true);    // estaba en el Set histórico
    expect(app.esCopagoAdelanto('OSDE')).toBe(false);
    expect(app.getExentaForOS('OSDE')).toBe(true);         // exenta por default
    expect(app.getExentaForOS('CoberMed')).toBe(false);    // gravada por default
    expect(app.pctIVAForOS('OSDE')).toBeCloseTo(0.105);
    expect(app.pctIVAForOS('CEMEPLA')).toBeCloseTo(0.21);
  });

  it('alta de OS nueva: copago a cuenta + gravada 21% queda configurado', async () => {
    setInput(window, 'os-edit-id', '');
    setInput(window, 'os-nombre', 'NuevaOS Test');
    setInput(window, 'os-copago-modo', 'adelanto');
    setInput(window, 'os-iva-cond', '21');
    await app.guardarOS();

    const os = app.DB.obrasSociales.find(o => o.nombre === 'NuevaOS Test');
    expect(os).toBeTruthy();
    expect(os.copagoModo).toBe('adelanto');
    expect(os.exentaDefault).toBe(false);
    expect(os.alicuota).toBe(21);
    // Las funciones de negocio respetan la ficha
    expect(app.esCopagoAdelanto('NuevaOS Test')).toBe(true);
    expect(app.getExentaForOS('NuevaOS Test')).toBe(false);
    expect(app.pctIVAForOS('NuevaOS Test')).toBeCloseTo(0.21);
    // Y el IVA de un registro de esa OS usa 21%
    expect(app.ivaReg({ os:'NuevaOS Test', cantidad:1, valorUnit:100000, exenta:false })).toBeCloseTo(21000);
  });

  it('editar una OS gravada y pasarla a exenta la vuelve exenta', async () => {
    const cm = app.DB.obrasSociales.find(o => o.nombre === 'CoberMed');
    setInput(window, 'os-edit-id', String(cm.id));
    setInput(window, 'os-nombre', 'CoberMed');
    setInput(window, 'os-codigo', cm.codigo || '');
    setInput(window, 'os-copago-modo', 'complementario');
    setInput(window, 'os-iva-cond', 'exenta');
    await app.guardarOS();

    expect(cm.exentaDefault).toBe(true);
    expect(cm.alicuota).toBeUndefined();               // exenta ⇒ sin alícuota
    expect(app.getExentaForOS('CoberMed')).toBe(true);
    expect(app.esCopagoAdelanto('CoberMed')).toBe(false);
    expect(app.ivaReg({ os:'CoberMed', cantidad:1, valorUnit:100000 })).toBe(0);   // ahora exenta
  });
});

describe('Coseguro a cuenta hereda el IVA de la prestación (desglose de factura)', () => {
  it('gravada: el copago se descompone en neto + IVA y netea cada bucket', () => {
    // CoberMed (adelanto + gravada 10.5%). Copago 22.100 = 20.000 neto + 2.100 IVA.
    const t = app.totalesOS([{ os:'CoberMed', cantidad:1, valorUnit:100000, copago:22100, copagoTipo:'adelanto' }], 'CoberMed');
    expect(t.netoGravadoAFacturar).toBeCloseTo(80000, 2);
    expect(t.ivaAFacturar).toBeCloseTo(8400, 2);
    expect(t.aFacturar).toBeCloseTo(88400, 2);
    // Invariante clave: NO cambia cuánto paga la OS (sólo el reparto por IVA)
    expect(t.aFacturar).toBeCloseTo(t.total - t.copagoAdelanto, 6);
    expect(t.netoExentoAFacturar + t.netoGravadoAFacturar + t.ivaAFacturar).toBeCloseTo(t.aFacturar, 6);
  });

  it('exenta: el copago descuenta neto puro, sin IVA', () => {
    const t = app.totalesOS([{ os:'Bristol', cantidad:1, valorUnit:100000, exenta:true, copago:15000, copagoTipo:'adelanto' }], 'Bristol');
    expect(t.netoExentoAFacturar).toBeCloseTo(85000, 2);
    expect(t.ivaAFacturar).toBeCloseTo(0, 6);
    expect(t.aFacturar).toBeCloseTo(85000, 2);
  });

  it('sin copago: el desglose neto == bruto (no cambia nada)', () => {
    const t = app.totalesOS([{ os:'OSDE', cantidad:1, valorUnit:100000, exenta:false }], 'OSDE');
    expect(t.netoGravadoAFacturar).toBeCloseTo(t.netoGravado, 6);
    expect(t.ivaAFacturar).toBeCloseTo(t.iva, 6);
  });
});

describe('Consistencia de la alícuota data-driven (OS al 21% no-CEMEPLA)', () => {
  it('las filas por código usan la alícuota de la ficha y cuadran con el resumen', () => {
    // Bug detectado en auditoría: filasPresentacionOS tenía la alícuota hardcodeada (10,5%)
    // y no se enteraba de una OS configurada al 21% → las filas no cuadraban con totalesOS.
    app.DB.obrasSociales.push({ id:7777, nombre:'MutualTest', estado:'Activa', copagoModo:'complementario', exentaDefault:false, alicuota:21 });
    const regs = [{ os:'MutualTest', cantidad:1, valorUnit:100000, exenta:false, prestacion:'Consulta', fecha:'2026-06-01' }];
    expect(app.pctIVAForOS('MutualTest')).toBeCloseTo(0.21);
    expect(app.ivaReg(regs[0])).toBeCloseTo(21000);
    const t = app.totalesOS(regs, 'MutualTest');
    expect(t.iva).toBeCloseTo(21000);
    const ivaFilas = app.filasPresentacionOS(regs, 'MutualTest').reduce((s,f)=>s+f.iva, 0);
    expect(ivaFilas).toBeCloseTo(t.iva, 6);   // filas y resumen coinciden
  });
});

describe('Renombrar una OS propaga el nombre a los datos históricos', () => {
  it('el nombre nuevo llega a registros / prestaciones / pagos, no solo a facturas', async () => {
    app.DB.registros.push({ id:8001, os:'Bristol', cantidad:1, valorUnit:1000, fecha:'2026-06-01' });
    app.DB.prestaciones.push({ id:8002, os:'Bristol', desc:'X', codigo:'123', valOS:1000 });
    app.DB.pagosRecibidos = app.DB.pagosRecibidos || [];
    app.DB.pagosRecibidos.push({ id:8003, os:'Bristol', monto:500 });
    const bristol = app.DB.obrasSociales.find(o => o.nombre === 'Bristol');

    setInput(window, 'os-edit-id', String(bristol.id));
    setInput(window, 'os-nombre', 'Bristol SA');
    setInput(window, 'os-copago-modo', 'adelanto');
    setInput(window, 'os-iva-cond', 'exenta');
    await app.guardarOS();

    expect(app.DB.registros.find(r => r.id === 8001).os).toBe('Bristol SA');
    expect(app.DB.prestaciones.find(p => p.id === 8002).os).toBe('Bristol SA');
    expect(app.DB.pagosRecibidos.find(p => p.id === 8003).os).toBe('Bristol SA');
  });
});
