// Renombrar (editar) un médico debe seguir reconociéndolo como LA MISMA persona:
// el nombre nuevo se arrastra a todo lo que lo referenciaba por nombre (atenciones,
// liquidaciones, derivaciones). Distinto de borrar/agregar otro médico. Además no se
// permiten dos médicos con el mismo nombre (rompería el vínculo por nombre).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
const VIEJO = 'Dr. Polisky, Nicolás';
const NUEVO = 'Dr. Polisky, Nicolás A.';

beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'closeModal', 'renderMedicosGrid', 'renderConfiguracion'].forEach(fn => {
    if (typeof window[fn] === 'function') window[fn] = () => {};
  });
  // Un médico con id fijo + referencias por nombre en varias colecciones
  app.DB.medicos = [{ id: 10, nombre: VIEJO, color: '#333' }];
  app.DB.registros = [
    { id: 1, os: 'OSDE', medico: VIEJO, consultorio: 'Palpa', cantidad: 1, valorUnit: 100, fecha: '2026-06-01' },
    { id: 2, os: 'IOMA', medico: VIEJO, consultorio: 'Palpa', cantidad: 2, valorUnit: 200, fecha: '2026-06-02' },
    { id: 3, os: 'OSDE', medico: 'Otro Médico', consultorio: 'Palpa', cantidad: 1, valorUnit: 100, fecha: '2026-06-03' },
  ];
  app.DB.liquidaciones = [{ id: 4, mes: '2026-06', medico: VIEJO, estado: 'Cerrada' }];
  app.DB.derivaciones = [{ id: 5, medico: VIEJO, paciente: 'Juan', estado: 'Realizada' }];
  // desc con el formato REAL que arma confirmarPagoEnviado: soloApellido saca el "Dr. "
  app.DB.movimientos = [{ id: 6, tipo: 'Egreso', origen: 'Honorario', desc: 'Liquidación Junio 2026 — Polisky, Nicolás', monto: 1000, liqId: 4 }];
  app.DB.nextId = 1000;
});

// Simula editar el médico id=10 poniéndole un nombre nuevo y guardar.
function renombrarA(nombreNuevo) {
  app.editarMedico(10);
  // editarMedico rellena el form con setTimeout(50); en jsdom lo forzamos seteando los ids.
  setInput(window, 'med-edit-id', '10');
  setInput(window, 'med-nombre', nombreNuevo);
  app.guardarMedico();
}

describe('Renombrar un médico arrastra el nombre a todas las referencias', () => {
  it('las atenciones del médico pasan al nombre nuevo (y las de otros no se tocan)', () => {
    renombrarA(NUEVO);
    expect(app.DB.registros.find(r => r.id === 1).medico).toBe(NUEVO);
    expect(app.DB.registros.find(r => r.id === 2).medico).toBe(NUEVO);
    expect(app.DB.registros.find(r => r.id === 3).medico).toBe('Otro Médico'); // intacto
  });

  it('liquidaciones y derivaciones también siguen a la misma persona', () => {
    renombrarA(NUEVO);
    expect(app.DB.liquidaciones.find(l => l.id === 4).medico).toBe(NUEVO);
    expect(app.DB.derivaciones.find(d => d.id === 5).medico).toBe(NUEVO);
  });

  it('el médico sigue siendo el MISMO objeto (mismo id y color)', () => {
    renombrarA(NUEVO);
    expect(app.DB.medicos.length).toBe(1);
    expect(app.DB.medicos[0].id).toBe(10);
    expect(app.DB.medicos[0].color).toBe('#333');
    expect(app.DB.medicos[0].nombre).toBe(NUEVO);
  });

  it('el egreso de liquidación en Caja actualiza el apellido en la descripción', () => {
    // VIEJO = "Dr. Polisky, Nicolás" (apellido Polisky). Renombrar a "Gómez, Ana".
    renombrarA('Gómez, Ana');
    const mov = app.DB.movimientos.find(m => m.id === 6);
    expect(mov.desc).toContain('Gómez');
    expect(mov.desc).not.toContain('Polisky');
  });

  it('marca como cambiadas las colecciones afectadas (para sincronizar a la nube)', () => {
    renombrarA(NUEVO);
    const dirty = app.__dirtyCols();
    ['medicos', 'registros', 'liquidaciones', 'derivaciones'].forEach(c => expect(dirty).toContain(c));
  });
});

describe('No se permiten dos médicos con el mismo nombre', () => {
  beforeEach(() => {
    app.DB.medicos.push({ id: 11, nombre: 'Dra. Otra, Persona', color: '#555' });
  });

  it('renombrar al nombre de otro médico se rechaza (no mergea personas)', () => {
    renombrarA('Dra. Otra, Persona');
    // No cambió: sigue con el nombre viejo
    expect(app.DB.medicos.find(m => m.id === 10).nombre).toBe(VIEJO);
    // Y las atenciones no se tocaron
    expect(app.DB.registros.find(r => r.id === 1).medico).toBe(VIEJO);
  });

  it('crear un médico nuevo con un nombre ya existente se rechaza', () => {
    app.abrirNuevoMedico();
    setInput(window, 'med-edit-id', '');
    setInput(window, 'med-nombre', VIEJO);
    app.guardarMedico();
    expect(app.DB.medicos.filter(m => m.nombre === VIEJO).length).toBe(1);
  });
});
