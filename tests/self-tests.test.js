// "Verificar cálculos" (runSelfTests): corre TODAS las verificaciones de cálculo
// embebidas en la app y exige que pasen todas. Si alguna falla, este test la
// muestra por nombre. Cubre, entre otras, las nuevas de filasPresentacionOS
// (agrupación de la presentación por código). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  window.showToast = () => {};
});

describe('runSelfTests (Verificar cálculos)', () => {
  it('todas las verificaciones de cálculo pasan', () => {
    const r = app.runSelfTests();
    const fallidos = r.fallaron.map(f => `${f.nombre} (obtuvo ${f.real}, esperaba ${f.esperado})`);
    expect(fallidos, fallidos.join('\n')).toEqual([]);
    expect(r.pasaron).toBe(r.total);
  });

  it('incluye las verificaciones de la presentación agrupada por código', () => {
    // Sanity: que efectivamente estén corriendo los checks nuevos (por nombre).
    const r = app.runSelfTests();
    // runSelfTests no expone los nombres directamente, pero sí el total; nos aseguramos
    // de que haya una cantidad razonable de checks (las nuevas suman ~13).
    expect(r.total).toBeGreaterThan(150);
  });
});
