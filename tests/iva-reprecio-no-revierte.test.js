// BUG (2 meses, 2 OS): una atención marcada GRAVADA a mano aparecía EXENTA a fin de mes.
// Causa: al actualizar precios, el reprecio "arrastraba" el IVA usando el DEFAULT de la OS
// (casi todas exentas) cuando el nomenclador no definía el IVA de esa prestación → revertía la
// marca manual. Fix: el reprecio solo arrastra el IVA si el CONTRATO lo define explícito.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
const OS = 'DoctorRed';   // default exenta (no está en OS_GRAVADAS_SIEMPRE)
beforeEach(() => { app = loadApp().app; resetDatos(app); });

function regGravada() {
  return { id: 10, os: OS, codigo: '420101', prestacion: 'Consulta', plan: '', fecha: '2026-08-05', cantidad: 1, valorUnit: 20000, exenta: false };
}

describe('El reprecio NO revierte la marca de IVA de la atención', () => {
  it('atención GRAVADA + nomenclador sin IVA explícito → sigue GRAVADA tras repreciar', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420101', desc: 'Consulta', os: OS, valOS: 22000 }]; // sin p.exenta
    app.DB.registros = [regGravada()];
    app._repreciarRegistros('2026-08-01', OS);
    expect(app.DB.registros[0].exenta).toBe(false);    // NO se revirtió a exenta
    expect(app.DB.registros[0].valorUnit).toBe(22000); // el PRECIO sí se actualizó
  });

  it('y la presentación de fin de mes la muestra GRAVADA (no exenta)', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420101', desc: 'Consulta', os: OS, valOS: 22000 }];
    app.DB.registros = [regGravada()];
    app._repreciarRegistros('2026-08-01', OS);
    const filas = app.filasPresentacionOS(app.DB.registros, OS);
    expect(filas.length).toBe(1);
    expect(filas[0].exenta).toBe(false);
    expect(filas[0].iva).toBeGreaterThan(0);   // gravada → tiene IVA
  });
});

describe('El reprecio NUNCA cambia el IVA, ni con contrato explícito', () => {
  // El IVA de la atención lo decide el usuario. Aunque el nomenclador diga otra cosa, actualizar
  // precios NO lo toca. Si hay que cambiar el IVA, lo hace el usuario (toggle o editando).
  it('contrato dice EXENTA pero la atención está GRAVADA → sigue GRAVADA', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420101', desc: 'Consulta', os: OS, valOS: 22000, exenta: true }];
    app.DB.registros = [regGravada()];   // gravada a mano
    app._repreciarRegistros('2026-08-01', OS);
    expect(app.DB.registros[0].exenta).toBe(false);   // NO se movió
    expect(app.DB.registros[0].valorUnit).toBe(22000); // el precio sí
  });

  it('contrato dice GRAVADA pero la atención está EXENTA → sigue EXENTA', () => {
    app.DB.prestaciones = [{ id: 1, codigo: '420101', desc: 'Consulta', os: OS, valOS: 22000, exenta: false }];
    app.DB.registros = [{ ...regGravada(), exenta: true }];   // exenta a mano
    app._repreciarRegistros('2026-08-01', OS);
    expect(app.DB.registros[0].exenta).toBe(true);    // NO se movió
  });
});
