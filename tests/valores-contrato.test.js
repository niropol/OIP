// Tests de B: el nomenclador (DB.prestaciones) es la ÚNICA base de valores de
// consulta. CONSULTA_VALORES queda solo como fallback para OS sin consulta cargada,
// y el reconocimiento de OS en el parser usa las OS reales (DB.obrasSociales), no el
// mapa hardcodeado. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

describe('valorConsultaOS: el nomenclador manda', () => {
  it('OSDE tiene consulta en el nomenclador → usa ESE valor, no CONSULTA_VALORES', () => {
    const consultas = app.getConsultasDeOS('OSDE');
    expect(consultas.length).toBeGreaterThan(0);
    expect(app.valorConsultaOS('OSDE')).toBe(consultas[0].valOS);
    // el mapa hardcodeado puede tener un valor distinto (otro plan) — no es la fuente
    expect(app.CONSULTA_VALORES['OSDE']).not.toBe(undefined);
  });

  it('editar el valor de la consulta en el nomenclador cambia lo que devuelve valorConsultaOS', () => {
    const antes = app.valorConsultaOS('OSDE');
    const consulta = app.getConsultasDeOS('OSDE')[0];
    consulta.valOS = 999999;
    const despues = app.valorConsultaOS('OSDE');
    expect(despues).toBe(999999);
    expect(despues).not.toBe(antes);
  });

  it('SinCargo NO tiene consulta en el nomenclador → cae al fallback CONSULTA_VALORES', () => {
    expect(app.getConsultasDeOS('SinCargo').length).toBe(0);
    expect(app.valorConsultaOS('SinCargo')).toBe(app.CONSULTA_VALORES['SinCargo']);
  });

  it('OS totalmente desconocida (sin nomenclador ni mapa) usa el default 22000', () => {
    expect(app.valorConsultaOS('OSInexistenteXYZ')).toBe(22000);
  });
});

describe('normalizarOSAlias: reconoce OS reales (DB.obrasSociales), no el mapa hardcodeado', () => {
  it('reconoce una OS agregada en runtime aunque no esté en CONSULTA_VALORES', () => {
    app.DB.obrasSociales.push({ id: 9001, nombre: 'NuevaOS Test', estado: 'Activa' });
    expect(app.CONSULTA_VALORES['NuevaOS Test']).toBeUndefined();  // no está en el mapa viejo
    expect(app.getOSList()).toContain('NuevaOS Test');             // sí está en la base real
    expect(app.normalizarOSAlias('NuevaOS Test').os).toBe('NuevaOS Test');
  });

  it('una OS inactiva NO se reconoce (getOSList la excluye)', () => {
    app.DB.obrasSociales.push({ id: 9002, nombre: 'OS Dada De Baja', estado: 'Inactiva' });
    expect(app.getOSList()).not.toContain('OS Dada De Baja');
    expect(app.normalizarOSAlias('OS Dada De Baja').os).toBe('Particular');
  });

  it('sigue reconociendo las OS conocidas de siempre (OSDE, CoberMed)', () => {
    expect(app.normalizarOSAlias('OSDE').os).toBe('OSDE');
    expect(app.normalizarOSAlias('cober').os).toBe('CoberMed');
  });

  it('texto totalmente desconocido sigue cayendo en Particular', () => {
    expect(app.normalizarOSAlias('AlgoQueNoExisteJamas').os).toBe('Particular');
  });
});
