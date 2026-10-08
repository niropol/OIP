# ARQUITECTURA — App OIP (Oftalmología Integral Palpa & Haedo)

> Documento de la **Etapa 0** del plan de `INSTRUCCIONES-CLAUDE-CODE.md`.
> Es solo descripción del estado actual. **No propone ni introduce cambios.**

> ⚠️ **ACTUALIZACIÓN (2026-07-07) — este documento quedó parcialmente desactualizado.**
> El código se modularizó y algunos detalles ya no aplican. Vale la descripción de las
> reglas de negocio (sección 5), pero tené en cuenta:
> - **Ya no es un `index.html` monolítico de 10.563 líneas.** El JS se partió en `js/`
>   (`datos.js`, `calculos.js`, `persistencia.js`, `ui-*.js`); `index.html` conserva el
>   HTML/CSS + un `<script>` inline con navegación, helpers y `runSelfTests`.
> - **Todos los números de línea de este documento son de la versión vieja** y ya no
>   coinciden. Usá búsqueda por nombre de función.
> - **El guardado ya NO sube todo el dataset** en cada llamada: `guardarEnNube`
>   (`js/persistencia.js`) sube **solo las colecciones `dirty`** y borra por snapshot.
> - Se agregaron colecciones `consultorios` y `notas`; `atenciones`/`gastos` reservados se quitaron.

---

## 1. Visión general

- **Archivo único:** `index.html` — **10.563 líneas**. HTML + CSS + JS vanilla, sin frameworks, sin build.
- **Estructura del archivo:**
  - Líneas **1–361**: `<head>`, fuentes, `<style>` (todo el CSS, variables de tema en `:root`).
  - Líneas **362**: carga de `xlsx` (SheetJS) por CDN. Línea **10**: SDK de Supabase por CDN.
  - Líneas **364–2579**: `<body>` — pantalla de login, nav superior y el HTML de las 10 secciones + modales.
  - Líneas **2580–10561**: un único `<script>` con TODO el JavaScript (datos semilla, lógica, render, persistencia).
- **Backend:** Supabase. Tablas genéricas:
  - `app_data (coleccion, doc_id, data)` — cada documento de cada colección como una fila JSON.
  - `app_meta (clave, valor)` — guarda `config` y `nextId`.
  - Auth: email/contraseña + Google OAuth. Lista blanca de mails en `MAILS_AUTORIZADOS` (L10172).
  - Credenciales hardcodeadas: `SUPABASE_URL` / `SUPABASE_ANON` (L10084-10085).
- **Deploy:** GitHub Pages (se publica `index.html` solo).
- **Layout:** fijo, no responsive (`min-width: 1100px`, L51).

---

## 2. Las 10 secciones (qué hace cada una)

Navegación por `showSection(id)` (L3450): muestra/oculta `<div class="section">` y marca el item de nav. No hay router ni URLs.

| Sección | id HTML | Función(es) de render | Qué hace |
|---|---|---|---|
| **Dashboard** | `section-dashboard` (L429) | `initDashboard` (L3494) | KPIs del día/mes: facturado, IVA, honorarios, conteo de consultas por sede, tabla resumen por OS. |
| **Atenciones** | `section-atenciones` (L473) | `renderAtenciones` (L3926) | Listado de atenciones (registros) con filtros. Carga **individual** (modal `guardarAtencion`) y **masiva** (pegar resumen / carga múltiple). Editar/eliminar registros. |
| **Preliquidación** | `section-preliquidacion` (L585) | `generarPreliq` (L5311) + `_renderTabMedico/_renderTabAdmin/_renderTabCierre` | Liquidación mensual de honorarios por médico. Tabs: vista médico, vista admin, cierre de mes. Cierre bloquea edición de registros del período. |
| **Obras Sociales** | `section-obras-sociales` (L648) | `renderOS` (L6300) → `renderOSCards/renderOSStats/renderOSTbody` | Tarjetas por OS, detalle mensual (`renderOSDetalle`), generación de preliquidación OS y emisión de factura (`confirmarFacturaOS`). |
| **Médicos** | `section-medicos` (L780) | `renderMedicosGrid` (L7238) | ABM de médicos (nombre, consultorio, forma de pago, datos fiscales). |
| **Finanzas** | `section-finanzas` (L792) | `renderFinanzas` (L7356) | Tabs: **Caja chica** (efectivo por sede), **Caja** (banco + efectivo = total), **Cobranzas** (`renderCobranzas`), **Facturas OS** (`renderFacturasOS`), pagos pendientes. |
| **Derivaciones** | `section-derivaciones` (L990) | `renderDerivaciones` (L9527) + KPIs/agrupaciones | Derivaciones quirúrgicas y sus pagos parciales; cada pago suma a la liquidación del médico. |
| **Estadísticas** | `section-estadisticas` (L1094) | `renderEstadisticas` (L7810) | Gráficos CSS: consultas por sede, balance por mes (facturado/honorarios/gastos). |
| **Alarmas** | `section-alarmas` (L1152) | `renderAlarmas` (L7994) | Recordatorios con vencimiento y repetición; motor `chequearAlarmasHora` cada 30 s. |
| **Configuración** | `section-configuracion` (L1177) | `renderConfiguracion` (L8079) | Valores globales (honorario OS, valor consulta particular), nomenclador de prestaciones, importación de contratos (PDF/Excel), aumentos, `actualizarPreciosPrestaciones` (reprecio), botón "Verificar cálculos" (`runSelfTests`). |

---

## 3. Modelo de datos — el objeto `DB`

Definido en **L2585**. Es un objeto global en memoria. Todo el estado vive acá.

### 3.1 Estructura

```
DB = {
  clinicaActiva: 'ambos' | 'Palpa' | 'Haedo',
  config: {
    honorarioOS: 10500,               // $ fijo por paciente OS (consulta)
    valorConsultaParticular: 60000,   // valor total consulta particular
    sedes: { Palpa:{...}, Haedo:{...} }
  },
  medicos: [...],          // 10 médicos semilla (id, nombre, consultorio, formaPago, color, …)
  prestaciones: [...],     // nomenclador (~737 ítems): {id, codigo, desc, os, valOS, valPart, nomenclador, vigencia, exenta?}
  obrasSociales: [...],    // 19 OS (id, nombre, codigo, pago, vencimiento, estado, contacto, email)
  alarmas: [...],
  liquidaciones: [],       // cierres mensuales por médico: {id, mes, medico, estado, totales, fechaCierre, facturaRecibida, pagoEnviado}
  movimientos: [],         // CAJA BANCO (transferencias, cobros OS): {id, fecha, desc, consultorio, tipo, monto, saldo, origen, regId?/facturaId?}
  registros: [],           // ATENCIONES (núcleo) — ver 3.2
  cajaChica: [],           // CAJA CHICA efectivo por sede: {id, fecha, consultorio, tipo, concepto, origen, monto, regId?}
  facturas: [],            // facturas a OS: {id, num, fecha, dest, mes, monto, netoExento, netoGravado, ivaGravado, copagoAdelanto, pctIVA, estado, vence, fechaPago, obs}
  pagosRecibidos: [],      // cobros: {id, facturaId, num, os, fecha, monto, medioPago, referencia}
  contratos: [],           // contratos/convenios importados
  aumentos: [],            // historial de aumentos aplicados
  derivaciones: [],        // {id, medico, consultorio, cirugia, estado, pagos:[{id,fecha,monto,concepto,nota}]}
  atenciones: [],          // (reservado, sin uso real)
  gastos: [],              // (reservado)
  nextId: 2000,            // contador global de IDs (DB.nextId++)
}
```

### 3.2 `DB.registros` — la atención (entidad central)

Cada registro es una atención por día/médico/OS. Forma:

```
{ id, fecha, medico, consultorio,            // 'Palpa'|'Haedo'|'Extra'
  os, plan, prestacion, codigo,
  cantidad, valorUnit, exenta,               // exenta: true/false/undefined
  partEfectivo, partEfVal, partTransf, partTrVal,   // particular: cantidad y valor por medio de pago
  copago, copagoMedio, copagoTipo,           // copagoTipo: 'adelanto'|'complementario'
  honorarioPagadoEfectivo?,                  // particular efectivo ya pagado al médico
  pagoExtra?, concepto?, derivId?,           // registro generado por un pago de derivación
  paciente?, apellido?, nombre?, dni?, empresa? }  // datos opcionales (CEMEPLA/SinCargo los exigen)
```

- **Particular**: no usa `cantidad/valorUnit`; usa `partEfectivo/partTransf` (0/1) y `partEfVal/partTrVal`.
- **OS**: usa `cantidad × valorUnit`, con `exenta` por IVA.
- **Registro "Pago derivación"** (os = `'Pago derivación'`): suma directo a honorarios vía `pagoExtra`.

### 3.3 Colecciones sincronizadas

`COLECCIONES` (L10088) — **el array que controla qué se persiste**:

```
['registros','medicos','prestaciones','facturas','liquidaciones','cajaChica',
 'alarmas','derivaciones','contratos','movimientos','pagosRecibidos','obrasSociales','aumentos']
```

`config` y `nextId` se guardan aparte en `app_meta`. (`atenciones` y `gastos` NO están en `COLECCIONES`: no se sincronizan.)

---

## 4. Flujo de guardado a la nube (delicado — no romper)

Mecanismo en bloque **L10084–10560**. Variables de control: `sb` (cliente), `autosaveActivo`, `autosaveTimer`, `cambiosPendientes = {dirty:Set, borrados:{}}`.

### 4.1 Arranque y carga
- `arranque()` (L10519) → `initSupabase()` → si hay sesión, `onLoginOk()`.
- `onLoginOk()` (L10178): valida mail contra `MAILS_AUTORIZADOS`; si no, cierra sesión. Luego `cargarDesdeNube()` e `init()`.
- `cargarDesdeNube()` (L10207):
  1. Lee `app_data` y `app_meta`.
  2. Si está vacío → `sembrarInicial()` (sube el `DB` semilla, incl. ~737 prestaciones, en lotes de 500).
  3. Si no, reconstruye cada colección desde las filas.
  4. **Migraciones** (no destructivas): si faltan obras sociales o alguna OS base (ej. `SinCargo`), las agrega desde `OBRAS_SOCIALES_BASE` (L10091) **sin pisar** lo existente.
  5. Carga `config`/`nextId` desde meta.
  6. `_guardarSnapshot()` para la red de seguridad.

### 4.2 Marcado de cambios y autoguardado
- Cualquier función que muta `DB` llama a `marcarCambios(coleccion)` (L10101).
- Esto agrega la colección a `cambiosPendientes.dirty`, prende el botón de guardar, y programa un **autosave con debounce**:
  - colecciones críticas (`registros, obrasSociales, prestaciones, facturas, pagosRecibidos`) → **250 ms**.
  - resto → **1200 ms**.

### 4.3 Red de seguridad (clave)
- `_guardarSnapshot()` (L10440) guarda un `JSON.stringify` de cada colección.
- `_chequearCambiosNoMarcados()` (L10443) compara snapshot vs estado actual; si algo cambió **sin** haber llamado a `marcarCambios` (ej. mutación profunda `factura.estado='Pagada'`), lo marca.
- Se ejecuta:
  - cada **3 segundos** (`setInterval` en `init`, L9917),
  - antes de cada `guardarEnNube`,
  - en `beforeunload` (L10529) y `visibilitychange→hidden` (L10545), donde además intenta un guardado final.

### 4.4 Guardado real
- `guardarEnNube(automatico)` (L10456):
  1. `_chequearCambiosNoMarcados()`.
  2. Lee del remoto la lista `coleccion:doc_id` para no pisar.
  3. **Upsert** de TODOS los items con `id` (en lotes de 500, `onConflict: 'coleccion,doc_id'`).
  4. **Borra del remoto** lo que ya no está local (diferencia de sets) → así desaparecen los borrados.
  5. Upsert de `config`/`nextId`.
  6. Limpia `dirty`, re-snapshot. Si falla el autosave, reintenta a los 10 s.
- `traerCambiosNube()` (L10506): recarga desde la nube (avisa si hay cambios sin guardar).

> Nota: el guardado sube **todo** el dataset en cada llamada (no solo lo `dirty`); `dirty` se usa para decidir *cuándo* guardar, no *qué*.

---

## 5. Reglas de negocio de facturación (NO cambiar la lógica)

### 5.1 Facturación — fuente única `facturadoReg(r)` (L3846)
- **Particular**: `partEfectivo×partEfVal + partTransf×partTrVal`.
- **OS**: `totalReg(r)` = `subtotalNeto(r) + ivaReg(r)`.
- `subtotalNeto` (L3816): OS = `cantidad×valorUnit`; Particular = suma por medio de pago.

### 5.2 IVA por obra social — `ivaReg(r)` (L3826)
- **Particular** → 0 (sin IVA).
- **CEMEPLA** → **21%**.
- `exenta === true` → 0; `exenta === false` → **10.5%**.
- Default sin `exenta`: `OS_GRAVADAS_SIEMPRE = {CoberMed, Medical's}` → 10.5%; el resto → exentas (0).
- `getExentaForOS(os)` (L4489): CEMEPLA no exenta; exenta = no estar en `OS_GRAVADAS_SIEMPRE`.
- Comentario del código (L3431-3436): por defecto **todas las OS son exentas**; solo CoberMed y Medical's son siempre gravadas (10.5%); CEMEPLA 21%; Bristol puede ser mixta (por prestación).
- `totalesOS(registros, osName)` (L3879): fuente única de los totales de una preliquidación OS → `{netoExento, netoGravado, iva, total, copagoAdelanto, aFacturar}`. `pctIVA` = 21% si CEMEPLA, si no 10.5%.

### 5.3 Copago-adelanto vs complementario
- `OS_COPAGO_ADELANTO = {Bristol, CoberMed, Medical's}` (L3855).
- `copagoAdelantoReg(r)` (L3860): si la OS es de adelanto y `copagoTipo !== 'complementario'`, devuelve el copago (registros viejos sin tipo = adelanto). **Adelanto se descuenta** de lo que paga la OS; **complementario NO** (la OS paga el total y el copago es ingreso extra).
- `netoOS(r)` (L3866) = `totalReg(r) − copagoAdelantoReg(r)`.
- En `guardarAtencion` (L9044-9064): el copago entra a **caja chica** (si efectivo) o a **movimientos/Caja** (si transferencia), vinculado por `regId`.

### 5.4 Honorarios médicos — `honorMedicoReg(r)` (L3897)
- **Particular** → `(partEfectivo + partTransf) × (valorConsultaParticular / 2)` = 50% del valor.
- **SinCargo** → `cantidad × valorUnit` (≈ $0,1; el médico cobra lo que paga el paciente).
- **OS** → solo consultas pagan honorario fijo: `cantConsultaHon(r) × config.honorarioOS`.
- `cantConsultaHon(r)` (L3803): 0 para Particular y SinCargo; para OS solo si `esConsultaReg(r)`.
- Cirugías/estudios OS no pagan honorario fijo de consulta (suman solo a la facturación OS).
- Particular efectivo: se ofrece pagar el 50% al médico en el acto (`honorarioPagadoEfectivo`, L8945) para no pagarlo de nuevo en la liquidación.

### 5.5 SinCargo (OS especial)
- Solo consulta `420101`; paciente paga **$0,1 por transferencia** que se abona al médico el mismo día.
- En `guardarAtencion` (L9069-9082): crea **un ingreso y un egreso** de $0,1 en `movimientos` (neto cero), ambos con `regId` para limpiar si se borra.
- Nombre **y** apellido del paciente **obligatorios** (L9015-9023).
- `honorMedicoReg`: el médico cobra el $0,1 (no el honorario fijo).

### 5.6 CEMEPLA
- IVA 21%. Exige datos de paciente (nombre, DNI, empresa) y monto neto explícito (L9001-9012).

### 5.7 Las dos cajas
- **Caja chica** = `DB.cajaChica`, efectivo **por sede** (Palpa/Haedo). Saldo: `saldoCajaChica(consultorio)` (L7578) = Ingresos − Egresos de esa sede.
- **Caja** = `DB.movimientos` (banco: transferencias + cobros OS) + efectivo (caja chica). En `renderFinanzas` (L7385-7402):
  - `saldoBanco` = acumulado de todos los `movimientos` (Ingreso +, Egreso −). Los movimientos guardan `saldo:0`; el saldo corriente se **recalcula al render**.
  - `saldoEfectivo` = `saldoCajaChica('Palpa') + saldoCajaChica('Haedo')`.
  - `saldoTotal` = banco + efectivo.

### 5.8 Reprecio — `actualizarPreciosPrestaciones()` (L10273)
- **Configuración es la fuente de verdad** de los precios; no se reemplaza el catálogo con el del código.
- Pide una **fecha de vigencia** (permite futuras). Re-aplica precios a las atenciones de OS **desde** esa fecha; las **anteriores quedan intactas** (L10354). Excluye Particular y CEMEPLA.
- **Orden de match** (L10355-10372):
  1. por **código** (`os || codigo`) — robusto, no depende del texto;
  2. por **descripción** (`os || prestacion`);
  3. para **consultas**: por **OS + plan** (extrae plan de la descripción); si la OS tiene un único valor de consulta, lo usa.
- Si el precio es `AMBIGUO` (mismo nombre, distintos precios) → no toca, avisa para revisar a mano.
- Sube prestaciones (reemplazo completo) y las atenciones recalculadas.

### 5.9 Ciclo de vida de los datos (regla central: sin huérfanos)
Lo que crea un movimiento se vincula por `regId` / `facturaId` / `derivId`, y al borrar se arrastra lo asociado:
- `eliminarRegistro(id)` (L4119): borra el registro y sus movimientos en `cajaChica` y `movimientos` (por `regId`; para registros viejos sin `regId`, por coincidencia fecha+consultorio+concepto). Bloquea si el mes del médico está cerrado (`regBloqueado`).
- `eliminarFactura()` (L7160): si estaba cobrada, borra también el ingreso en `movimientos` (por `facturaId`) y el `pagosRecibidos`.
- `eliminarDerivacion(id)` (L9875): borra los registros "Pago derivación" que generó (por `derivId`).
- `confirmarCobro()` (L7068): marca factura `Pagada`, crea `pagosRecibidos` y un ingreso en `movimientos` (`facturaId`, origen `Factura`).
- `confirmarFacturaOS()` (L6800): emite factura `Pendiente`, eliminando antes el placeholder `Preliquidada` de esa OS/mes.

### 5.10 Cierre de liquidaciones
- `regBloqueado(r)` (L5303): true si existe una `liquidacion` de ese mes+médico con `estado === 'Cerrada'`. Impide editar/eliminar registros del período cerrado. Flujo de cierre: `cerrarMesMedico` / `reabrirMesMedico` / `marcarFacturaRecibida` / `confirmarPagoEnviado` (L5762+).

### 5.11 Constantes de referencia
- `CONSULTA_VALORES` (L3409): valor de consulta por OS (referencia al cargar).
- `MES_MINIMO = '2026-05'` (L3719): no se muestran meses anteriores.

---

## 6. Tests existentes

`runSelfTests()` (L9926, 175 líneas) — ~65 asserts de cálculo (IVA, honorarios, totales, vencimientos, saldos). Se corre desde el botón "Verificar cálculos" en Configuración; el detalle va a la consola. **Cubre cálculos, no la app entera** (no toca DOM ni persistencia).

---

## 7. Funciones de más de 80 líneas

(22 funciones; medidas por rango hasta la siguiente declaración de nivel superior)

| Líneas | Función | Ubicación | Rol |
|---:|---|---|---|
| 174 | `initDashboard` | L3494–3667 | KPIs y tablas del dashboard |
| 193 | `renderAtenciones` | L3926–4118 | Tabla de atenciones con filtros |
| 225 | `parsearResumenPegado` | L4707–4931 | Parser de carga masiva (texto pegado) |
| 106 | `mostrarResumenCargaMasiva` | L4932–5037 | Preview de la carga masiva |
| 181 | `_ejecutarGuardarCargaMasiva` | L5090–5270 | Persistencia de la carga masiva |
| 146 | `_renderTabMedico` | L5364–5509 | Tab preliquidación por médico |
| 128 | `_renderTabAdmin` | L5510–5637 | Tab preliquidación admin |
| 124 | `_renderTabCierre` | L5638–5761 | Tab cierre de mes |
| 160 | `copiarTablamedico` | L5837–5996 | Exporta tabla de liquidación a texto |
| 105 | `imprimirLiquidacion` | L6044–6148 | Ventana de impresión de liquidación |
| 112 | `generarPreliqOS` | L6178–6289 | Preliquidación de OS |
| 230 | `renderOSDetalle` | L6372–6601 | Detalle mensual de una OS |
| 136 | `copiarDetalleOSMail` | L6602–6737 | Arma el mail de detalle OS |
| 108 | `renderCobranzas` | L6922–7029 | Tabla de cobranzas |
| 118 | `renderMedicosGrid` | L7238–7355 | Grilla de médicos |
| 95 | `renderPagosPendientes` | L7469–7563 | Pagos pendientes |
| 184 | `renderEstadisticas` | L7810–7993 | Gráficos de estadísticas |
| 83 | `renderConfiguracion` | L8079–8161 | Pantalla de configuración |
| 186 | `guardarAtencion` | L8908–9093 | Alta de atención (Particular/OS/SinCargo) + caja |
| 90 | `renderDerivPorMedico` | L9597–9686 | Derivaciones agrupadas por médico |
| 175 | `runSelfTests` | L9926–10100 | Batería de tests de cálculo |
| 164 | `actualizarPreciosPrestaciones` | L10273–10436 | Reprecio por fecha de vigencia |

---

## 8. Riesgos / puntos sensibles para el refactor

- **El guardado sube todo el dataset** en cada llamada y borra del remoto lo que no esté local: cualquier pérdida accidental en `DB` se propaga a la nube. La red de seguridad cada 3 s amplifica esto.
- **Vínculos por `regId`/`facturaId`/`derivId`** + *fallback* por coincidencia de texto para datos viejos: frágil pero deliberado; preservarlo exactamente.
- **`exenta` con tres estados** (`true`/`false`/`undefined`): la lógica de IVA depende de distinguir `undefined` de `false`.
- **Saldos recalculados al render** (no persistidos): el campo `saldo:0` de los movimientos es intencional.
- **Todo es global** (un `<script>`, funciones colgadas de `window`, llamadas `onclick=` desde el HTML): la extracción a módulos deberá conservar esos nombres globales o adaptar el HTML.
- **Datos semilla embebidos** (~737 prestaciones, médicos, OS) usados tanto como seed inicial como base de migraciones (`OBRAS_SOCIALES_BASE`).

---

*Fin del documento de Etapa 0. No se realizaron cambios al código.*
