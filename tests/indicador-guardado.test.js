// Mejora de visibilidad: el botón "Guardar" de la topbar (#btn-guardar-nube) antes
// mostraba el MISMO estado naranja "pendiente" tanto para "recién escribiste algo"
// como para "el último guardado falló hace rato" — no había forma de distinguir un
// problema real de un cambio normal sin guardar todavía. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window, btn;

function mockSb({ falla = false } = {}) {
  return {
    from() {
      return {
        upsert: () => Promise.resolve({ error: falla ? new Error('fail') : null }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
  };
}

beforeEach(async () => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  await new Promise(r => setTimeout(r, 0));  // dejar correr arranque() (modo DEV) antes de pisar sb
  app.__setAutosaveActivo(false);  // control manual: llamamos guardarEnNube() nosotros
  app.__setDatosCargados(true);
  btn = window.document.getElementById('btn-guardar-nube');
});

describe('marcarCambios: estado "pendiente" (naranja)', () => {
  it('un cambio normal deja el botón en pendiente, texto "Guardar cambios"', () => {
    app.marcarCambios('registros');
    expect(btn.classList.contains('pendiente')).toBe(true);
    expect(btn.classList.contains('error')).toBe(false);
    expect(btn.textContent).toBe('💾 Guardar cambios');
  });
});

describe('guardarEnNube: éxito → estado "ok" con hora del último guardado', () => {
  it('guarda bien: sin pendiente ni error, tooltip con la hora', async () => {
    app.__setSb(mockSb({ falla: false }));
    app.DB.registros.push({ id: 1, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    app.marcarCambios('registros');
    await app.guardarEnNube();
    expect(btn.classList.contains('pendiente')).toBe(false);
    expect(btn.classList.contains('error')).toBe(false);
    expect(btn.title).toContain('último');
  });
});

describe('guardarEnNube: falla → estado "error" (rojo), distinto de "pendiente"', () => {
  it('el botón queda en rojo con su propio texto/tooltip, no confundible con "pendiente"', async () => {
    app.__setSb(mockSb({ falla: true }));
    app.DB.registros.push({ id: 2, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    app.marcarCambios('registros');
    await app.guardarEnNube();
    expect(btn.classList.contains('error')).toBe(true);
    expect(btn.classList.contains('pendiente')).toBe(false);
    expect(btn.textContent).toBe('⚠️ No guardado');
    expect(btn.title.toLowerCase()).toContain('falló');
  });

  it('un cambio nuevo DESPUÉS de un error no lo tapa con el naranja genérico', async () => {
    app.__setSb(mockSb({ falla: true }));
    app.DB.registros.push({ id: 3, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    app.marcarCambios('registros');
    await app.guardarEnNube();
    expect(btn.classList.contains('error')).toBe(true);

    // el usuario sigue trabajando; se marca otro cambio
    app.DB.registros.push({ id: 4, os: 'IOMA', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    app.marcarCambios('registros');
    expect(btn.classList.contains('error')).toBe(true);      // sigue en rojo
    expect(btn.classList.contains('pendiente')).toBe(false);  // no lo pisó el naranja
  });

  it('un guardado exitoso posterior SÍ limpia el estado de error', async () => {
    app.__setSb(mockSb({ falla: true }));
    app.DB.registros.push({ id: 5, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    app.marcarCambios('registros');
    await app.guardarEnNube();
    expect(btn.classList.contains('error')).toBe(true);

    app.__setSb(mockSb({ falla: false }));
    await app.guardarEnNube();
    expect(btn.classList.contains('error')).toBe(false);
    expect(btn.classList.contains('pendiente')).toBe(false);
  });
});
