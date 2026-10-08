// Algunas obras sociales piden, junto con el resumen mensual, el detalle de paciente +
// N° de autorización (sobre todo de cirugías). Se puede cargar al dar de alta la atención
// o completar después (editar registro), y debe aparecer en el resumen que se envía a la
// OS (renderOSDetalle / copiarDetalleOSMail). Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window;
  resetDatos(app);
  ['initDashboard', 'renderCajaChica', 'renderAtenciones', 'closeModal', 'showToast', 'renderConfiguracion']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
  window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
  setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
  setInput(window, 'at-fecha', '2026-06-10');
  setInput(window, 'at-consultorio-sel', 'Palpa');
});

describe('Alta de atención: N° de autorización opcional', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, codigo: '20167', desc: 'Catarata c/IOL', os: 'OSDE', valOS: 1351970, valPart: 60000 },
    ];
    const sel = window.document.getElementById('at-prestacion-sel');
    sel.innerHTML = '<option>Catarata c/IOL — $1.351.970</option>';
    sel.selectedIndex = 0;
    app.AT.tipo = 'OS';
    app.AT.os = 'OSDE';
    app.AT.categoria = 'prestacion';
    setInput(window, 'at-monto', 1351970);
    setInput(window, 'at-cantidad', 1);
    setInput(window, 'at-iva-val', '0');
  });

  it('guarda paciente y N° de autorización si se cargan', () => {
    setInput(window, 'at-pac-apellido', 'Gómez');
    setInput(window, 'at-pac-nombre', 'Ana');
    setInput(window, 'at-pac-autorizacion', '778899/26');

    app.guardarAtencion();

    expect(app.DB.registros.length).toBe(1);
    const reg = app.DB.registros[0];
    expect(reg.paciente).toBe('Gómez, Ana');
    expect(reg.autorizacion).toBe('778899/26');
  });

  it('sin cargar nada de paciente/autorización, el registro se crea igual (sigue siendo opcional)', () => {
    app.guardarAtencion();
    expect(app.DB.registros.length).toBe(1);
    expect(app.DB.registros[0].autorizacion).toBeUndefined();
  });
});

describe('Editar registro: paciente y N° de autorización se pueden completar después', () => {
  it('editarRegistro precarga los campos y guardarEdicionRegistro los actualiza', () => {
    app.DB.registros.push({
      id: 500, fecha: '2026-06-10', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'OSDE', prestacion: 'Catarata c/IOL', cantidad: 1, valorUnit: 1351970, exenta: true,
      partEfectivo: 0, partEfVal: 60000, partTransf: 0, partTrVal: 60000,
    });
    app.editarRegistro(500);
    expect(window.document.getElementById('edit-reg-paciente').value).toBe('');
    expect(window.document.getElementById('edit-reg-autorizacion').value).toBe('');

    setInput(window, 'edit-reg-paciente', 'Rodríguez, Luis');
    setInput(window, 'edit-reg-autorizacion', '445566/26');
    app.guardarEdicionRegistro();

    const reg = app.DB.registros.find(r => r.id === 500);
    expect(reg.paciente).toBe('Rodríguez, Luis');
    expect(reg.autorizacion).toBe('445566/26');
  });
});

describe('renderOSDetalle: el resumen muestra paciente y N° de autorización', () => {
  it('CEMEPLA (ya sin agrupar): agrega la columna N° Autorización con el valor', () => {
    app.DB.registros.push({
      id: 1, fecha: '2026-06-05', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'CEMEPLA', prestacion: 'Consulta', cantidad: 1, valorUnit: 20000, exenta: false,
      paciente: 'Díaz, Marta', dni: '30111222', empresa: 'ACME', autorizacion: '99887766',
    });
    app.renderOSDetalle('CEMEPLA', '2026-06');
    const html = window.document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('N° Autorización');
    expect(html).toContain('99887766');
  });

  it('OS que agrupa por código (OSDE): agrega una sección aparte "Pacientes / N° de autorización" con la cirugía', () => {
    app.DB.registros.push({
      id: 2, fecha: '2026-06-12', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'OSDE', prestacion: 'Catarata c/IOL', cantidad: 1, valorUnit: 1351970, exenta: true,
      paciente: 'Suárez, Jorge', autorizacion: '112233/26',
    });
    app.renderOSDetalle('OSDE', '2026-06');
    const html = window.document.getElementById('os-detalle-panel').innerHTML;
    expect(html).toContain('Pacientes / N° de autorización');
    expect(html).toContain('Suárez, Jorge');
    expect(html).toContain('112233/26');
  });

  it('si ninguna atención tiene paciente/autorización, NO aparece la sección (no ensucia el resumen)', () => {
    app.DB.registros.push({
      id: 3, fecha: '2026-06-12', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'OSDE', prestacion: 'Consulta', cantidad: 1, valorUnit: 55679, exenta: true,
    });
    app.renderOSDetalle('OSDE', '2026-06');
    const html = window.document.getElementById('os-detalle-panel').innerHTML;
    expect(html).not.toContain('Pacientes / N° de autorización');
  });
});

describe('copiarDetalleOSMail: el texto/HTML copiado incluye paciente y N° de autorización', () => {
  function mockClipboard() {
    let capturadoHTML = '', capturadoTexto = '';
    window.ClipboardItem = undefined;  // fuerza el catch → siempre usa writeText (texto plano)
    window.navigator.clipboard = {
      writeText: (t) => { capturadoTexto = t; return Promise.resolve(); },
    };
    return () => ({ capturadoTexto });
  }

  it('OSDE (agrupado): el texto plano incluye la sección de pacientes/autorización', async () => {
    const getCaptured = mockClipboard();
    app.DB.registros.push({
      id: 4, fecha: '2026-06-15', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'OSDE', prestacion: 'Catarata c/IOL', cantidad: 1, valorUnit: 1351970, exenta: true,
      paciente: 'Fernández, Rosa', autorizacion: '556677/26',
    });
    window.showToast = () => {};
    app.copiarDetalleOSMail('OSDE', '2026-06');
    await new Promise(r => setTimeout(r, 0));
    const { capturadoTexto } = getCaptured();
    expect(capturadoTexto).toContain('PACIENTES / N° DE AUTORIZACIÓN');
    expect(capturadoTexto).toContain('Fernández, Rosa');
    expect(capturadoTexto).toContain('556677/26');
  });

  it('sin pacientes/autorización cargados, el texto plano NO incluye esa sección', async () => {
    const getCaptured = mockClipboard();
    app.DB.registros.push({
      id: 5, fecha: '2026-06-15', medico: 'Dr. Polisky, Nicolás', consultorio: 'Palpa',
      os: 'OSDE', prestacion: 'Consulta', cantidad: 1, valorUnit: 55679, exenta: true,
    });
    window.showToast = () => {};
    app.copiarDetalleOSMail('OSDE', '2026-06');
    await new Promise(r => setTimeout(r, 0));
    const { capturadoTexto } = getCaptured();
    expect(capturadoTexto).not.toContain('PACIENTES / N° DE AUTORIZACIÓN');
  });
});
