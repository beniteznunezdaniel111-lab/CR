-- =============================================================================
-- HRPilot · Fase 1 · Puestos, requisitos y versiones de descripciones/ofertas
-- =============================================================================
-- Un puesto (job_positions) guarda los datos del formulario; sus requisitos
-- (job_requirements) se evalúan uno a uno en el módulo 2; cada texto generado o
-- editado se guarda como una versión inmutable (job_position_versions).
-- =============================================================================

create type public.job_level as enum (
  'intern', 'junior', 'mid', 'senior', 'lead', 'manager', 'director'
);
create type public.work_mode as enum ('onsite', 'hybrid', 'remote');
create type public.job_status as enum ('draft', 'open', 'closed');
create type public.job_tone as enum ('professional', 'friendly', 'dynamic', 'formal');
create type public.requirement_kind as enum ('required', 'preferred');
create type public.job_version_source as enum ('ai', 'manual', 'restored');

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.job_positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 150),
  department text check (char_length(department) <= 120),
  level public.job_level not null,
  work_mode public.work_mode not null,
  location text check (char_length(location) <= 150),
  responsibilities text not null check (char_length(trim(responsibilities)) between 10 and 6000),
  salary_min numeric(12, 2) check (salary_min >= 0),
  salary_max numeric(12, 2) check (salary_max >= 0),
  salary_currency text check (salary_currency in ('EUR', 'CRC', 'USD')),
  salary_period text check (salary_period in ('year', 'month')),
  benefits text check (char_length(benefits) <= 4000),
  tone public.job_tone not null default 'professional',
  status public.job_status not null default 'draft',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permite FK compuestas (hijo.job_id, hijo.org_id) → nunca se mezclan empresas.
  unique (id, org_id),
  constraint job_salary_range
    check (salary_min is null or salary_max is null or salary_max >= salary_min),
  constraint job_salary_unit
    check (
      (salary_min is null and salary_max is null)
      or (salary_currency is not null and salary_period is not null)
    )
);
create index job_positions_org_created_idx on public.job_positions (org_id, created_at desc);
comment on table public.job_positions is 'Puestos de trabajo: datos de partida para ofertas, CVs y entrevistas.';

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_id uuid not null,
  text text not null check (char_length(trim(text)) between 2 and 500),
  kind public.requirement_kind not null default 'required',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (job_id, org_id) references public.job_positions (id, org_id) on delete cascade
);
create index job_requirements_job_idx on public.job_requirements (job_id, sort_order);
comment on table public.job_requirements is
  'Requisitos del puesto. Los CVs se evalúan requisito por requisito (módulo 2).';

create table public.job_position_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_id uuid not null,
  version_number integer not null check (version_number > 0),
  source public.job_version_source not null,
  restored_from_version integer,
  internal_description_md text not null default ''
    check (char_length(internal_description_md) <= 20000),
  offer_linkedin_md text not null default '' check (char_length(offer_linkedin_md) <= 20000),
  offer_portal_md text not null default '' check (char_length(offer_portal_md) <= 20000),
  offer_web_md text not null default '' check (char_length(offer_web_md) <= 20000),
  -- Resultado de la revisión de lenguaje inclusivo (reglas + IA) de esta versión.
  inclusive_review jsonb,
  inclusive_reviewed_at timestamptz,
  -- Trazabilidad de la IA (si la versión la generó la IA).
  prompt_id text,
  prompt_version integer,
  model text,
  ai_usage_id bigint,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, version_number),
  unique (id, org_id),
  foreign key (job_id, org_id) references public.job_positions (id, org_id) on delete cascade
);
create index job_versions_job_idx on public.job_position_versions (job_id, version_number desc);
comment on table public.job_position_versions is
  'Versiones inmutables de la descripción interna y las ofertas. Solo la revisión inclusiva se actualiza.';

create trigger job_positions_set_updated_at before update on public.job_positions
  for each row execute function private.set_updated_at();

-- Numeración de versiones: correlativa por puesto y sin huecos por concurrencia.
create or replace function private.assign_job_version_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.job_positions j where j.id = new.job_id for update;
  select coalesce(max(v.version_number), 0) + 1
    into new.version_number
  from public.job_position_versions v
  where v.job_id = new.job_id;
  return new;
end;
$$;

create trigger job_versions_assign_number before insert on public.job_position_versions
  for each row execute function private.assign_job_version_number();

-- -----------------------------------------------------------------------------
-- RPC: crear o actualizar un puesto con sus requisitos en una sola transacción.
-- security invoker → RLS se aplica a cada sentencia (solo admin/RRHH de la empresa).
-- p_requirements: [{ "id"?: uuid, "text": string, "kind": "required"|"preferred" }]
-- p_job_id: null para crear un puesto nuevo.
-- Los requisitos existentes conservan su id (lo usan los análisis de CVs).
-- -----------------------------------------------------------------------------
create or replace function public.save_job_position(
  p_org_id uuid,
  p_fields jsonb,
  p_requirements jsonb,
  p_job_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job_id uuid := p_job_id;
  v_req jsonb;
  v_req_id uuid;
  v_ids uuid[] := '{}';
  v_position integer := 0;
begin
  if jsonb_typeof(p_requirements) is distinct from 'array'
     or jsonb_array_length(p_requirements) > 30 then
    raise exception 'Lista de requisitos no válida' using errcode = '22023';
  end if;

  if v_job_id is null then
    insert into public.job_positions (
      org_id, title, department, level, work_mode, location, responsibilities,
      salary_min, salary_max, salary_currency, salary_period, benefits, tone
    )
    values (
      p_org_id,
      trim(p_fields ->> 'title'),
      nullif(trim(p_fields ->> 'department'), ''),
      (p_fields ->> 'level')::public.job_level,
      (p_fields ->> 'work_mode')::public.work_mode,
      nullif(trim(p_fields ->> 'location'), ''),
      trim(p_fields ->> 'responsibilities'),
      nullif(p_fields ->> 'salary_min', '')::numeric,
      nullif(p_fields ->> 'salary_max', '')::numeric,
      nullif(p_fields ->> 'salary_currency', ''),
      nullif(p_fields ->> 'salary_period', ''),
      nullif(trim(p_fields ->> 'benefits'), ''),
      coalesce(nullif(p_fields ->> 'tone', ''), 'professional')::public.job_tone
    )
    returning id into v_job_id;
  else
    update public.job_positions
    set
      title = trim(p_fields ->> 'title'),
      department = nullif(trim(p_fields ->> 'department'), ''),
      level = (p_fields ->> 'level')::public.job_level,
      work_mode = (p_fields ->> 'work_mode')::public.work_mode,
      location = nullif(trim(p_fields ->> 'location'), ''),
      responsibilities = trim(p_fields ->> 'responsibilities'),
      salary_min = nullif(p_fields ->> 'salary_min', '')::numeric,
      salary_max = nullif(p_fields ->> 'salary_max', '')::numeric,
      salary_currency = nullif(p_fields ->> 'salary_currency', ''),
      salary_period = nullif(p_fields ->> 'salary_period', ''),
      benefits = nullif(trim(p_fields ->> 'benefits'), ''),
      tone = coalesce(nullif(p_fields ->> 'tone', ''), 'professional')::public.job_tone
    where id = v_job_id and org_id = p_org_id;
    if not found then
      raise exception 'Puesto no encontrado' using errcode = 'P0002';
    end if;
  end if;

  for v_req in select value from jsonb_array_elements(p_requirements) loop
    v_position := v_position + 1;
    v_req_id := nullif(v_req ->> 'id', '')::uuid;
    if v_req_id is not null then
      update public.job_requirements
      set
        text = trim(v_req ->> 'text'),
        kind = (v_req ->> 'kind')::public.requirement_kind,
        sort_order = v_position
      where id = v_req_id and job_id = v_job_id;
      if not found then
        v_req_id := null;
      end if;
    end if;
    if v_req_id is null then
      insert into public.job_requirements (org_id, job_id, text, kind, sort_order)
      values (
        p_org_id,
        v_job_id,
        trim(v_req ->> 'text'),
        (v_req ->> 'kind')::public.requirement_kind,
        v_position
      )
      returning id into v_req_id;
    end if;
    v_ids := v_ids || v_req_id;
  end loop;

  delete from public.job_requirements r
  where r.job_id = v_job_id and not (r.id = any (v_ids));

  return v_job_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS: solo admin y RRHH de la empresa
-- -----------------------------------------------------------------------------
alter table public.job_positions enable row level security;
alter table public.job_requirements enable row level security;
alter table public.job_position_versions enable row level security;

create policy job_positions_hr_all on public.job_positions
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy job_requirements_hr_all on public.job_requirements
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy job_versions_hr_all on public.job_position_versions
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- Privilegios explícitos
-- -----------------------------------------------------------------------------
revoke all on table public.job_positions, public.job_requirements, public.job_position_versions
  from public, anon, authenticated;
grant all on table public.job_positions, public.job_requirements, public.job_position_versions
  to service_role;

grant select, delete on table public.job_positions to authenticated;
grant insert (org_id, title, department, level, work_mode, location, responsibilities,
  salary_min, salary_max, salary_currency, salary_period, benefits, tone)
  on table public.job_positions to authenticated;
grant update (title, department, level, work_mode, location, responsibilities,
  salary_min, salary_max, salary_currency, salary_period, benefits, tone, status)
  on table public.job_positions to authenticated;

grant select, delete on table public.job_requirements to authenticated;
grant insert (org_id, job_id, text, kind, sort_order) on table public.job_requirements
  to authenticated;
grant update (text, kind, sort_order) on table public.job_requirements to authenticated;

-- Las versiones no se editan ni se borran: solo se añaden (y se anota su revisión).
grant select on table public.job_position_versions to authenticated;
grant insert (org_id, job_id, source, restored_from_version, internal_description_md,
  offer_linkedin_md, offer_portal_md, offer_web_md, inclusive_review, inclusive_reviewed_at,
  prompt_id, prompt_version, model, ai_usage_id)
  on table public.job_position_versions to authenticated;
grant update (inclusive_review, inclusive_reviewed_at) on table public.job_position_versions
  to authenticated;

revoke execute on function private.assign_job_version_number() from public, anon;
revoke execute on function public.save_job_position(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_job_position(uuid, jsonb, jsonb, uuid) to authenticated;
