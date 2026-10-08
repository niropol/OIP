// (archivo existente + toggle de IVA desde Atenciones)
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'renderAtenciones', 'renderFinanzas', 'closeModal', 'showToast', 'openModal']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
  setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
  setInput(window, 'at-fecha', '2026-06-10');
  setInput(window, 'at-consultorio-sel', 'Haedo');
  window.confirm = () => false;
});

function editar(id, cambios) {
  app.editarRegistro(id);
  Object.entries(cambios).forEach(([campo, val]) => setInput(window, campo, val));
}

describe('Editar atención — re-sincroniza la caja', () => {
  it('Particular efectivo: cambiar el monto actualiza la caja chica (no duplica)', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(app.DB.cajaChica.filter(m => m.regId === reg.id && m.tipo === 'Ingreso').length).toBe(1);

    editar(reg.id, { 'edit-reg-part-ef-val': 50000 });
    app.guardarEdicionRegistro();

    const ing = app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Efectivo');
    expect(ing.length).toBe(1);
    expect(ing[0].monto).toBe(50000);
    expect(app.DB.registros.find(r => r.id === reg.id).partEfVal).toBe(50000);
  });

  it('Particular efectivo: cambiar el consultorio mueve el ingreso de caja chica', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];

    editar(reg.id, { 'edit-reg-consultorio': 'Palpa' });
    app.guardarEdicionRegistro();

    const ing = app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Efectivo');
    expect(ing.length).toBe(1);
    expect(ing[0].consultorio).toBe('Palpa');
  });

  it('Honorario efectivo ya pagado: al editar el monto, el egreso se ajusta a la mitad', () => {
    window.confirm = () => true;
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Honorario')[0].monto).toBe(30000);

    editar(reg.id, { 'edit-reg-part-ef-val': 50000 });
    app.guardarEdicionRegistro();

    const egr = app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Honorario');
    expect(egr.length).toBe(1);
    expect(egr[0].monto).toBe(25000);
  });

  it('Editar un particular NO le vacía la OS (bug: edit-reg-os no tiene la opción Particular)', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];

    editar(reg.id, { 'edit-reg-part-ef-val': 55000 });
    app.guardarEdicionRegistro();

    const r = app.DB.registros.find(x => x.id === reg.id);
    expect(r.os).toBe('Particular');
    expect(app.facturadoReg(r)).toBe(55000);
  });

  it('Particular efectivo → transferencia: el ingreso pasa de caja chica al banco', () => {
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];

    editar(reg.id, { 'edit-reg-part-ef': 0, 'edit-reg-part-tr': 1, 'edit-reg-part-tr-val': 60000 });
    app.guardarEdicionRegistro();

    expect(app.DB.cajaChica.filter(m => m.regId === reg.id).length).toBe(0);
    const banco = app.DB.movimientos.filter(m => m.regId === reg.id && m.origen === 'Particular');
    expect(banco.length).toBe(1);
    expect(banco[0].monto).toBe(60000);
  });

  it('Efectivo con honorario pagado → transferencia: limpia el flag y no deja egreso colgado', () => {
    window.confirm = () => true;
    app.AT.tipo = 'Particular'; app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    app.guardarAtencion();
    const reg = app.DB.registros[app.DB.registros.length - 1];
    expect(reg.honorarioPagadoEfectivo).toBe(true);

    editar(reg.id, { 'edit-reg-part-ef': 0, 'edit-reg-part-tr': 1, 'edit-reg-part-tr-val': 60000 });
    app.guardarEdicionRegistro();

    const r = app.DB.registros.find(x => x.id === reg.id);
    expect(r.honorarioPagadoEfectivo).toBeUndefined();
    expect(app.DB.cajaChica.filter(m => m.regId === reg.id && m.origen === 'Honorario').length).toBe(0);
  });
});

describe('Toggle de IVA desde la lista de Atenciones', () => {
  beforeEach(() => { window.confirm = () => true; });

  it('cambia exenta ↔ gravada de una atención de OS', () => {
    app.DB.registros = [{ id: 700, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: true, fecha: '2026-06-10' }];
    app.toggleExentaAtencion(700);
    expect(app.exentaReg(app.DB.registros[0], 'OSDE')).toBe(false);   // ahora gravada
    app.toggleExentaAtencion(700);
    expect(app.exentaReg(app.DB.registros[0], 'OSDE')).toBe(true);    // y vuelve a exenta
  });

  it('FUNCIONA aunque la liquidación esté CERRADA (el IVA no afecta el honorario)', () => {
    app.DB.registros = [{ id: 701, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: true, fecha: '2026-06-10' }];
    // Liquidación de ese médico/mes CERRADA
    app.DB.liquidaciones = [{ id: 1, mes: '2026-06', medico: 'Dr. Polisky, Nicolás', estado: 'Cerrada' }];
    expect(app.regBloqueado(app.DB.registros[0])).toBe(true);   // editar SÍ estaría bloqueado
    app.toggleExentaAtencion(701);                               // pero el toggle de IVA NO
    expect(app.exentaReg(app.DB.registros[0], 'OSDE')).toBe(false);   // cambió igual
  });

  it('Particular y CEMEPLA no se tocan', () => {
    app.DB.registros = [
      { id: 702, os: 'Particular', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', partEfectivo: 1, partEfVal: 60000, fecha: '2026-06-10' },
      { id: 703, os: 'CEMEPLA', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 50000, exenta: false, fecha: '2026-06-10' },
    ];
    app.toggleExentaAtencion(702);
    app.toggleExentaAtencion(703);
    expect(app.exentaReg(app.DB.registros[1], 'CEMEPLA')).toBe(false);   // CEMEPLA sigue gravada
  });
});

describe('Editar el comentario/observación de una atención', () => {
  beforeEach(() => {
    // el select de OS se llena en init(); lo poblamos a mano para el round-trip de edición
    window.document.getElementById('edit-reg-os').innerHTML = '<option>OSDE</option>';
  });

  it('actualiza el comentario de una atención de OS', () => {
    app.DB.registros = [{ id: 800, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', plan: '', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10', comentario: 'viejo' }];
    editar(800, { 'edit-reg-comentario': 'ojo derecho, urgente' });
    app.guardarEdicionRegistro();
    expect(app.DB.registros.find(r => r.id === 800).comentario).toBe('ojo derecho, urgente');
  });

  it('vaciar el comentario lo quita del registro (no deja string vacío)', () => {
    app.DB.registros = [{ id: 801, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', plan: '', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10', comentario: 'algo' }];
    editar(801, { 'edit-reg-comentario': '   ' });
    app.guardarEdicionRegistro();
    expect(app.DB.registros.find(r => r.id === 801).comentario).toBeUndefined();
  });

  it('agrega un comentario a una atención que no tenía', () => {
    app.DB.registros = [{ id: 802, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', plan: '', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10' }];
    editar(802, { 'edit-reg-comentario': 'aclaración nueva' });
    app.guardarEdicionRegistro();
    expect(app.DB.registros.find(r => r.id === 802).comentario).toBe('aclaración nueva');
  });
});

describe('Comentario rápido desde la lista (funciona con la liquidación CERRADA)', () => {
  it('agrega/cambia el comentario aunque el mes esté cerrado (no toca el honorario)', () => {
    app.DB.registros = [{ id: 810, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10' }];
    app.DB.liquidaciones = [{ id: 1, mes: '2026-06', medico: 'Dr. Polisky, Nicolás', estado: 'Cerrada' }];
    expect(app.regBloqueado(app.DB.registros[0])).toBe(true);   // el modal SÍ estaría bloqueado
    window.prompt = () => 'ojo izquierdo';
    app.editarComentarioAtencion(810);
    expect(app.DB.registros.find(r => r.id === 810).comentario).toBe('ojo izquierdo');
  });

  it('vaciar el comentario lo borra', () => {
    app.DB.registros = [{ id: 811, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10', comentario: 'algo' }];
    window.prompt = () => '   ';
    app.editarComentarioAtencion(811);
    expect(app.DB.registros.find(r => r.id === 811).comentario).toBeUndefined();
  });

  it('cancelar (Esc) no cambia nada', () => {
    app.DB.registros = [{ id: 812, os: 'OSDE', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', cantidad: 1, valorUnit: 100000, exenta: false, fecha: '2026-06-10', comentario: 'original' }];
    window.prompt = () => null;
    app.editarComentarioAtencion(812);
    expect(app.DB.registros.find(r => r.id === 812).comentario).toBe('original');
  });

  it('los particulares no llevan comentario de OS', () => {
    app.DB.registros = [{ id: 813, os: 'Particular', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa', partEfectivo: 1, partEfVal: 60000, fecha: '2026-06-10' }];
    let pedido = false;
    window.prompt = () => { pedido = true; return 'x'; };
    app.editarComentarioAtencion(813);
    expect(pedido).toBe(false);   // ni siquiera abre el prompt
    expect(app.DB.registros.find(r => r.id === 813).comentario).toBeUndefined();
  });
});
