// Los desplegables aparecen en orden alfabético: OS por nombre, médicos por apellido.
// (Consultorios se dejan en su orden natural a propósito: alfabético pondría "Extra" primero
//  como sede por defecto del modal de atención, que sería un default equivocado.)
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => { const h = loadApp(); app = h.app; resetDatos(app); });

describe('Orden alfabético de desplegables', () => {
  it('cmpAlfa: insensible a acentos y con orden natural de números', () => {
    expect(app.cmpAlfa('á', 'b')).toBeLessThan(0);
    expect(app.cmpAlfa('Plan 90', 'Plan 100')).toBeLessThan(0);  // natural, no "100" antes de "90"
  });

  it('getOSList devuelve las OS en orden alfabético', () => {
    const lista = app.getOSList();
    const ordenada = [...lista].sort(app.cmpAlfa);
    expect(lista).toEqual(ordenada);
  });

  it('optionsMedicos ordena por apellido (sin Dr./Dra.)', () => {
    const html = app.optionsMedicos();
    // Extraer los nombres en el orden en que aparecen las <option>
    const nombres = [...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
    const apellidos = nombres.map(app.soloApellido);
    const ordenados = [...apellidos].sort(app.cmpAlfa);
    expect(apellidos).toEqual(ordenados);
  });
});
