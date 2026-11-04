# HRPilot — Plan del MVP (aprobado)

> Documento de referencia del MVP. Aprobado el 2026-11-04 con un cambio: el modelo de IA por defecto es **Claude Haiku 5.5** (`claude-haiku-5-5`).
> Las decisiones marcadas como "por defecto" se pueden revisar en cualquier fase.

## 1. Objetivo

SaaS de RRHH con IA, multiempresa desde el primer día, para validar con empresas reales de **España/UE** y **Costa Rica/LatAm**. Interfaz y salidas de IA en español (i18n preparada, solo `es`). "HRPilot" es un nombre provisional centralizado en `src/lib/config/brand.ts`.

## 2. Arquitectura

- **Una sola app Next.js** (App Router, TypeScript estricto, Server Actions + Route Handlers). Cada módulo vive en `src/modules/<módulo>`. Capas comunes:
  - `src/lib/supabase`
  - `src/lib/auth`
  - `src/lib/ai`
  - `src/lib/storage`
  - `src/lib/extraction`
  - `src/lib/countries`
  - `src/lib/audit`
  - `src/lib/email`
- **Multiempresa:**
  - Esquema compartido.
  - Todas las tablas de negocio llevan `org_id`, RLS y FKs compuestas `(padre_id, org_id)`.
  - La empresa activa va en la URL: `/app/[org]/…`.
  - Un usuario puede pertenecer a varias empresas.
- **Idioma:** next-intl con `messages/es.json`. Fechas, números y moneda se formatean con `Intl` según el país (`es-ES` / `es-CR`). Las rutas van en inglés y los textos en español.
- **País** (`src/lib/countries/{es,cr}.ts`) define:
  - moneda y formatos;
  - normativa de referencia y autoridad de control (AEPD / PRODHAB);
  - plantillas legales;
  - nombres de documentos;
  - trato en las salidas de IA (tú en ES, usted en CR).
- **Capa `src/lib/ai/`**, la única vía para llamar a Claude:
  - **Modelo:** `ANTHROPIC_MODEL`, por defecto `claude-haiku-5-5`.
  - **Prompts versionados** en `src/lib/ai/prompts/<tarea>/v<N>.ts`: system prompt, plantilla, esquema Zod de salida, `max_tokens` y `effort`. Una versión publicada no se edita: se crea la siguiente. La auditoría guarda `prompt_id@version`.
  - **Tipos de llamada:**
    - `generateObject()`: salida estructurada nativa (`output_config.format` + `zodOutputFormat`), con validación Zod y un reintento con feedback si no valida.
    - `generateText()` y streaming para textos largos.
    - Respuestas con citas nativas (bloques `search_result`) para la FAQ.
  - **Errores:** reintentos del SDK ante 429/5xx. Los rechazos (`refusal`) se tratan como error controlado; en Haiku 5.5 no hay fallback del servidor.
  - **Control de tokens:**
    - límite de entrada por tarea;
    - conteo con `count_tokens` cuando la entrada es grande;
    - las entradas se mantienen por debajo de 100K tokens (por encima, la tarifa de Haiku 5.5 se multiplica por 5);
    - tope mensual de gasto por empresa.
  - **Registro de uso:** cada llamada se guarda en `ai_usage` (empresa, usuario, tarea, prompt@versión, modelo, tokens, coste estimado, duración, estado).
  - **Proveedor `mock`:** devuelve respuestas fijas, sin coste, para tests, CI y E2E.
  - **Datos no fiables:** los textos de CVs y documentos van delimitados como datos.
- **Embeddings:** interfaz `EmbeddingProvider` con implementación de Voyage AI (modelo de gama media de la familia actual, 1024 dimensiones). Se guarda el modelo usado en cada documento. Alternativa UE: Mistral `mistral-embed`.
- **Ficheros:**
  - Subida directa del navegador a Supabase Storage con URL firmada, para evitar el límite de 4,5 MB de las funciones de Vercel.
  - Extracción con `unpdf` (PDF) y `mammoth` (DOCX).
- **Tareas largas:** una petición por elemento (un CV, un módulo de formación), con estado persistido y reintento. No hay servicio de colas.
- **Tareas programadas:** cron diario de Vercel para la retención de CVs.
- **Despliegue:** Vercel (funciones en `fra1`) y un único proyecto de Supabase en región UE para todos los clientes.

## 3. Fases

Al terminar cada fase: lint, typecheck y tests; commit y push; resumen; y esperar el OK.

### Fase 0 — Base
1. **Proyecto:** Next.js, TS estricto, ESLint, Prettier, Tailwind, shadcn/ui, next-intl, Zod, Vitest, Playwright, pnpm.
2. **Supabase local:**
   - migraciones base (organizaciones, perfiles, membresías, invitaciones, auditoría, uso de IA);
   - funciones auxiliares de RLS;
   - RPCs;
   - triggers (auditoría, último admin, solo inserción);
   - buckets privados con sus políticas.
3. **Acceso:** registro con código de acceso (`SIGNUP_ACCESS_CODE`), login y recuperación de contraseña. Alta de empresa: quien la crea queda como admin.
4. **Usuarios:**
   - invitación con rol y aceptación;
   - cambio de rol, desactivación y baja, sin poder quitar al último admin;
   - enlace de invitación copiable; email si hay SMTP.
5. **Interfaz:**
   - navegación según el rol y selector de empresa;
   - ajustes de empresa (país, datos, meses de retención);
   - páginas legales marcadas "pendiente de revisión legal".
6. **Capas comunes:** `lib/countries`, `lib/ai` (con mock y tests), `lib/audit` y `lib/email`.
7. **Seed:** "Demo ES" y "Demo CR", cada una con admin, RRHH y empleado.
8. **Tests:**
   - aislamiento RLS con 2 empresas × 3 roles, en tablas y en Storage;
   - un test que falla si alguna tabla de `public` no tiene RLS;
   - E2E: registro → invitación → menú según rol.
9. **Repositorio:** CI en GitHub Actions, `CLAUDE.md`, README y `.env.example`.

### Fase 1 — Descripciones de puesto y ofertas
1. Tablas de puestos, requisitos (imprescindible/deseable) y versiones.
2. Formulario del puesto.
3. Prompt `job.generate`: descripción interna y oferta en versión LinkedIn, portal de empleo genérico y web propia.
4. Revisión inclusiva en dos capas:
   - reglas fijas: edad, sexo, estado civil, nacionalidad, "buena presencia", "nativo"…;
   - revisión por IA: fragmento, motivo y alternativa.
5. En ES: aviso si falta la banda salarial y detección de peticiones de historial salarial (transparencia retributiva).
6. Editor visual que guarda en Markdown, con versiones, historial y restauración.
7. Exportar: copiar, `.md` y PDF (vista de impresión).
8. Ficha del puesto como base de los módulos 2 y 3.

### Fase 2 — Filtrado de CVs con revisión humana
1. Tablas:
   - candidatos;
   - datos identificativos aparte (`candidate_pii`);
   - análisis y cumplimiento por requisito.
2. Subida de hasta 20 CVs (PDF/DOCX). Sin OCR: un PDF escaneado da un error claro.
3. Proceso de cada CV:
   1. extracción estructurada;
   2. texto sin datos identificativos;
   3. evaluación solo contra los requisitos (cumple / parcial / no consta, con cita literal), resumen y preguntas para la entrevista.
4. Salvaguardas:
   - prohibición explícita en el system prompt;
   - la salida no puede mencionar atributos protegidos;
   - las evidencias se verifican contra el texto del CV;
   - a la IA solo llega texto, nunca la foto.
5. Sin puntuación de IA. Solo un recuento fijo de requisitos cumplidos para ordenar y filtrar.
6. Estados (pendiente → revisado → avanza / no avanza):
   - solo los cambia una persona, mediante la RPC `set_candidate_status`;
   - el comentario es opcional;
   - todo queda auditado.
7. Aviso visible "Sugerencia de IA – requiere revisión humana".
8. Modo anónimo:
   - se activa por puesto;
   - oculta datos identificativos y el CV original;
   - la identidad se revela con una acción manual con motivo, auditada.
9. Retención:
   - por defecto 12 meses desde la subida, configurable por empresa;
   - borrado automático diario y borrado a petición del candidato;
   - en auditoría quedan solo metadatos seudónimos.
10. Aviso de privacidad para candidatos según el país (plantillas, marcado como borrador).

### Fase 3 — Guías de entrevista y onboarding
1. **Guía de entrevista:**
   - se genera desde un puesto y, opcionalmente, un candidato;
   - incluye preguntas por competencias, técnicas y STAR, qué buscar y una rúbrica de 1 a 5;
   - sin preguntas personales; en ES, sin historial salarial;
   - no se edita (se regenera); se exporta a PDF.
2. **Plan de onboarding:**
   - plan 30/60/90 generado y editable;
   - se asigna a un nuevo empleado, que puede no tener cuenta, con su fecha de inicio;
   - RRHH marca las tareas completadas;
   - el empleado no ve el plan.

### Fase 4 — FAQ interna
1. Admin y RRHH suben los documentos.
2. Ingesta: troceo por secciones con número de página, embeddings y búsqueda híbrida (vectorial + léxica en español) con umbral de relevancia.
3. Respuesta:
   - sin fragmentos relevantes, no se llama a la IA: "No encuentro esto en la documentación" y botón "Preguntar a RRHH";
   - con fragmentos, citas nativas y streaming;
   - una respuesta sin cita válida se sustituye por "no lo sé".
4. El chat tiene en cuenta las preguntas anteriores de la conversación.
5. "Preguntar a RRHH": la consulta va a la bandeja de RRHH y la respuesta se notifica dentro de la app.
6. Panel de RRHH:
   - preguntas frecuentes agrupadas por similitud, sin identidad (con aviso en el chat);
   - preguntas sin respuesta;
   - consultas abiertas.
7. Las conversaciones se conservan 12 meses.

### Fase 5 — Formación y evaluaciones
1. Generación desde un tema o desde documentos (subidos o de la FAQ): índice → módulos (contenido, ejemplos, resumen) → test con explicaciones.
2. RRHH edita y publica. Un test que ya tiene intentos no se edita: se duplica.
3. Asignación a empleados con fecha límite opcional.
4. Test: aprobado con 70 %, intentos ilimitados y se guarda la mejor nota. Las respuestas correctas son secretas y la nota se calcula en el servidor.
5. Panel de progreso por formación y por empleado.

### Fase 6 — Pulido para la demo
1. Inicio adaptado a cada rol, estados vacíos, errores claros, responsive y accesibilidad.
2. Modo demo: "Crear empresa demo" (ES o CR) copia datos ficticios y resultados ya generados en un espacio aislado y desechable.
3. Exportar o borrar los datos de una persona y cerrar una empresa.
4. Página de uso de IA para el admin, con aviso al 80 % del tope.
5. README de despliegue y E2E final.

## 4. Esquema de base de datos

**Relaciones:**
```
organizations
├── memberships ── profiles (1:1 auth.users)
├── invitations
├── audit_events (solo inserción) · ai_usage (solo inserción)
├── job_positions
│   ├── job_requirements
│   ├── job_position_versions
│   ├── candidates ── candidate_pii (1:1)
│   │   └── cv_analyses ── cv_requirement_matches
│   ├── interview_guides (candidato opcional)
│   └── onboarding_plans ── onboarding_plan_tasks
│       └── onboarding_assignments ── onboarding_assignment_tasks
├── kb_documents ── kb_chunks (vector(1024) + tsvector español)
├── faq_conversations ── faq_messages
├── hr_queries
└── trainings
    ├── training_sources · training_modules
    ├── training_quiz_questions ── training_quiz_keys (1:1, solo RRHH)
    └── training_assignments ── training_module_progress · training_attempts
```

**RLS:**
- Funciones auxiliares en el esquema `private`: `is_member`, `has_role`, `is_hr`, `is_admin`. Son `security definer`, no se exponen por la API y se usan como `(select private.is_hr(org_id))`.
- Permisos por tabla:

| Tablas | Empleado | RRHH | Admin |
|---|---|---|---|
| `organizations` | leer la suya | leer | leer y editar |
| `memberships`, `profiles` | lo propio | leer | gestionar |
| `invitations`, `ai_usage` | — | — | gestionar / leer |
| `audit_events` | — | leer (puestos y candidatos) | leer |
| Módulos 1–3 | — | todo | todo |
| `candidate_pii` y CV original | — | si el puesto no es anónimo o se reveló | igual |
| `kb_documents`, `kb_chunks` | leer los listos | gestionar | gestionar |
| `faq_*` | solo lo propio | estadísticas agregadas (RPC) | igual |
| `hr_queries` | crear y leer las propias | leer y responder | leer y responder |
| Formaciones | las asignadas y publicadas | todo | todo |
| `training_quiz_keys` | — | todo | todo |

- **Garantías (con tests):**
  - toda política exige pertenecer a la empresa de la fila;
  - una tabla sin RLS hace fallar la CI;
  - `audit_events` y `ai_usage` son de solo inserción, incluso con la clave de servicio;
  - el estado del candidato solo cambia mediante una RPC que exige un usuario de RRHH o Admin;
  - el anonimato se aplica en la base de datos y en Storage;
  - la búsqueda vectorial respeta RLS y filtra por empresa;
  - la nota de los tests se calcula en el servidor.

## 5. Decisiones acordadas

| Tema | Decisión |
|---|---|
| Modelo de IA | `claude-haiku-5-5` (0,10 $ / 0,50 $ por millón de tokens con prompts ≤ 100K), configurable con `ANTHROPIC_MODEL` |
| Embeddings | Voyage AI (requiere permitir `api.voyageai.com` y `VOYAGE_API_KEY` en la Fase 4) |
| Despliegue | Lo hace el usuario siguiendo el README |
| Datos en desarrollo y demos | Ficticios y planes gratuitos hasta el primer piloto real; antes, Supabase Pro, Vercel Pro y revisión legal |
| Email | SMTP (Brevo o Resend) configurado en Supabase y en la app; mientras tanto, enlace copiable |
| Registro | Abierto con código de acceso configurable; las invitaciones no necesitan código |
| Tope de IA | ~20 $/mes por empresa, aviso al 80 % y bloqueo al 100 % |
| Países | ES y CR (ampliable); interfaz tuteando y sin "vosotros" |
| Superadmin | Sin panel; el uso global se consulta por SQL |
| Marca | Neutra hasta tener logo |

## 6. Avisos de cumplimiento (no es asesoramiento legal)

Conviene revisarlos con un especialista antes de usar datos reales:
- **RIA (UE) 2024/1689:** el filtrado de CVs es de alto riesgo. Hay obligaciones documentales y de conformidad que quedan fuera del código.
- **RGPD:** probablemente harán falta una evaluación de impacto (EIPD) y un contrato de encargado del tratamiento con cada cliente. Anthropic y Voyage procesan los datos fuera de la UE.
- **Directiva (UE) 2023/970 de transparencia retributiva:** informar del salario o su banda y no preguntar por el salario anterior.
- **Costa Rica, Ley 8968:** las plantillas de aviso son borradores.
