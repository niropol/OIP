// "Revisar datos cargados" (runDiagnosticoDatos): diagnóstico de salud sobre los datos
// REALES de DB (no objetos de prueba). Solo lectura — nunca modifica. Detecta problemas
// que "Verificar cálculos" no puede ver. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  window.showToast = () => {};
});

const msgs = (r) => [...r.errores, ...r.avisos].map(p => p.msg).join(' || ');

describe('runDiagnosticoDatos: base sana', () => {
  it('sin problemas cuando los datos están bien', () => {
    // resetDatos deja colecciones transaccionales vacías; el seed (medicos/prestaciones/
    // obrasSociales/consultorios) queda sano. nextId del seed es alto.
    const r = app.runDiagnosticoDatos();
    expect(r.errores.length).toBe(0);
  });
});

describe('runDiagnosticoDatos: ERRORES (rompen algo)', () => {
  it('detecta id repetido dentro de una colección (bloquea guardado en la nube)', () => {
    app.DB.registros = [
      { id: 500, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 },
      { id: 500, os: 'IOMA', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 200 },
    ];
    app.DB.nextId = 9000;
    const r = app.runDiagnosticoDatos();
    expect(r.errores.some(e => /id 500 repetido/.test(e.msg))).toBe(true);
  });

  it('detecta nextId no mayor que el id más alto usado', () => {
    app.DB.registros = [{ id: 8000, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }];
    app.DB.nextId = 2000;  // más bajo que 8000 → próxima alta colisiona
    const r = app.runDiagnosticoDatos();
    expect(r.errores.some(e => /nextId/.test(e.msg))).toBe(true);
  });
});

describe('runDiagnosticoDatos: AVISOS (revisar)', () => {
  beforeEach(() => { app.DB.nextId = 99999; });  // evitar el error de nextId en estos tests

  it('atención con médico inexistente', () => {
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'Dr. Fantasma', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /médico que ya no existe/.test(a.msg))).toBe(true);
  });

  it('atención con OS que no está en la lista', () => {
    app.DB.registros = [{ id: 1, os: 'OSInventada', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /OS que no está/.test(a.msg))).toBe(true);
  });

  it('atención con consultorio inexistente', () => {
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Marte', cantidad: 1, valorUnit: 100 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /consultorio inexistente/.test(a.msg))).toBe(true);
  });

  // Cada aviso tiene que decir QUÉ dato está mal, no solo cuántos, para poder corregirlo.
  it('el aviso de OS inválida NOMBRA la OS', () => {
    app.DB.registros = [{ id: 1, fecha: '2026-06-01', os: 'OSInventada', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100 }];
    const msg = app.runDiagnosticoDatos().avisos.find(a => /OS que no está/.test(a.msg)).msg;
    expect(msg).toContain('OSInventada');
  });

  it('el aviso de consultorio inválido NOMBRA el consultorio', () => {
    app.DB.registros = [{ id: 1, fecha: '2026-06-01', os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Marte', cantidad: 1, valorUnit: 100 }];
    const msg = app.runDiagnosticoDatos().avisos.find(a => /consultorio inexistente/.test(a.msg)).msg;
    expect(msg).toContain('Marte');
  });

  it('el aviso de registro vacío IDENTIFICA fecha · médico · OS', () => {
    app.DB.registros = [{ id: 1, fecha: '2026-06-05', os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 0, valorUnit: 0 }];
    const msg = app.runDiagnosticoDatos().avisos.find(a => /registro vacío/.test(a.msg)).msg;
    expect(msg).toContain('2026-06-05');
    expect(msg).toContain('Polisky');
    expect(msg).toContain('OSDE');
  });

  it('el aviso de pago huérfano IDENTIFICA el pago y la factura que falta', () => {
    app.DB.pagosRecibidos = [{ id: 1, num: 'B-9', os: 'IOMA', monto: 12345, facturaId: 777 }];
    const msg = app.runDiagnosticoDatos().avisos.find(a => /factura inexistente/.test(a.msg)).msg;
    expect(msg).toContain('B-9');
    expect(msg).toContain('IOMA');
    expect(msg).toContain('777');
  });

  it('factura cuyo monto no cierra con su desglose', () => {
    app.DB.facturas = [{ id: 1, num: 'A-1', dest: 'OSDE', mes: 'Junio 2026', estado: 'Pendiente',
      netoExento: 50000, netoGravado: 0, ivaGravado: 0, monto: 99999 }];  // 50000 ≠ 99999
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /no cierra con su desglose/.test(a.msg))).toBe(true);
  });

  it('el aviso identifica CUÁL factura es y da los números para corregirla', () => {
    app.DB.facturas = [{ id: 1, num: 'A-1', dest: 'OSDE', mes: 'Junio 2026', estado: 'Pendiente',
      netoExento: 50000, netoGravado: 0, ivaGravado: 0, monto: 99999 }];
    const msg = app.runDiagnosticoDatos().avisos.find(a => /no cierra con su desglose/.test(a.msg)).msg;
    expect(msg).toContain('A-1');           // número de factura
    expect(msg).toContain('OSDE');          // a quién
    expect(msg).toContain('Junio 2026');    // período
    expect(msg).toMatch(/99\.999/);         // monto guardado
    expect(msg).toMatch(/50\.000/);         // lo que suma el desglose
    expect(msg).toMatch(/49\.999/);         // la diferencia
  });

  it('FALSO POSITIVO corregido: factura vieja con copago (desglose bruto) NO se marca', () => {
    // Formato viejo: desglose BRUTO (100.000 + 10.500 IVA) y monto = bruto − copago 22.100.
    app.DB.facturas = [{ id: 1, num: 'A-2', dest: 'CoberMed', mes: 'Junio 2026', estado: 'Pendiente',
      netoExento: 0, netoGravado: 100000, ivaGravado: 10500, copagoAdelanto: 22100, monto: 88400 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /no cierra con su desglose/.test(a.msg))).toBe(false);
  });

  it('factura nueva con desglose NETO de copago tampoco se marca', () => {
    app.DB.facturas = [{ id: 1, num: 'A-3', dest: 'CoberMed', mes: 'Junio 2026', estado: 'Pendiente',
      netoExento: 0, netoGravado: 80000, ivaGravado: 8400, copagoAdelanto: 22100, monto: 88400 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /no cierra con su desglose/.test(a.msg))).toBe(false);
  });

  it('factura con el monto ajustado a mano NO se marca (la diferencia es deliberada)', () => {
    app.DB.facturas = [{ id: 1, num: 'A-4', dest: 'OSDE', mes: 'Junio 2026', estado: 'Pendiente',
      netoExento: 50000, netoGravado: 0, ivaGravado: 0, monto: 48000, montoAjustado: true }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /no cierra con su desglose/.test(a.msg))).toBe(false);
  });

  it('pago recibido apuntando a una factura inexistente', () => {
    app.DB.pagosRecibidos = [{ id: 1, facturaId: 777, monto: 1000 }];  // no hay factura 777
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /factura inexistente/.test(a.msg))).toBe(true);
  });

  it('liquidación de un médico inexistente', () => {
    app.DB.liquidaciones = [{ id: 1, mes: '2026-06', medico: 'Dr. Fantasma', estado: 'Cerrada' }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /liquidación.*médico que ya no existe/.test(a.msg))).toBe(true);
  });

  it('caja chica en negativo', () => {
    app.DB.cajaChica = [{ id: 1, fecha: '2026-06-01', consultorio: 'Palpa', tipo: 'Egreso', monto: 50000 }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /Caja chica de Palpa en negativo/.test(a.msg))).toBe(true);
  });

  it('prestación con categoría inválida', () => {
    app.DB.prestaciones = [{ id: 1, codigo: 'X', desc: 'Algo', os: 'OSDE', valOS: 100, categoria: 'inventada' }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /categoría inválida/.test(a.msg))).toBe(true);
  });

  it('prestaciones con el mismo código repetido en una OS', () => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 },
      { id: 2, codigo: '420114', desc: 'Consulta (dup)', os: 'OSDE', valOS: 55000 },  // mismo código+OS
      { id: 3, codigo: '420114', desc: 'Consulta', os: 'IOMA', valOS: 30000 },          // otra OS: OK
    ];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /código.*repetido/.test(a.msg))).toBe(true);
  });

  it('atención con exención inválida (ni true ni false)', () => {
    app.DB.registros = [{ id: 1, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100, fecha: '2026-06-01', exenta: 'si' }];
    const r = app.runDiagnosticoDatos();
    expect(r.avisos.some(a => /exención inválido/.test(a.msg))).toBe(true);
  });
});

describe('runDiagnosticoDatos: consistencia de la presentación a la OS', () => {
  beforeEach(() => { app.DB.nextId = 99999; });

  it('base sana: la suma por código cuadra con totalesOS (sin error)', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 }];
    app.DB.registros = [
      { id: 1, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 2, valorUnit: 50000, prestacion: 'Consulta', fecha: '2026-06-03', exenta: false },
      { id: 2, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 55000, prestacion: 'Consulta', fecha: '2026-06-10', exenta: false },
    ];
    const r = app.runDiagnosticoDatos();
    expect(r.errores.some(e => /suma por código no cuadra/.test(e.msg))).toBe(false);
  });
});

describe('runDiagnosticoDatos: es SOLO LECTURA', () => {
  it('no modifica ninguna colección', () => {
    app.DB.registros = [{ id: 500, os: 'OSDE', medico: 'Dr. Fantasma', consultorio: 'Marte', cantidad: 1, valorUnit: 100 }];
    app.DB.facturas = [{ id: 1, estado: 'Pendiente', netoExento: 1, monto: 999 }];
    const snapRegs = JSON.stringify(app.DB.registros);
    const snapFact = JSON.stringify(app.DB.facturas);
    app.runDiagnosticoDatos();
    expect(JSON.stringify(app.DB.registros)).toBe(snapRegs);
    expect(JSON.stringify(app.DB.facturas)).toBe(snapFact);
  });
});
