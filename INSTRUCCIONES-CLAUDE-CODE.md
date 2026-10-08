# Instrucciones para reorganizar la app OIP con Claude Code

Este documento es para pasárselo a Claude Code. Contiene el contexto de la app, el plan de trabajo por etapas, los prompts en orden, y las reglas que no se deben romper.

**Leé la sección "Antes de empezar" — es la parte más importante.**

---

## Antes de empezar (leer obligatorio)

Esta app **está en producción y maneja dinero real** (facturación a obras sociales, honorarios médicos, caja). Tiene meses de reglas de negocio afinadas y muchos bugs ya corregidos uno por uno.

El riesgo número uno de este trabajo es **romper algo que hoy funciona**. El dueño de la app no programa, así que no va a detectar una regresión hasta que un número salga mal en una liquidación. Por eso:

- **NO se hace una reescritura grande de una sola vez.** Se separa en módulos por etapas, una pieza a la vez, verificando que el comportamiento sea idéntico después de cada paso.
- **El objetivo es cambiar la ESTRUCTURA, no el COMPORTAMIENTO.** La app tiene que funcionar exactamente igual antes y después.
- **Antes de separar archivos hay que construir tests automáticos.** Sin esa red, el refactor es a ciegas.

---

## Qué es la app

- **Archivo único:** `index.html` (~10.500 líneas). HTML + CSS + JavaScript vanilla, sin frameworks, sin build.
- **Backend:** Supabase (tablas genéricas `app_data` y `app_meta` que guardan colecciones en JSON). Login con Google OAuth. RLS activado.
- **Deploy:** GitHub Pages (repo público). Se sube el `index.html` y se publica solo.
- **Uso:** gestión de un consultorio oftalmológico con dos sedes (Palpa y Haedo). Un solo equipo de usuarios.
- **Idioma:** español argentino.

### Secciones de la app
Dashboard, Atenciones (carga individual y masiva), Obras Sociales, Médicos, Finanzas (Caja chica, Caja, Cobranzas, Facturas OS), Derivaciones, Estadísticas, Alarmas, Configuración, Preliquidación.

---

## Modelo de datos

Todo el estado vive en un objeto global `DB` con estas colecciones (todas se sincronizan con la nube vía el array `COLECCIONES`):

`registros` (atenciones), `medicos`, `prestaciones` (nomenclador), `facturas`, `liquidaciones`, `cajaChica`, `alarmas`, `derivaciones`, `contratos`, `movimientos` (caja banco), `pagosRecibidos`, `obrasSociales`, `aumentos`.

### Flujo de guardado (delicado, no romper)
- Las funciones modifican `DB` y llaman a `marcarCambios(coleccion)` para marcar qué cambió.
- Hay un autoguardado con debounce y una **"red de seguridad"** que cada 3 segundos compara un snapshot y guarda cambios que no se marcaron (incluso mutaciones profundas como `factura.estado='Pagada'`). También chequea antes de cada guardado y al ocultar la página.
- `cargarDesdeNube` reconstruye `DB` desde Supabase al arrancar, con migraciones que agregan colecciones/OS faltantes sin pisar lo existente.

---

## Reglas de negocio críticas (NO cambiar la lógica)

Estas reglas ya están afinadas y verificadas. El refactor NO debe alterarlas:

- **Facturación:** `facturadoReg(r)` es la fuente única de cuánto factura una atención. Particular = efectivo×valor + transferencia×valor. OS = neto + IVA.
- **IVA por obra social:** la mayoría 10.5%; CEMEPLA 21%; varias OS son exentas (sin IVA). Hay funciones `getExentaForOS` y `totalesOS`.
- **Copago-adelanto** (Bristol, CoberMed, Medical's): el copago se descuenta de lo que paga la OS. El complementario NO se descuenta.
- **Honorarios médicos:** consulta OS paga honorario fijo; Particular = mitad del valor; SinCargo paga $0,1; cirugías/estudios no pagan honorario fijo de consulta.
- **SinCargo** (OS especial): solo consulta 420101, paciente paga $0,1 por transferencia que se paga al médico el mismo día (movimiento neto cero, entra y sale). Nombre del paciente obligatorio.
- **Dos cajas:** Caja chica = efectivo por sede. Caja = banco (transferencias + cobros OS) + efectivo (caja chica) = total.
- **Reprecio:** al actualizar precios con una fecha de vigencia, las atenciones desde esa fecha toman el valor nuevo; las anteriores quedan intactas. El match es por código primero, después por descripción, y para consultas por OS+plan.
- **Ciclo de vida de los datos:** cada cosa que crea un dato o movimiento debe poder borrarse limpio. Al borrar una atención/factura/derivación, se limpian los movimientos de caja asociados (por `regId`/`facturaId`/`derivId`) para no dejar datos huérfanos. **Esta regla es central: cualquier refactor debe preservarla.**

---

## Tests que ya existen

Hay una función `runSelfTests()` (botón "Verificar cálculos" en Configuración) con ~65 tests de cálculo. **Cubren cálculos, no la app entera.** El refactor necesita tests más completos (ver Etapa 1).

---

## Plan de trabajo por etapas

Hacé las etapas EN ORDEN. No pases a la siguiente hasta que la actual esté verificada y commiteada.

### Etapa 0 — Entender (sin tocar nada)
Leer todo el archivo y documentar la arquitectura. No proponer ni hacer cambios.

### Etapa 1 — Red de tests (lo más importante)
Montar un entorno de testing automático (Vitest + jsdom) y escribir tests de los flujos críticos que pasen contra el código actual SIN modificarlo. Esta es la red que hace seguro todo lo demás.

### Etapa 2 — Separar en módulos por capas (sin cambiar comportamiento)
Extraer de a un módulo por vez: estado/datos, lógica de negocio (cálculos puros), persistencia (Supabase), y UI por sección. Después de cada extracción, correr todos los tests y confirmar que pasan.

### Etapa 3 — Build
Configurar un build (Vite) que junte los módulos en un `index.html` final desplegable en GitHub Pages, idéntico en comportamiento al original.

---

## Prompts (usar de a uno, en orden)

### Prompt 0 — Entender antes de tocar
```
Este es un sistema de gestión médica en un solo archivo index.html (~10.500
líneas, HTML+CSS+JS vanilla, backend Supabase, EN PRODUCCIÓN, maneja dinero real).
Leé el archivo INSTRUCCIONES-CLAUDE-CODE.md que está en esta carpeta antes de nada.

No cambies nada todavía. Primero leé todo index.html y escribí un documento
ARQUITECTURA.md que explique: qué hace cada sección, el modelo de datos (objeto DB),
el flujo de guardado a la nube, y las reglas de negocio de facturación (honorarios,
IVA por obra social, copagos, reprecio, las dos cajas). Listá todas las funciones de
más de 80 líneas. No propongas ni hagas cambios todavía.
```

### Prompt 1 — Red de tests
```
Antes de refactorizar necesito tests automáticos que corran sin navegador.
Configurá Vitest con jsdom. Escribí tests para los flujos críticos:
- cargar una atención (OS y Particular) y verificar su facturación
- cobrar una factura y que el ingreso entre a Caja
- cargar y borrar una atención, verificando que NO queden movimientos huérfanos en caja
- honorarios, IVA y copagos por cada obra social
- el reprecio de atenciones por fecha de vigencia
Los tests tienen que pasar contra el código ACTUAL sin modificarlo. Confirmá que
todos pasan antes de seguir. No cambies comportamiento.
```

### Prompt 2 — Separar en módulos
```
Ahora separá el código en módulos por capas, SIN cambiar ningún comportamiento:
- estado/datos (el objeto DB y su manejo)
- lógica de negocio (cálculos puros: facturadoReg, totalesOS, honorarios, IVA, reprecio)
- persistencia (todo lo de Supabase: cargar, guardar, red de seguridad)
- UI por sección (dashboard, atenciones, finanzas, etc.)
Hacelo de a UN módulo por vez. Después de extraer cada módulo, corré TODOS los tests
y confirmá que siguen pasando antes de pasar al siguiente. Hacé un commit de git
después de cada módulo que funcione. Si algún test falla, frená y avisame.
```

### Prompt 3 — Build
```
Quiero seguir desplegando en GitHub Pages como un solo archivo. Configurá un build
con Vite que junte todos los módulos en un index.html final autocontenido (con el JS
y CSS embebidos, sin dependencias externas salvo las que ya usa la app). Verificá con
los tests que el archivo resultante funciona idéntico al original. Documentá en el
README cómo correr el build y cómo desplegar.
```

---

## Reglas permanentes (repetírselas a Claude Code)

1. **No cambies comportamiento, solo estructura.** La app debe funcionar idéntica antes y después.
2. **Después de cada cambio, corré los tests y confirmá que pasan.** Si fallan, frená.
3. **Commit de git después de cada paso que funcione** (para poder volver atrás).
4. **Si vas a tocar una regla de negocio, frená y preguntá primero.** No "mejores" cálculos por tu cuenta.
5. **Preservá el ciclo de vida de los datos:** lo que se crea se vincula, lo que se borra arrastra lo asociado (sin huérfanos).
6. **No migres a un framework** (React/Vue). El objetivo es modularizar vanilla JS, no reescribir.
7. **Nunca digas que algo está terminado sin haberlo verificado con los tests.**

---

## Cómo poner la app en una carpeta con git (pasos previos)

1. Creá una carpeta nueva, por ejemplo `oip-app`.
2. Poné adentro el `index.html` actual y este `INSTRUCCIONES-CLAUDE-CODE.md`.
3. En esa carpeta, inicializá git: `git init && git add . && git commit -m "version inicial funcionando"`.
4. Abrí Claude Code en esa carpeta y empezá con el Prompt 0.

Tener git desde el inicio es lo que te permite volver atrás si algo se rompe. Cada vez
que un paso funcione, hacé un commit. Si algo sale mal, volvés al commit anterior.
