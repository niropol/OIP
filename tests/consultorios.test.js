// Tests de la gestión de Consultorios (Configuración → Consultorios) como base
// única para "a qué consultorio aplicar prácticas o consultas". Contra el código
// actual. Palpa/Haedo/Extra vienen del seed (js/datos.js) como consultorios activos.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['renderConfiguracion', 'closeModal', 'showToast']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

describe('getConsultoriosList: base única de consultorios activos', () => {
  it('devuelve Palpa, Haedo y Extra por defecto (seed)', () => {
    expect(app.getConsultoriosList()).toEqual(['Palpa', 'Haedo', 'Extra']);
  });

  it('excluye los inactivos', () => {
    app.DB.consultorios.find(c => c.nombre === 'Extra').estado = 'Inactiva';
    expect(app.getConsultoriosList()).toEqual(['Palpa', 'Haedo']);
  });
});

describe('poblarSelectoresConsultorio: propaga la lista a TODOS los selects', () => {
  it('llena los selectores "aplicar a" (sin placeholder)', () => {
    app.poblarSelectoresConsultorio();
    const g = id => [...window.document.getElementById(id).options].map(o => o.text);
    expect(g('at-consultorio-sel')).toEqual(['Palpa', 'Haedo', 'Extra']);
    expect(g('cm-consultorio')).toEqual(['Palpa', 'Haedo', 'Extra']);
    expect(g('edit-reg-consultorio')).toEqual(['Palpa', 'Haedo', 'Extra']);
    expect(g('dv-consultorio')).toEqual(['Palpa', 'Haedo', 'Extra']);
    expect(g('cc-consultorio')).toEqual(['Palpa', 'Haedo', 'Extra']);
  });

  it('mov-consultorio incluye los consultorios + "General" fijo al final', () => {
    app.poblarSelectoresConsultorio();
    const opts = [...window.document.getElementById('mov-consultorio').options].map(o => o.text);
    expect(opts).toEqual(['Palpa', 'Haedo', 'Extra', 'General']);
  });

  it('los filtros llevan placeholder "Todos los consultorios"', () => {
    app.poblarSelectoresConsultorio();
    const opts = [...window.document.getElementById('at-f-consultorio').options].map(o => o.text);
    expect(opts[0]).toBe('Todos los consultorios');
    expect(opts.slice(1)).toEqual(['Palpa', 'Haedo', 'Extra']);
  });

  it('un consultorio nuevo aparece en todos los selects tras poblar de nuevo', () => {
    app.DB.consultorios.push({ id: 9001, nombre: 'Sucursal Test', estado: 'Activa' });
    app.poblarSelectoresConsultorio();
    const g = id => [...window.document.getElementById(id).options].map(o => o.text);
    expect(g('at-consultorio-sel')).toContain('Sucursal Test');
    expect(g('est-consultorio')).toContain('Sucursal Test');
  });

  it('un consultorio desactivado desaparece de los selects', () => {
    app.DB.consultorios.find(c => c.nombre === 'Haedo').estado = 'Inactiva';
    app.poblarSelectoresConsultorio();
    const opts = [...window.document.getElementById('at-consultorio-sel').options].map(o => o.text);
    expect(opts).not.toContain('Haedo');
  });
});

describe('ABM de consultorios', () => {
  it('guardarConsultorio (alta) crea un consultorio activo', () => {
    setInput(window, 'co-edit-id', '');
    setInput(window, 'co-nombre', 'Sucursal Nueva');
    app.guardarConsultorio();
    const c = app.DB.consultorios.find(x => x.nombre === 'Sucursal Nueva');
    expect(c).toBeTruthy();
    expect(c.estado).toBe('Activa');
    expect(app.getConsultoriosList()).toContain('Sucursal Nueva');
  });

  it('no permite crear dos consultorios con el mismo nombre (case-insensitive)', () => {
    setInput(window, 'co-edit-id', '');
    setInput(window, 'co-nombre', 'palpa');
    app.guardarConsultorio();
    expect(app.DB.consultorios.filter(c => c.nombre.toLowerCase() === 'palpa').length).toBe(1);
  });

  it('toggleConsultorioEstado activa/desactiva sin borrar', () => {
    const id = app.DB.consultorios.find(c => c.nombre === 'Extra').id;
    app.toggleConsultorioEstado(id);
    expect(app.DB.consultorios.find(c => c.id === id).estado).toBe('Inactiva');
    expect(app.getConsultoriosList()).not.toContain('Extra');
    app.toggleConsultorioEstado(id);
    expect(app.DB.consultorios.find(c => c.id === id).estado).toBe('Activa');
    expect(app.getConsultoriosList()).toContain('Extra');
  });

  it('renombrar un consultorio propaga el nombre nuevo a registros/cajaChica existentes', () => {
    app.DB.registros.push({ id: 8001, fecha: '2026-06-01', medico: 'X', consultorio: 'Extra', os: 'OSDE', cantidad: 1, valorUnit: 100 });
    app.DB.cajaChica.push({ id: 8002, fecha: '2026-06-01', consultorio: 'Extra', tipo: 'Ingreso', monto: 100 });
    const id = app.DB.consultorios.find(c => c.nombre === 'Extra').id;
    setInput(window, 'co-edit-id', id);
    setInput(window, 'co-nombre', 'Guardia');
    app.guardarConsultorio();
    expect(app.DB.registros.find(r => r.id === 8001).consultorio).toBe('Guardia');
    expect(app.DB.cajaChica.find(m => m.id === 8002).consultorio).toBe('Guardia');
    expect(app.getConsultoriosList()).toContain('Guardia');
    expect(app.getConsultoriosList()).not.toContain('Extra');
    // Solo se marcan las colecciones que EFECTIVAMENTE cambiaron: movimientos y
    // derivaciones no tenían nada con "Extra", no deben quedar marcadas.
    const dirty = app.__dirtyCols();
    expect(dirty).toContain('registros');
    expect(dirty).toContain('cajaChica');
    expect(dirty).not.toContain('movimientos');
    expect(dirty).not.toContain('derivaciones');
  });

  it('eliminarConsultorio (confirmado) lo quita de la lista sin borrar atenciones históricas', () => {
    app.DB.registros.push({ id: 8003, fecha: '2026-06-01', medico: 'X', consultorio: 'Extra', os: 'OSDE', cantidad: 1, valorUnit: 100 });
    window.confirm = () => true;
    const id = app.DB.consultorios.find(c => c.nombre === 'Extra').id;
    app.eliminarConsultorio(id);
    expect(app.DB.consultorios.some(c => c.id === id)).toBe(false);
    expect(app.getConsultoriosList()).not.toContain('Extra');
    // el registro histórico sigue existiendo, con el nombre viejo (no se toca)
    expect(app.DB.registros.find(r => r.id === 8003).consultorio).toBe('Extra');
  });
});

describe('Migración: una nube EXISTENTE (sin la colección consultorios) se siembra sola', () => {
  // Escenario crítico: producción ya tiene datos (registros, obrasSociales, etc.) pero
  // 'consultorios' nunca existió como colección en la nube (se agregó recién en este
  // cambio). Sin la migración, cargarDesdeNube() dejaría DB.consultorios = [] y NINGÚN
  // selector de "aplicar a consultorio" tendría opciones.
  function mockSbConDatosSinConsultorios() {
    const ops = { upserts: [] };
    const api = {
      from() {
        return {
          upsert(rows) { ops.upserts.push(rows); return Promise.resolve({ error: null }); },
          select() {
            // La nube tiene datos de OTRAS colecciones, pero cero filas 'consultorios'.
            // Builder que soporta la carga paginada (.order().range()) y await directo.
            const rows = [{ coleccion: 'registros', doc_id: 1, data: { id: 1, os: 'OSDE' } }];
            const res = () => ({ data: rows, error: null, count: rows.length });
            const b = {
              eq() { return b; }, neq() { return b; }, order() { return b; },
              range() { return Promise.resolve(res()); },
              then(resolve, reject) { return Promise.resolve(res()).then(resolve, reject); },
            };
            return b;
          },
        };
      },
    };
    return { api, ops };
  }

  it('siembra Palpa/Haedo/Extra si la nube no tenía ninguna fila de consultorios', async () => {
    await new Promise(r => setTimeout(r, 0));  // dejar correr arranque() (modo DEV) antes de pisar sb
    const m = mockSbConDatosSinConsultorios();
    app.__setSb(m.api);
    await app.cargarDesdeNube();
    expect(app.DB.consultorios.map(c => c.nombre).sort()).toEqual(['Extra', 'Haedo', 'Palpa']);
    expect(app.getConsultoriosList().sort()).toEqual(['Extra', 'Haedo', 'Palpa']);
  });
});

describe('guardarAtencion valida el consultorio contra la lista dinámica', () => {
  beforeEach(() => {
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
    setInput(window, 'at-fecha', '2026-06-10');
    app.AT.tipo = 'Particular';
    app.AT.medioPago = 'Efectivo';
    setInput(window, 'at-part-monto', 60000);
    window.confirm = () => false;
  });

  it('acepta un consultorio activo de la lista', () => {
    setInput(window, 'at-consultorio-sel', 'Extra');
    app.guardarAtencion();
    expect(app.DB.registros.some(r => r.consultorio === 'Extra')).toBe(true);
  });

  it('rechaza un consultorio que ya no está activo (fue desactivado)', () => {
    app.DB.consultorios.find(c => c.nombre === 'Extra').estado = 'Inactiva';
    setInput(window, 'at-consultorio-sel', 'Extra');
    app.guardarAtencion();
    expect(app.DB.registros.length).toBe(0);
  });
});
