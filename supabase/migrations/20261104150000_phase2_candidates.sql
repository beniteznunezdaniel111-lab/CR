-- =============================================================================
-- HRPilot · Fase 2 · Candidaturas: CVs, análisis con IA y decisiones humanas
-- =============================================================================
-- Garantías de esta migración (con tests en tests/db/candidates.test.ts):
--   * La IA nunca decide. El estado de una candidatura no se puede actualizar
--     directamente: solo con la RPC set_candidate_status, que exige una persona de
--     RRHH o admin, guarda el historial y queda auditada.
--   * Los datos identificativos (candidate_pii) y el CV original solo son visibles
--     si el puesto no es anónimo o si alguien reveló la identidad indicando un
--     motivo (reveal_candidate_identity, auditada). Se aplica en la base de datos
--     y en Storage.
--   * Retención: cada candidatura tiene fecha de borrado (subida + meses
--     configurados por la empresa) y se recalcula si la empresa cambia el plazo.
--   * Un puesto con candidaturas no se puede borrar (hay que borrarlas antes).
-- =============================================================================

create type public.candidate_status as enum ('pending', 'reviewed', 'advance', 'no_advance');
create type public.cv_processing_status as enum ('pending', 'processing', 'done', 'failed');
create type public.requirement_match as enum ('meets', 'partial', 'not_found');
create type public.candidate_event_kind as enum ('status_changed', 'identity_revealed');

-- Modo anónimo por puesto y contador para el alias de cada candidatura
-- ("Candidatura n.º 7"). El contador no se reutiliza aunque se borren candidaturas.
alter table public.job_positions
  add column anonymous_review boolean not null default false,
  add column candidate_seq integer not null default 0;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_id uuid not null,
  candidate_number integer not null default 0 check (candidate_number >= 0),
  -- Decisión humana.
  status public.candidate_status not null default 'pending',
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  -- Procesado del CV (extracción, anonimización y análisis con IA).
  processing_status public.cv_processing_status not null default 'pending',
  processing_error text check (processing_error ~ '^[a-z_]{1,40}$'),
  processing_started_at timestamptz,
  -- CV original en Storage: {org_id}/{job_id}/{id}.pdf|docx (ver la restricción).
  cv_path text not null unique,
  cv_mime text not null check (cv_mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  cv_size integer not null check (cv_size between 1 and 10485760),
  -- Texto del CV sin datos identificativos: lo único que recibe la IA que evalúa.
  redacted_text text check (char_length(redacted_text) <= 60000),
  -- Revelado de identidad en modo anónimo (el motivo está en candidate_events).
  identity_revealed_by uuid references auth.users (id) on delete set null,
  identity_revealed_at timestamptz,
  -- Fecha de borrado automático (la calcula un trigger).
  retention_until timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (job_id, org_id) references public.job_positions (id, org_id) on delete cascade,
  constraint candidates_cv_path_format check (
    cv_path = org_id::text || '/' || job_id::text || '/' || id::text
      || case cv_mime when 'application/pdf' then '.pdf' else '.docx' end
  )
);
create unique index candidates_job_number_idx on public.candidates (job_id, candidate_number)
  where candidate_number > 0;
create index candidates_job_created_idx on public.candidates (job_id, created_at desc);
create index candidates_retention_idx on public.candidates (retention_until);
comment on table public.candidates is
  'Candidaturas a un puesto. Sin datos identificativos (están en candidate_pii).';

-- Datos identificativos: separados para poder ocultarlos en modo anónimo.
create table public.candidate_pii (
  candidate_id uuid primary key,
  org_id uuid not null,
  full_name text check (char_length(full_name) <= 200),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 60),
  location text check (char_length(location) <= 200),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  -- El nombre del fichero suele llevar el nombre de la persona.
  cv_filename text check (char_length(cv_filename) <= 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Hace explícita la relación 1:1 (la API la expone como objeto, no como lista).
  unique (candidate_id, org_id),
  foreign key (candidate_id, org_id) references public.candidates (id, org_id) on delete cascade
);
comment on table public.candidate_pii is
  'Datos identificativos de la candidatura. Ocultos en modo anónimo hasta revelar la identidad.';

-- Análisis de IA: inmutables. Uno nuevo por cada "volver a analizar".
create table public.cv_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  candidate_id uuid not null,
  summary text not null check (char_length(summary) <= 4000),
  -- Experiencia, formación, habilidades e idiomas (sin datos identificativos).
  profile jsonb not null default '{}'::jsonb,
  -- [{ question, purpose, requirement_id? }]
  interview_questions jsonb not null default '[]'::jsonb,
  -- Requisitos del puesto en el momento del análisis: [{ id, text, kind }]
  requirements_snapshot jsonb not null default '[]'::jsonb,
  -- Recuento determinista (no es una puntuación de la IA): requisitos que la IA
  -- marca como cumplidos con una cita que aparece literalmente en el CV.
  required_met integer not null default 0 check (required_met >= 0),
  required_total integer not null default 0 check (required_total >= 0),
  preferred_met integer not null default 0 check (preferred_met >= 0),
  preferred_total integer not null default 0 check (preferred_total >= 0),
  -- Salvaguardas activadas (códigos, sin datos personales).
  guard_flags jsonb not null default '[]'::jsonb,
  -- Trazabilidad.
  prompt_id text not null,
  prompt_version integer not null,
  identity_prompt_id text,
  identity_prompt_version integer,
  model text not null,
  ai_usage_ids bigint[] not null default '{}',
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (candidate_id, org_id) references public.candidates (id, org_id) on delete cascade
);
create index cv_analyses_candidate_idx on public.cv_analyses (candidate_id, created_at desc);
comment on table public.cv_analyses is
  'Análisis de un CV contra los requisitos del puesto. Sugerencia de IA que requiere revisión humana.';

create table public.cv_requirement_matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  analysis_id uuid not null,
  -- Sin FK: el requisito puede editarse o borrarse después; se guarda su texto.
  requirement_id uuid,
  requirement_text text not null check (char_length(requirement_text) <= 500),
  requirement_kind public.requirement_kind not null,
  sort_order integer not null default 0,
  result public.requirement_match not null,
  -- Cita literal del CV (anonimizado) que justifica el resultado.
  evidence text check (char_length(evidence) <= 600),
  evidence_verified boolean not null default false,
  explanation text not null default '' check (char_length(explanation) <= 1000),
  foreign key (analysis_id, org_id) references public.cv_analyses (id, org_id) on delete cascade
);
create index cv_matches_analysis_idx on public.cv_requirement_matches (analysis_id, sort_order);

-- Historial de decisiones humanas y revelados de identidad. Solo lo escriben las
-- RPCs; se borra con la candidatura (puede contener comentarios con datos
-- personales). La auditoría conserva solo metadatos seudónimos.
create table public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  candidate_id uuid not null,
  kind public.candidate_event_kind not null,
  from_status public.candidate_status,
  to_status public.candidate_status,
  note text check (char_length(note) <= 1000),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, org_id) references public.candidates (id, org_id) on delete cascade
);
create index candidate_events_candidate_idx on public.candidate_events (candidate_id, created_at desc);

create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function private.set_updated_at();
create trigger candidate_pii_set_updated_at before update on public.candidate_pii
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Alias correlativo por puesto y fecha de retención (subida + meses de la empresa).
create or replace function private.prepare_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months smallint;
begin
  update public.job_positions j
  set candidate_seq = j.candidate_seq + 1
  where j.id = new.job_id
  returning j.candidate_seq into new.candidate_number;

  select o.cv_retention_months into v_months
  from public.organizations o
  where o.id = new.org_id;

  new.retention_until := new.created_at + make_interval(months => coalesce(v_months, 12));
  return new;
end;
$$;

create trigger candidates_prepare before insert on public.candidates
  for each row execute function private.prepare_candidate();

-- Si la empresa cambia el plazo de retención, se recalcula para todas sus candidaturas.
create or replace function private.sync_candidate_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.candidates c
  set retention_until = c.created_at + make_interval(months => new.cv_retention_months)
  where c.org_id = new.id;
  return new;
end;
$$;

create trigger organizations_sync_candidate_retention
  after update of cv_retention_months on public.organizations
  for each row when (old.cv_retention_months is distinct from new.cv_retention_months)
  execute function private.sync_candidate_retention();

-- El modo anónimo se puede activar siempre, pero no desactivar si ya hay
-- candidaturas (revelaría todas las identidades a la vez, sin motivo).
create or replace function private.guard_job_anonymous_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.anonymous_review and not new.anonymous_review
     and exists (select 1 from public.candidates c where c.job_id = new.id) then
    raise exception 'No se puede desactivar la revisión anónima de un puesto con candidaturas'
      using errcode = '42501';
  end if;
  perform private.log_audit(new.org_id, 'job.anonymous_review_changed', 'job', new.id,
    jsonb_build_object('enabled', new.anonymous_review));
  return new;
end;
$$;

create trigger job_positions_guard_anonymous_review
  before update of anonymous_review on public.job_positions
  for each row when (old.anonymous_review is distinct from new.anonymous_review)
  execute function private.guard_job_anonymous_review();

-- Un puesto con candidaturas no se borra (salvo al eliminar la empresa completa).
create or replace function private.prevent_job_delete_with_candidates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o where o.id = old.org_id)
     and exists (select 1 from public.candidates c where c.job_id = old.id) then
    raise exception 'El puesto tiene candidaturas: bórralas antes de borrar el puesto'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger job_positions_prevent_delete_with_candidates
  before delete on public.job_positions
  for each row execute function private.prevent_job_delete_with_candidates();

-- -----------------------------------------------------------------------------
-- Visibilidad de la identidad (RLS de candidate_pii y del bucket cvs)
-- -----------------------------------------------------------------------------
create or replace function private.can_view_candidate_identity(p_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.candidates c
    join public.job_positions j on j.id = c.job_id and j.org_id = c.org_id
    where c.id = p_candidate_id
      and c.org_id = any (private.hr_org_ids())
      and (not j.anonymous_review or c.identity_revealed_at is not null)
  );
$$;

create or replace function private.can_view_candidate_cv(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.candidates c
    join public.job_positions j on j.id = c.job_id and j.org_id = c.org_id
    where c.cv_path = p_path
      and c.org_id = any (private.hr_org_ids())
      and (not j.anonymous_review or c.identity_revealed_at is not null)
  );
$$;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Registra hasta 20 CVs de un puesto (candidatura + nombre del fichero) en una
-- transacción. security invoker: RLS exige admin/RRHH de la empresa del puesto.
-- p_files: [{ "filename": text, "mime": text, "size": int }]
-- Devuelve, en el mismo orden, el id, la ruta en Storage y el alias.
create or replace function public.register_candidates(p_job_id uuid, p_files jsonb)
returns table (candidate_id uuid, cv_path text, candidate_number integer)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_org uuid;
  v_file jsonb;
  v_id uuid;
  v_mime text;
  v_path text;
  v_number integer;
begin
  if jsonb_typeof(p_files) is distinct from 'array'
     or jsonb_array_length(p_files) not between 1 and 20 then
    raise exception 'Sube entre 1 y 20 CVs cada vez' using errcode = '22023';
  end if;

  select j.org_id into v_org from public.job_positions j where j.id = p_job_id;
  if v_org is null then
    raise exception 'Puesto no encontrado' using errcode = 'P0002';
  end if;

  for v_file in select value from jsonb_array_elements(p_files) loop
    v_id := gen_random_uuid();
    v_mime := v_file ->> 'mime';
    v_path := v_org::text || '/' || p_job_id::text || '/' || v_id::text
      || case v_mime when 'application/pdf' then '.pdf' else '.docx' end;

    insert into public.candidates (id, org_id, job_id, cv_path, cv_mime, cv_size)
    values (v_id, v_org, p_job_id, v_path, v_mime, (v_file ->> 'size')::integer)
    returning candidate_number into v_number;

    insert into public.candidate_pii (candidate_id, org_id, cv_filename)
    values (v_id, v_org, left(nullif(trim(v_file ->> 'filename'), ''), 255));

    candidate_id := v_id;
    cv_path := v_path;
    candidate_number := v_number;
    return next;
  end loop;
end;
$$;

-- Guarda el resultado de la extracción: datos identificativos (aparte) y el texto
-- anonimizado. security definer porque en modo anónimo RRHH no puede leer
-- candidate_pii (y un UPDATE con RLS exige poder leer la fila).
-- p_identity: { full_name, email, phone, location, links: [] }
create or replace function public.store_candidate_extraction(
  p_candidate_id uuid,
  p_identity jsonb,
  p_redacted_text text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_links text[];
begin
  select c.org_id into v_org from public.candidates c where c.id = p_candidate_id;
  if v_org is null or not private.is_hr(v_org) then
    raise exception 'Candidatura no encontrada' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(left(value, 300)), '{}')
    into v_links
  from (
    select value
    from jsonb_array_elements_text(coalesce(p_identity -> 'links', '[]'::jsonb))
    limit 10
  ) links;

  insert into public.candidate_pii (candidate_id, org_id, full_name, email, phone, location, links)
  values (
    p_candidate_id,
    v_org,
    left(nullif(trim(p_identity ->> 'full_name'), ''), 200),
    left(nullif(trim(p_identity ->> 'email'), ''), 254),
    left(nullif(trim(p_identity ->> 'phone'), ''), 60),
    left(nullif(trim(p_identity ->> 'location'), ''), 200),
    v_links
  )
  on conflict (candidate_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    phone = excluded.phone,
    location = excluded.location,
    links = excluded.links;

  update public.candidates c
  set redacted_text = p_redacted_text
  where c.id = p_candidate_id;
end;
$$;

-- Decisión humana sobre una candidatura. Única forma de cambiar su estado.
create or replace function public.set_candidate_status(
  p_candidate_id uuid,
  p_status public.candidate_status,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates%rowtype;
  v_comment text := nullif(trim(p_comment), '');
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Solo una persona puede decidir sobre una candidatura' using errcode = '42501';
  end if;

  select * into v_candidate from public.candidates c where c.id = p_candidate_id for update;
  if not found or not private.is_hr(v_candidate.org_id) then
    raise exception 'Candidatura no encontrada' using errcode = 'P0002';
  end if;
  if v_candidate.status = p_status then
    raise exception 'La candidatura ya tiene ese estado' using errcode = '22023';
  end if;
  if char_length(v_comment) > 1000 then
    raise exception 'El comentario es demasiado largo' using errcode = '22001';
  end if;

  update public.candidates c
  set status = p_status, status_changed_by = v_actor, status_changed_at = now()
  where c.id = p_candidate_id;

  insert into public.candidate_events (org_id, candidate_id, kind, from_status, to_status, note, actor_id)
  values (v_candidate.org_id, p_candidate_id, 'status_changed', v_candidate.status, p_status,
    v_comment, v_actor);

  -- Sin el comentario: puede contener datos personales y la auditoría los sobrevive.
  perform private.log_audit(v_candidate.org_id, 'candidate.status_changed', 'candidate',
    p_candidate_id,
    jsonb_build_object(
      'job_id', v_candidate.job_id,
      'from', v_candidate.status,
      'to', p_status,
      'with_comment', v_comment is not null
    ));
end;
$$;

-- Revela la identidad de una candidatura en un puesto anónimo. Exige motivo.
create or replace function public.reveal_candidate_identity(p_candidate_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.candidates%rowtype;
  v_anonymous boolean;
  v_reason text := trim(coalesce(p_reason, ''));
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Solo una persona puede revelar una identidad' using errcode = '42501';
  end if;

  select * into v_candidate from public.candidates c where c.id = p_candidate_id for update;
  if not found or not private.is_hr(v_candidate.org_id) then
    raise exception 'Candidatura no encontrada' using errcode = 'P0002';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception 'Indica un motivo (entre 10 y 500 caracteres)' using errcode = '22023';
  end if;

  select j.anonymous_review into v_anonymous
  from public.job_positions j
  where j.id = v_candidate.job_id;
  if not v_anonymous then
    raise exception 'El puesto no usa revisión anónima' using errcode = '22023';
  end if;
  if v_candidate.identity_revealed_at is not null then
    raise exception 'La identidad ya está revelada' using errcode = '22023';
  end if;

  update public.candidates c
  set identity_revealed_by = v_actor, identity_revealed_at = now()
  where c.id = p_candidate_id;

  insert into public.candidate_events (org_id, candidate_id, kind, note, actor_id)
  values (v_candidate.org_id, p_candidate_id, 'identity_revealed', v_reason, v_actor);

  perform private.log_audit(v_candidate.org_id, 'candidate.identity_revealed', 'candidate',
    p_candidate_id, jsonb_build_object('job_id', v_candidate.job_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.candidates enable row level security;
alter table public.candidate_pii enable row level security;
alter table public.cv_analyses enable row level security;
alter table public.cv_requirement_matches enable row level security;
alter table public.candidate_events enable row level security;

create policy candidates_hr_all on public.candidates
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy candidate_pii_select_visible on public.candidate_pii
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    and private.can_view_candidate_identity(candidate_id)
  );
create policy candidate_pii_insert_hr on public.candidate_pii
  for insert to authenticated
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy cv_analyses_hr_all on public.cv_analyses
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy cv_matches_hr_all on public.cv_requirement_matches
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy candidate_events_select_hr on public.candidate_events
  for select to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- Privilegios explícitos
-- -----------------------------------------------------------------------------
revoke all on table public.candidates, public.candidate_pii, public.cv_analyses,
  public.cv_requirement_matches, public.candidate_events
  from public, anon, authenticated;
grant all on table public.candidates, public.candidate_pii, public.cv_analyses,
  public.cv_requirement_matches, public.candidate_events
  to service_role;

-- Estado, revelado y retención NO son editables directamente (solo RPCs/triggers).
grant select, delete on table public.candidates to authenticated;
grant insert (id, org_id, job_id, cv_path, cv_mime, cv_size) on table public.candidates
  to authenticated;
grant update (processing_status, processing_error, processing_started_at)
  on table public.candidates to authenticated;

grant select on table public.candidate_pii to authenticated;
grant insert (candidate_id, org_id, cv_filename) on table public.candidate_pii to authenticated;

-- Los análisis son inmutables.
grant select on table public.cv_analyses to authenticated;
grant insert (org_id, candidate_id, summary, profile, interview_questions, requirements_snapshot,
  required_met, required_total, preferred_met, preferred_total, guard_flags, prompt_id,
  prompt_version, identity_prompt_id, identity_prompt_version, model, ai_usage_ids)
  on table public.cv_analyses to authenticated;

grant select on table public.cv_requirement_matches to authenticated;
grant insert (org_id, analysis_id, requirement_id, requirement_text, requirement_kind, sort_order,
  result, evidence, evidence_verified, explanation)
  on table public.cv_requirement_matches to authenticated;

grant select on table public.candidate_events to authenticated;

-- El modo anónimo se cambia directamente (el trigger lo valida y lo audita).
grant update (anonymous_review) on table public.job_positions to authenticated;

revoke execute on function
  private.prepare_candidate(),
  private.sync_candidate_retention(),
  private.guard_job_anonymous_review(),
  private.prevent_job_delete_with_candidates(),
  private.can_view_candidate_identity(uuid),
  private.can_view_candidate_cv(text)
  from public, anon;
grant execute on function
  private.can_view_candidate_identity(uuid),
  private.can_view_candidate_cv(text)
  to authenticated, service_role;

revoke execute on function
  public.register_candidates(uuid, jsonb),
  public.store_candidate_extraction(uuid, jsonb, text),
  public.set_candidate_status(uuid, public.candidate_status, text),
  public.reveal_candidate_identity(uuid, text)
  from public, anon;
grant execute on function
  public.register_candidates(uuid, jsonb),
  public.store_candidate_extraction(uuid, jsonb, text),
  public.set_candidate_status(uuid, public.candidate_status, text),
  public.reveal_candidate_identity(uuid, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: el CV original solo se puede leer si la identidad es visible.
-- Subida (URL firmada) y borrado los hace el servidor; RRHH no escribe directamente.
-- -----------------------------------------------------------------------------
drop policy if exists "cvs_hr_all" on storage.objects;

create policy "cvs_hr_select_visible" on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and private.can_view_candidate_cv(name));
