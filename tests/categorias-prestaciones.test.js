// Clasificación en 3 categorías: Consultas / Estudios / Prácticas (pedido del usuario,
// base para pagar al médico por práctica). Fuente única categoriaDesc/categoriaPrestacion/
// categoriaReg en calculos.js; reconocimiento automático al importar contratos con
// selector por fila para las dudas; filtros por categoría en Atención rápida; la
// categoría queda CONGELADA en cada registro. Contra el código actual.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos, setInput } from './harness.js';

let app, window, document;
beforeEach(() => {
  const h = loadApp();
  app = h.app; window = h.window; document = window.document;
  resetDatos(app);
  ['showToast', 'closeModal', 'initDashboard', 'renderCajaChica', 'renderAtenciones', 'renderConfiguracion']
    .forEach(fn => { if (typeof window[fn] === 'function') window[fn] = () => {}; });
});

describe('categoriaDesc: reconocimiento por palabras clave (lista del usuario)', () => {
  const ESTUDIOS = [
    // primera tanda
    'Topografía corneal', 'OCT macular', 'Tomografía de coherencia óptica', 'Campo visual computarizado',
    'Paquimetría ultrasónica', 'Estudio de superficie ocular', 'IOL Master', 'Recuento endotelial',
    'Pentacam', 'Ultrabiomicroscopía', 'UBM de segmento anterior', 'Campimetría',
    'HRT de papila', 'Ecografía ocular', 'Ecometría', 'Interferometría', 'RFG',
    'Angiografía con fluoresceína', 'Papilografía',
    // segunda tanda (2026-07)
    'Test de Schirmer', 'PAM test', 'Autorrefractometría', 'Autorefractometria simple', 'ARM',
    'Ejercicios ortópticos por sesión', 'Oftalmoscopia indirecta binocular', 'OBI',
    'Fondo de ojo', 'Fondo de ojos', 'Electrorretinograma', 'Electroretinograma',
    'Microscopía especular computarizada', 'Curva tensional bilateral', 'Curvas tensionales',
    'Curva de tensiones diaria', 'Retinografía digital', 'Potencial evocado visual',
    'Potenciales evocados visuales', 'Iconografía', 'Iconografia (por presupuesto)',
  ];
  it('reconoce como ESTUDIO cada palabra clave definida (con y sin tildes)', () => {
    ESTUDIOS.forEach(desc => {
      expect(app.categoriaDesc(desc), desc).toBe('estudio');
    });
  });

  it('TODAS las palabras/tokens de las listas fuente clasifican como estudio', () => {
    [...app.ESTUDIO_KEYWORDS, ...app.ESTUDIO_TOKENS].forEach(kw => {
      expect(app.categoriaDesc(kw), kw).toBe('estudio');
    });
  });

  it('consultas y cirugías no caen en estudio', () => {
    expect(app.categoriaDesc('Consulta (Plan 510)')).toBe('consulta');
    expect(app.categoriaDesc('Catarata / facoemulsificación c/IOL')).toBe('practica');
    expect(app.categoriaDesc('Iridotomía Láser unilateral')).toBe('practica');
    // tokens cortos con borde de palabra: no matchean adentro de otras palabras
    expect(app.categoriaDesc('Doctorado')).toBe('practica');           // 'oct'
    expect(app.categoriaDesc('Armazón de prueba')).toBe('practica');   // 'arm'
    expect(app.categoriaDesc('Curvatura corneal')).toBe('practica');   // 'curva'
    expect(app.categoriaDesc('Lente intraocular')).toBe('practica');
  });
});

describe('Import de contrato: detección automática + selector por fila (pregunta las dudas)', () => {
  it('el preview trae un select de categoría por fila, preseleccionado por detección', () => {
    const rows = [
      { codigo: '1', desc: 'Consulta oftalmológica', valor: 20000, exenta: true, incluir: true, categoria: app.categoriaDesc('Consulta oftalmológica') },
      { codigo: '2', desc: 'OCT macular', valor: 30000, exenta: true, incluir: true, categoria: app.categoriaDesc('OCT macular') },
      { codigo: '3', desc: 'Catarata c/IOL', valor: 900000, exenta: true, incluir: true, categoria: app.categoriaDesc('Catarata c/IOL') },
    ];
    window._mostrarPreviewContrato(rows, 'OSDE', '2026-08');
    const selects = [...document.querySelectorAll('#contrato-preview-tbody select')];
    expect(selects.length).toBe(3);
    expect(selects[0].value).toBe('consulta');
    expect(selects[1].value).toBe('estudio');
    expect(selects[2].value).toBe('practica');
  });

  it('una fila que no matchea nada queda marcada como dudosa (⚠️) para que el usuario confirme', () => {
    const rows = [
      { codigo: '9', desc: 'Módulo especial XYZ', valor: 5000, exenta: true, incluir: true, categoria: app.categoriaDesc('Módulo especial XYZ') },
    ];
    window._mostrarPreviewContrato(rows, 'OSDE', '2026-08');
    const html = document.getElementById('contrato-preview-tbody').innerHTML;
    expect(html).toContain('⚠️');
    expect(document.getElementById('contrato-preview-stats').innerHTML).toContain('dudosa');
  });

  it('confirmarImportContrato guarda la categoría elegida en cada prestación', () => {
    window._contratoPreview = {
      os: 'OSDE', vigencia: '2026-08',
      rows: [
        { codigo: '2', desc: 'OCT macular', valor: 30000, exenta: true, incluir: true, categoria: 'estudio' },
        { codigo: '3', desc: 'Catarata c/IOL', valor: 900000, exenta: true, incluir: true, categoria: 'practica' },
      ],
    };
    window.confirm = (msg) => !/¿Reemplazar/.test(msg);  // agregar (no reemplazar) + confirmar el cambio
    app.confirmarImportContrato();
    const oct = app.DB.prestaciones.find(p => p.desc === 'OCT macular' && p.os === 'OSDE');
    const cat = app.DB.prestaciones.find(p => p.desc === 'Catarata c/IOL' && p.os === 'OSDE' && p.categoria);
    expect(oct.categoria).toBe('estudio');
    expect(cat.categoria).toBe('practica');
  });
});

describe('Atención rápida: 3 categorías filtran el desplegable y la categoría se congela', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, codigo: '420162', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679, valPart: 60000 },
      { id: 2, codigo: '20167',  desc: 'Catarata c/IOL',      os: 'OSDE', valOS: 900000, valPart: 60000 },
      { id: 3, codigo: '30010',  desc: 'OCT macular',         os: 'OSDE', valOS: 30000,  valPart: 60000 },
      { id: 4, codigo: '30020',  desc: 'Rareza sin keywords', os: 'OSDE', valOS: 10000,  valPart: 60000, categoria: 'estudio' },
    ];
    window.document.getElementById('at-medico-sel').innerHTML = '<option>Dr. Polisky, Nicolás</option>';
    setInput(window, 'at-medico-sel', 'Dr. Polisky, Nicolás');
    setInput(window, 'at-fecha', '2026-06-10');
    setInput(window, 'at-consultorio-sel', 'Palpa');
    app.atSelTipo('OS'); app.atSelOS('OSDE');
  });

  function textosDelSelect() {
    return [...document.getElementById('at-prestacion-sel').options].map(o => o.text);
  }

  it("'estudio' lista solo estudios (detectados + override)", () => {
    app.atSelCategoria('estudio');
    const t = textosDelSelect();
    expect(t.some(x => x.includes('OCT macular'))).toBe(true);
    expect(t.some(x => x.includes('Rareza'))).toBe(true);   // override categoria:'estudio'
    expect(t.some(x => x.includes('Catarata'))).toBe(false);
    expect(t.some(x => x.includes('Consulta'))).toBe(false);
  });

  it("'practica' lista solo prácticas", () => {
    app.atSelCategoria('practica');
    const t = textosDelSelect();
    expect(t.some(x => x.includes('Catarata'))).toBe(true);
    expect(t.some(x => x.includes('OCT'))).toBe(false);
  });

  it("'prestacion' (alias viejo) sigue funcionando: estudios + prácticas juntos", () => {
    app.atSelCategoria('prestacion');
    const t = textosDelSelect();
    expect(t.some(x => x.includes('Catarata'))).toBe(true);
    expect(t.some(x => x.includes('OCT'))).toBe(true);
  });

  it('la atención guardada congela la categoría en el registro', () => {
    app.atSelCategoria('estudio');
    const sel = document.getElementById('at-prestacion-sel');
    sel.value = '3';  // OCT macular
    app.atOnPrestChange();
    app.guardarAtencion();
    const reg = app.DB.registros[0];
    expect(reg.categoria).toBe('estudio');
    expect(app.categoriaReg(reg)).toBe('estudio');
  });
});

describe('categoriaReg: base para el pago por práctica', () => {
  it('registro viejo sin categoría: usa el override del nomenclador si existe', () => {
    app.DB.prestaciones.push({ id: 50, codigo: 'X', desc: 'Módulo raro', os: 'OSDE', valOS: 1000, categoria: 'estudio' });
    const reg = { os: 'OSDE', prestacion: 'Módulo raro', cantidad: 1, valorUnit: 1000 };
    expect(app.categoriaReg(reg)).toBe('estudio');
  });

  it('registro viejo sin match en nomenclador: detección por descripción', () => {
    expect(app.categoriaReg({ os: 'IOMA', prestacion: 'Ecografía ocular', cantidad: 1 })).toBe('estudio');
    expect(app.categoriaReg({ os: 'IOMA', prestacion: 'Vitrectomía', cantidad: 1 })).toBe('practica');
    expect(app.categoriaReg({ os: 'IOMA', prestacion: '', cantidad: 1 })).toBe('consulta');
  });
});

describe('El pago al médico (cantConsultaHon) respeta la categoría — fuente única', () => {
  it('una CONSULTA re-categorizada a estudio en el nomenclador deja de pagar honorario', () => {
    app.DB.prestaciones = [{ id: 1, codigo: 'C1', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679 }];
    const reg = { os: 'OSDE', prestacion: 'Consulta (Plan 510)', cantidad: 1, valorUnit: 55679 };
    // Como consulta: paga honorario (cantidad cuenta)
    expect(app.cantConsultaHon(reg)).toBe(1);
    expect(app.honorMedicoReg(reg)).toBe(app.DB.config.honorarioOS);
    // Se re-categoriza la prestación a estudio (override en el nomenclador)
    app.DB.prestaciones[0].categoria = 'estudio';
    expect(app.cantConsultaHon(reg)).toBe(0);           // ya no cuenta como consulta
    expect(app.honorMedicoReg(reg)).toBe(0);            // no paga honorario de consulta
  });

  it('la categoría CONGELADA en el registro manda sobre la descripción', () => {
    // Descripción de consulta pero congelada como estudio → no paga
    const reg = { os: 'OSDE', prestacion: 'Consulta vestida', cantidad: 2, valorUnit: 55679, categoria: 'estudio' };
    expect(app.cantConsultaHon(reg)).toBe(0);
  });

  it('registros viejos (sin categoría ni override) se comportan igual que antes', () => {
    // consulta por descripción → paga; cirugía por descripción → no paga
    expect(app.cantConsultaHon({ os: 'OSDE', prestacion: 'Consulta (Plan 510)', cantidad: 3 })).toBe(3);
    expect(app.cantConsultaHon({ os: 'OSDE', prestacion: 'Catarata c/IOL', cantidad: 1 })).toBe(0);
    // guard de descripción vacía → consulta (comportamiento defensivo previo intacto)
    expect(app.cantConsultaHon({ os: 'OSDE', prestacion: '', cantidad: 1 })).toBe(1);
  });
});

describe('Filtros de desplegable consistentes con la categoría (override incluido)', () => {
  beforeEach(() => {
    app.DB.prestaciones = [
      { id: 1, codigo: 'C', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679 },
      { id: 2, codigo: 'E', desc: 'OCT macular',         os: 'OSDE', valOS: 30000 },
      { id: 3, codigo: 'P', desc: 'Catarata c/IOL',      os: 'OSDE', valOS: 900000 },
    ];
  });

  it('override consulta→estudio: sale de Consultas y entra a Estudios', () => {
    app.DB.prestaciones[0].categoria = 'estudio';
    expect(app.getConsultasDeOS('OSDE').some(p => p.id === 1)).toBe(false);
    expect(app.getEstudiosDeOS('OSDE').some(p => p.id === 1)).toBe(true);
    // y "sin consulta" (estudios+prácticas) la incluye
    expect(app.getPracticasDeOS('OSDE').some(p => p.id === 3)).toBe(true);
  });

  it('override estudio→consulta: entra a Consultas y valorConsultaOS la puede tomar', () => {
    app.DB.prestaciones = [{ id: 9, codigo: 'E', desc: 'OCT especial', os: 'SAMI', valOS: 12345, categoria: 'consulta' }];
    expect(app.getConsultasDeOS('SAMI').some(p => p.id === 9)).toBe(true);
    expect(app.valorConsultaOS('SAMI')).toBe(12345);
  });
});

describe('Corrección manual en la tabla de Prestaciones', () => {
  it('togglePrestCategoria cicla consulta → estudio → práctica y guarda el override', () => {
    app.DB.prestaciones = [{ id: 7, codigo: 'C1', desc: 'Consulta (Plan 510)', os: 'OSDE', valOS: 55679 }];
    expect(app.categoriaPrestacion(app.DB.prestaciones[0])).toBe('consulta');
    app.togglePrestCategoria(7);
    expect(app.DB.prestaciones[0].categoria).toBe('estudio');
    app.togglePrestCategoria(7);
    expect(app.DB.prestaciones[0].categoria).toBe('practica');
    app.togglePrestCategoria(7);
    expect(app.DB.prestaciones[0].categoria).toBe('consulta');
  });
});
