// Las 4 mejoras de "permitir editar / arreglar cosas cerradas":
//   1) Selector de mes de OS/Pagos: refresca las cards al cambiar el mes y NUNCA
//      genera una opción basura tipo "undefined NaN" a partir de datos malformados.
//   2) Alarmas: se puede editar una alarma ya configurada (conserva id y estado).
//   3) Preliquidación de médico ya CERRADA y PAGADA: se puede reabrir para corregir
//      un error de carga, revirtiendo el egreso de Caja del pago.
//   4) Cajas: se puede editar y eliminar un movimiento de banco.
// Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  app.DB.alarmas = [];
  ['showToast', 'closeModal', 'initDashboard', 'updateAlarmBadge'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
});

// ── 1) Selector de mes de OS/Pagos ───────────────────────────────────────────
describe('Selector de mes OS/Pagos', () => {
  it('no genera opciones malformadas ("undefined"/"NaN") aunque haya datos con mes basura', () => {
    // Una factura con mes NO YYYY-MM (ya viene como label) + una liquidación con mes undefined.
    app.DB.facturas = [{ id: 1, dest: 'OSDE', mes: 'Junio 2026', monto: 1000, estado: 'Pendiente' }];
    app.DB.liquidaciones = [{ id: 2, mes: undefined, medico: 'X', estado: 'Cerrada' }];
    app.DB.registros = [{ id: 3, fecha: '2026-06-10', os: 'OSDE', medico: 'X', cantidad: 1 }];
    app.poblarSelectoresMes();
    const sel = document.getElementById('os-fact-mes');
    const values = [...sel.options].map(o => o.value);
    const labels = [...sel.options].map(o => o.textContent);
    // Todas las opciones son YYYY-MM válidas
    values.forEach(v => expect(v).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/));
    // Ningún label contiene "undefined" ni "NaN"
    labels.forEach(l => {
      expect(l.toLowerCase()).not.toContain('undefined');
      expect(l).not.toContain('NaN');
    });
  });

  it('onOSMesChange redibuja las cards del mes elegido y cierra el panel de detalle', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 }];
    app.DB.registros = [
      { id: 10, fecha: '2026-06-10', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000 },
      { id: 11, fecha: '2026-07-10', os: 'IOMA', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 30000 },
    ];
    app.poblarSelectoresMes();
    // Dejar el panel de detalle "abierto" para verificar que se cierra
    const panel = document.getElementById('os-detalle-panel');
    panel.style.display = 'block'; panel.dataset.os = 'OSDE';

    setInput(window, 'os-fact-mes', '2026-07');
    app.onOSMesChange();

    const grid = document.getElementById('os-cards-grid').innerHTML;
    expect(grid).toContain('IOMA');       // OS del mes elegido
    expect(grid).not.toContain('OSDE');   // la del mes viejo ya no
    expect(panel.style.display).toBe('none');
    expect(panel.dataset.os).toBe('');
  });
});

// ── 2) Editar alarma ─────────────────────────────────────────────────────────
describe('Editar alarma configurada', () => {
  beforeEach(() => {
    app.DB.alarmas = [{
      id: 100, tipo: 'info', titulo: 'Original', desc: 'desc vieja',
      fecha: '2026-07-01', hora: '', rel: 'Palpa', repeat: 'No repetir', estado: 'resuelta',
    }];
    app.DB.nextId = 500;
  });

  it('editarAlarma carga los datos y guardarAlarma actualiza en el lugar (mismo id, mismo estado)', () => {
    app.editarAlarma(100);
    setInput(window, 'alarm-titulo', 'Corregida');
    setInput(window, 'alarm-desc', 'desc nueva');
    setInput(window, 'alarm-tipo', 'urgente');
    app.guardarAlarma();

    expect(app.DB.alarmas.length).toBe(1);          // no duplica
    const al = app.DB.alarmas[0];
    expect(al.id).toBe(100);                         // mismo id
    expect(al.estado).toBe('resuelta');              // conserva estado
    expect(al.titulo).toBe('Corregida');
    expect(al.desc).toBe('desc nueva');
    expect(al.tipo).toBe('urgente');
  });

  it('sin edición, guardarAlarma crea una nueva', () => {
    document.getElementById('alarm-titulo').value = '';   // abrir "nueva"
    window.openModal('modal-alarma');
    setInput(window, 'alarm-titulo', 'Nueva alarma');
    app.guardarAlarma();
    expect(app.DB.alarmas.length).toBe(2);
    expect(app.DB.alarmas[0].titulo).toBe('Nueva alarma'); // unshift → primera
    expect(app.DB.alarmas[0].estado).toBe('activa');
  });
});

// ── 3) Editar la presentación (factura) ya hecha a una OS ────────────────────
describe('Editar la presentación a la OS (corregir error de carga)', () => {
  it('el detalle de la OS ofrece editar la factura cuando ya existe', () => {
    const mesLabel = app.getMesLabel('2026-06');
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 }];
    app.DB.registros = [{ id: 10, fecha: '2026-06-10', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000 }];
    app.DB.facturas = [{ id: 77, num: 'A-0001', dest: 'OSDE', mes: mesLabel, monto: 50000, estado: 'Pendiente', fecha: '2026-06-30', vence: '2026-08-29' }];
    app.renderOSDetalle('OSDE', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('editarFactura(77)');           // botón de corregir
    expect(html).toContain('A-0001');                       // muestra la factura existente
  });

  it('guardarEdicionFactura corrige la presentación en el lugar (mismo id)', () => {
    app.DB.facturas = [{ id: 77, num: 'A-0001', dest: 'OSDE', mes: 'Junio 2026', monto: 50000, estado: 'Pendiente', fecha: '2026-06-30', vence: '2026-08-29', obs: '' }];
    app.editarFactura(77);
    setInput(window, 'ef-monto', 48000);
    setInput(window, 'ef-num', 'A-0002');
    app.guardarEdicionFactura();
    const f = app.DB.facturas.find(x => x.id === 77);
    expect(app.DB.facturas.length).toBe(1);   // no duplica
    expect(f.monto).toBe(48000);
    expect(f.num).toBe('A-0002');
    expect(app.__dirtyCols()).toContain('facturas');
  });

  it('editar una presentación YA COBRADA ajusta también el ingreso en Caja', () => {
    app.DB.facturas = [{ id: 88, num: 'A-0010', dest: 'IOMA', mes: 'Junio 2026', monto: 30000, estado: 'Pagada', fecha: '2026-06-30', vence: '2026-08-29', obs: '' }];
    app.DB.movimientos = [{ id: 90, fecha: '2026-07-01', desc: 'Cobro A-0010 — IOMA', consultorio: 'General', tipo: 'Ingreso', monto: 30000, saldo: 0, facturaId: 88 }];
    app.editarFactura(88);
    setInput(window, 'ef-monto', 27000);
    app.guardarEdicionFactura();
    expect(app.DB.facturas.find(x => x.id === 88).monto).toBe(27000);
    expect(app.DB.movimientos.find(m => m.facturaId === 88).monto).toBe(27000);  // Caja ajustada
  });
});

// ── 3b) Corregir en la presentación si una prestación va exenta o gravada ─────
describe('Cambiar exenta/gravada de una prestación en la presentación', () => {
  beforeEach(() => {
    app.DB.facturas = [];
    app.DB.prestaciones = [{ id: 1, codigo: '170101', desc: 'Cirugía catarata', os: 'OSDE', valOS: 200000 }];
    // Dos atenciones de la misma prestación, hoy exentas (default OSDE)
    app.DB.registros = [
      { id: 10, fecha: '2026-06-05', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Cirugía catarata', valorUnit: 200000, exenta: true },
      { id: 11, fecha: '2026-06-20', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Cirugía catarata', valorUnit: 200000, exenta: true },
    ];
    window.confirm = () => true;
  });

  it('el pill de la presentación es clickeable y llama a toggleExentaPresentacion', () => {
    app.renderOSDetalle('OSDE', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('toggleExentaPresentacion(');
    expect(html).toContain("'OSDE'");
  });

  it('togglear pone GRAVADAS las prestaciones de ese CÓDIGO y aparece IVA 10.5%', () => {
    // Antes: exentas → sin IVA
    expect(app.ivaReg(app.DB.registros[0])).toBe(0);
    app.toggleExentaPresentacion('OSDE', '2026-06', '170101', 'Cirugía catarata', true);
    // Ahora ambas quedaron gravadas
    expect(app.DB.registros.every(r => r.exenta === false)).toBe(true);
    expect(app.ivaReg(app.DB.registros[0])).toBe(200000 * 0.105);
    expect(app.__dirtyCols()).toContain('registros');
  });

  it('volver a togglear las devuelve a exentas', () => {
    app.toggleExentaPresentacion('OSDE', '2026-06', '170101', 'Cirugía catarata', true);   // → gravadas
    app.toggleExentaPresentacion('OSDE', '2026-06', '170101', 'Cirugía catarata', false);  // → exentas
    expect(app.DB.registros.every(r => r.exenta === true)).toBe(true);
  });

  it('corrige UNA sola atención (Medifé gravada→exenta) sin tocar las demás del código', () => {
    app.DB.facturas = [];
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'Medifé', valOS: 50000 }];
    // 3 consultas del mismo código: dos ya exentas (bien) y una gravada por error de carga
    app.DB.registros = [
      { id: 30, fecha: '2026-06-03', os: 'Medifé', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000, exenta: true },
      { id: 31, fecha: '2026-06-10', os: 'Medifé', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000, exenta: true },
      { id: 32, fecha: '2026-06-20', os: 'Medifé', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000, exenta: false }, // ← el error
    ];
    window.confirm = () => true;
    app.toggleExentaRegistro(32, 'Medifé', '2026-06');
    // Solo la 32 cambió; las otras dos siguen exentas
    expect(app.DB.registros.find(r => r.id === 32).exenta).toBe(true);
    expect(app.DB.registros.find(r => r.id === 30).exenta).toBe(true);
    expect(app.DB.registros.find(r => r.id === 31).exenta).toBe(true);
    expect(app.__dirtyCols()).toContain('registros');
  });

  it('la corrección por atención funciona aunque la liquidación del médico esté CERRADA', () => {
    // El caso real: no se puede editar la atención porque el mes está cerrado, pero la
    // exención (IVA) no afecta el honorario del médico, así que debe permitirse.
    app.DB.facturas = [];
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta', os: 'Medifé', valOS: 50000 }];
    app.DB.registros = [{ id: 40, fecha: '2026-06-20', os: 'Medifé', medico: 'Dr. Polisky, Nicolás', cantidad: 1, prestacion: 'Consulta', valorUnit: 50000, exenta: false }];
    app.DB.liquidaciones = [{ id: 90, mes: '2026-06', medico: 'Dr. Polisky, Nicolás', estado: 'Cerrada', pagoEnviado: true }];
    // Sanity: el registro está "bloqueado" para edición normal
    expect(app.regBloqueado(app.DB.registros[0])).toBe(true);
    window.confirm = () => true;
    app.toggleExentaRegistro(40, 'Medifé', '2026-06');
    expect(app.DB.registros.find(r => r.id === 40).exenta).toBe(true);   // se corrigió igual
  });

  it('CEMEPLA no se puede cambiar (siempre 21%): el pill no es clickeable', () => {
    app.DB.prestaciones = [{ id: 2, codigo: '420101', desc: 'Consulta', os: 'CEMEPLA', valOS: 40000 }];
    app.DB.registros = [{ id: 12, fecha: '2026-06-05', os: 'CEMEPLA', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 40000 }];
    app.renderOSDetalle('CEMEPLA', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    expect(html).not.toContain('toggleExentaPresentacion(');
    expect(html).toContain('21%');
  });
});

// ── La presentación agrupa TODAS las prestaciones del mismo código en una fila ──
describe('Presentación a la OS: agrupar por código', () => {
  function filasVisibles() {
    // cuenta filas de prestación de la tabla: cada fila (no-CEMEPLA) tiene un pill de
    // IVA clickeable con su onclick a toggleExentaPresentacion.
    const html = document.getElementById('os-detalle-panel').innerHTML;
    return (html.match(/toggleExentaPresentacion\(/g) || []).length;
  }

  it('mismo código con distinta descripción y distinto precio → una sola fila', () => {
    app.DB.facturas = [];
    app.DB.prestaciones = [{ id: 1, codigo: '420114', desc: 'Consulta oftalmológica', os: 'OSDE', valOS: 50000, exenta: true }];
    // 3 atenciones del MISMO código (mapea por descripción a 420114) cargadas con
    // textos distintos y un cambio de precio a mitad de mes.
    app.DB.registros = [
      { id: 10, fecha: '2026-06-03', os: 'OSDE', medico: 'X', cantidad: 2, prestacion: 'Consulta oftalmológica', valorUnit: 50000, exenta: true },
      { id: 11, fecha: '2026-06-15', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Consulta oftalmológica', valorUnit: 55000, exenta: true },
    ];
    app.renderOSDetalle('OSDE', '2026-06');
    const html = document.getElementById('os-detalle-panel').innerHTML;
    // Una sola fila de prestación (un solo pill de IVA)
    expect(filasVisibles()).toBe(1);
    // El código presente y el neto total (2×50000 + 1×55000 = 155.000) en la fila
    expect(html).toContain('420114');
    expect(html).toContain('155.000');
  });

  it('la suma de las filas agrupadas cuadra con totalesOS (no se pierde ni sobra plata)', () => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420114', desc: 'Consulta', os: 'OSDE', valOS: 50000 },
      { id: 2, codigo: '170101', desc: 'Cirugía', os: 'OSDE', valOS: 200000 },
    ];
    app.DB.registros = [
      { id: 10, fecha: '2026-06-03', os: 'OSDE', medico: 'X', cantidad: 2, prestacion: 'Consulta', valorUnit: 50000, exenta: false },
      { id: 11, fecha: '2026-06-15', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Consulta', valorUnit: 55000, exenta: false },
      { id: 12, fecha: '2026-06-20', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Cirugía', valorUnit: 200000, exenta: true },
    ];
    const filas = app.filasPresentacionOS(app.DB.registros, 'OSDE');
    const t = app.totalesOS(app.DB.registros, 'OSDE');
    const sumaNeto = filas.reduce((s,f) => s + f.neto, 0);
    const sumaIva  = filas.reduce((s,f) => s + f.iva, 0);
    expect(sumaNeto).toBeCloseTo(t.netoExento + t.netoGravado, 6);
    expect(sumaIva).toBeCloseTo(t.iva, 6);
    // 2 filas: Consulta (gravada, 3 unidades, precio mixto) + Cirugía (exenta)
    expect(filas.length).toBe(2);
    const consulta = filas.find(f => f.codigo === '420114');
    expect(consulta.cant).toBe(3);
    expect(consulta.valorMixto).toBe(true);   // 50000 y 55000
  });

  it('exento y gravado del mismo código NO se mezclan (van en filas separadas)', () => {
    app.DB.facturas = [];
    app.DB.prestaciones = [{ id: 1, codigo: '170101', desc: 'Cirugía', os: 'OSDE', valOS: 100000 }];
    app.DB.registros = [
      { id: 20, fecha: '2026-06-03', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Cirugía', valorUnit: 100000, exenta: true },
      { id: 21, fecha: '2026-06-10', os: 'OSDE', medico: 'X', cantidad: 1, prestacion: 'Cirugía', valorUnit: 100000, exenta: false },
    ];
    app.renderOSDetalle('OSDE', '2026-06');
    // Dos filas: una exenta, una gravada
    expect(filasVisibles()).toBe(2);
  });
});

// ── 4) Editar / eliminar movimientos de banco ────────────────────────────────
describe('Editar cajas (movimientos de banco)', () => {
  beforeEach(() => {
    app.DB.movimientos = [
      { id: 30, fecha: '2026-06-10', desc: 'Gasto luz', consultorio: 'Palpa', tipo: 'Egreso', monto: 5000, saldo: 0 },
    ];
    app.DB.nextId = 600;
    window.confirm = () => true;
  });

  it('editarMovimiento + guardarMovimiento actualiza en el lugar (mismo id)', () => {
    app.editarMovimiento(30);
    setInput(window, 'mov-desc', 'Gasto luz corregido');
    setInput(window, 'mov-monto', 7500);
    setInput(window, 'mov-tipo', 'Egreso');
    app.guardarMovimiento();
    expect(app.DB.movimientos.length).toBe(1);
    expect(app.DB.movimientos[0].id).toBe(30);
    expect(app.DB.movimientos[0].desc).toBe('Gasto luz corregido');
    expect(app.DB.movimientos[0].monto).toBe(7500);
    expect(app.__dirtyCols()).toContain('movimientos');
  });

  it('eliminarMovimiento lo saca de la caja', () => {
    app.eliminarMovimiento(30);
    expect(app.DB.movimientos.length).toBe(0);
    expect(app.__dirtyCols()).toContain('movimientos');
  });

  it('editar un movimiento automático (con origen) pide confirmación', () => {
    let pedido = '';
    window.confirm = (msg) => { pedido = msg; return true; };
    app.DB.movimientos = [{ id: 31, fecha: '2026-06-10', desc: 'Copago', consultorio: 'Palpa', tipo: 'Ingreso', monto: 3000, saldo: 0, origen: 'Copago' }];
    app.editarMovimiento(31);
    expect(pedido).toContain('automáticamente');
  });
});
