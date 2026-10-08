# Envío automático de la preliquidación por mail (Supabase)

El botón **✉️ Enviar por mail** (Preliquidación → pestaña "Para el médico") manda al médico la
misma tabla que "Copiar preliq". Con esta Edge Function, el mail sale **solo**, en HTML con
formato, desde la casilla de la clínica (`oftaoftalmo26@gmail.com`).

Si la función NO está desplegada, el botón sigue funcionando: abre tu mail prellenado (mailto) y
lo mandás vos. Al desplegar la función, pasa a envío automático sin tocar nada más.

## Qué necesitás (una sola vez)

### 1) Contraseña de aplicación de Gmail (de oftaoftalmo26@gmail.com)
1. Entrá a la Cuenta de Google de ese mail → **Seguridad**.
2. Activá **Verificación en 2 pasos** (si no está activa).
3. Buscá **Contraseñas de aplicaciones** → creá una (nombre: "OIP Supabase").
4. Copiá la clave de **16 letras** (sin espacios). ⚠️ No la compartas por chat: va solo en Supabase.

### 2) Desplegar la función en Supabase
**Opción A — Panel web (sin instalar nada):**
1. Supabase → tu proyecto → **Edge Functions** → **Create a function** (o "Deploy via editor").
2. Nombre exacto: `enviar-preliquidacion`.
3. Pegá el contenido de `index.ts` (este mismo directorio) y **Deploy**.
4. Dejá **Verify JWT** activado (default).

**Opción B — CLI:**
```bash
supabase functions deploy enviar-preliquidacion
```

### 3) Cargar los secrets (la casilla y la contraseña)
En Supabase → **Edge Functions → Secrets** (o Project Settings → Edge Functions), agregá:

| Nombre | Valor |
|---|---|
| `GMAIL_USER` | `oftaoftalmo26@gmail.com` |
| `GMAIL_APP_PASSWORD` | la clave de 16 letras (sin espacios) |

O por CLI:
```bash
supabase secrets set GMAIL_USER=oftaoftalmo26@gmail.com GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
```

## Listo
Cargá el email de cada médico en **Configuración → Médicos** y tocá **✉️ Enviar por mail**: el
médico recibe la preliquidación desde `oftaoftalmo26@gmail.com`, automáticamente.

## Notas
- La función corre con **Verify JWT** activado: solo usuarios logueados de la app pueden enviar.
- Si Gmail rechazara el SMTP, revisá que la contraseña sea la **de aplicación** (no la normal) y
  que la verificación en 2 pasos esté activa.
- Envío de prueba (reemplazá `TU_PROYECTO` y el token de tu sesión):
  ```bash
  curl -i -X POST "https://TU_PROYECTO.supabase.co/functions/v1/enviar-preliquidacion" \
    -H "Authorization: Bearer <ACCESS_TOKEN_DE_SESION>" \
    -H "Content-Type: application/json" \
    -d '{"to":"vos@ejemplo.com","subject":"Prueba OIP","text":"Funciona ✔","html":"<b>Funciona ✔</b>"}'
  ```
