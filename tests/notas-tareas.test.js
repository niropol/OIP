// El pizarrón del dashboard pasó a ser una LISTA DE TAREAS: cada nota se puede marcar
// realizada (checkbox, queda tachada) y responder (respuestas visibles para el equipo).
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast'].forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

describe('Agregar tarea', () => {
  it('agregarNota crea una tarea con hecho:false y respuestas vacías', () => {
    setInput(window, 'nota-nueva', 'Llamar a OSDE por el padrón');
    app.agregarNota();
    const t = app.DB.notas[0];
    expect(t.texto).toBe('Llamar a OSDE por el padrón');
    expect(t.hecho).toBe(false);
    expect(Array.isArray(t.respuestas)).toBe(true);
    expect(t.fecha).toBeTruthy();
  });

  it('no agrega una tarea vacía', () => {
    setInput(window, 'nota-nueva', '   ');
    app.agregarNota();
    expect((app.DB.notas || []).length).toBe(0);
  });
});

describe('Marcar realizada', () => {
  it('toggleNotaHecha marca y desmarca', () => {
    app.DB.notas = [{ id: 1, texto: 'x', hecho: false, respuestas: [] }];
    app.toggleNotaHecha(1);
    expect(app.DB.notas[0].hecho).toBe(true);
    app.toggleNotaHecha(1);
    expect(app.DB.notas[0].hecho).toBe(false);
  });

  it('una tarea realizada NO se borra (queda tachada en el render)', () => {
    app.DB.notas = [{ id: 1, texto: 'Tarea', hecho: true, respuestas: [] }];
    app.renderNotas();
    const html = document.getElementById('notas-lista').innerHTML;
    expect(html).toContain('checkbox');
    expect(html).toContain('checked');
    expect(html).toContain('line-through');
  });
});

describe('Responder una tarea', () => {
  it('responderNota agrega una respuesta con fecha', () => {
    app.DB.notas = [{ id: 5, texto: 'Revisar factura', hecho: false, respuestas: [] }];
    app.renderNotas();                       // crea el input nota-resp-5
    setInput(window, 'nota-resp-5', 'Ya la revisé, está OK');
    app.responderNota(5);
    expect(app.DB.notas[0].respuestas.length).toBe(1);
    expect(app.DB.notas[0].respuestas[0].texto).toBe('Ya la revisé, está OK');
    expect(app.DB.notas[0].respuestas[0].fecha).toBeTruthy();
  });

  it('no agrega una respuesta vacía', () => {
    app.DB.notas = [{ id: 5, texto: 'x', hecho: false, respuestas: [] }];
    app.renderNotas();
    setInput(window, 'nota-resp-5', '   ');
    app.responderNota(5);
    expect(app.DB.notas[0].respuestas.length).toBe(0);
  });

  it('las respuestas aparecen en el render', () => {
    app.DB.notas = [{ id: 5, texto: 'x', hecho: false, respuestas: [{ texto: 'respuesta visible', fecha: '01/01' }] }];
    app.renderNotas();
    expect(document.getElementById('notas-lista').innerHTML).toContain('respuesta visible');
  });
});

describe('Redibujo no pierde lo tipeado (fix B)', () => {
  it('marcar una tarea NO borra una respuesta a medio escribir en otra', () => {
    app.DB.notas = [{ id: 1, texto: 'A', hecho: false, respuestas: [] }, { id: 2, texto: 'B', hecho: false, respuestas: [] }];
    app.renderNotas();
    document.getElementById('nota-resp-2').value = 'escribiendo una respuesta…';
    app.toggleNotaHecha(1);   // dispara renderNotas
    expect(document.getElementById('nota-resp-2').value).toBe('escribiendo una respuesta…');
  });

  it('responder vacía SOLO el input de esa tarea y preserva el de otra', () => {
    app.DB.notas = [{ id: 1, texto: 'A', hecho: false, respuestas: [] }, { id: 2, texto: 'B', hecho: false, respuestas: [] }];
    app.renderNotas();
    document.getElementById('nota-resp-1').value = 'mi respuesta';
    document.getElementById('nota-resp-2').value = 'borrador de la otra';
    app.responderNota(1);
    expect(document.getElementById('nota-resp-1').value).toBe('');            // enviada → limpia
    expect(document.getElementById('nota-resp-2').value).toBe('borrador de la otra');  // preservada
    expect(app.DB.notas.find(n => n.id === 1).respuestas.length).toBe(1);
  });
});

describe('Seguridad', () => {
  it('el texto y las respuestas se escapan (no se inyecta HTML)', () => {
    app.DB.notas = [{ id: 1, texto: '<img src=x onerror=alert(1)>', hecho: false, respuestas: [{ texto: '<b>hola</b>', fecha: '' }] }];
    app.renderNotas();
    const html = document.getElementById('notas-lista').innerHTML;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;hola');
  });
});
