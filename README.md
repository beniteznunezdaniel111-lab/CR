# HRPilot

SaaS de Recursos Humanos con IA para empresas de España/UE y Costa Rica/LatAm (MVP). "HRPilot" es un
nombre provisional (`src/lib/config/brand.ts`).

- Plan y decisiones: [`docs/PLAN.md`](docs/PLAN.md)
- Convenciones para desarrollar: [`CLAUDE.md`](CLAUDE.md)

**Estado:** Fase 2 terminada.

- **Fase 0 (base):** registro, empresas con datos aislados (RLS), roles, invitaciones, capa de IA y
  layout.
- **Fase 1 (puestos y ofertas):** descripción interna y ofertas con IA, revisión de lenguaje
  inclusivo, versiones y exportación.
- **Fase 2 (filtrado de CVs):** subida de CVs, anonimización, encaje requisito por requisito con
  citas comprobadas, decisión siempre humana y auditada, revisión anónima, retención y aviso de
  privacidad por país.

Los módulos de las fases 3–5 llegan después.

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

Cuentas demo (contraseña `Demo1234`):

| Empresa                      | Admin                     | RRHH                     | Empleado                     |
| ---------------------------- | ------------------------- | ------------------------ | ---------------------------- |
| Logística Iberia (Demo) · ES | admin@demo-es.example.com | rrhh@demo-es.example.com | empleado@demo-es.example.com |
| Café Volcán (Demo) · CR      | admin@demo-cr.example.com | rrhh@demo-cr.example.com | empleado@demo-cr.example.com |

El registro de empresas nuevas pide el código `SIGNUP_ACCESS_CODE` (en local: `demo`). Los emails
locales (invitaciones, recuperación de contraseña) se ven en http://127.0.0.1:54324.

### IA real

Por defecto `AI_PROVIDER=mock` (respuestas fijas, sin coste). Para usar Claude, añade a `.env.local`:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-5-5
```

y comprueba la conexión con `pnpm ai:smoke`.

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
