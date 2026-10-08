// Pizarrón de notas del dashboard: notas compartidas entre usuarios (DB.notas se
// sincroniza como cualquier colección), agregables/borrables, con texto SIEMPRE
// escapado (es texto libre del usuario). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  window.showToast = () => {};
});

describe('agregarNota / eliminarNota', () => {
  it('agrega la nota a DB.notas con id, texto y fecha, y limpia el input', () => {
    setInput(window, 'nota-nueva', 'Llamar a OSDE por la factura de junio');
    app.agregarNota();
    expect(app.DB.notas.length).toBe(1);
    const n = app.DB.notas[0];
    expect(n.texto).toBe('Llamar a OSDE por la factura de junio');
    expect(n.id).toBeGreaterThan(0);
    expect(n.fecha).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(document.getElementById('nota-nueva').value).toBe('');
  });

  it('no agrega notas vacías (ni de solo espacios)', () => {
    setInput(window, 'nota-nueva', '   ');
    app.agregarNota();
    expect(app.DB.notas.length).toBe(0);
  });

  it('la nota aparece en el pizarrón y eliminarNota la saca', () => {
    setInput(window, 'nota-nueva', 'Nota de prueba XYZ');
    app.agregarNota();
    expect(document.getElementById('notas-lista').innerHTML).toContain('Nota de prueba XYZ');
    const id = app.DB.notas[0].id;
    app.eliminarNota(id);
    expect(app.DB.notas.length).toBe(0);
    expect(document.getElementById('notas-lista').innerHTML).not.toContain('Nota de prueba XYZ');
  });

  it('las notas nuevas quedan primeras (unshift)', () => {
    setInput(window, 'nota-nueva', 'primera');
    app.agregarNota();
    setInput(window, 'nota-nueva', 'segunda');
    app.agregarNota();
    expect(app.DB.notas[0].texto).toBe('segunda');
  });
});

describe('Seguridad y sincronización', () => {
  it('el texto se escapa: una nota con HTML no inyecta elementos', () => {
    setInput(window, 'nota-nueva', '<img src=x onerror="window.__hacked=1"> <b>hola</b>');
    app.agregarNota();
    const cont = document.getElementById('notas-lista');
    expect(cont.querySelector('img')).toBeNull();
    expect(cont.querySelector('b')).toBeNull();
    expect(cont.innerHTML).toContain('&lt;img');
    expect(window.__hacked).toBeUndefined();
  });

  it('initDashboard renderiza el pizarrón (visible al abrir la app)', () => {
    app.DB.notas.push({ id: 1, texto: 'Nota persistida', fecha: '02/07 10:00' });
    app.initDashboard();
    expect(document.getElementById('notas-lista').innerHTML).toContain('Nota persistida');
  });

  it('agregar y borrar marcan la colección como pendiente de guardar (marcarCambios)', () => {
    // El botón de guardar pasa a "pendiente" cuando marcarCambios corre — proxy observable
    const btn = document.getElementById('btn-guardar-nube');
    btn.classList.remove('pendiente');
    setInput(window, 'nota-nueva', 'sync test');
    app.agregarNota();
    expect(btn.classList.contains('pendiente')).toBe(true);
  });

  it('el export a Excel incluye la hoja Notas', () => {
    setInput(window, 'nota-nueva', 'nota exportable');
    app.agregarNota();
    const data = app.construirDatosExportacion();
    expect(data['Notas']).toBeDefined();
    expect(data['Notas'][0].Nota).toBe('nota exportable');
  });
});
