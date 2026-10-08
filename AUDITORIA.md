# Auditoría profesional — App OIP

Revisión completa de **funciones repetidas, código muerto y errores/inconsistencias de
cálculo**. Hecha sobre el código modularizado (13 módulos `js/` + `index.html`).
Base objetiva: 224 funciones analizadas, 57 tests (Vitest) + 68 autochequeos internos en verde.

> **Nada de esto se modificó todavía** — es un informe. Al final están las recomendaciones.

---

## Resumen ejecutivo

- **Funciones con nombre duplicado:** **0**. La modularización quedó limpia.
- **Código muerto:** 6 ítems menores (constantes/colecciones/variables sin uso). Sin impacto funcional, conviene limpiarlos.
- **Cálculos:** el **núcleo está correcto y es consistente** (facturación, IVA por OS, copagos, reprecio, caja). Se encontraron **3 inconsistencias en honorarios de preliquidación**, de impacto bajo, originadas por **lógica de honorarios repetida en 3 lugares** (la única "duplicación" real del código).

---

## 1) Funciones repetidas

**No hay funciones con el mismo nombre definidas dos veces.** ✅

Lo que sí hay es **lógica duplicada** (el mismo cálculo escrito en varios lugares en vez de una función compartida). Es la causa de las inconsistencias de la sección 3:

- El **honorario a liquidar por médico/mes** se calcula por separado en:
  1. `_renderTabMedico` (panel en pantalla) — `js/ui-preliquidacion.js`
  2. `enviarLiquidacionCierre` (mensaje de WhatsApp) — `js/ui-preliquidacion.js:555`
  3. `honorMedicoReg` (por registro; dashboard, estadísticas, export, desglose por sede) — `js/calculos.js`

  Al estar repetida, las tres divergen (ver sección 3). **Recomendación:** unificar en una sola
  función fuente de verdad (ej. `honorariosDelMedico(regs)` que devuelva `{honOS, honTr, honEf, honSC, aLiquidar}`).

---

## 2) Código muerto

| Ítem | Ubicación | Estado |
|---|---|---|
| `esLocalhost()` | `js/persistencia.js:32` | Sin uso desde que el modo edición pasó a ser incondicional. Se puede borrar (o reusar al reactivar login). |
| `prestacionesSample` | `js/datos.js:835` | Constante declarada, nunca usada. |
| `osSample` | `js/datos.js:836` | Constante declarada, nunca usada. |
| `DB.atenciones` | `js/datos.js:813` | Colección "reservada", 0 accesos en todo el código. |
| `DB.gastos` | `js/datos.js:817` | Solo se **lee** vacía en "Exportar todo"; nunca se escribe. Los gastos reales van por caja chica. Vestigial. |
| `DB.clinicaActiva` | `js/datos.js:15` | Se **escribe** en `setClinic()` pero **nunca se lee**. Vestigial (write-only). |
| `cambiosPendientes.borrados` | `js/persistencia.js:39` | Andamiaje muerto: solo se inicializa en `{}`, nunca se llena ni se lee. |

Ninguno afecta el funcionamiento. Limpiarlos reduce ruido y confusión.

---

## 3) Cálculos — hallazgos

### Lo que está BIEN (verificado)
- **`facturadoReg` (fuente única de facturación)**, **`ivaReg`** (10,5% / 21% CEMEPLA / exentas),
  **`totalesOS`**, **`netoOS`**, **copago adelanto vs complementario**: consistentes entre sí y con los tests.
- **Reprecio** (`actualizarPreciosPrestaciones`): respeta fecha de vigencia, match por código→descripción→OS+plan, avisa ambigüedades, no toca Particular/CEMEPLA. Correcto.
- **Caja** (banco recalculado + caja chica por sede): correcto.
- **Conteo de consultas** (`contarConsultas`/`cantConsultaHon`): cuenta solo consultas OS (excluye Particular y SinCargo), así que **`honOS` no se duplica**. ✅

### Inconsistencias encontradas (honorarios de preliquidación)

**H1 — `enviarLiquidacionCierre` omite SinCargo.** `js/ui-preliquidacion.js:555`
El panel en pantalla usa `aLiquidar = honOS + honTr + honSC`, pero el **mensaje de cierre/WhatsApp**
usa `aLiquidar = honOS + honTr` (sin `honSC`). Si el médico tuvo consultas SinCargo, el mensaje
las omite. **Impacto financiero: casi nulo** (SinCargo = $0,1 por consulta), pero es una inconsistencia real.

**H2 — Desglose por sede no cuadra con el total a liquidar.** `js/ui-preliquidacion.js:184`
El desglose por consultorio suma `honorMedicoReg(r)`, que en Particular incluye **el efectivo**
(ya pagado en el momento). Pero `aLiquidar` de la tarjeta **excluye** el efectivo. Resultado:
si hubo particulares en efectivo, la suma de los chips por sede **es mayor** que el "A liquidar"
de la tarjeta. Es confuso visualmente (no es un error de plata pagada, sí de presentación).

**H3 — Honorario de Particular usa el valor estándar, no el cobrado.** `js/calculos.js` (`honorMedicoReg`)
El honorario de Particular es `(efectivo+transf) × (valorConsultaParticular/2)` — siempre el **50% del
valor estándar de Configuración**, aunque a ese paciente se le haya cobrado un monto distinto
(`at-part-monto`). En cambio, el pago en efectivo **del momento** sí usa el monto real (`val/2`).
Para particulares a precio estándar no hay diferencia; para particulares con precio especial, el
honorario de la liquidación (transferencia) no coincide con lo realmente cobrado.
> Esto **parece intencional** (un autochequeo lo llama "50% fijo del estándar"), por eso se marca
> como **a confirmar**, no como bug.

---

## Recomendaciones (en orden)

1. **Unificar el cálculo de honorarios** en una sola función (elimina la causa de H1 y H2 de raíz).
2. **Limpiar el código muerto** de la sección 2 (rápido y seguro).
3. **Confirmar la regla H3** (¿el honorario de Particular debe ser 50% del estándar o 50% de lo
   realmente cobrado?). Según la respuesta, ajustar `honorMedicoReg` o dejarlo documentado.

Cada cambio debe ir con sus tests y verificación, como veníamos haciendo.

---

## Estado: correcciones aplicadas (post-auditoría)

✅ **(1) Honorarios unificados** en una sola fuente de verdad: `honorariosMedico(regs)` +
`honorALiquidarReg(r)` en `js/calculos.js`. Los 5 lugares que recalculaban honorarios
(`_renderTabMedico`, `_renderTabAdmin`, `_renderTabCierre`, `enviarLiquidacionCierre`,
`copiarTablamedico`) ahora usan la misma función. Esto resolvió **H1** (el mensaje de
cierre ya incluye SinCargo) y **H2** (el desglose por sede usa `honorALiquidarReg` y cuadra
con el "A liquidar").

✅ **(2) Código muerto eliminado:** `esLocalhost`, `prestacionesSample`, `osSample`,
`DB.atenciones`, `cambiosPendientes.borrados`. *(Se dejaron `DB.gastos` y `DB.clinicaActiva`:
son inofensivos y tocarlos implicaría cambiar el export / `setClinic`; quedan para más adelante.)*

✅ **(3) H3 resuelto:** el honorario de Particular ahora es **50% de lo realmente cobrado**
(`honorMedicoReg` Particular = `subtotalNeto/2`). El valor estándar sigue como **default**
precargado, así que para consultas a precio normal no cambia nada.

Verificación: **68 tests (Vitest) + 69 autochequeos internos** en verde (ver limitaciones más abajo).

### ✅ Hallazgo adicional — RESUELTO

**`pagoExtra` (pagos de derivación) no se sumaba a la liquidación del médico.** Se decidió
que **sí** deben sumarse. Ahora `honorMedicoReg` y `honorariosMedico` contemplan `pagoExtra`
(nuevo campo `honExtra` en el desglose; `aLiquidar` lo incluye), y el panel/mensaje de cierre
muestran la línea "Derivaciones".

Además se rehízo el **modal de pago de derivación**: ahora muestra la **prestación del contrato
de la OS** (selector con su valor), calcula el **5% sugerido** (constante `DERIV_PORC`) y deja
ese monto **editable** antes de confirmarlo y sumarlo a la liquidación. Verificado con tests
(derivaciones) y en navegador.

---

## ⚠️ Limitaciones y verificación pendiente (auditoría adversarial)

Revisión escéptica del propio trabajo. Estas son afirmaciones previas que estaban
**sobre-vendidas** y se corrigen acá para que el registro sea honesto:

1. **"Verificado en el navegador" NO aplica a la persistencia.** La app corre en modo
   edición con `DEV_SIN_LOGIN = true` y `sb = null`, así que `guardarEnNube` y
   `flushKeepalive` **no se ejecutan** en esa verificación. Lo único probado en navegador
   es que la app carga y que la UI (modales, cálculos, render) funciona. **Los arreglos de
   guardado están cubiertos SOLO por tests unitarios con un Supabase simulado.**
   **Pendiente real:** probar contra Supabase de verdad (staging o con backup) **con login
   activado** antes de confiar en producción.

2. **El mock de Supabase prueba "se emiten las llamadas correctas", no "Supabase las acepta".**
   No cubre RLS, el constraint `on_conflict (coleccion,doc_id)`, ni las formas de error/payload
   reales. No es un "blindaje" completo.

3. **`flushKeepalive` es best-effort, no un guardado garantizado.** Puede fallar en silencio si
   el token cacheado venció (sesiones >~1 h) o si el payload supera ~64 KB (tope de keepalive;
   ahora se omite en ese caso). El guardado primario y confiable es el async de `guardarEnNube`.

4. **Concurrencia multiusuario: parcialmente resuelta.** Se eliminó el borrado catastrófico
   (espejo destructivo) — eso sí está verificado por tests. PERO `guardarEnNube` sube la
   **colección dirty completa**, así que dos usuarios editando **la misma colección a la vez**
   pueden pisarse (last-write-wins por registro, con copia posiblemente vieja), y un registro
   borrado por otro puede resucitar. La afirmación previa "no se pierde info ya sincronizada"
   vale para el caso catastrófico, **no** para ediciones concurrentes. **Pendiente:** un
   merge real (traer remoto y fusionar) o dirty por-registro antes de uso multiusuario intenso.

5. **Default del 5% en derivación = adivinanza por palabra clave.** Para una OS con varias
   cirugías que matchean la categoría (ej. varias "catarata"), preselecciona la
   alfabéticamente primera, que puede no ser la de precio correcto. Es editable (el usuario
   elige en el selector), pero el valor precargado no es confiable a ciegas.

### Lo que SÍ pasó la auditoría adversarial (con evidencia)
- **"Valor a la vista" en atención rápida:** 0 descripciones con el em-dash separador; el
  option y `guardarAtencion` usan el mismo byte; un alta end-to-end guardó la descripción
  limpia (sin precio). OK.
- **Autochequeos internos:** `runSelfTests()` → **69/69 OK** con el código actual (H3 + pagoExtra).
- **Cálculos de honorarios/IVA/copagos/reprecio:** cubiertos por 68 tests Vitest. OK.

---

## 4) Auditoría — Obras Sociales, Estadísticas, Finanzas, Preliquidación

Revisión enfocada en que los cálculos **"viajen" correctamente** entre pantallas: que un
número que aparece en Obras Sociales sea el mismo (o consistente) al que aparece en
Finanzas, Dashboard, Estadísticas y Preliquidación. Se leyeron enteros y en detalle
`js/calculos.js`, `js/ui-finanzas.js`, `js/ui-os-crud.js`, `js/ui-vistas.js` y
`js/ui-preliquidacion.js`.

### Corregido (5 hallazgos, F1–F5)

**F1 — Caja chica y KPIs de Finanzas ignoraban cualquier consultorio que no fuera
Palpa/Haedo.** `js/ui-finanzas.js` (`renderCajaChica`, `renderFinanzas`).
Desde que "Consultorios" pasó a ser una base gestionable ([0a50224](.)), un consultorio
nuevo (o "Extra") podía tener movimientos de caja chica reales que:
- no aparecían en ninguna tarjeta/tabla de Caja chica (solo había 2 tarjetas hardcodeadas),
- se marcaban como **"huérfanos"** (sin consultorio válido) aunque el consultorio existiera
  y estuviera activo — el aviso solo reconocía `'Palpa'`/`'Haedo'` como válidos,
- no sumaban al **saldo de caja chica** mostrado en los KPIs de Finanzas (`fin-caja-total`,
  `fin-caja-sub`) ni al **saldo total de Caja** (`caja-saldo-efectivo`, tab Caja).

Se reescribió `renderCajaChica()` para generar tarjetas, tablas y el aviso de huérfanos
**dinámicamente** a partir de `getConsultoriosList()` (uno por cada consultorio activo,
con id de tbody slugificado), y se corrigieron los 3 acumuladores de `renderFinanzas()`
para sumar sobre todos los consultorios activos en lugar de sumar `'Palpa' + 'Haedo'` a mano.

**F2 — Dashboard y Estadísticas contaban consultas solo de Palpa/Haedo/Extra.**
`js/ui-vistas.js` (`initDashboard`, `renderEstadisticas`).
Mismo problema que F1 pero para conteo de pacientes: `hoyTotal`/`mesTotal` del Dashboard y
el gráfico de consultorio de Estadísticas (`cCount`) sumaban tres claves fijas
(`Palpa`, `Haedo`, `Extra`); un consultorio nuevo quedaba invisible en ambas pantallas
(no sumaba al total ni aparecía en el gráfico), aunque sí estaba correctamente contado en
otras partes de la misma pantalla de Estadísticas (el filtro por consultorio y el balance
mensual ya eran genéricos). Se reescribieron ambas funciones para iterar
`getConsultoriosList()`.

**F3 — El mensaje de cierre y la liquidación impresa mostraban la cantidad de
prestaciones equivocada junto al honorario OS.** `js/ui-preliquidacion.js`
(`enviarLiquidacionCierre`, `imprimirLiquidacion`).
`honOS` (el monto) siempre se calculó como *consultas × honorarioOS* (cirugías/estudios no
pagan honorario fijo — correcto). Pero el texto mostraba `totOS` (cantidad de **todas** las
prestaciones OS, incluidas cirugías) como si fuera el multiplicador: *"OS: 12 consultas →
$60.000"* cuando en realidad solo 8 de esas 12 eran consultas y `$60.000 = 8 × $7.500`. El
médico veía un "×" que no cerraba con el monto. Se cambió para mostrar `totConsultas`
(mismo valor que ya usaban correctamente el panel en pantalla y `_renderTabCierre`).

**F4 — El desglose por OS del panel Admin de preliquidación inflaba el honorario en filas
con cirugías.** `js/ui-preliquidacion.js` (`_renderTabAdmin`).
La columna "Honorario" de la tabla por-OS se calculaba como `g.cant × honorarioOS`, donde
`g.cant` es la cantidad de **todas** las prestaciones de esa OS (consultas + cirugías +
estudios). Si un médico tuvo una cirugía con esa OS, el honorario mostrado en esa fila
quedaba inflado (cirugías no pagan honorario fijo). Se agregó un acumulador `honFijo` que
usa `cantConsultaHon(r)` (excluye cirugías/estudios) por fila; la suma de `honFijo` de
todas las filas coincide con `honOS` de `honorariosMedico` (fuente única).

**F5 — El monto "pendiente" por OS en la tabla de Obras Sociales no incluía facturas
`Preliquidada`.** `js/ui-finanzas.js` (`renderOSTbody`).
El resto de la app (stats de arriba de Obras Sociales, Finanzas, Dashboard) trata
`'Preliquidada'` como un estado pendiente de cobro. Pero la tabla por-OS de Obras Sociales
solo filtraba `['Pendiente','Vencida']`, así que el monto pendiente mostrado ahí, sumado
entre todas las OS, **no coincidía** con el total pendiente general si había facturas
preliquidadas. Se agregó `'Preliquidada'` al filtro, igual que en el resto de la app.

Los 5 se cubrieron con tests nuevos: `tests/finanzas-dinamico.test.js` (8 tests, F1/F2),
`tests/preliquidacion-honorarios-display.test.js` (2 tests, F3/F4) y
`tests/os-pendiente-preliquidada.test.js` (1 test, F5). Se verificaron en vivo en el
navegador (consultorio custom con movimientos de caja chica y una atención: aparece en
Caja chica, en los KPIs de Finanzas, en el Dashboard y en el gráfico de Estadísticas; el
flujo de reasignar un movimiento huérfano funciona end-to-end).

### D2 y D3 — resueltos según decisión del usuario

**D2 — "Facturado [mes]" significaba dos cosas distintas en Dashboard vs. Finanzas.**
En el Dashboard, `factMes` = suma de `facturadoReg(r)` de todos los registros del mes por
**fecha de atención**, incluye Particular, y **no resta** el copago-adelanto. En Finanzas,
`montoFact` = suma de `f.monto` de las **facturas emitidas** del mes por **fecha de
factura**, que sí lo tiene neteado. Son dos métricas legítimas y ninguna estaba "mal", pero
compartían el mismo rótulo visual ("Facturado [mes]") en dos pantallas y no coinciden si se
comparan. **Decisión del usuario: solo aclarar los rótulos, sin tocar ningún cálculo.**
Se cambió a **"Facturado [mes] (atenciones)"** en el Dashboard (`js/ui-vistas.js`) y
**"Facturado mes (emitido)"** en Finanzas (`index.html`, KPI `fin-fact-mes`), cada uno con
un `title` (tooltip) que explica el criterio y remite a la otra pantalla.

**D3 — `confirmarCobro()` no sincroniza el monto si se cobra un importe distinto al
facturado.** `js/ui-finanzas.js`. Si al confirmar un cobro el usuario edita el monto
(ej. factura $100.000, se cobran $95.000), ese monto queda en `DB.pagosRecibidos` pero
`f.monto` (el monto de la factura) no se toca. **Decisión del usuario: dejar la factura
como estaba (no sincronizar), pero mostrar una señal de que hubo diferencia.** Se agregó
en **Historial de pagos** (`renderHistorialPagos`, `js/ui-finanzas.js`): cuando
`pago.monto` difiere de `f.monto` en más de un centavo, la fila muestra
"⚠ Cobrado $95.000" debajo del monto facturado, con tooltip "Facturado $100.000 — Cobrado
$95.000". No requirió tocar `confirmarCobro()`: el dato ya existía separado en
`pagosRecibidos` (`monto`) vs. `facturas` (`f.monto`); solo faltaba mostrarlo.
> **Nota de alcance:** los KPIs "Cobrado acumulado" (Obras Sociales) y "Cobrado este año"
> (Cobranzas) suman `f.monto` de las facturas Pagadas, no el monto realmente cobrado — si
> hay cobros parciales, esos totales agregados quedan levemente por encima de la plata real
> entrada. No se tocó (el usuario pidió una señal por factura, no un cambio de agregados);
> si en algún momento estos KPIs deben reflejar lo realmente cobrado, hay que sumar
> `pagosRecibidos` en vez de `facturas`.

Cubierto por 3 tests nuevos (`tests/cobro-diferencia.test.js`) y verificado en vivo en el
navegador (cobro parcial → factura sin tocar, aviso visible en Historial de pagos).

### D1 — RESUELTO en la auditoría de la sección 5 (ver abajo)

Este hallazgo (lógica de neto/IVA duplicada) se decía "sin bug de plata en vivo" en su
momento. La auditoría de la sección 5 encontró que **sí había un caso real donde divergía**
(CEMEPLA + `exenta` marcada a mano) y unificó los 5+ lugares que la reimplementaban.

---

## 5) Auditoría de fuentes de datos duplicadas — "una madre por cada dato"

Pedido explícito: revisar TODAS las secciones buscando lugares que recalculan lo mismo que
una función fuente única ya existente, en vez de llamarla — y corregir lo que esté mal.
Se revisó cada archivo `js/*.js` y `index.html` completo, no solo Finanzas/Preliquidación.

### Bugs reales encontrados (números distintos según la pantalla) — CORREGIDOS

**BUG 1 — CEMEPLA con `exenta` marcada a mano daba IVA distinto según la pantalla.**
`ivaReg()` (`js/calculos.js`) trata CEMEPLA como **siempre** gravada al 21%, sin mirar
`r.exenta` (coherente con `getExentaForOS('CEMEPLA') → false`, con el comentario "CEMEPLA
tiene IVA 21% (no exenta)"). Pero `totalesOS()` y **5 lugares más** que reimplementaban la
cuenta a mano (`renderOSDetalle`, `copiarDetalleOSMail` ×2, `generarPreliqOS`, el desglose
por OS de Atenciones, la vista previa de Carga masiva) **sí** respetaban `r.exenta`, incluso
para CEMEPLA. Como el toggle "Exenta/Gravada" de Atención rápida se puede tocar a mano para
cualquier OS (sin bloqueo especial para CEMEPLA), una atención CEMEPLA marcada "exenta" por
error dabla **$0 de IVA** en Obras Sociales / Preliquidación pero **21% igual** en el
Dashboard/facturado general — dos números distintos para el mismo dato.
**Corregido:** se agregó `exentaReg(r, os)` como fuente única en `js/calculos.js` (CEMEPLA
→ siempre `false`, el resto respeta `r.exenta` o cae al default de la OS) y se cambiaron los
6 lugares para usar `exentaReg()` + `ivaReg()` en vez de reimplementar la fórmula.

**BUG 2 — "Cobros pendientes" daba un monto distinto en Finanzas que en el resto de la
app.** Se encontraron **9 lugares** que filtran facturas "pendientes de cobro", cada uno
escribiendo el array de estados a mano:
- `js/ui-finanzas.js` (`renderFinanzas`, KPI "Cobros pendientes"): `['Pendiente','Vencida']`
  — **le faltaba `'Preliquidada'`**.
- `js/ui-vistas.js` (Dashboard, KPI "Cobros pendientes"): `['Preliquidada','Pendiente']`
  — **le faltaba `'Vencida'`** (¡el estado más urgente quedaba afuera del KPI!).
- Los otros 7 lugares (`renderOSStats`, `renderOSTbody`, `renderCobranzas`,
  `renderPagosPendientes` ×3, Resumen mensual) ya tenían los 3 estados correctos.
Resultado: el KPI de Finanzas y el de Dashboard casi nunca coincidían entre sí, ni con
Obras Sociales. **Corregido:** se agregó `ESTADOS_FACTURA_PENDIENTE` + `facturaPendiente(f)`
como fuente única en `js/calculos.js`, y los 9 lugares ahora la usan.

**BUG 3 — El honorario de un particular con precio ESPECIAL salía mal en "Atenciones →
Resumen" y en las tarjetas de "Médicos".** Hace unas sesiones se corrigió `honorMedicoReg`
para que el honorario de un particular sea 50% de lo **realmente cobrado** (no del precio
estándar de Configuración) — pero esa corrección nunca se propagó a dos vistas que seguían
con la cuenta vieja:
- `renderAtenciones()` (tab Resumen, `js/ui-atenciones.js`): calculaba
  `(partEfectivo+partTransf) × (valorConsultaParticular/2)` a mano — precio siempre
  estándar, **y además sumaba el efectivo** (ya cobrado en el momento) a la columna
  "Total liq.", que debería excluirlo.
- `renderMedicosGrid()` (`js/ui-medicos.js`): mismo problema, en "Hoy" y en "Mes".
**Corregido:** ambas ahora usan `honorALiquidarReg(r)` / `honorariosMedico(regs)`
(fuente única), que ya calculan esto bien.

**BUG 4 — En "Médicos", el conteo de pacientes de "Hoy" no incluía cirugías, pero el de
"Mes" sí.** `hoyTotalPac` sumaba `hoyConsulOS + hoyEfec + hoyTransf` (solo consultas OS),
mientras `mesTotalPac` sumaba `totalConsultasReg(r)` (consultas + cirugías + todo). Un
médico que operó hoy veía "Hoy — 2 pacientes" aunque hubiera atendido 3. **Corregido:**
"Hoy" ahora usa `totalConsultasReg(r)` igual que "Mes".

**BUG 5 — "A liquidar este mes" (Médicos) no incluía SinCargo ni pagos de derivación.**
Se armaba a mano como `honOS + honTransf`, dejando afuera lo que `honorariosMedico().
aLiquidar` sí suma (SinCargo, derivaciones). Si un médico tuvo consultas SinCargo o cobró
una derivación ese mes, el total mostrado en su tarjeta quedaba por debajo del real.
**Corregido:** ahora usa `aLiquidar` de `honorariosMedico()` directamente.

**BUG 6 (menor) — el desglose por OS de "Atenciones → Resumen" podía clasificar mal una
fila sin `exenta` definido.** Agrupaba por `r.exenta` crudo (sin normalizar); una atención
con `exenta` sin definir caía como "gravada" por default aunque la OS fuera exenta por
defecto — mismo patrón de bug que ya se había corregido en `renderOSCards` en una sesión
anterior, pero no acá. **Corregido:** ahora usa `exentaReg(r, r.os)`.

### Limpieza de duplicación (sin bug de plata hoy, pero mismo riesgo a futuro) — CORREGIDA

- **"Cuántos pacientes representa un registro"** (`r.cantidad` para OS, `partEfectivo +
  partTransf` para Particular) estaba reimplementado en 6 lugares en vez de llamar a
  `totalConsultasReg(r)`: `sumarPacientes()`, dos lugares en `js/ui-vistas.js` (médicos
  activos hoy, timeline reciente), uno en Carga masiva (aviso "ya hay atenciones"), y dos en
  la exportación a Excel (`construirDatosExportacion`, `exportarAtenciones`). Los 6 daban
  el mismo número hoy porque `cantidad` es 0 en Particular y `partEfectivo/partTransf` son 0
  en OS por construcción — pero es un invariante implícito, no garantizado. Se cambiaron
  los 6 a llamar `totalConsultasReg(r)`.
- `_renderTabAdmin` (Preliquidación) calculaba el neto por OS como `r.cantidad * r.valorUnit`
  en vez de `subtotalNeto(r)` — mismo resultado, ahora usa la función.
- Variable muerta `pctFrac` en `abrirConfirmarFactura` (`js/ui-finanzas.js`), nunca usada — eliminada.

### Verificación

24 tests nuevos entre `tests/auditoria-fuente-unica.test.js` (BUG 1 y 2) y
`tests/auditoria-honorarios-duplicados.test.js` (BUG 3, 4, 6). Suite completa: **24
archivos, 183 tests, todos en verde** (159 previos + 24 nuevos). Verificado en vivo en el
navegador: CEMEPLA+exenta manual da el mismo IVA en `ivaReg` y `totalesOS`; una factura
Vencida y otra Preliquidada del mismo monto total ahora dan el mismo "Cobros pendientes"
en Dashboard y en Finanzas; un particular con precio especial ($100.000 en vez del estándar
$60.000) muestra $50.000 de honorario (no $30.000) en la tarjeta de Médicos; las 9 secciones
de la app cargan sin errores de consola.

---

## 6) Fusión de secciones: Obras sociales + Médicos + Derivaciones → "OS/Pagos"

Pedido del usuario: unificar esas 3 solapas del menú en una sola llamada **OS/Pagos**, con
tabs **Preliquidaciones médicos · Resumen obras sociales · Cobranzas pendientes ·
Historial de pagos · Derivaciones** — misma información, más clara y directa. Con chequeo
de que todo se nutra de una única fuente y de que los cálculos queden intactos.

### Cómo se hizo (para minimizar el riesgo de romper algo)

- **Los IDs internos de cada tab se conservaron tal cual eran** en las secciones
  originales (`medicos-grid`, `os-tab-resumen/cobranzas/historial`, `deriv-*`). Ninguna
  función de render (`renderMedicosGrid`, `renderOS`, `renderCobranzas`,
  `renderHistorialPagos`, `initDerivaciones`) necesitó cambios: siguen escribiendo en los
  mismos elementos.
- **Un solo conmutador nuevo** (`switchOSPagosTab`, en `index.html` junto a
  `showSection`) muestra un pane por vez y dispara el render del tab elegido. Reemplaza a
  `switchOSTab` (eliminada, sus 3 tabs ahora son tabs de OS/Pagos).
- **Alias de compatibilidad en `showSection`**: cualquier código que todavía llame a
  `showSection('medicos'/'obras-sociales'/'derivaciones')` cae automáticamente en OS/Pagos
  con el tab correcto. Nada externo quedó apuntando al vacío.
- Los botones de acción de cada sección vieja (+ Agregar médico, Ver todas las
  liquidaciones, + Nueva OS, + Nueva derivación) viven ahora dentro de su tab.
- La sección **Preliquidación** (detalle por médico/admin/cierre) sigue existiendo aparte,
  a la que se llega igual que antes con "Ver preliq." / "Ver todas las liquidaciones"
  desde el tab Preliquidaciones médicos.
- Selectores JS que apuntaban a las secciones eliminadas se actualizaron:
  `switchDerivTab` y `filtrarPorMedico` usan el nuevo `#deriv-subtabs`; `verCobranzasOS`
  salta al tab Cobranzas de OS/Pagos.

### Chequeo de fuente única sobre el contenido fusionado

- **Preliquidaciones médicos** (`renderMedicosGrid`): usa `honorariosMedico()`,
  `contarConsultas()` y `totalConsultasReg()` — ya corregido en la auditoría de la
  sección 5. Sin cambios.
- **Resumen obras sociales** (`renderOS` → cards/stats/tabla): usa `totalesOS()` y
  `facturaPendiente()` — fuentes únicas ya auditadas. Sin cambios.
- **Cobranzas / Historial** (`renderCobranzas`, `renderHistorialPagos`): filtran con
  `facturaPendiente()` y muestran `pagosRecibidos` (con la señal ⚠ de diferencia
  facturado/cobrado). Sin cambios.
- **Derivaciones**: los montos en KPIs, listado y "por médico" salen todos de la misma
  cuenta (suma de `d.pagos[].monto`) — consistentes entre sí; el pago confirmado además
  genera el registro con `pagoExtra`, que fluye a las liquidaciones vía
  `honorariosMedico()` (fuente única). Un solo hallazgo, cosmético: la pastilla de
  consultorio del listado hardcodeaba Palpa/Haedo (un consultorio custom tomaba el color
  de Haedo) — corregido con el mismo patrón dinámico del resto de la app.
- **Ningún cálculo cambió**: la fusión es solo de navegación/estructura.

### Verificación

12 tests nuevos (`tests/os-pagos-navegacion.test.js`): estructura (secciones viejas
eliminadas, 5 panes presentes con IDs intactos), un pane visible por vez, renders por tab,
aliases de compatibilidad, y cross-links (verCobranzasOS con filtro, sub-tabs de
Derivaciones, filtrarPorMedico). Suite completa: **25 archivos, 195 tests, todos en
verde**. Verificado en vivo en el navegador: topnav con la entrada única OS/Pagos, los 5
tabs renderizan su contenido con datos de prueba, "Ver preliq." abre la sección
Preliquidación, los aliases funcionan y las 8 secciones de la app cargan sin errores de
consola.

---

## 7) Auditoría profesional de flujo — Finanzas y Contratos: la base madre y su circulación

Pedido: auditar cómo la información se lee de la base madre y circula por todo el sistema
para los cálculos de las OS y del pago a los médicos. Se trazó cada flujo de punta a punta.

### El mapa del flujo (cómo debe circular — y circula — la información)

**Base madre de VALORES: `DB.prestaciones` (el nomenclador).** Se alimenta únicamente
desde Configuración → Contratos (subir archivo o Aumento por %) y la edición manual de
Prestaciones. De ahí leen: `valorConsultaOS()` (valor de consulta por OS, con
`CONSULTA_VALORES` como fallback solo si la OS no tiene consulta cargada), los
desplegables de Atención rápida y Carga masiva (`data-val` por opción), el modal de pago
de derivación (valor de contrato para el 5% sugerido) y el reprecio
(`actualizarPreciosPrestaciones`).

**Base madre de HECHOS: `DB.registros` (las atenciones).** Cada atención congela
cantidad/valorUnit/exenta al crearse. Propiedad clave verificada: un cambio de contrato
NO altera atenciones pasadas — solo el reprecio explícito ("Actualizar precios en la
nube") las toca, desde la fecha de vigencia elegida y avisando sobre montos manuales.

**Capa de cálculo única: `js/calculos.js`.** Todos los números salen de ahí:
`exentaReg/ivaReg/totalesOS` (IVA y totales OS), `facturadoReg` (facturación),
`honorariosMedico/honorALiquidarReg` (pagos a médicos), `facturaPendiente` (estados),
`aplicarPorcentaje` (aumentos), `exentaPrestacion` (exención del nomenclador — nueva).
Cubierta por 104 autochequeos del botón "Verificar cálculos" y 212 tests Vitest.

**Flujo OS (facturación → cobro):** registros del mes → `totalesOS()` → detalle de OS /
mail / preliquidación OS (los tres muestran los mismos totales) → "Hacer factura" recibe
esos mismos totales y `confirmarFacturaOS` los CONGELA en la factura (netoExento/
netoGravado/iva/monto) → Cobranzas filtra con `facturaPendiente()` → `confirmarCobro`
crea el pago recibido + el Ingreso en banco (movimientos) → Historial muestra ⚠ si lo
cobrado difiere de lo facturado → Resumen mensual y Caja leen movimientos. Sin
recálculos intermedios: cada eslabón lee lo que congeló el anterior.

**Flujo médicos (honorarios → pago):** registros → `honorariosMedico()` → tarjetas de
Médicos, panel de preliquidación, mensaje de WhatsApp e impresión (verificado antes: los
cuatro dan lo mismo) → `cerrarMesMedico` BLOQUEA los registros del período
(`regBloqueado` impide editar/borrar) → `confirmarPagoEnviado` calcula el `aLiquidar` de
esos registros bloqueados (idéntico al panel, porque nada pudo cambiar desde el cierre) y
genera el Egreso en banco → Caja / Resumen mensual lo descuentan.

**Flujo contratos:** archivo (parse → preview con toggle IVA por fila → importar) o
Aumento por % (`aplicarPorcentaje` → preview → aplicar) → actualizan el nomenclador +
registran la vigencia en `DB.contratos` (con la observación del aumento) → exports Excel
y JSON reflejan los valores nuevos (verificado en vivo y por tests).

### Hallazgos — corregidos en esta pasada

**H1 (real, de plata): el override de IVA por prestación no viajaba del nomenclador a las
atenciones.** Al importar un contrato se puede marcar cada prestación como
exenta/gravada (`p.exenta`), y la tabla de Prestaciones lo muestra bien. Pero los 5
constructores de desplegables que CREAN atenciones (Atención rápida y los 4 de Carga
masiva) armaban su `data-exenta` con el default de la OS, ignorando el override. Una
prestación gravada-por-override en una OS exenta por default (ej. OSDE) se facturaba SIN
IVA salvo que el usuario tocara el badge a mano. **Corregido:** nueva fuente única
`exentaPrestacion(p)` en `js/calculos.js` (override manda; sin override, default de la
OS; CEMEPLA nunca exenta — mismo criterio que `exentaReg`), usada en los 5 desplegables y
en la tabla de Prestaciones. Verificado en vivo: elegir la prestación con override en
Atención rápida ahora precarga "⚡ 10.5%" y el registro se crea con IVA.

**H2 (display): "10.5%" hardcodeado donde CEMEPLA debía decir 21%.** En el preview del
contrato (fila y toggle) y en el toggle de IVA de Atención rápida. El cálculo no estaba
mal (`ivaReg` fuerza 21% para CEMEPLA), pero el usuario veía un porcentaje que no era el
que se iba a aplicar. Corregido con `getIVALabel(os, exenta)`.

**H3 (robustez): la matemática del aumento por % vivía inline en la UI.** Extraída a
`aplicarPorcentaje(valor, pct)` en `js/calculos.js` (única cuenta y único redondeo para
cualquier ajuste porcentual futuro) y sumada al diagnóstico.

### Verificaciones que PASARON sin hallazgos

- Las facturas congelan los totales de `totalesOS()` al emitirse; nadie los recalcula después.
- El egreso del pago a un médico coincide con el panel: los registros están bloqueados desde el cierre.
- Derivaciones: el pago crea el registro `pagoExtra` (→ `honorariosMedico`) y suma en `d.pagos` — ambos del mismo acto, consistentes en KPIs, listado, por-médico y liquidación.
- El reprecio (`actualizarPreciosPrestaciones`) usa Configuración como fuente de verdad, respeta la fecha de vigencia y no pisa montos manuales sin avisar.
- Exports (Excel y backup JSON) reflejan la base madre tal cual, incluido el historial de contratos con sus observaciones.

### Además en esta pasada

- Configuración reordenada: 🧪 Diagnóstico → 🔄 Actualizar precios → 💾 Datos y respaldo → solapas.
- Diagnóstico actualizado: 104 autochequeos (se sumaron `aplicarPorcentaje` ×5 y `exentaPrestacion` ×4).
- 5 tests Vitest nuevos (`tests/exenta-prestacion.test.js`). Suite completa: **212/212**.

---

## 8) Auditoría de nube, código muerto, bugs y consistencia (2026-07)

Pedido: auditar cómo se sube/baja la info de la nube (sin perder datos con el sistema
nuevo), código muerto/duplicado, bugs de cálculo e inconsistencias. Honesto y crítico.

### A) Cómo se SUBE a la nube — y sus riesgos

**Mecanismo:** cada objeto se guarda como una fila JSON en `app_data`
(`coleccion, doc_id, data jsonb`) + `app_meta` (config, nextId). `guardarEnNube` sube
SOLO las colecciones marcadas como sucias (upsert por lotes de 500), deduplica por
`(coleccion, doc_id)` para no disparar el error 21000 de Postgres, y borra de la nube
únicamente lo que el usuario eliminó en la sesión (borrado seguro por snapshot). Al
cerrar la pestaña hay un flush best-effort con keepalive.

**Fortaleza clave (verificada):** todos los campos NUEVOS de esta etapa
(`categoria` y `exenta` por prestación, `obs` en contratos, `categoria` en registros, la
colección `notas`) **sincronizan solos, sin migración de esquema**, porque el
almacenamiento es el objeto entero en JSON. No hay columnas por campo.

**Riesgos honestos que quedan (no todos resueltos):**
- **Multiusuario concurrente:** si dos personas editan la MISMA colección a la vez, es
  last-write-wins por registro (documentado desde antes; no se resolvió acá).
- **keepalive es best-effort:** token vencido (~1 h) o payload > ~64 KB pueden perder el
  flush de salida; el guardado primario async es el confiable.
- **[CORREGIDO] Re-siembra peligrosa:** si el `select` de `app_data` volvía vacío por un
  problema transitorio (RLS, red, timeout), el código lo interpretaba como "base nueva" y
  **re-sembraba las 700+ prestaciones y médicos SEMILLA encima de producción**. Ahora, si
  `app_data` viene vacío pero `app_meta` tiene datos, se **aborta la carga** (la base no es
  nueva) en vez de pisar nada. Cubierto por 2 tests nuevos.

### B) Cómo LEVANTA la info con el sistema nuevo (sin perder lo actual)

`cargarDesdeNube` vacía las colecciones y las reconstruye desde la nube. Análisis del
riesgo de que la nube (con datos viejos, de antes de estos cambios) se cargue mal:
- La colección `notas` no existía → carga vacía. **Sin pérdida** (no había notas).
- Los registros/prestaciones viejos NO tienen `categoria`/`exenta`-override → las
  funciones caen en la **detección automática** (`categoriaReg`, `exentaPrestacion`). Un
  "OCT" viejo guardado como prestación se reconoce como estudio al cargar. **Sin pérdida,
  sin corrupción** — solo se enriquece la clasificación.
- Migraciones de obras sociales y consultorios (sembrar los que falten) siguen intactas.
- **Conclusión: levantar producción con el código nuevo es seguro** — los campos nuevos
  son aditivos y hay fallback de detección para todo lo viejo.

### C) Código muerto / duplicado

- **Muerto:** ya se limpió en auditorías previas (`DB.gastos`, `DB.clinicaActiva`,
  `esLocalhost`, `prestacionesSample/osSample`). Reconfirmado: no quedan. **0 funciones
  con nombre duplicado.**
- **[CORREGIDO] Duplicación de criterio de categoría:** `getConsultasDeOS` y
  `getPrestacionesSinConsulta` filtraban con `esConsulta(desc)` directo, mientras
  `getEstudiosDeOS`/`getPracticasDeOS` (nuevas) usaban `categoriaPrestacion`. Resultado:
  si re-categorizabas una prestación a mano, los filtros se desincronizaban (aparecía en
  Estudios pero seguía en Consultas). Ahora **los 3 filtros usan la misma fuente única**.
  Idem el IVA del modal de editar prestación y el selector de derivaciones.

### D) Bugs / errores de cálculo

- **[CORREGIDO — el más importante] El pago al médico ignoraba la re-categorización.**
  `cantConsultaHon` (la función que decide qué paga honorario de consulta) miraba SOLO la
  descripción (`esConsultaReg`), ignorando el override de categoría del nomenclador y la
  categoría congelada del registro. Una consulta re-categorizada a "estudio" **seguía
  pagando honorario de consulta**. Ahora `cantConsultaHon` usa `categoriaReg` (fuente
  única), así el pago respeta la categoría. Verificado en vivo: re-categorizar una consulta
  OSDE a estudio baja el honorario de 2 a 0. *(Esto es justo la base de "calcular cuánto
  pagar por práctica" que se viene construyendo.)*
- **[CORREGIDO en el acto] Precedencia en `categoriaReg`:** una primera versión dejaba que
  la detección por texto ganara sobre el override del nomenclador (el propio test nuevo lo
  atrapó). Corregido: el override del nomenclador manda; los guards defensivos de consulta
  (precio mal guardado / número solo / descripción vacía) quedan como red para datos raros.

### E) Inconsistencia de datos

- **[CORREGIDO] La carga masiva no congelaba `categoria`** (el modal rápido sí). Ahora las
  filas de "consultas" se congelan como `consulta`, las de "prestaciones" se detectan, y el
  particular masivo como `consulta` — consistente con el alta individual.

### Lo que NO se tocó (y por qué)
- **Estudios y prácticas todavía no le pagan nada al médico.**
  > ⚠️ **DESACTUALIZADO (2026-07-07): esto YA se implementó.** Cada médico tiene tarifa por
  > estudio y por práctica (`med.pagoEstudio` / `med.pagoPractica`, modo `fijo` o `pct`) y
  > `honorPracticaReg` (js/calculos.js) las aplica; `honorariosMedico` ya suma `honPract` a
  > `aLiquidar`. Cubierto por `tests/pago-estudios-practicas.test.js`.

  Las categorías ya se
  capturan y circulan bien, pero la REGLA de cuánto se paga por estudio/práctica es una
  decisión de negocio pendiente (¿monto fijo por categoría? ¿% del valor? ¿por médico?).
  Cuando se defina, se engancha en `honorariosMedico` usando `categoriaReg`, que ya está
  listo.
- Concurrencia multiusuario y límites de keepalive: mejoras mayores para otra etapa.

### Verificación
7 tests nuevos (pago↔categoría, filtros consistentes, anti-reseed). Suite completa:
**240/240**. Diagnóstico "Verificar cálculos": **160/160** en vivo. Sin errores de consola.
