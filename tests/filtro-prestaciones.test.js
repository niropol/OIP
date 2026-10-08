// Tests del filtro por letra en los desplegables de prestaciones (Atención rápida,
// Pago de derivación, y las filas de Carga masiva). No toca value/data-*: solo oculta
// <option> no coincidentes. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

describe('filtrarOpcionesSelect (helper genérico)', () => {
  function selectConOpciones(textos) {
    const sel = window.document.createElement('select');
    textos.forEach(t => { const o = window.document.createElement('option'); o.text = t; sel.appendChild(o); });
    return sel;
  }

  it('oculta las opciones que no contienen el texto buscado', () => {
    const sel = selectConOpciones(['[20167] Catarata c/IOL', '[20502] Iridotomía', '[300102] Campo visual']);
    app.filtrarOpcionesSelect(sel, 'campo');
    const visibles = [...sel.options].filter(o => o.style.display !== 'none').map(o => o.text);
    expect(visibles).toEqual(['[300102] Campo visual']);
  });

  it('es insensible a mayúsculas y acentos', () => {
    const sel = selectConOpciones(['OCT tomografía coherencia óptica', 'Ecografía ocular']);
    app.filtrarOpcionesSelect(sel, 'ECOGRAFIA');
    const visibles = [...sel.options].filter(o => o.style.display !== 'none').map(o => o.text);
    expect(visibles).toEqual(['Ecografía ocular']);
  });

  it('filtra por código además de por descripción', () => {
    const sel = selectConOpciones(['[20167] Catarata c/IOL', '[20502] Iridotomía']);
    app.filtrarOpcionesSelect(sel, '20502');
    const visibles = [...sel.options].filter(o => o.style.display !== 'none').map(o => o.text);
    expect(visibles).toEqual(['[20502] Iridotomía']);
  });

  it('con texto vacío muestra todas las opciones', () => {
    const sel = selectConOpciones(['A', 'B', 'C']);
    app.filtrarOpcionesSelect(sel, 'a');
    app.filtrarOpcionesSelect(sel, '');
    const visibles = [...sel.options].filter(o => o.style.display !== 'none').map(o => o.text);
    expect(visibles).toEqual(['A', 'B', 'C']);
  });

  it('no toca value ni data-* de las opciones', () => {
    const sel = window.document.createElement('select');
    const o = window.document.createElement('option');
    o.text = 'Catarata'; o.value = '285'; o.setAttribute('data-val', '1351970');
    sel.appendChild(o);
    app.filtrarOpcionesSelect(sel, 'nada-que-matchee');
    expect(o.value).toBe('285');
    expect(o.getAttribute('data-val')).toBe('1351970');
  });
});

describe('Atención rápida: filtro sobre at-prestacion-sel', () => {
  it('el input de filtro existe y filtra el select en vivo', () => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 1351970, valPart: 60000 },
      { id: 2, os: 'OSDE', codigo: '20502', desc: 'Iridotomía láser', valOS: 180000, valPart: 60000 },
    ];
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    app.atSelTipo('OS'); app.atSelOS('OSDE'); app.atSelCategoria('prestacion');

    const filtro = window.document.getElementById('at-prest-filtro');
    expect(filtro).toBeTruthy();
    filtro.value = 'irido';
    filtro.dispatchEvent(new window.Event('input'));

    const opts = [...window.document.getElementById('at-prestacion-sel').options];
    const visibles = opts.filter(o => o.style.display !== 'none').map(o => o.text);
    expect(visibles.length).toBe(1);
    expect(visibles[0]).toContain('Iridotomía');
  });

  it('cambiar de categoría limpia el filtro (no queda desincronizado)', () => {
    app.DB.prestaciones = [{ id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 1351970, valPart: 60000 }];
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    app.atSelTipo('OS'); app.atSelOS('OSDE'); app.atSelCategoria('prestacion');
    setInput(window, 'at-prest-filtro', 'catarata');
    app.atSelCategoria('consulta');
    expect(window.document.getElementById('at-prest-filtro').value).toBe('');
  });
});

describe('Pago de derivación: filtro sobre pago-deriv-prest', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, os: 'OSDE', codigo: '20167', desc: 'Catarata c/IOL', valOS: 1351970, valPart: 60000 },
      { id: 2, os: 'OSDE', codigo: '20502', desc: 'Iridotomía láser', valOS: 180000, valPart: 60000 },
    ];
    app.DB.derivaciones.push({ id: 8000, fecha: '2026-06-01', consultorio: 'Palpa', paciente: 'Test',
      medico: 'Dr. Polisky, Nicolás', os: 'OSDE', cirugia: 'Catarata', ojo: 'OD', estado: 'Programada', pagos: [] });
  });

  it('el input de filtro existe y filtra el select', () => {
    app.abrirPagoDerivacion(8000);
    const filtro = window.document.getElementById('pago-deriv-prest-filtro');
    expect(filtro).toBeTruthy();
    filtro.value = 'irido';
    filtro.dispatchEvent(new window.Event('input'));
    const opts = [...window.document.getElementById('pago-deriv-prest').options];
    const visibles = opts.filter(o => o.style.display !== 'none' && o.value !== '').map(o => o.text);
    expect(visibles.length).toBe(1);
    expect(visibles[0]).toContain('Iridotomía');
  });

  it('reabrir el modal limpia el filtro de la vez anterior', () => {
    app.abrirPagoDerivacion(8000);
    setInput(window, 'pago-deriv-prest-filtro', 'catarata');
    app.abrirPagoDerivacion(8000);
    expect(window.document.getElementById('pago-deriv-prest-filtro').value).toBe('');
  });
});

describe('Carga masiva: filtro por fila en .cm-prest-sel', () => {
  it('cada fila de consultas tiene su propio input de filtro que filtra SOLO esa fila', () => {
    app.agregarFilaConsulta();
    app.agregarFilaConsulta();
    const filtros = [...window.document.querySelectorAll('.cm-prest-filtro')];
    expect(filtros.length).toBe(2);
    // filtrar solo la primera fila no debe afectar la segunda
    filtros[0].value = 'zzz-no-matchea-nada';
    filtros[0].dispatchEvent(new window.Event('input'));
    const selects = [...window.document.querySelectorAll('.cm-prest-sel')];
    const visiblesFila1 = [...selects[0].options].filter(o => o.style.display !== 'none');
    const visiblesFila2 = [...selects[1].options].filter(o => o.style.display !== 'none');
    expect(visiblesFila1.length).toBe(0);
    expect(visiblesFila2.length).toBeGreaterThan(0);
  });

  it('cambiar la OS de una fila de consulta limpia su filtro', () => {
    app.agregarFilaConsulta();
    const row = window.document.querySelector('#cm-consultas-tbody tr');
    const filtro = row.querySelector('.cm-prest-filtro');
    filtro.value = 'algo';
    const osSel = row.querySelector('select');
    app.onCMConsultaOSChange(osSel, row.id);
    expect(filtro.value).toBe('');
  });

  it('cada fila de prestaciones/cirugías también tiene su input de filtro', () => {
    app.agregarFilaPrestacion();
    const filtro = window.document.querySelector('#cm-prest-tbody .cm-prest-filtro');
    expect(filtro).toBeTruthy();
  });

  it('cambiar la OS de una fila de prestación limpia su filtro', () => {
    app.agregarFilaPrestacion();
    const row = window.document.querySelector('#cm-prest-tbody tr');
    const filtro = row.querySelector('.cm-prest-filtro');
    filtro.value = 'algo';
    const osSel = row.querySelector('select');
    app.onCMPrestOSChange(osSel, row.id);
    expect(filtro.value).toBe('');
  });
});
