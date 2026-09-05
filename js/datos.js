// ═══════════════════════════════════════════════════════════════════════════
//  ESTADO / DATOS — objeto DB, datos semilla y constantes de datos
// ───────────────────────────────────────────────────────────────────────────
//  Extraído de index.html en la Etapa 2. El comportamiento es idéntico: el
//  código se movió tal cual. Este módulo se carga PRIMERO (antes de calculos.js
//  y del script principal) porque todo el resto depende de DB. Los símbolos
//  (DB, CONSULTA_VALORES, OS_GRAVADAS_SIEMPRE, …) siguen siendo globales.
// ═══════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════
//  DATA STORE
// ══════════════════════════════════════

const DB = {
  // Valores globales configurables
  config: {
    honorarioOS: 10500,        // $ fijo por paciente OS
    valorConsultaParticular: 60000,  // valor total consulta particular
    // honorario particular = 50% del valor = 30000
    // si paga efectivo → se paga el mismo día
    // si paga transferencia → se paga con liquidación mensual
    sedes: {
      Palpa: { direccion: 'Palpa 2427 1B, CABA',            tel: '116-889-2046' },
      Haedo: { direccion: 'Av. Rivadavia 15822 1er piso, Haedo', tel: '116-889-2046' },
    },
  },

  medicos: [
    { id:1, nombre:'Dr. Polisky, Nicolás',    especialidad:'', consultorio:'Palpa',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#2d5a8e' },
    { id:2, nombre:'Dra. Mateo, Agustina',    especialidad:'', consultorio:'Palpa',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#1d6a4a' },
    { id:3, nombre:'Dra. Sacks, Camila',      especialidad:'', consultorio:'Haedo',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#7c3aed' },
    { id:4, nombre:'Dra. Puertas, Mariana',   especialidad:'', consultorio:'Haedo',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#b45309' },
    { id:5, nombre:'Dra. Murcia, Jenny',      especialidad:'', consultorio:'Palpa',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#be185d' },
    { id:6, nombre:'Dra. Sadir, Victoria',    especialidad:'', consultorio:'Ambos',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#0e7490' },
    { id:7, nombre:'Dra. Cervera, Silvia',    especialidad:'', consultorio:'Haedo',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#4d7c0f' },
    { id:8, nombre:'Dra. Federico, Julieta',  especialidad:'', consultorio:'Palpa',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#9f1239' },
    { id:9, nombre:'Dra. González Galvis, Fátima Patricia',   especialidad:'', consultorio:'Ambos',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#5b21b6' },
    { id:10,nombre:'Dra. Telenchana, Alex',   especialidad:'', consultorio:'Haedo',  formaPago:'Transferencia bancaria', diaPago:'5 de cada mes',        cuit:'', matricula:'', tel:'', email:'', cbu:'', color:'#065f46' },
  ],

  prestaciones: [
    // ═══ BASE: solo se deja OSDE hardcodeado como semilla ═══
    // El resto de los nomencladores (IOMA, CEMEPLA, ASMEPRIV, AMFFA, BAPRO, Bristol, CMP,
    // CoberMed, DoctorRed, Medicus, Medifé, Premedic, SAMI, Sancor, Luis Pasteur…) YA NO
    // viven en el código: la nube es la única fuente de precios y se cargan desde ahí.
    { id:284, codigo:'420162', desc:'Consulta (Plan 210)',                       os:'OSDE', valOS:21536.00,  valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:283, codigo:'420162', desc:'Consulta (Plan 310)',                       os:'OSDE', valOS:24021.00,  valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:282, codigo:'420162', desc:'Consulta (Plan 410)',                       os:'OSDE', valOS:28506.00,  valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:281, codigo:'420162', desc:'Consulta (Plan 450)',                       os:'OSDE', valOS:36333.00,  valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:280, codigo:'420162', desc:'Consulta (Plan 510)',                       os:'OSDE', valOS:55679.00,  valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:285, codigo:'20167',  desc:'Catarata / facoemulsificación c/IOL',       os:'OSDE', valOS:1351970.00,valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:286, codigo:'20661',  desc:'Iridotomía Láser unilateral',               os:'OSDE', valOS:212339.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:287, codigo:'20663',  desc:'Fotocoagulación láser / YAG capsulotomía', os:'OSDE', valOS:280933.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:288, codigo:'20674',  desc:'Inyección intravítrea antiangiogénico',     os:'OSDE', valOS:420301.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:289, codigo:'20260',  desc:'Cirugía simple oftalmológica unilateral',   os:'OSDE', valOS:115583.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:290, codigo:'20261',  desc:'Cx ectropión/entropión/ptosis unilateral',  os:'OSDE', valOS:341317.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:291, codigo:'20360',  desc:'Cx pterigión / quiste conjuntiva',          os:'OSDE', valOS:211660.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
    { id:292, codigo:'20462',  desc:'Cx refractiva Excimer Láser',               os:'OSDE', valOS:612496.00, valPart:60000, nomenclador:'OSDE', vigencia:'01/04/2026' },
  ],

  obrasSociales: [
    { id:1,  nombre:'OSDE',          codigo:'6001102517', pago:'Mensual por padrones', vencimiento:'2026-12-31', consultas:0, facturado:0, estado:'Activa', contacto:'', email:'' },
    { id:2,  nombre:'IOMA',          codigo:'002',        pago:'Por prestación',        vencimiento:'2026-06-30', consultas:0, facturado:0, estado:'Activa', contacto:'', email:'' },
    { id:3,  nombre:'Medifé',        codigo:'MDF',        pago:'Mensual por padrones', vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:4,  nombre:'DoctorRed',     codigo:'DR',         pago:'Por prestación',        vencimiento:'2026-11-30', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:5,  nombre:'Sancor',        codigo:'SAN',        pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:6,  nombre:'Premedic',      codigo:'PREMEDIC',   pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:7,  nombre:'AMFFA',         codigo:'AMFFA',      pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:8,  nombre:'CMP',           codigo:'CMP',        pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'', email:'' },
    { id:9,  nombre:'CoberMed',         codigo:'30-59879747-8', pago:'Por prestación',     vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'administracion@cober.com.ar', email:'pagos.prestadores@cober.com.ar' },
    { id:10, nombre:'Bristol',       codigo:'BRISTOL',    pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'central.autorizaciones@medicals.ar', email:'' },
    { id:11, nombre:"Medical's",     codigo:'MEDICALS',   pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'prestadores_facturacion@medicals.ar', email:'prestadores_facturacion@medicals.ar' },
    { id:13, nombre:'Medicus',       codigo:'MED',        pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:14, nombre:'ASMEPRIV',      codigo:'ASMEPRIV',   pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'', email:'' },
    { id:15, nombre:'BAPRO',         codigo:'BAPRO',      pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'', email:'' },
    { id:17, nombre:'SAMI',          codigo:'SAMI',       pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'', email:'' },
    { id:18, nombre:'Luis Pasteur',  codigo:'LP',         pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,   estado:'Activa', contacto:'', email:'' },
    { id:19, nombre:'CEMEPLA',       codigo:'CEM',        pago:'Por prestación',        vencimiento:'2026-12-31', consultas:0, facturado:0,  estado:'Activa', contacto:'', email:'' },
    { id:20, nombre:'Particular',    codigo:'—',          pago:'Pago directo',          vencimiento:'—',          consultas:0, facturado:0,      estado:'Activa', contacto:'', email:'' },
    { id:21, nombre:'SinCargo',      codigo:'420101',     pago:'Sin cargo (paga al médico)', vencimiento:'—',       consultas:0, facturado:0,      estado:'Activa', contacto:'', email:'' },
  ],

  // ── Consultorios (sedes) — base única para todo selector "aplicar a consultorio" ──
  // Palpa/Haedo/Extra ya no están hardcodeados en la UI: se gestionan acá
  // (Configuración → Consultorios) y poblarSelectoresConsultorio() los propaga
  // a todos los selects de la app.
  consultorios: [
    { id:1, nombre:'Palpa', estado:'Activa' },
    { id:2, nombre:'Haedo', estado:'Activa' },
    { id:3, nombre:'Extra', estado:'Activa' },
  ],

  alarmas: [
    { id:1, tipo:'info', titulo:'Bienvenido a OIP Oftalmología Integral', desc:'Cargá las atenciones del día desde Atenciones → Cargar día de atención.', fecha:'2026-05-20', rel:'Otros', estado:'activa', repeat:'No repetir' },
  ],

  liquidaciones: [],  // Cierres mensuales por médico: { id, mes, medico, estado, totales, fechaCierre, facturaRecibida, pagoEnviado }

  movimientos: [],

  registros: [],       // Atenciones por día/médico/OS (sin nombre)

  cajaChica: [],       // Caja chica por consultorio

  notas: [],           // Pizarrón del dashboard: { id, texto, fecha } — visible para todos

  facturas: [],

  pagosRecibidos: [],

  contratos: [],

  derivaciones: [],

  nextId: 2000,
};

// Fallback del valor de consulta SOLO para OS sin su consulta cargada en el nomenclador.
// Ya no lleva precios negociados de OS (la nube es la fuente): quedan OSDE como base y los
// dos valores estructurales (SinCargo = $0,1 que se abona al médico; Particular = consulta
// directa, espejo de config.valorConsultaParticular). El resto cae al default de 22000.
const CONSULTA_VALORES = {
  'OSDE':         55679.00,  // Plan 510 (04/2026) — base semilla
  'SinCargo':     0.1,       // paga $0,1 por transferencia que se abona al médico
  'Particular':   60000,
};

// OS exentas de IVA (resto son gravadas al 10.5%)
// Por defecto todas las OS son EXENTAS de IVA
// Solo CoberMed, Medical's son siempre gravadas (10.5%)
// CEMEPLA tiene IVA 21% (tratado aparte en ivaReg)
// Bristol puede ser mixta (se define por prestación)
const OS_GRAVADAS_SIEMPRE = new Set(['CoberMed', "Medical's"]);


// ── Nuevo modelo: registros por día/médico/OS ──
// Cada registro = { id, fecha, medico, consultorio, os, plan, cantidad, valorUnit, exenta,
//                   partEfectivo, partEfVal, partTransf, partTrVal }

if (!DB.registros) DB.registros = [];
