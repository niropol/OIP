// "Restaurar desde backup" (Configuración → Datos y respaldo): completa el círculo del
// backup JSON — antes se podía descargar pero no había forma de volver a cargarlo. Es
// destructivo (reemplaza TODOS los datos), así que valida el archivo y pide confirmación
// explícita antes de tocar nada. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
});

function inputConArchivo(window, contenido, nombre = 'backup.json') {
  const input = window.document.createElement('input');
  input.type = 'file';
  const file = new window.File([contenido], nombre, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return input;
}

function esperarToast(window) {
  return new Promise(resolve => { window.showToast = (msg) => resolve(msg); });
}

describe('importarBackupJSON: valida el archivo antes de tocar nada', () => {
  it('rechaza un archivo que no es JSON válido', async () => {
    const input = inputConArchivo(window, 'esto no es json {{{');
    const p = esperarToast(window);
    app.importarBackupJSON(input);
    const msg = await p;
    expect(msg).toContain('no es un JSON válido');
  });

  it('rechaza un JSON que no tiene la forma de un backup de OIP', async () => {
    const input = inputConArchivo(window, JSON.stringify({ foo: 1 }));
    const p = esperarToast(window);
    app.importarBackupJSON(input);
    const msg = await p;
    expect(msg).toContain('no es un backup de OIP válido');
  });

  it('un archivo inválido NO toca los datos actuales', async () => {
    app.DB.registros.push({ id: 999, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    const input = inputConArchivo(window, JSON.stringify({ foo: 1 }));
    const p = esperarToast(window);
    app.importarBackupJSON(input);
    await p;
    expect(app.DB.registros.some(r => r.id === 999)).toBe(true);
  });
});

describe('importarBackupJSON: pide confirmación antes de reemplazar', () => {
  function backupValido() {
    return JSON.stringify({
      app: 'OIP', version: 1, fecha: '2026-06-01T10:00:00.000Z',
      DB: { ...app.DB, registros: [{ id: 4242, os: 'OSDE', fecha: '2026-05-01', medico: 'Dr. Restaurado', cantidad: 1, valorUnit: 100, partEfectivo: 0, partTransf: 0 }] },
    });
  }

  it('si el usuario cancela la confirmación, NO se toca DB', async () => {
    app.DB.registros.push({ id: 1, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    window.confirm = () => false;
    const input = inputConArchivo(window, backupValido());
    app.importarBackupJSON(input);
    await new Promise(r => setTimeout(r, 10));
    expect(app.DB.registros.some(r => r.id === 4242)).toBe(false);
    expect(app.DB.registros.some(r => r.id === 1)).toBe(true);
  });

  it('si el usuario confirma, DB se reemplaza por el contenido del backup', async () => {
    app.DB.registros.push({ id: 1, os: 'OSDE', fecha: '2026-06-01', cantidad: 1, valorUnit: 100 });
    window.confirm = () => true;
    const input = inputConArchivo(window, backupValido());
    const p = esperarToast(window);
    app.importarBackupJSON(input);
    const msg = await p;
    expect(msg).toContain('Backup restaurado');
    expect(app.DB.registros.some(r => r.id === 4242)).toBe(true);
    expect(app.DB.registros.some(r => r.id === 1)).toBe(false);  // lo viejo, reemplazado
    expect(app.DB.registros.find(r => r.id === 4242).medico).toBe('Dr. Restaurado');
  });

  it('tras confirmar, restaura TODAS las colecciones del backup, no solo registros', async () => {
    window.confirm = () => true;
    const backup = JSON.parse(backupValido());
    backup.DB.movimientos = [{ id: 5, fecha: '2026-05-01', desc: 'x', consultorio: 'General', tipo: 'Ingreso', monto: 777 }];
    backup.DB.config = { ...app.DB.config, honorarioOS: 99999 };
    const input = inputConArchivo(window, JSON.stringify(backup));
    const p = esperarToast(window);
    app.importarBackupJSON(input);
    await p;
    expect(app.DB.movimientos.some(m => m.id === 5)).toBe(true);
    expect(app.DB.config.honorarioOS).toBe(99999);
  });
});
