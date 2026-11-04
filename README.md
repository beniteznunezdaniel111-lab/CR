# HRPilot

SaaS de Recursos Humanos con IA para empresas de España/UE y Costa Rica/LatAm (MVP). "HRPilot" es un
nombre provisional (`src/lib/config/brand.ts`).

- Plan y decisiones: [`docs/PLAN.md`](docs/PLAN.md)
- Convenciones para desarrollar: [`CLAUDE.md`](CLAUDE.md)

**Estado:** Fase 4 terminada.

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

El módulo de formación (Fase 5) llega después.

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

## Despliegue

Vercel + Supabase (región UE). La guía completa se escribe en la Fase 6. Resumen:

1. Crear el proyecto de Supabase en una región de la UE y aplicar las migraciones
   (`supabase link` + `supabase db push`).
2. En Supabase Auth: activar la confirmación de email, configurar SMTP propio (Brevo, Resend...) y
   añadir la URL de la app a _Redirect URLs_ (`https://tu-dominio/auth/callback`).
3. En Vercel: importar el repositorio y configurar las variables de `.env.example`. `vercel.json`
   fija la región de las funciones (`fra1`) y el cron diario de retención de CVs
   (`/api/cron/retention`); define `CRON_SECRET` para que Vercel pueda llamarlo.
4. Antes de usar datos reales: planes de pago (Supabase Pro, Vercel Pro) y revisión legal
   (ver `docs/PLAN.md` § Avisos de cumplimiento).
