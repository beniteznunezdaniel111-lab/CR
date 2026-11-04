# HRPilot

SaaS de Recursos Humanos con IA para empresas de España/UE y Costa Rica/LatAm (MVP). "HRPilot" es un
nombre provisional (`src/lib/config/brand.ts`).

- Plan y decisiones: [`docs/PLAN.md`](docs/PLAN.md)
- Convenciones para desarrollar: [`CLAUDE.md`](CLAUDE.md)

**Estado:** MVP completo (fases 0 a 6).

- **Fase 0 (base):** registro, empresas con datos aislados (RLS), roles, invitaciones, capa de IA y
  layout.
- **Fase 1 (puestos y ofertas):** descripción interna y ofertas con IA, revisión de lenguaje
  inclusivo, versiones y exportación.
- **Fase 2 (filtrado de CVs):** subida de CVs, anonimización, encaje requisito por requisito con
  citas comprobadas, decisión siempre humana y auditada, revisión anónima, retención y aviso de
  privacidad por país.
- **Fase 3 (entrevistas y onboarding):** guías de entrevista por puesto o candidatura con rúbrica
  y PDF; planes 30/60/90 editables, asignación a nuevas incorporaciones y seguimiento de tareas.
- **Fase 4 (FAQ interna):** documentos de la empresa (PDF/DOCX), búsqueda híbrida, respuestas en
  streaming con citas (documento, página y fragmento), "no lo sé" cuando no hay respaldo,
  consultas a RRHH con aviso dentro de la app y preguntas frecuentes anónimas para RRHH.

- **Fase 5 (formación y evaluaciones):** formaciones generadas con IA desde un tema o documentos
  (índice, módulos con ejemplos y resumen, test con explicaciones), edición, publicación,
  duplicado, asignación con fecha límite y aviso, test con nota calculada en el servidor (70 %,
  mejor nota) y panel de progreso por formación y por persona.

- **Fase 6 (demo):** inicio adaptado a cada rol, empresa demo con datos ficticios (España o Costa
  Rica, se borra sola a los 14 días), uso de IA con aviso al 80 % del tope, exportar y borrar los
  datos de una persona, cierre de empresa, pantallas de error y de carga, y esta guía de
  despliegue.

## Requisitos

- Node.js 22+ y pnpm 10 (`corepack enable`)
- Docker (para Supabase local)

## Puesta en marcha (local)

```bash
pnpm install
pnpm db:start        # Supabase local (Docker). Aplica las migraciones.
pnpm env:local       # Crea .env.local con las claves locales (IA en modo mock)
pnpm db:seed         # Empresas demo "Logística Iberia (Demo)" y "Café Volcán (Demo)"
pnpm dev             # http://localhost:3000
```

Los tres pasos de Supabase se pueden hacer de una vez con `pnpm setup:local`. Si algo no arranca,
`pnpm diagnose` revisa Node, Docker, Supabase y `.env.local` y dice qué hacer.

Cuentas demo (contraseña `Demo1234`):

| Empresa                      | Admin                     | RRHH                     | Empleado                     |
| ---------------------------- | ------------------------- | ------------------------ | ---------------------------- |
| Logística Iberia (Demo) · ES | admin@demo-es.example.com | rrhh@demo-es.example.com | empleado@demo-es.example.com |
| Café Volcán (Demo) · CR      | admin@demo-cr.example.com | rrhh@demo-cr.example.com | empleado@demo-cr.example.com |

El registro de empresas nuevas pide el código `SIGNUP_ACCESS_CODE` (en local: `demo`). Los emails
locales (invitaciones, recuperación de contraseña) se ven en http://127.0.0.1:54324.

### Problemas frecuentes

- **Primero:** `pnpm diagnose` indica qué falta y cómo arreglarlo.
- **«Falta NEXT_PUBLIC_SUPABASE_URL…» al abrir la app:** no existe `.env.local`. Con Docker Desktop
  abierto, ejecuta `pnpm db:start` (espera a que termine), después `pnpm env:local` y reinicia
  `pnpm dev` (Ctrl+C y otra vez). Next.js solo lee las variables al arrancar.
- **`pnpm db:start` falla:** comprueba que Docker Desktop está abierto. La primera vez descarga
  varias imágenes y tarda unos minutos.
- **Puertos ocupados (54321, 54322…):** hay otro Supabase local en marcha; páralo con
  `pnpm exec supabase stop --all`.

### IA real

Por defecto `AI_PROVIDER=mock` (respuestas fijas, sin coste). Para usar Claude, añade a `.env.local`:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-5-5
```

y comprueba la conexión con `pnpm ai:smoke`.

Para la búsqueda semántica de la FAQ, añade también la clave de Voyage AI (sin ella, la FAQ funciona
en modo básico: solo encuentra coincidencias de palabras):

```bash
VOYAGE_API_KEY=pa-...
VOYAGE_MODEL=voyage-3.5
```

Al cambiar de modo (o de modelo) hay que reprocesar los documentos desde "Documentos de la FAQ".

## Tests

```bash
pnpm check           # lint + formato + tipos + unitarios
pnpm test:db         # aislamiento entre empresas, permisos por rol, auditoría (necesita la BD)
pnpm test:e2e        # flujo completo en navegador (necesita Supabase y .env.local)
```

Sin Docker, los tests de base de datos pueden ejecutarse sobre un Postgres nativo:
`pnpm db:native start && pnpm test:db` (ver `scripts/native-db.sh`).

La CI de GitHub Actions ejecuta todo lo anterior, incluidos los E2E con el Supabase oficial.

## Variables de entorno

Documentadas en [`.env.example`](.env.example).

## Despliegue (Vercel + Supabase)

Guía para poner la app en producción con datos de prueba. **Antes de usar datos reales** hacen
falta planes de pago (Supabase Pro y Vercel Pro), la revisión legal de los textos marcados como
"pendiente de revisión legal" y los avisos de `docs/PLAN.md` (§ Avisos de cumplimiento).

### 1. Supabase (región UE)

1. Crea un proyecto en una región de la UE (p. ej. Frankfurt) y guarda la contraseña de la base de
   datos.
2. Aplica las migraciones desde tu equipo:

   ```bash
   pnpm exec supabase link --project-ref <ref-del-proyecto>
   ```

   ```bash
   pnpm exec supabase db push
   ```

   Crean tablas, RLS, funciones, la extensión `vector` y los buckets privados de Storage (`cvs`,
   `kb-documents`, `training-sources`).

3. **Authentication → Providers → Email:** activa _Confirm email_.
4. **Authentication → URL Configuration:** _Site URL_ = `https://tu-dominio` y añade
   `https://tu-dominio/auth/callback` y `https://tu-dominio/auth/confirm` a _Redirect URLs_.
5. **Authentication → Emails → SMTP:** configura un SMTP propio (Brevo, Resend…): el de Supabase
   solo sirve para pruebas y tiene un límite muy bajo.
6. **Project Settings → API:** copia la URL, la clave publicable y la clave secreta.

### 2. Vercel

1. Importa el repositorio (framework Next.js; `vercel.json` fija la región `fra1`).
2. Variables de entorno (todas documentadas en [`.env.example`](.env.example)):

   | Variable                               | Valor                                                     |
   | -------------------------------------- | --------------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL`                 | `https://tu-dominio`                                      |
   | `NEXT_PUBLIC_SUPABASE_URL`             | URL del proyecto                                          |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave publicable                                          |
   | `SUPABASE_SECRET_KEY`                  | clave secreta (solo servidor)                             |
   | `AI_PROVIDER`                          | `anthropic` (o `mock` para una demo sin coste)            |
   | `ANTHROPIC_API_KEY`                    | clave de la API de Anthropic                              |
   | `ANTHROPIC_MODEL`                      | `claude-haiku-5-5`                                        |
   | `VOYAGE_API_KEY`                       | clave de Voyage AI (búsqueda semántica de la FAQ)         |
   | `SIGNUP_ACCESS_CODE`                   | código largo y aleatorio mientras el registro sea privado |
   | `SMTP_*`                               | el mismo SMTP que en Supabase (emails de invitación)      |
   | `CRON_SECRET`                          | `openssl rand -hex 32` (Vercel lo envía al cron)          |

3. Despliega y comprueba la IA con `pnpm ai:smoke` en local con las mismas claves.

### 3. Tareas programadas

`vercel.json` programa cada día `/api/cron/retention` (03:17 UTC), que borra:

- las candidaturas cuyo plazo de retención ha vencido (con su CV);
- las conversaciones de la FAQ sin actividad en 12 meses y los avisos de más de 12 meses;
- las empresas demo con más de 14 días (con sus ficheros).

Sin `CRON_SECRET` el endpoint responde 401 y no borra nada.

### 4. Después de desplegar

- Regístrate (con el código de acceso), crea tu empresa o prueba una **empresa demo** (España o
  Costa Rica) desde la pantalla de alta.
- El tope de IA por empresa (`organizations.ai_monthly_budget_usd`, 20 $ por defecto) lo cambia la
  plataforma por SQL; el admin ve el consumo en **Ajustes → Uso de IA** y un aviso al 80 %.
- Si cambias de proveedor o modelo de embeddings, reprocesa los documentos de la FAQ.

### Costes orientativos (piloto pequeño)

Con Claude Haiku 5.5 (0,10 $ / 0,50 $ por millón de tokens) un análisis de CV o una guía de
entrevista cuesta del orden de céntimos; los embeddings de Voyage, fracciones de céntimo. El tope
mensual protege de sorpresas: al 100 % las funciones con IA se bloquean hasta el mes siguiente.
