// Unir prestaciones que son la misma con distinta grafía (mayúsculas/espacios). Sobrevive UN
// nombre (el del catálogo, con el valor MÁS ALTO); las atenciones se renombran y se les completa
// el código faltante. El valorUnit ya cargado en cada atención NO se toca (precio histórico).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { app = loadApp().app; resetDatos(app); });

describe('unirPrestacionesDuplicadas', () => {
  it('caso Medifé real: "Consulta vestida" (sin código) + "Consulta Vestida" (con código)', () => {
    app.DB.prestaciones = [
      { id: 1, os: 'Medifé', codigo: '7- 423023', desc: 'Consulta Vestida', valOS: 25784.2, exenta: true },
    ];
    app.DB.registros = [
      { id: 10, os: 'Medifé', prestacion: 'Consulta vestida', codigo: '', fecha: '2026-06-01', valorUnit: 25784.2, exenta: true },
      { id: 11, os: 'Medifé', prestacion: 'Consulta vestida', codigo: '', fecha: '2026-06-02', valorUnit: 25784.2, exenta: true },
      { id: 12, os: 'Medifé', prestacion: 'Consulta Vestida', codigo: '7- 423023', fecha: '2026-06-03', valorUnit: 25784.2, exenta: true },
    ];
    const grupos = app._gruposPrestacionesDuplicadas();
    expect(grupos.length).toBe(1);
    expect(grupos[0].survName).toBe('Consulta Vestida');   // la del catálogo (con código)

    app.unirPrestacionesDuplicadas();
    // Todas las atenciones quedan con el mismo nombre canónico
    const nombres = new Set(app.DB.registros.map(r => r.prestacion));
    expect([...nombres]).toEqual(['Consulta Vestida']);
    // A las que no tenían código se les completó
    expect(app.DB.registros.filter(r => r.codigo === '7- 423023').length).toBe(3);
    // El precio de cada atención NO se tocó
    expect(app.DB.registros.every(r => r.valorUnit === 25784.2)).toBe(true);
    // El catálogo sigue con una sola entrada
    expect(app.DB.prestaciones.length).toBe(1);
  });

  it('dos entradas de catálogo con valores distintos → sobrevive el valor MÁS ALTO', () => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '420101', desc: 'Consulta', valOS: 40000 },
      { id: 2, os: 'OSDE', codigo: '420101', desc: 'consulta', valOS: 55000 },   // misma, más cara, minúscula
    ];
    app.DB.registros = [
      { id: 10, os: 'OSDE', prestacion: 'consulta', codigo: '420101', fecha: '2026-08-01', valorUnit: 55000 },
    ];
    app.unirPrestacionesDuplicadas();
    expect(app.DB.prestaciones.length).toBe(1);               // una sobrevive
    expect(app.DB.prestaciones[0].valOS).toBe(55000);         // el valor MÁS ALTO
  });

  it('no hace nada si no hay duplicados por nombre', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '420101', desc: 'Consulta', valOS: 40000 }];
    app.DB.registros = [{ id: 10, os: 'OSDE', prestacion: 'Consulta', codigo: '420101', fecha: '2026-08-01', valorUnit: 40000 }];
    expect(app._gruposPrestacionesDuplicadas().length).toBe(0);
    app.unirPrestacionesDuplicadas();
    expect(app.DB.registros[0].prestacion).toBe('Consulta');
  });

  it('duplicado solo en atenciones (sin catálogo): sobrevive la grafía más usada', () => {
    app.DB.prestaciones = [];
    app.DB.registros = [
      { id: 10, os: 'SAMI', prestacion: 'Campo visual', codigo: '', fecha: '2026-08-01', valorUnit: 10000 },
      { id: 11, os: 'SAMI', prestacion: 'Campo visual', codigo: '', fecha: '2026-08-02', valorUnit: 10000 },
      { id: 12, os: 'SAMI', prestacion: 'campo VISUAL', codigo: '', fecha: '2026-08-03', valorUnit: 10000 },
    ];
    app.unirPrestacionesDuplicadas();
    expect(new Set(app.DB.registros.map(r => r.prestacion))).toEqual(new Set(['Campo visual']));
  });

  it('NO junta prestaciones realmente distintas (planes diferentes)', () => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '420162', desc: 'Consulta (Plan 210)', valOS: 40000 },
      { id: 2, os: 'OSDE', codigo: '420162', desc: 'Consulta (Plan 510)', valOS: 60000 },
    ];
    app.DB.registros = [];
    expect(app._gruposPrestacionesDuplicadas().length).toBe(0);   // nombres distintos → no se tocan
  });
});
