# Tests automáticos de OIP (Etapa 1)

Red de seguridad para refactorizar sin romper el comportamiento. Corren con
**Vitest + jsdom** contra el `index.html` de producción **sin modificarlo**.

## Cómo correr

```bash
npm install      # solo la primera vez
npm test         # corre todos los tests una vez
npm run test:watch   # modo watch (re-corre al guardar)
```

## Qué cubren

- `calculos.test.js` — cálculos puros: facturación, IVA por OS (10.5% / 21% CEMEPLA /
  exentas), honorarios (OS, Particular, SinCargo), copagos (adelanto vs complementario)
  y `totalesOS`.
- `flujos.test.js` — cobro de factura → ingreso en Caja; borrado de factura y de atención
  **sin dejar movimientos huérfanos**; reprecio por fecha de vigencia.
- `alta-atencion.test.js` — alta (`guardarAtencion`): Particular efectivo/transferencia,
  honorario al médico en el acto, copago a caja chica, y SinCargo (ingreso+egreso neto cero).
- `derivaciones.test.js` — pago de derivación que suma a la liquidación (registro pagoExtra
  con `derivId`) y borrado de la derivación que arrastra esos pagos.
- `carga-masiva.test.js` — parser del resumen pegado: helpers puros (`normalizarOSAlias`,
  `parsearFecha`, detección de médico/fecha/consultorio) y el flujo completo
  `parsearResumenPegado` (texto → formulario del modal).

### Hueco conocido de cobertura

Falta cubrir el guardado de la carga masiva (`guardarCargaMasiva` /
`_ejecutarGuardarCargaMasiva`) y las vistas de preliquidación/estadísticas (render).
Conviene agregar tests ahí antes de refactorizar esas zonas.

## Cómo funciona el harness (`harness.js`)

`index.html` es un archivo único donde `DB`, `AT` y los cálculos son `const` de nivel
superior (no accesibles desde afuera). El harness:

1. Lee `index.html` tal cual del disco (**no lo modifica**).
2. En la copia en memoria que carga jsdom, inserta un `<script>` final que expone esos
   símbolos en `window.__APP__`.
3. Carga en una URL que **no** es localhost, así no entra el modo dev y `arranque()`
   corta temprano sin tocar Supabase.

Si en el futuro se renombra alguna función/constante de las expuestas, actualizar la
lista `EXPONER` en `harness.js`.
