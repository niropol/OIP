// Decisión del dueño: sacar los precios hardcodeados del código, dejando SOLO OSDE como base.
// La nube es la única fuente de precios; el resto de los nomencladores se cargan desde ahí.
// Este test fija esa decisión para que nadie vuelva a meter precios de otras OS en el código.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

describe('Semilla del código: solo OSDE (el resto viene de la nube)', () => {
  it('DB.prestaciones semilla trae únicamente filas de OSDE', () => {
    const osUnicas = [...new Set(app.DB.prestaciones.map(p => p.os))];
    expect(osUnicas).toEqual(['OSDE']);
    expect(app.DB.prestaciones.length).toBeGreaterThan(0);   // sigue habiendo base
  });

  it('CONSULTA_VALORES no lleva precios negociados de OS (solo OSDE + estructurales)', () => {
    const claves = Object.keys(app.CONSULTA_VALORES).sort();
    expect(claves).toEqual(['OSDE', 'Particular', 'SinCargo'].sort());
    // ninguna OS negociada quedó hardcodeada
    ['IOMA', 'Medifé', 'DoctorRed', 'Sancor', 'AMFFA', 'ASMEPRIV', 'BAPRO',
     'Medicus', 'CMP', 'CoberMed', 'Bristol', 'SAMI', 'CEMEPLA', 'Luis Pasteur']
      .forEach(os => expect(app.CONSULTA_VALORES[os]).toBeUndefined());
  });

  it('la app sigue conociendo TODAS las OS (obrasSociales) aunque no tengan precios en el código', () => {
    // La lista de OS y su config (IVA, contacto…) NO son precios: se conservan como base.
    const lista = app.getOSList();  // getOSList excluye 'Particular' a propósito
    ['OSDE', 'IOMA', 'CoberMed', 'Bristol', 'CEMEPLA', 'AMFFA', 'Medicus'].forEach(os =>
      expect(lista).toContain(os));
  });

  it('una OS sin su consulta en el nomenclador cae al fallback 22000 (no rompe)', () => {
    expect(app.getConsultasDeOS('Medicus').length).toBe(0);   // ya no está hardcodeada
    expect(app.valorConsultaOS('Medicus')).toBe(22000);       // fallback seguro
  });

  it('OSDE conserva su nomenclador como base', () => {
    expect(app.getConsultasDeOS('OSDE').length).toBeGreaterThan(0);
    expect(app.valorConsultaOS('OSDE')).toBe(app.getConsultasDeOS('OSDE')[0].valOS);
  });
});
