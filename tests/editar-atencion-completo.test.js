// EDITAR ATENCIÓN COMPLETA: el modal de edición permite editar TODO como en la carga —
// prestación (nombre/código/valor/categoría/IVA), obra social, copago/coseguro, además de
// médico/consultorio/comentario/valor que ya andaban. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
const MED = 'Dr. Polisky, Nicolás';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = h.window.document;
  resetDatos(app);
  ['renderAtenciones', 'renderCajaChica', 'renderFinanzas', 'closeModal', 'showToast', 'openModal', 'initDashboard']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.confirm = () => true;
});

function regOSDE(extra = {}) {
  return { id: 900, os: 'OSDE', medico: MED, consultorio: 'Palpa', plan: '', prestacion: '', codigo: '',
           cantidad: 1, valorUnit: 21536, exenta: true, categoria: 'consulta', fecha: '2026-06-10', ...extra };
}

describe('Desplegables dinámicos', () => {
  it('el selector de OS se puebla desde la base (incluye SinCargo, no está hardcodeado)', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    const os = [...document.getElementById('edit-reg-os').options].map(o => o.value);
    expect(os).toContain('OSDE');
    expect(os).toContain('SinCargo');   // antes faltaba en la lista hardcodeada
    expect(os).toContain('Particular');
  });

  it('el selector de consultorio se puebla desde la base', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    const cons = [...document.getElementById('edit-reg-consultorio').options].map(o => o.value);
    expect(cons).toEqual(app.getConsultoriosList());
    expect(document.getElementById('edit-reg-consultorio').value).toBe('Palpa');
  });
});

describe('Editar la prestación', () => {
  it('elegir una prestación del nomenclador autocompleta nombre, código, valor y categoría', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    // Elegir "Catarata / facoemulsificación c/IOL" (id 285, valOS 1351970, práctica)
    const sel = document.getElementById('edit-reg-prestacion');
    sel.value = '285';
    app.editarRegPrestChange();
    expect(document.getElementById('edit-reg-valunit').value).toBe('1351970');   // autocompletado
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.prestacion).toBe('Catarata / facoemulsificación c/IOL');
    expect(r.codigo).toBe('20167');
    expect(r.valorUnit).toBe(1351970);
    expect(r.categoria).toBe('practica');
  });

  it('"otra prestación" permite nombre a mano + valor, sin código', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    const sel = document.getElementById('edit-reg-prestacion');
    sel.value = '__otra__';
    app.editarRegPrestChange();
    setInput(window, 'edit-reg-prest-otra', 'Cirugía especial no convenida');
    setInput(window, 'edit-reg-valunit', 500000);
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.prestacion).toBe('Cirugía especial no convenida');
    expect(r.codigo).toBe('');
    expect(r.valorUnit).toBe(500000);
  });

  it('"(mantener actual)" por defecto NO cambia la prestación existente', () => {
    app.DB.registros = [regOSDE({ prestacion: 'Consulta (Plan 210)', codigo: '420162' })];
    app.editarRegistro(900);
    // no se toca el selector: al guardar debe mantener la prestación
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.prestacion).toBe('Consulta (Plan 210)');
    expect(r.codigo).toBe('420162');
  });

  it('cambiar la OS repuebla las prestaciones de la OS nueva', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    setInput(window, 'edit-reg-os', 'IOMA');
    app.editarRegOSChange();
    expect(document.getElementById('edit-reg-os').value).toBe('IOMA');
    // el selector de prestación ahora tiene "mantener" + "otra" como mínimo (sin arrastrar OSDE)
    const opts = [...document.getElementById('edit-reg-prestacion').options].map(o => o.value);
    expect(opts).toContain('__otra__');
    expect(opts).toContain('__actual__');
  });

  it('cambiar de OS NO deja el precio stale de la OS anterior (fix auditoría)', () => {
    app.DB.registros = [regOSDE({ valorUnit: 21536 })];   // precio de OSDE
    app.editarRegistro(900);
    setInput(window, 'edit-reg-os', 'IOMA');
    app.editarRegOSChange();
    // el valor debe pasar al de la OS nueva (fallback 22000), no quedar en 21536
    expect(document.getElementById('edit-reg-valunit').value).toBe(String(app.valorConsultaOS('IOMA')));
    expect(document.getElementById('edit-reg-valunit').value).not.toBe('21536');
  });
});

describe('Editar el copago / coseguro', () => {
  it('agregar un copago crea el movimiento de caja (aunque no tuviera caja antes)', () => {
    app.DB.registros = [regOSDE({ os: 'CoberMed', exenta: false })];
    app.DB.cajaChica = []; app.DB.movimientos = [];
    app.editarRegistro(900);
    document.getElementById('edit-reg-tiene-copago').checked = true;
    app.editarRegToggleCopago();
    setInput(window, 'edit-reg-copago-monto', 5000);
    setInput(window, 'edit-reg-copago-medio', 'Efectivo');
    setInput(window, 'edit-reg-copago-tipo', 'adelanto');
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.copago).toBe(5000);
    expect(r.copagoMedio).toBe('Efectivo');
    const mov = app.DB.cajaChica.filter(m => m.regId === 900 && m.origen === 'Copago');
    expect(mov.length).toBe(1);
    expect(mov[0].monto).toBe(5000);
  });

  it('cambiar el monto del copago actualiza el movimiento (no duplica)', () => {
    app.DB.registros = [regOSDE({ os: 'CoberMed', exenta: false, copago: 5000, copagoMedio: 'Efectivo', copagoTipo: 'adelanto' })];
    app.DB.cajaChica = [{ id: 1, regId: 900, origen: 'Copago', monto: 5000, tipo: 'Ingreso', consultorio: 'Palpa' }];
    app.editarRegistro(900);
    setInput(window, 'edit-reg-copago-monto', 8000);
    app.guardarEdicionRegistro();
    const mov = app.DB.cajaChica.filter(m => m.regId === 900 && m.origen === 'Copago');
    expect(mov.length).toBe(1);
    expect(mov[0].monto).toBe(8000);
  });

  it('destildar el copago lo quita y borra su movimiento', () => {
    app.DB.registros = [regOSDE({ os: 'CoberMed', exenta: false, copago: 5000, copagoMedio: 'Efectivo', copagoTipo: 'adelanto' })];
    app.DB.cajaChica = [{ id: 1, regId: 900, origen: 'Copago', monto: 5000, tipo: 'Ingreso', consultorio: 'Palpa' }];
    app.editarRegistro(900);
    document.getElementById('edit-reg-tiene-copago').checked = false;
    app.editarRegToggleCopago();
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.copago).toBe(0);
    expect(app.DB.cajaChica.filter(m => m.regId === 900 && m.origen === 'Copago').length).toBe(0);
  });
});

describe('Los campos que ya andaban siguen andando', () => {
  it('médico, consultorio, IVA y valor se editan y guardan', () => {
    app.DB.registros = [regOSDE()];
    app.editarRegistro(900);
    setInput(window, 'edit-reg-medico', MED);
    setInput(window, 'edit-reg-consultorio', 'Haedo');
    setInput(window, 'edit-reg-valunit', 30000);
    app.editarRegToggleIVA();   // exenta → gravada
    app.guardarEdicionRegistro();
    const r = app.DB.registros.find(x => x.id === 900);
    expect(r.consultorio).toBe('Haedo');
    expect(r.valorUnit).toBe(30000);
    expect(r.exenta).toBe(false);   // ahora gravada
  });
});
