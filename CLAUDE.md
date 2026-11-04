# CLAUDE.md — HRPilot (SaaS de RRHH con IA)

Guía para trabajar en este repositorio. El plan completo y las decisiones acordadas están en
[`docs/PLAN.md`](docs/PLAN.md). **Fase actual: 2 (filtrado de CVs con revisión humana) terminada.** Cada fase termina con lint,
typecheck y tests en verde, commit, resumen y OK explícito del usuario antes de seguir.

## Comandos

| Comando                                  | Qué hace                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                               | Next.js en modo desarrollo (http://localhost:3000)                       |
| `pnpm lint` / `pnpm format`              | ESLint (0 warnings) / Prettier                                           |
| `pnpm typecheck`                         | `tsc --noEmit` (TypeScript estricto)                                     |
| `pnpm test`                              | Tests unitarios (Vitest, sin red ni BD)                                  |
| `pnpm test:db`                           | Tests de BD: RLS, triggers, RPCs (necesita Postgres en :54322)           |
| `pnpm test:e2e`                          | Playwright (necesita Supabase + `.env.local`; compila y arranca la app)  |
| `pnpm check`                             | lint + formato + tipos + unitarios                                       |
| `pnpm db:start` / `db:stop` / `db:reset` | Supabase local con Docker                                                |
| `pnpm db:native start`                   | Postgres nativo + shim de Supabase, solo para `test:db` sin Docker       |
| `pnpm env:local`                         | Genera `.env.local` desde `supabase status`                              |
| `pnpm setup:local`                       | `db:start` + `env:local` + `db:seed` de una vez                          |
| `pnpm diagnose`                          | Revisa Node, Docker, Supabase y `.env.local` y explica cómo arreglarlo   |
| `pnpm db:seed`                           | Empresas demo ES y CR con admin, RRHH y empleado (contraseña `Demo1234`) |
| `pnpm db:types`                          | Regenera `src/lib/supabase/database.types.ts` desde la BD local          |
| `pnpm ai:smoke`                          | Llamada real mínima a Claude (requiere `ANTHROPIC_API_KEY`)              |

## Estructura

```
src/app/                 Rutas (App Router). /app/[org]/... = zona privada por empresa
src/modules/<módulo>/    Lógica de cada módulo: actions.ts (Server Actions), queries.ts, schemas.ts
src/lib/ai/              ÚNICA capa de IA (prompts versionados, Zod, reintentos, uso, tope)
src/lib/supabase/        Clientes: server.ts (con sesión, RLS), client.ts (navegador), admin.ts (service role)
src/lib/auth/            Sesión, contexto de empresa (getOrgContext/requireOrgRole) y roles
src/lib/countries/       Configuración por país (ES, CR): formatos, normativa, trato tú/usted
src/lib/audit/           Registro de auditoría desde el servidor
src/lib/inclusive/        Reglas de lenguaje inclusivo y detector de atributos protegidos en textos de la IA
src/lib/extraction/      Texto de PDF (unpdf) y DOCX (mammoth); sin OCR. mime.ts se puede usar en el navegador
src/lib/privacy/         Anonimización de CVs (nombre, contacto, dirección, nacimiento, nacionalidad...)
src/lib/markdown.ts      Markdown → texto plano y nombres de fichero
src/components/markdown/ Editor visual (TipTap, guarda Markdown) y visor seguro (react-markdown)
src/app/print/           Vistas de impresión / PDF (sin la interfaz de la app; exigen sesión)
src/app/api/cron/        Tareas programadas (vercel.json), autorizadas con CRON_SECRET
src/lib/config/brand.ts  Nombre del producto (APP_NAME) — único sitio donde aparece "HRPilot"
messages/es.json         Todos los textos de la interfaz (next-intl)
supabase/migrations/     Esquema SQL (fuente de verdad de tablas, RLS y RPCs)
tests/unit|db|e2e        Vitest unitarios · Vitest contra Postgres · Playwright
```

## Reglas de arquitectura (no negociables)

1. **Multiempresa con RLS.** Toda tabla de negocio lleva `org_id NOT NULL`, RLS activado y
   políticas con los helpers de `private`: `org_id = any ((select private.hr_org_ids())::uuid[])`
   (también `member_org_ids`, `admin_org_ids`). El cast `::uuid[]` es obligatorio (sin él Postgres lo
   trata como subconsulta y falla). Las tablas hijas usan FK compuesta `(padre_id, org_id)`.
   `tests/db` falla si una tabla de `public` no tiene RLS o políticas.
2. **Privilegios explícitos.** Cada migración hace `revoke all ... from anon, authenticated` y concede
   solo lo necesario, por columnas cuando aplica (p. ej. el admin no puede tocar
   `ai_monthly_budget_usd`). Nada se expone a `anon` salvo `get_invitation_preview`.
3. **Service role solo en servidor y solo para:** auditoría, uso de IA, tope de gasto, cron, scripts
   y el fichero del CV (URL firmada de subida, lectura para procesarlo y borrado), siempre después de
   comprobar con la sesión del usuario que es RRHH/admin y ve la candidatura. Los datos de negocio se
   leen y escriben SIEMPRE con `lib/supabase/server.ts` (sesión del usuario).
4. **La IA solo pasa por `src/lib/ai`.** ESLint prohíbe importar `@anthropic-ai/sdk` fuera de ahí.
   - Modelo por `ANTHROPIC_MODEL` (por defecto `claude-haiku-5-5`, decisión del usuario).
   - Prompts en `src/lib/ai/prompts/<area>/<nombre>.v<N>.ts` con `definePrompt`. **Una versión
     publicada no se edita**: se crea `v<N+1>` y se registra en `prompts/registry.ts`.
   - `generateObject()` valida con Zod (salida estructurada nativa + 1 reintento con feedback),
     comprueba el tope mensual, controla tokens (< 100K por la tarifa de Haiku) y registra cada
     llamada en `ai_usage`. Cada prompt tiene `mock` para tests/CI/demos (`AI_PROVIDER=mock`).
   - Texto aportado por usuarios (CVs, documentos) va dentro de `asData()`.
   - Haiku 5.5 no admite `temperature` ni prefill y no tiene fallback de servidor ante `refusal`:
     los rechazos se convierten en `AiError("refused")`.
5. **La IA nunca decide sobre personas.** Solo sugiere; las decisiones (p. ej. estado de un
   candidato) las toma un humano mediante RPCs auditadas (`set_candidate_status`: la columna
   `status` no tiene permiso de UPDATE). El código de procesado/IA nunca llama a esa RPC. No inferir
   ni mencionar edad, sexo, origen, estado civil, salud, religión, etc.: lo prohíbe el prompt y
   `src/lib/inclusive/protected-mentions.ts` retira lo que se cuele (se registra la salvaguarda).
   Sin puntuaciones de IA: solo recuentos deterministas.
6. **Auditoría solo inserción.** `audit_events` y `ai_usage` no admiten UPDATE/DELETE (trigger), salvo
   el borrado en cascada de una empresa completa. `details` nunca lleva datos personales.
7. **Textos:** todo en `messages/es.json`; errores de validación Zod = claves de `validation.*`
   (un test comprueba que existen). Trato: interfaz tuteando, sin "vosotros". Salidas de IA:
   tú en ES, usted en CR (`country.formOfAddress`).
8. **Legal:** textos legales marcados "pendiente de revisión legal". No dar asesoramiento legal.

## Módulos

- **Puestos y ofertas (`src/modules/jobs`, Fase 1).** `save_job_position` (RPC, security invoker)
  guarda puesto + requisitos en una transacción y conserva los ids de los requisitos (los usará el
  análisis de CVs). Cada texto generado o editado es una versión inmutable de
  `job_position_versions` (numeración automática por trigger); restaurar crea una versión nueva.
  La revisión inclusiva combina `src/lib/inclusive` (instantánea) con el prompt
  `job.inclusive_review`; de la IA solo se aceptan fragmentos que aparecen literalmente en el texto.
  En España (`payTransparency`) se avisa si falta la banda salarial.
- **Candidaturas (`src/modules/candidates`, Fase 2).** Subida: `register_candidates` (RPC) +
  URL firmada por fichero (el navegador sube directo a Storage, hasta 20 PDF/DOCX de 10 MB).
  Procesado (una Server Action por CV): extracción → `cv.identity@1` localiza nombre y contacto →
  `src/lib/privacy/redaction` anonimiza el texto (también por reglas) → `store_candidate_extraction`
  guarda la identidad aparte (`candidate_pii`) → `cv.analysis@1` evalúa el texto anonimizado solo
  contra los requisitos → `analysis.ts` verifica cada cita contra el texto, retira menciones a
  atributos protegidos y calcula el recuento (solo "cumple" con cita verificada). Análisis
  inmutables (`cv_analyses` + `cv_requirement_matches`); "volver a analizar" crea otro.
  Decisiones e identidad: `set_candidate_status` y `reveal_candidate_identity` (con motivo) guardan
  historial en `candidate_events` y auditan sin comentarios. Modo anónimo por puesto: `candidate_pii`
  y el CV original solo son legibles si el puesto no es anónimo o se reveló la identidad (RLS en
  tabla y en Storage); no se puede desactivar si hay candidaturas. Retención: `retention_until`
  (subida + meses de la empresa, recalculada si cambian) y cron diario `/api/cron/retention`.
  Un puesto con candidaturas no se puede borrar. Aviso de privacidad por país
  (`privacy-notice.ts`, plantillas en `candidates.privacyTemplate`), marcado como borrador.

## Cómo añadir…

- **Una tabla:** migración nueva en `supabase/migrations/` (nunca editar una ya aplicada en remoto) →
  `org_id` + FK compuestas + RLS + privilegios explícitos → actualizar `database.types.ts`
  (`pnpm db:types`) → tests en `tests/db/`.
- **Un prompt:** fichero `vN` con `definePrompt` (id, versión, feature, effort, maxOutputTokens,
  esquemas Zod, system, user, mock) → registrarlo → test de que el mock cumple el esquema.
- **Una pantalla de módulo:** página en `src/app/app/[org]/<ruta>` con `requireOrgRole(slug, ROLES)`,
  lógica en `src/modules/<módulo>`, entrada en `src/lib/navigation.ts` y textos en `messages/es.json`.
  Al cerrar una fase, subir `CURRENT_PHASE` en `navigation.ts`.

## Entorno de desarrollo sin Docker

En el entorno cloud de Claude no se pueden descargar las imágenes de Supabase (proxy). Ahí:
`pnpm db:native start` levanta Postgres nativo con `supabase/tests/shim/supabase-shim.sql` (emula
roles, `auth` y `storage`) y aplica las migraciones; `pnpm test:db` funciona igual. Los E2E se
ejecutan en GitHub Actions con el Supabase oficial (`.github/workflows/ci.yml`).

## Decisiones de arquitectura (registro)

- Next.js 16 (App Router, `src/proxy.ts` en lugar de middleware), React 19, Tailwind 4, shadcn/ui
  (componentes copiados del repo oficial en `src/components/ui`), next-intl 4, Zod 4.
- TypeScript 6 (no 7: typescript-eslint aún no lo soporta).
- Empresa activa en la URL (`/app/[slug]`); el slug `new` está reservado.
- Invitaciones propias (tabla `invitations`, token de 256 bits, solo se guarda el SHA-256, 7 días):
  la aceptación es una RPC que exige sesión y que el email coincida.
- Registro abierto con `SIGNUP_ACCESS_CODE`; con invitación válida no se pide código.
- Confirmación de email desactivada en local (`supabase/config.toml`); activarla en producción.
- `pgvector` se activa en la Fase 4 (no hace falta antes).
- Tope de IA por empresa en `organizations.ai_monthly_budget_usd` (20 $ por defecto), gestionado por
  la plataforma; aviso al 80 % (Fase 6) y bloqueo al 100 %.
- Formularios con React 19: las Server Actions devuelven `values` (sin contraseñas) en los errores
  y los campos los usan como `defaultValue`; los selects de formularios usan `ControlledSelect`
  (input oculto propio) para no perder el valor al reiniciarse el formulario.
- Editor de textos: TipTap + `@tiptap/markdown` (se guarda Markdown). PDF mediante vista de
  impresión (`/print/...` + «Guardar como PDF» del navegador), sin dependencias de servidor.
- CVs: el análisis usa dos llamadas (identidad sobre el CV original; evaluación sobre el texto
  anonimizado) para que la IA que evalúa nunca vea nombre ni contacto. `unpdf` y `mammoth` van en
  `serverExternalPackages`. Las Server Actions se ejecutan en serie desde el navegador, así que una
  tanda de 20 CVs se analiza uno a uno (con progreso).
- `requireHrContext(orgId)` (`src/lib/auth/hr-context.ts`) es el contexto común de las Server
  Actions de RRHH.
