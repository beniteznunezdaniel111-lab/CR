-- =============================================================================
-- HRPilot · Fase 5 · Formación y evaluaciones
-- =============================================================================
-- Garantías (tests en tests/db/trainings.test.ts):
--   * RRHH gestiona las formaciones de su empresa. La plantilla solo ve las
--     publicadas que tiene asignadas (formación, módulos y preguntas).
--   * Las respuestas correctas (training_quiz_keys) solo las lee RRHH. La nota se
--     calcula en la base de datos (submit_training_attempt): aprobado con 70 %,
--     intentos ilimitados y se guarda la mejor nota.
--   * Un test con intentos no se puede modificar (se duplica la formación) y una
--     formación con intentos no se puede borrar.
-- =============================================================================

create type public.training_status as enum ('draft', 'published');
create type public.training_source_kind as enum ('kb_document', 'upload');

-- -----------------------------------------------------------------------------
-- Formaciones, fuentes y módulos
-- -----------------------------------------------------------------------------
create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  topic text check (char_length(topic) <= 2000),
  audience text check (char_length(audience) <= 300),
  status public.training_status not null default 'draft',
  published_at timestamptz,
  duplicated_from uuid references public.trainings (id) on delete set null,
  -- Trazabilidad de la IA: [{ step, prompt_id, prompt_version, model, ai_usage_id }]
  generation jsonb not null default '[]'::jsonb check (jsonb_typeof(generation) = 'array'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  constraint trainings_published check ((status = 'published') = (published_at is not null))
);
create index trainings_org_idx on public.trainings (org_id, created_at desc);

-- Documentos usados para generar (instantánea del texto; solo RRHH).
create table public.training_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  training_id uuid not null,
  kind public.training_source_kind not null,
  kb_document_id uuid references public.kb_documents (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  -- Fichero subido (bucket training-sources): {org_id}/{training_id}/{id}.pdf|docx
  file_path text unique,
  file_mime text check (file_mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  content text not null default '' check (char_length(content) <= 200000),
  created_at timestamptz not null default now(),
  foreign key (training_id, org_id) references public.trainings (id, org_id) on delete cascade,
  constraint training_sources_file check (
    (kind = 'kb_document' and file_path is null)
    or (kind = 'upload' and (file_path is null
      or file_path like org_id::text || '/' || training_id::text || '/%'))
  )
);
create index training_sources_training_idx on public.training_sources (training_id);

create table public.training_modules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  training_id uuid not null,
  position integer not null check (position between 1 and 30),
  title text not null check (char_length(trim(title)) between 2 and 200),
  objective text not null default '' check (char_length(objective) <= 600),
  -- Markdown editable.
  content text not null default '' check (char_length(content) <= 40000),
  -- [{ title, description }]
  examples jsonb not null default '[]'::jsonb check (jsonb_typeof(examples) = 'array'),
  summary text not null default '' check (char_length(summary) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_id, position),
  unique (id, org_id),
  foreign key (training_id, org_id) references public.trainings (id, org_id) on delete cascade
);

create trigger trainings_set_updated_at before update on public.trainings
  for each row execute function private.set_updated_at();
create trigger training_modules_set_updated_at before update on public.training_modules
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Test: preguntas (visibles para quien hace el test) y claves (solo RRHH)
-- -----------------------------------------------------------------------------
create table public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  training_id uuid not null,
  position integer not null check (position between 1 and 30),
  question text not null check (char_length(trim(question)) between 5 and 500),
  options text[] not null check (cardinality(options) between 2 and 6),
  created_at timestamptz not null default now(),
  unique (training_id, position),
  unique (id, org_id),
  foreign key (training_id, org_id) references public.trainings (id, org_id) on delete cascade
);

create table public.training_quiz_keys (
  question_id uuid primary key,
  org_id uuid not null,
  correct_index integer not null check (correct_index between 0 and 5),
  explanation text not null default '' check (char_length(explanation) <= 1500),
  foreign key (question_id, org_id) references public.training_quiz_questions (id, org_id)
    on delete cascade
);

-- -----------------------------------------------------------------------------
-- Asignaciones, progreso por módulo e intentos
-- -----------------------------------------------------------------------------
create table public.training_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  training_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid default auth.uid() references auth.users (id) on delete set null,
  due_date date,
  best_score numeric(5, 2) check (best_score between 0 and 100),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  passed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (training_id, user_id),
  unique (id, org_id),
  foreign key (training_id, org_id) references public.trainings (id, org_id) on delete cascade
);
create index training_assignments_user_idx on public.training_assignments (user_id, created_at desc);

create table public.training_module_progress (
  assignment_id uuid not null,
  module_id uuid not null,
  org_id uuid not null,
  user_id uuid not null default auth.uid(),
  completed_at timestamptz not null default now(),
  primary key (assignment_id, module_id),
  foreign key (assignment_id, org_id) references public.training_assignments (id, org_id)
    on delete cascade,
  foreign key (module_id, org_id) references public.training_modules (id, org_id) on delete cascade
);

create table public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  assignment_id uuid not null,
  training_id uuid not null,
  user_id uuid not null,
  answers integer[] not null,
  correct_count integer not null check (correct_count >= 0),
  total integer not null check (total > 0),
  score numeric(5, 2) not null check (score between 0 and 100),
  passed boolean not null,
  created_at timestamptz not null default now(),
  foreign key (assignment_id, org_id) references public.training_assignments (id, org_id)
    on delete cascade
);
create index training_attempts_assignment_idx
  on public.training_attempts (assignment_id, created_at desc);
create index training_attempts_training_idx on public.training_attempts (training_id);

-- -----------------------------------------------------------------------------
-- Reglas de integridad
-- -----------------------------------------------------------------------------
-- Un test con intentos no se modifica (salvo al borrar la empresa entera).
create or replace function private.lock_quiz_with_attempts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_training uuid;
begin
  if tg_table_name = 'training_quiz_questions' then
    v_training := coalesce(new.training_id, old.training_id);
  else
    select q.training_id into v_training
    from public.training_quiz_questions q
    where q.id = coalesce(new.question_id, old.question_id);
  end if;
  if exists (select 1 from public.organizations o where o.id = v_org)
     and exists (select 1 from public.trainings t where t.id = v_training)
     and exists (select 1 from public.training_attempts a where a.training_id = v_training) then
    raise exception 'El test ya tiene intentos: duplica la formación para cambiarlo'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger training_quiz_questions_lock before insert or update or delete
  on public.training_quiz_questions
  for each row execute function private.lock_quiz_with_attempts();
create trigger training_quiz_keys_lock before insert or update or delete
  on public.training_quiz_keys
  for each row execute function private.lock_quiz_with_attempts();

-- Una formación con intentos no se borra (sus resultados se conservan).
create or replace function private.prevent_training_delete_with_attempts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o where o.id = old.org_id)
     and exists (select 1 from public.training_attempts a where a.training_id = old.id) then
    raise exception 'La formación tiene intentos: no se puede borrar' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger trainings_prevent_delete_with_attempts before delete on public.trainings
  for each row execute function private.prevent_training_delete_with_attempts();

-- ¿La formación está publicada y asignada a quien consulta?
create or replace function private.training_visible_to_me(p_training_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_assignments a
    join public.trainings t on t.id = a.training_id
    where a.training_id = p_training_id
      and a.user_id = auth.uid()
      and t.status = 'published'
      and t.org_id = any (private.member_org_ids())
  );
$$;

-- ¿El módulo pertenece a la formación de una asignación propia (y publicada)?
create or replace function private.module_in_my_assignment(p_assignment_id uuid, p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_assignments a
    join public.trainings t on t.id = a.training_id
    join public.training_modules m on m.training_id = a.training_id
    where a.id = p_assignment_id
      and m.id = p_module_id
      and a.user_id = auth.uid()
      and t.status = 'published'
      and a.org_id = any (private.member_org_ids())
  );
$$;

-- -----------------------------------------------------------------------------
-- RPCs de RRHH
-- -----------------------------------------------------------------------------
-- Sustituye el test completo (preguntas y claves) en una transacción.
-- p_questions: [{ question, options: [..], correct_index, explanation }]
create or replace function public.save_training_quiz(p_training_id uuid, p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_training public.trainings%rowtype;
  v_question jsonb;
  v_position integer := 0;
  v_options text[];
  v_correct integer;
  v_question_id uuid;
  v_text text;
begin
  select * into v_training from public.trainings t where t.id = p_training_id;
  if not found or auth.uid() is null or not private.is_hr(v_training.org_id) then
    raise exception 'Formación no encontrada' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_questions) is distinct from 'array'
     or jsonb_array_length(p_questions) not between 1 and 30 then
    raise exception 'El test debe tener entre 1 y 30 preguntas' using errcode = '22023';
  end if;
  if exists (select 1 from public.training_attempts a where a.training_id = p_training_id) then
    raise exception 'El test ya tiene intentos: duplica la formación para cambiarlo'
      using errcode = '42501';
  end if;

  delete from public.training_quiz_questions q where q.training_id = p_training_id;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    v_position := v_position + 1;
    v_text := trim(coalesce(v_question ->> 'question', ''));
    if char_length(v_text) not between 5 and 500 then
      raise exception 'Pregunta %: escribe entre 5 y 500 caracteres', v_position
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_question -> 'options') is distinct from 'array' then
      raise exception 'Pregunta %: faltan las opciones', v_position using errcode = '22023';
    end if;
    select coalesce(array_agg(trim(option.value) order by option.ordinality), '{}')
    into v_options
    from jsonb_array_elements_text(v_question -> 'options') with ordinality as option(value, ordinality);
    if cardinality(v_options) not between 2 and 6
       or exists (select 1 from unnest(v_options) as o(value) where char_length(o.value) not between 1 and 300)
       or (select count(distinct lower(o.value)) from unnest(v_options) as o(value)) <> cardinality(v_options) then
      raise exception 'Pregunta %: entre 2 y 6 opciones distintas', v_position using errcode = '22023';
    end if;
    v_correct := (v_question ->> 'correct_index')::integer;
    if v_correct is null or v_correct < 0 or v_correct >= cardinality(v_options) then
      raise exception 'Pregunta %: marca la respuesta correcta', v_position using errcode = '22023';
    end if;

    insert into public.training_quiz_questions (org_id, training_id, position, question, options)
    values (v_training.org_id, p_training_id, v_position, v_text, v_options)
    returning id into v_question_id;
    insert into public.training_quiz_keys (question_id, org_id, correct_index, explanation)
    values (
      v_question_id, v_training.org_id, v_correct,
      left(trim(coalesce(v_question ->> 'explanation', '')), 1500)
    );
  end loop;

  update public.trainings set updated_at = now() where id = p_training_id;
end;
$$;

-- Publica una formación completa (módulos con contenido y test con respuestas).
create or replace function public.publish_training(p_training_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_training public.trainings%rowtype;
begin
  select * into v_training from public.trainings t where t.id = p_training_id for update;
  if not found or auth.uid() is null or not private.is_hr(v_training.org_id) then
    raise exception 'Formación no encontrada' using errcode = 'P0002';
  end if;
  if v_training.status = 'published' then
    return;
  end if;
  if not exists (select 1 from public.training_modules m where m.training_id = p_training_id)
     or exists (
       select 1 from public.training_modules m
       where m.training_id = p_training_id and char_length(trim(m.content)) = 0
     ) then
    raise exception 'Todos los módulos necesitan contenido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.training_quiz_questions q where q.training_id = p_training_id)
     or exists (
       select 1 from public.training_quiz_questions q
       left join public.training_quiz_keys k on k.question_id = q.id
       where q.training_id = p_training_id and k.question_id is null
     ) then
    raise exception 'El test necesita preguntas con respuesta correcta' using errcode = '22023';
  end if;

  update public.trainings
  set status = 'published', published_at = now()
  where id = p_training_id;
  perform private.log_audit(v_training.org_id, 'training.published', 'training', p_training_id, '{}');
end;
$$;

-- Copia editable (borrador) de una formación: módulos, test con respuestas y fuentes.
create or replace function public.duplicate_training(p_training_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_training public.trainings%rowtype;
  v_copy uuid;
  v_question record;
  v_new_question uuid;
begin
  select * into v_training from public.trainings t where t.id = p_training_id;
  if not found or auth.uid() is null or not private.is_hr(v_training.org_id) then
    raise exception 'Formación no encontrada' using errcode = 'P0002';
  end if;

  insert into public.trainings (org_id, title, description, topic, audience, duplicated_from,
    generation, created_by)
  values (v_training.org_id, left(trim(p_title), 200), v_training.description, v_training.topic,
    v_training.audience, v_training.id, v_training.generation, auth.uid())
  returning id into v_copy;

  insert into public.training_modules (org_id, training_id, position, title, objective, content,
    examples, summary)
  select m.org_id, v_copy, m.position, m.title, m.objective, m.content, m.examples, m.summary
  from public.training_modules m
  where m.training_id = p_training_id;

  for v_question in
    select q.position, q.question, q.options, k.correct_index, k.explanation
    from public.training_quiz_questions q
    left join public.training_quiz_keys k on k.question_id = q.id
    where q.training_id = p_training_id
    order by q.position
  loop
    insert into public.training_quiz_questions (org_id, training_id, position, question, options)
    values (v_training.org_id, v_copy, v_question.position, v_question.question, v_question.options)
    returning id into v_new_question;
    if v_question.correct_index is not null then
      insert into public.training_quiz_keys (question_id, org_id, correct_index, explanation)
      values (v_new_question, v_training.org_id, v_question.correct_index,
        coalesce(v_question.explanation, ''));
    end if;
  end loop;

  -- Las fuentes se copian como texto (el fichero original queda en la formación de origen).
  insert into public.training_sources (org_id, training_id, kind, kb_document_id, title, content)
  select s.org_id, v_copy, s.kind, s.kb_document_id, s.title, s.content
  from public.training_sources s
  where s.training_id = p_training_id;

  perform private.log_audit(v_training.org_id, 'training.duplicated', 'training', v_copy,
    jsonb_build_object('from', p_training_id));
  return v_copy;
end;
$$;

-- Asigna una formación publicada a miembros activos (avisa a quien es nuevo).
-- Volver a asignar solo actualiza la fecha límite. Devuelve cuántas son nuevas.
create or replace function public.assign_training(
  p_training_id uuid,
  p_user_ids uuid[],
  p_due_date date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_training public.trainings%rowtype;
  v_slug text;
  v_new integer := 0;
  v_updated integer := 0;
  v_row record;
begin
  select * into v_training from public.trainings t where t.id = p_training_id;
  if not found or auth.uid() is null or not private.is_hr(v_training.org_id) then
    raise exception 'Formación no encontrada' using errcode = 'P0002';
  end if;
  if v_training.status <> 'published' then
    raise exception 'Publica la formación antes de asignarla' using errcode = '22023';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) not between 1 and 500 then
    raise exception 'Elige entre 1 y 500 personas' using errcode = '22023';
  end if;
  if p_due_date is not null and p_due_date < current_date then
    raise exception 'La fecha límite no puede ser anterior a hoy' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_user_ids) as u(id)
    where not exists (
      select 1 from public.memberships m
      where m.org_id = v_training.org_id and m.user_id = u.id and m.status = 'active'
    )
  ) then
    raise exception 'Solo se puede asignar a miembros activos de la empresa' using errcode = '22023';
  end if;

  select o.slug into v_slug from public.organizations o where o.id = v_training.org_id;

  for v_row in
    insert into public.training_assignments (org_id, training_id, user_id, assigned_by, due_date)
    select distinct v_training.org_id, p_training_id, u.id, auth.uid(), p_due_date
    from unnest(p_user_ids) as u(id)
    on conflict (training_id, user_id) do update set due_date = excluded.due_date
    returning id, user_id, (xmax = 0) as inserted
  loop
    if v_row.inserted then
      v_new := v_new + 1;
      insert into public.notifications (org_id, user_id, kind, params, link)
      values (v_training.org_id, v_row.user_id, 'training_assigned',
        jsonb_build_object('title', v_training.title),
        '/app/' || v_slug || '/my-trainings/' || v_row.id);
    else
      v_updated := v_updated + 1;
    end if;
  end loop;

  perform private.log_audit(v_training.org_id, 'training.assigned', 'training', p_training_id,
    jsonb_build_object('new', v_new, 'updated', v_updated, 'due_date', p_due_date));
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC de la plantilla: entregar un intento del test (la nota la pone la BD)
-- -----------------------------------------------------------------------------
create or replace function public.submit_training_attempt(
  p_assignment_id uuid,
  p_answers integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.training_assignments%rowtype;
  v_training public.trainings%rowtype;
  v_total integer;
  v_correct integer := 0;
  v_index integer := 0;
  v_selected integer;
  v_question record;
  v_results jsonb := '[]'::jsonb;
  v_score numeric(5, 2);
  v_passed boolean;
  v_best numeric(5, 2);
begin
  select * into v_assignment
  from public.training_assignments a
  where a.id = p_assignment_id
  for update;
  if not found or auth.uid() is null or v_assignment.user_id <> auth.uid()
     or not private.is_member(v_assignment.org_id) then
    raise exception 'Asignación no encontrada' using errcode = 'P0002';
  end if;
  select * into v_training from public.trainings t where t.id = v_assignment.training_id;
  if v_training.status <> 'published' then
    raise exception 'La formación no está publicada' using errcode = '22023';
  end if;

  select count(*) into v_total
  from public.training_quiz_questions q
  where q.training_id = v_training.id;
  if v_total = 0 then
    raise exception 'La formación no tiene test' using errcode = '22023';
  end if;
  if p_answers is null or cardinality(p_answers) <> v_total then
    raise exception 'Responde todas las preguntas' using errcode = '22023';
  end if;

  for v_question in
    select q.id, q.options, k.correct_index, k.explanation
    from public.training_quiz_questions q
    join public.training_quiz_keys k on k.question_id = q.id
    where q.training_id = v_training.id
    order by q.position
  loop
    v_index := v_index + 1;
    v_selected := p_answers[v_index];
    if v_selected is null or v_selected < 0 or v_selected >= cardinality(v_question.options) then
      raise exception 'Respuesta no válida en la pregunta %', v_index using errcode = '22023';
    end if;
    if v_selected = v_question.correct_index then
      v_correct := v_correct + 1;
    end if;
    v_results := v_results || jsonb_build_object(
      'question_id', v_question.id,
      'selected', v_selected,
      'correct_index', v_question.correct_index,
      'correct', v_selected = v_question.correct_index,
      'explanation', v_question.explanation
    );
  end loop;
  if v_index <> v_total then
    raise exception 'El test no está completo' using errcode = '22023';
  end if;

  v_score := round(100.0 * v_correct / v_total, 2);
  v_passed := v_score >= 70;

  insert into public.training_attempts (org_id, assignment_id, training_id, user_id, answers,
    correct_count, total, score, passed)
  values (v_assignment.org_id, v_assignment.id, v_training.id, auth.uid(), p_answers, v_correct,
    v_total, v_score, v_passed);

  update public.training_assignments a
  set attempt_count = a.attempt_count + 1,
      best_score = greatest(coalesce(a.best_score, 0), v_score),
      passed_at = coalesce(a.passed_at, case when v_passed then now() end)
  where a.id = v_assignment.id
  returning a.best_score into v_best;

  return jsonb_build_object(
    'score', v_score,
    'passed', v_passed,
    'correct', v_correct,
    'total', v_total,
    'best_score', v_best,
    'pass_score', 70,
    'results', v_results
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.trainings enable row level security;
alter table public.training_sources enable row level security;
alter table public.training_modules enable row level security;
alter table public.training_quiz_questions enable row level security;
alter table public.training_quiz_keys enable row level security;
alter table public.training_assignments enable row level security;
alter table public.training_module_progress enable row level security;
alter table public.training_attempts enable row level security;

create policy trainings_select on public.trainings
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    or private.training_visible_to_me(id)
  );
create policy trainings_hr_insert on public.trainings
  for insert to authenticated
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy trainings_hr_update on public.trainings
  for update to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy trainings_hr_delete on public.trainings
  for delete to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy training_sources_hr on public.training_sources
  for all to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy training_modules_select on public.training_modules
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    or private.training_visible_to_me(training_id)
  );
create policy training_modules_hr_insert on public.training_modules
  for insert to authenticated
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy training_modules_hr_update on public.training_modules
  for update to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy training_modules_hr_delete on public.training_modules
  for delete to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy training_quiz_questions_select on public.training_quiz_questions
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    or private.training_visible_to_me(training_id)
  );

-- Las claves solo las ve RRHH (nadie más tiene ni siquiera permiso de lectura).
create policy training_quiz_keys_hr_select on public.training_quiz_keys
  for select to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy training_assignments_select on public.training_assignments
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and org_id = any ((select private.member_org_ids())::uuid[]))
    or org_id = any ((select private.hr_org_ids())::uuid[])
  );
create policy training_assignments_hr_update on public.training_assignments
  for update to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
-- Se puede quitar una asignación mientras no tenga intentos.
create policy training_assignments_hr_delete on public.training_assignments
  for delete to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]) and attempt_count = 0);

create policy training_module_progress_select on public.training_module_progress
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and org_id = any ((select private.member_org_ids())::uuid[]))
    or org_id = any ((select private.hr_org_ids())::uuid[])
  );
create policy training_module_progress_own_insert on public.training_module_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.module_in_my_assignment(assignment_id, module_id)
  );

create policy training_attempts_select on public.training_attempts
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and org_id = any ((select private.member_org_ids())::uuid[]))
    or org_id = any ((select private.hr_org_ids())::uuid[])
  );

-- -----------------------------------------------------------------------------
-- Privilegios explícitos
-- -----------------------------------------------------------------------------
revoke all on table public.trainings, public.training_sources, public.training_modules,
  public.training_quiz_questions, public.training_quiz_keys, public.training_assignments,
  public.training_module_progress, public.training_attempts
  from public, anon, authenticated;
grant all on table public.trainings, public.training_sources, public.training_modules,
  public.training_quiz_questions, public.training_quiz_keys, public.training_assignments,
  public.training_module_progress, public.training_attempts
  to service_role;

-- Estado y publicación solo con publish_training; test solo con save_training_quiz.
grant select, delete on table public.trainings to authenticated;
grant insert (id, org_id, title, description, topic, audience, generation)
  on table public.trainings to authenticated;
grant update (title, description, topic, audience, generation)
  on table public.trainings to authenticated;

grant select, delete on table public.training_sources to authenticated;
grant insert (id, org_id, training_id, kind, kb_document_id, title, file_path, file_mime, content)
  on table public.training_sources to authenticated;
grant update (content) on table public.training_sources to authenticated;

grant select, delete on table public.training_modules to authenticated;
grant insert (id, org_id, training_id, position, title, objective, content, examples, summary)
  on table public.training_modules to authenticated;
grant update (title, objective, content, examples, summary)
  on table public.training_modules to authenticated;

grant select on table public.training_quiz_questions to authenticated;
grant select on table public.training_quiz_keys to authenticated;

grant select, delete on table public.training_assignments to authenticated;
grant update (due_date) on table public.training_assignments to authenticated;

grant select on table public.training_module_progress to authenticated;
grant insert (assignment_id, module_id, org_id) on table public.training_module_progress
  to authenticated;

grant select on table public.training_attempts to authenticated;

revoke execute on function
  private.lock_quiz_with_attempts(),
  private.prevent_training_delete_with_attempts(),
  private.training_visible_to_me(uuid),
  private.module_in_my_assignment(uuid, uuid)
  from public, anon;
grant execute on function
  private.training_visible_to_me(uuid),
  private.module_in_my_assignment(uuid, uuid)
  to authenticated, service_role;

revoke execute on function
  public.save_training_quiz(uuid, jsonb),
  public.publish_training(uuid),
  public.duplicate_training(uuid, text),
  public.assign_training(uuid, uuid[], date),
  public.submit_training_attempt(uuid, integer[])
  from public, anon;
grant execute on function
  public.save_training_quiz(uuid, jsonb),
  public.publish_training(uuid),
  public.duplicate_training(uuid, text),
  public.assign_training(uuid, uuid[], date),
  public.submit_training_attempt(uuid, integer[])
  to authenticated;
-- Son acciones de personas (RRHH o quien hace el test): tampoco las hace el servidor.
revoke execute on function
  public.save_training_quiz(uuid, jsonb),
  public.publish_training(uuid),
  public.duplicate_training(uuid, text),
  public.assign_training(uuid, uuid[], date),
  public.submit_training_attempt(uuid, integer[])
  from service_role;
