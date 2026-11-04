-- =============================================================================
-- HRPilot · Fase 3 · Guías de entrevista y planes de onboarding
-- =============================================================================
-- Garantías (tests en tests/db/interviews-onboarding.test.ts):
--   * Solo admin y RRHH de la empresa ven y gestionan guías, planes y
--     asignaciones. El empleado no ve su plan (decisión del plan del MVP).
--   * Las guías de entrevista son inmutables: se regeneran (versión nueva).
--   * Una asignación copia las tareas del plan con fechas; editar o borrar el plan
--     después no cambia el onboarding ya asignado.
--   * Quién completa una tarea lo fija la base de datos (no se puede suplantar).
-- =============================================================================

create type public.onboarding_phase as enum ('d30', 'd60', 'd90');

-- -----------------------------------------------------------------------------
-- Guías de entrevista
-- -----------------------------------------------------------------------------
create table public.interview_guides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_id uuid not null,
  -- Guía adaptada a una candidatura (opcional): usa los requisitos parciales o
  -- que no constan en su análisis. Se borra con la candidatura.
  candidate_id uuid,
  -- { intro, competencies, technical, behavioral, candidateFocus, rubric }
  content jsonb not null,
  -- Requisitos que se tuvieron en cuenta para la candidatura (snapshot, sin datos personales).
  focus_requirements jsonb not null default '[]'::jsonb,
  guard_flags jsonb not null default '[]'::jsonb,
  prompt_id text not null,
  prompt_version integer not null,
  model text not null,
  ai_usage_id bigint,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (job_id, org_id) references public.job_positions (id, org_id) on delete cascade,
  foreign key (candidate_id, org_id) references public.candidates (id, org_id) on delete cascade
);
create index interview_guides_job_idx on public.interview_guides (job_id, created_at desc);
create index interview_guides_candidate_idx on public.interview_guides (candidate_id)
  where candidate_id is not null;
comment on table public.interview_guides is
  'Guías de entrevista generadas con IA (inmutables: se regeneran).';

-- La candidatura debe ser del mismo puesto que la guía.
create or replace function private.check_interview_guide_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidate_id is not null and not exists (
    select 1 from public.candidates c where c.id = new.candidate_id and c.job_id = new.job_id
  ) then
    raise exception 'La candidatura no pertenece a este puesto' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger interview_guides_check_candidate before insert on public.interview_guides
  for each row execute function private.check_interview_guide_candidate();

-- -----------------------------------------------------------------------------
-- Planes de onboarding (plantilla editable, a partir de un puesto)
-- -----------------------------------------------------------------------------
create table public.onboarding_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  job_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  intro text not null default '' check (char_length(intro) <= 2000),
  -- Trazabilidad de la IA (si el plan se generó con IA).
  prompt_id text,
  prompt_version integer,
  model text,
  ai_usage_id bigint,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (job_id, org_id) references public.job_positions (id, org_id) on delete cascade
);
create index onboarding_plans_org_idx on public.onboarding_plans (org_id, created_at desc);

create table public.onboarding_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  plan_id uuid not null,
  phase public.onboarding_phase not null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  -- Quién se encarga (rol, no persona): "RRHH", "Responsable directo", "IT"...
  owner_label text not null default '' check (char_length(owner_label) <= 100),
  materials text not null default '' check (char_length(materials) <= 500),
  is_checkpoint boolean not null default false,
  -- Día del plan (1-90) en el que vence.
  due_day integer not null check (due_day between 1 and 90),
  sort_order integer not null default 0,
  foreign key (plan_id, org_id) references public.onboarding_plans (id, org_id) on delete cascade
);
create index onboarding_plan_tasks_plan_idx on public.onboarding_plan_tasks (plan_id, sort_order);

-- -----------------------------------------------------------------------------
-- Asignaciones: el plan aplicado a una persona con su fecha de incorporación.
-- La persona puede no tener cuenta todavía (solo nombre y, opcional, email).
-- -----------------------------------------------------------------------------
create table public.onboarding_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Si se borra el plan, la asignación (con su copia de tareas) se conserva.
  plan_id uuid,
  plan_title text not null check (char_length(plan_title) <= 200),
  employee_name text not null check (char_length(trim(employee_name)) between 2 and 150),
  employee_email text check (char_length(employee_email) <= 254),
  -- Persona de la empresa con cuenta (opcional).
  member_user_id uuid references auth.users (id) on delete set null,
  start_date date not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  foreign key (plan_id, org_id) references public.onboarding_plans (id, org_id)
    on delete set null (plan_id)
);
create index onboarding_assignments_org_idx on public.onboarding_assignments (org_id, start_date desc);

create table public.onboarding_assignment_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  assignment_id uuid not null,
  phase public.onboarding_phase not null,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  owner_label text not null default '' check (char_length(owner_label) <= 100),
  materials text not null default '' check (char_length(materials) <= 500),
  is_checkpoint boolean not null default false,
  due_date date not null,
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  foreign key (assignment_id, org_id) references public.onboarding_assignments (id, org_id)
    on delete cascade
);
create index onboarding_assignment_tasks_idx
  on public.onboarding_assignment_tasks (assignment_id, sort_order);

create trigger onboarding_plans_set_updated_at before update on public.onboarding_plans
  for each row execute function private.set_updated_at();

-- Quién completa la tarea lo decide la base de datos.
create or replace function private.stamp_onboarding_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is null then
    new.completed_by := null;
  elsif old.completed_at is null then
    new.completed_at := now();
    new.completed_by := auth.uid();
  else
    -- Ya estaba completada: se conservan fecha y autor originales.
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  return new;
end;
$$;

create trigger onboarding_assignment_tasks_stamp
  before update of completed_at on public.onboarding_assignment_tasks
  for each row execute function private.stamp_onboarding_task_completion();

-- La persona con cuenta debe ser miembro activo de la empresa.
create or replace function private.check_onboarding_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.member_user_id is not null and not exists (
    select 1 from public.memberships m
    where m.org_id = new.org_id and m.user_id = new.member_user_id and m.status = 'active'
  ) then
    raise exception 'La persona no pertenece a la empresa' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger onboarding_assignments_check_member
  before insert or update of member_user_id on public.onboarding_assignments
  for each row execute function private.check_onboarding_member();

-- -----------------------------------------------------------------------------
-- RPCs (security invoker: la RLS se aplica a cada sentencia)
-- -----------------------------------------------------------------------------

-- Crea o actualiza un plan con sus tareas en una transacción.
-- p_tasks: [{ phase, title, description, owner_label, materials, is_checkpoint, due_day }] (1-60)
-- p_meta (solo al crear): { prompt_id, prompt_version, model, ai_usage_id }
create or replace function public.save_onboarding_plan(
  p_org_id uuid,
  p_job_id uuid,
  p_title text,
  p_intro text,
  p_tasks jsonb,
  p_plan_id uuid default null,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid := p_plan_id;
  v_task jsonb;
  v_position integer := 0;
begin
  if jsonb_typeof(p_tasks) is distinct from 'array'
     or jsonb_array_length(p_tasks) not between 1 and 60 then
    raise exception 'El plan debe tener entre 1 y 60 tareas' using errcode = '22023';
  end if;

  if v_plan_id is null then
    insert into public.onboarding_plans (org_id, job_id, title, intro, prompt_id, prompt_version,
      model, ai_usage_id)
    values (
      p_org_id, p_job_id, trim(p_title), coalesce(trim(p_intro), ''),
      nullif(p_meta ->> 'prompt_id', ''),
      nullif(p_meta ->> 'prompt_version', '')::integer,
      nullif(p_meta ->> 'model', ''),
      nullif(p_meta ->> 'ai_usage_id', '')::bigint
    )
    returning id into v_plan_id;
  else
    update public.onboarding_plans
    set title = trim(p_title), intro = coalesce(trim(p_intro), '')
    where id = v_plan_id and org_id = p_org_id;
    if not found then
      raise exception 'Plan no encontrado' using errcode = 'P0002';
    end if;
    delete from public.onboarding_plan_tasks t where t.plan_id = v_plan_id;
  end if;

  for v_task in select value from jsonb_array_elements(p_tasks) loop
    v_position := v_position + 1;
    insert into public.onboarding_plan_tasks (org_id, plan_id, phase, title, description,
      owner_label, materials, is_checkpoint, due_day, sort_order)
    values (
      p_org_id,
      v_plan_id,
      (v_task ->> 'phase')::public.onboarding_phase,
      trim(v_task ->> 'title'),
      coalesce(trim(v_task ->> 'description'), ''),
      coalesce(trim(v_task ->> 'owner_label'), ''),
      coalesce(trim(v_task ->> 'materials'), ''),
      coalesce((v_task ->> 'is_checkpoint')::boolean, false),
      (v_task ->> 'due_day')::integer,
      v_position
    );
  end loop;

  return v_plan_id;
end;
$$;

-- Asigna un plan a una persona: copia las tareas con su fecha de vencimiento.
create or replace function public.assign_onboarding_plan(
  p_plan_id uuid,
  p_employee_name text,
  p_start_date date,
  p_employee_email text default null,
  p_member_user_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.onboarding_plans%rowtype;
  v_assignment_id uuid;
begin
  select * into v_plan from public.onboarding_plans p where p.id = p_plan_id;
  if not found then
    raise exception 'Plan no encontrado' using errcode = 'P0002';
  end if;

  insert into public.onboarding_assignments (org_id, plan_id, plan_title, employee_name,
    employee_email, member_user_id, start_date)
  values (v_plan.org_id, v_plan.id, v_plan.title, trim(p_employee_name),
    nullif(trim(lower(p_employee_email)), ''), p_member_user_id, p_start_date)
  returning id into v_assignment_id;

  insert into public.onboarding_assignment_tasks (org_id, assignment_id, phase, title,
    description, owner_label, materials, is_checkpoint, due_date, sort_order)
  select v_plan.org_id, v_assignment_id, t.phase, t.title, t.description, t.owner_label,
    t.materials, t.is_checkpoint, p_start_date + (t.due_day - 1), t.sort_order
  from public.onboarding_plan_tasks t
  where t.plan_id = v_plan.id;

  return v_assignment_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS: solo admin y RRHH de la empresa
-- -----------------------------------------------------------------------------
alter table public.interview_guides enable row level security;
alter table public.onboarding_plans enable row level security;
alter table public.onboarding_plan_tasks enable row level security;
alter table public.onboarding_assignments enable row level security;
alter table public.onboarding_assignment_tasks enable row level security;

create policy interview_guides_hr_all on public.interview_guides
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy onboarding_plans_hr_all on public.onboarding_plans
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy onboarding_plan_tasks_hr_all on public.onboarding_plan_tasks
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy onboarding_assignments_hr_all on public.onboarding_assignments
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy onboarding_assignment_tasks_hr_all on public.onboarding_assignment_tasks
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- Privilegios explícitos
-- -----------------------------------------------------------------------------
revoke all on table public.interview_guides, public.onboarding_plans,
  public.onboarding_plan_tasks, public.onboarding_assignments,
  public.onboarding_assignment_tasks
  from public, anon, authenticated;
grant all on table public.interview_guides, public.onboarding_plans,
  public.onboarding_plan_tasks, public.onboarding_assignments,
  public.onboarding_assignment_tasks
  to service_role;

-- Guías: inmutables (sin UPDATE ni DELETE; se borran con el puesto o la candidatura).
grant select on table public.interview_guides to authenticated;
grant insert (org_id, job_id, candidate_id, content, focus_requirements, guard_flags, prompt_id,
  prompt_version, model, ai_usage_id) on table public.interview_guides to authenticated;

grant select, delete on table public.onboarding_plans to authenticated;
grant insert (org_id, job_id, title, intro, prompt_id, prompt_version, model, ai_usage_id)
  on table public.onboarding_plans to authenticated;
grant update (title, intro) on table public.onboarding_plans to authenticated;

grant select, delete on table public.onboarding_plan_tasks to authenticated;
grant insert (org_id, plan_id, phase, title, description, owner_label, materials, is_checkpoint,
  due_day, sort_order) on table public.onboarding_plan_tasks to authenticated;

grant select, delete on table public.onboarding_assignments to authenticated;
grant insert (org_id, plan_id, plan_title, employee_name, employee_email, member_user_id,
  start_date) on table public.onboarding_assignments to authenticated;

-- De una tarea asignada solo se marca si está hecha (el autor lo fija el trigger).
grant select on table public.onboarding_assignment_tasks to authenticated;
grant insert (org_id, assignment_id, phase, title, description, owner_label, materials,
  is_checkpoint, due_date, sort_order) on table public.onboarding_assignment_tasks
  to authenticated;
grant update (completed_at) on table public.onboarding_assignment_tasks to authenticated;

revoke execute on function
  private.check_interview_guide_candidate(),
  private.stamp_onboarding_task_completion(),
  private.check_onboarding_member()
  from public, anon;

revoke execute on function
  public.save_onboarding_plan(uuid, uuid, text, text, jsonb, uuid, jsonb),
  public.assign_onboarding_plan(uuid, text, date, text, uuid)
  from public, anon;
grant execute on function
  public.save_onboarding_plan(uuid, uuid, text, text, jsonb, uuid, jsonb),
  public.assign_onboarding_plan(uuid, text, date, text, uuid)
  to authenticated;
