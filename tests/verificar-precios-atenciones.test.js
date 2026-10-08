// Verificación de precios: los aumentos rigen desde que se cargan en adelante y se hacen sobre
// el precio anterior, así que meses distintos tienen legítimamente precios distintos. Lo que ES
// un error es que, dentro del MISMO mes y OS, una misma prestación tenga precios distintos
// (reprecio a medias: alguna quedó con el valor viejo). Eso es lo que detecta. No modifica nada.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  app.DB.prestaciones = [
    { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 60000 },
  ];
});

function reg(o) { return { cantidad: 1, exenta: true, plan: '510', codigo: '420162', prestacion: 'Consulta (Plan 510)', os: 'OSDE', ...o }; }

describe('Reprecio a medias (mismo mes, precios distintos) = error', () => {
  it('marca cuando en el mismo mes hay dos precios para la misma prestación', () => {
    app.DB.registros = [
      reg({ id: 10, fecha: '2026-06-05', valorUnit: 60000 }),   // nueva
      reg({ id: 11, fecha: '2026-06-06', valorUnit: 60000 }),   // nueva
      reg({ id: 12, fecha: '2026-06-20', valorUnit: 55679 }),   // quedó vieja
    ];
    const res = app.verificarPreciosAtenciones();
    expect(res.ok).toBe(false);
    expect(res.inconsistencias.length).toBe(1);
    const inc = res.inconsistencias[0];
    expect(inc.os).toBe('OSDE');
    expect(inc.mes).toBe('2026-06');
    expect(inc.valores.map(v => v.valor).sort()).toEqual([55679, 60000]);
    expect(inc.valorNomenclador).toBe(60000);   // referencia: el nomenclador dice 60000
  });
});

describe('Meses distintos con precios distintos = NO es error', () => {
  it('mayo a 55679 y junio a 60000 (cada uno consistente) → ok', () => {
    app.DB.registros = [
      reg({ id: 20, fecha: '2026-05-10', valorUnit: 55679 }),
      reg({ id: 21, fecha: '2026-05-11', valorUnit: 55679 }),
      reg({ id: 22, fecha: '2026-06-10', valorUnit: 60000 }),
      reg({ id: 23, fecha: '2026-06-11', valorUnit: 60000 }),
    ];
    const res = app.verificarPreciosAtenciones();
    expect(res.ok).toBe(true);                 // NO marca falsos positivos entre meses
    expect(res.revisadas).toBe(4);
  });

  it('un mes entero al valor viejo (uniforme) NO se marca (puede ser anterior al aumento)', () => {
    app.DB.registros = [
      reg({ id: 24, fecha: '2026-05-10', valorUnit: 55679 }),
      reg({ id: 25, fecha: '2026-05-11', valorUnit: 55679 }),
    ];
    expect(app.verificarPreciosAtenciones().ok).toBe(true);
  });
});

describe('Distintos planes con el MISMO código NO son un reprecio a medias', () => {
  beforeEach(() => {
    // OSDE: dos consultas comparten el código 420162 pero tienen precio distinto por plan
    app.DB.prestaciones = [
      { id: 1, codigo: '420162', desc: 'Consulta (Plan 210)', os: 'OSDE', valOS: 21536 },
      { id: 2, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679 },
    ];
  });

  it('mismo código + mismo mes, planes distintos con precios distintos → OK (no falso positivo)', () => {
    app.DB.registros = [
      { id: 10, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 210)', plan: '210', fecha: '2026-08-05', cantidad: 1, valorUnit: 21536, exenta: true },
      { id: 11, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-08-06', cantidad: 1, valorUnit: 55679, exenta: true },
    ];
    const res = app.verificarPreciosAtenciones();
    expect(res.ok).toBe(true);                 // planes distintos ≠ reprecio a medias
    expect(res.inconsistencias.length).toBe(0);
  });

  it('la MISMA prestación (mismo plan) con dos precios en el mes → SÍ se marca', () => {
    app.DB.registros = [
      { id: 12, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-08-05', cantidad: 1, valorUnit: 55679, exenta: true },
      { id: 13, os: 'OSDE', codigo: '420162', prestacion: 'Consulta (Plan 510)', plan: '510', fecha: '2026-08-06', cantidad: 1, valorUnit: 60000, exenta: true },
    ];
    const res = app.verificarPreciosAtenciones();
    expect(res.inconsistencias.length).toBe(1);
  });
});

describe('Alcance y bordes', () => {
  it('no revisa Particular ni CEMEPLA', () => {
    app.DB.registros = [
      { id: 30, os: 'Particular', partEfectivo: 1, partEfVal: 50000, fecha: '2026-06-10' },
      { id: 31, os: 'CEMEPLA', codigo: '—', prestacion: 'Consulta', valorUnit: 999, fecha: '2026-06-10', cantidad: 1 },
    ];
    const res = app.verificarPreciosAtenciones();
    expect(res.revisadas).toBe(0);
    expect(res.ok).toBe(true);
  });

  it('distingue prestaciones distintas dentro del mismo mes (no las mezcla)', () => {
    app.DB.prestaciones.push({ id: 2, codigo: '20167', desc: 'Catarata', os: 'OSDE', valOS: 1000000 });
    app.DB.registros = [
      reg({ id: 40, fecha: '2026-06-05', valorUnit: 60000 }),                                             // consulta
      reg({ id: 41, codigo: '20167', prestacion: 'Catarata', fecha: '2026-06-06', valorUnit: 1000000 }),  // catarata (otro precio, otra prestación)
    ];
    expect(app.verificarPreciosAtenciones().ok).toBe(true);   // no las confunde
  });

  it('filtra por OS y por mes', () => {
    app.DB.registros = [
      reg({ id: 50, fecha: '2026-06-05', valorUnit: 60000 }),
      reg({ id: 51, fecha: '2026-06-06', valorUnit: 55679 }),   // junio mixto
      reg({ id: 52, fecha: '2026-07-06', valorUnit: 60000 }),   // julio consistente
    ];
    expect(app.verificarPreciosAtenciones('OSDE', '2026-06').inconsistencias.length).toBe(1);
    expect(app.verificarPreciosAtenciones('OSDE', '2026-07').inconsistencias.length).toBe(0);
  });
});
