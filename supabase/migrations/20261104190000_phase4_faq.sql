-- =============================================================================
-- HRPilot · Fase 4 · FAQ interna con documentos y citas
-- =============================================================================
-- Garantías (tests en tests/db/faq.test.ts):
--   * Documentos y fragmentos: cualquier miembro lee los LISTOS de su empresa;
--     solo admin y RRHH los gestionan. La búsqueda (match_kb_chunks) se ejecuta
--     con los permisos del usuario y nunca devuelve fragmentos de otra empresa.
--   * El fichero original de un documento solo lo lee la plantilla cuando está listo.
--   * Conversaciones del chat: solo las ve su autor. RRHH ve las preguntas de
--     forma anónima y agregada (RPC sin identificadores de persona).
--   * Consultas a RRHH: la persona ve las suyas; RRHH las de la empresa y las
--     responde con una RPC que avisa a quien preguntó (aviso dentro de la app).
-- =============================================================================

create extension if not exists vector with schema extensions;

create type public.kb_document_status as enum ('pending', 'processing', 'ready', 'failed');
create type public.kb_doc_type as enum ('policy', 'handbook', 'agreement', 'benefits', 'other');
create type public.faq_outcome as enum ('answered', 'not_found', 'error');
create type public.hr_query_status as enum ('open', 'answered');

-- -----------------------------------------------------------------------------
-- Documentos y fragmentos
-- -----------------------------------------------------------------------------
create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 200),
  doc_type public.kb_doc_type not null default 'other',
  -- Fichero en Storage (bucket kb-documents): {org_id}/{id}.pdf|docx
  file_path text not null unique,
  file_mime text not null check (file_mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  file_size integer not null check (file_size between 1 and 26214400),
  status public.kb_document_status not null default 'pending',
  error text check (error ~ '^[a-z_]{1,40}$'),
  pages integer check (pages >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  -- Modelo con el que se calcularon los embeddings (si cambia, hay que reprocesar).
  embedding_model text check (char_length(embedding_model) <= 100),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  constraint kb_documents_path_format check (
    file_path = org_id::text || '/' || id::text
      || case file_mime when 'application/pdf' then '.pdf' else '.docx' end
  )
);
create index kb_documents_org_idx on public.kb_documents (org_id, created_at desc);

create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  document_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  heading text check (char_length(heading) <= 300),
  -- Párrafos del fragmento: cada uno es una unidad citable por la IA.
  blocks text[] not null check (cardinality(blocks) between 1 and 60),
  content text not null check (char_length(content) between 1 and 8000),
  page_from integer check (page_from >= 1),
  page_to integer check (page_to >= page_from),
  token_count integer not null default 0 check (token_count >= 0),
  embedding extensions.vector(1024) not null,
  fts tsvector generated always as (
    to_tsvector('spanish', coalesce(heading, '') || ' ' || content)
  ) stored,
  unique (document_id, chunk_index),
  foreign key (document_id, org_id) references public.kb_documents (id, org_id) on delete cascade
);
create index kb_chunks_org_doc_idx on public.kb_chunks (org_id, document_id);
create index kb_chunks_fts_idx on public.kb_chunks using gin (fts);
create index kb_chunks_embedding_idx on public.kb_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger kb_documents_set_updated_at before update on public.kb_documents
  for each row execute function private.set_updated_at();

create or replace function private.kb_document_is_ready(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kb_documents d where d.id = p_document_id and d.status = 'ready'
  );
$$;

-- Fichero original: RRHH de la empresa siempre; el resto de la plantilla, solo si
-- el documento está listo (un borrador o un fichero huérfano no se comparte).
create or replace function private.can_read_kb_file(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.try_uuid((storage.foldername(p_path))[1]) = any (private.hr_org_ids()),
    false
  )
  or exists (
    select 1
    from public.kb_documents d
    where d.file_path = p_path
      and d.status = 'ready'
      and d.org_id = any (private.member_org_ids())
  );
$$;

-- Búsqueda híbrida: semántica (embeddings) + palabras clave en español.
--   * Un fragmento es relevante si su similitud supera p_min_similarity o si
--     contiene al menos la mitad de los términos de la pregunta (mínimo 2 cuando
--     la pregunta tiene varios). Sin fragmentos relevantes no se llama a la IA.
--   * Se ordena por fusión de rangos (RRF) y se devuelven como mucho 12.
--   * security invoker: la RLS limita a lo que el usuario puede leer.
create or replace function public.match_kb_chunks(
  p_org_id uuid,
  p_embedding extensions.vector(1024),
  p_query text,
  p_embedding_model text,
  p_match_count integer default 6,
  p_min_similarity double precision default 0.4
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  heading text,
  blocks text[],
  page_from integer,
  page_to integer,
  similarity double precision,
  matched_terms integer,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select coalesce(array_agg(distinct t.lexeme), '{}'::text[]) as lexemes
    from unnest(to_tsvector('spanish', left(coalesce(p_query, ''), 1000))) as t
  ),
  candidates as (
    select
      c.id,
      c.document_id,
      d.title,
      c.heading,
      c.blocks,
      c.page_from,
      c.page_to,
      1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity,
      (
        select count(*)::integer
        from unnest(terms.lexemes) as l(lexeme)
        where l.lexeme = any (tsvector_to_array(c.fts))
      ) as matched_terms,
      cardinality(terms.lexemes) as total_terms
    from public.kb_chunks c
    join public.kb_documents d on d.id = c.document_id and d.org_id = c.org_id
    cross join terms
    where c.org_id = p_org_id
      and d.status = 'ready'
      and d.embedding_model = p_embedding_model
  ),
  relevant as (
    select *
    from candidates
    where similarity >= p_min_similarity
      or (
        total_terms > 0
        and matched_terms >= greatest(1, ceil(total_terms / 2.0))
        and (matched_terms >= 2 or total_terms = 1)
      )
  ),
  ranked as (
    select
      r.*,
      row_number() over (order by r.similarity desc) as vector_rank,
      row_number() over (order by r.matched_terms desc, r.similarity desc) as text_rank
    from relevant r
  )
  select
    ranked.id,
    ranked.document_id,
    ranked.title,
    ranked.heading,
    ranked.blocks,
    ranked.page_from,
    ranked.page_to,
    ranked.similarity,
    ranked.matched_terms,
    1.0 / (60 + ranked.vector_rank) + 1.0 / (60 + ranked.text_rank) as score
  from ranked
  order by score desc
  limit greatest(1, least(coalesce(p_match_count, 6), 12));
$$;

-- -----------------------------------------------------------------------------
-- Conversaciones del chat (privadas de cada persona; se conservan 12 meses)
-- -----------------------------------------------------------------------------
create table public.faq_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index faq_conversations_user_idx
  on public.faq_conversations (user_id, org_id, updated_at desc);
create index faq_conversations_updated_idx on public.faq_conversations (updated_at);

create table public.faq_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversation_id uuid not null,
  user_id uuid not null default auth.uid(),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  -- Respuestas: fuentes citadas [{ n, chunkId, documentId, documentTitle, pageFrom,
  -- pageTo, citedText }] y tramos de texto con sus referencias [{ text, refs }].
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  segments jsonb check (segments is null or jsonb_typeof(segments) = 'array'),
  outcome public.faq_outcome,
  -- Preguntas: embedding para agruparlas (anónimas) en el panel de RRHH.
  question_embedding extensions.vector(1024),
  embedding_model text check (char_length(embedding_model) <= 100),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (conversation_id, org_id) references public.faq_conversations (id, org_id)
    on delete cascade,
  constraint faq_messages_outcome check ((role = 'assistant') = (outcome is not null)),
  constraint faq_messages_embedding check (role = 'user' or question_embedding is null)
);
create index faq_messages_conversation_idx on public.faq_messages (conversation_id, created_at);
create index faq_messages_org_idx on public.faq_messages (org_id, created_at desc);

create or replace function private.touch_faq_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.faq_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger faq_messages_touch_conversation after insert on public.faq_messages
  for each row execute function private.touch_faq_conversation();

-- -----------------------------------------------------------------------------
-- Avisos dentro de la app (genéricos: también los usa la Fase 5)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- El texto se traduce en la interfaz: notifications.<kind> con `params`.
  kind text not null check (kind ~ '^[a-z_]{1,40}$'),
  params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
  -- Solo enlaces internos de la app.
  link text check (link ~ '^/app/[a-z0-9-]+(/[A-Za-z0-9/_?=&-]*)?$'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Consultas a RRHH
-- -----------------------------------------------------------------------------
create table public.hr_queries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(trim(question)) between 5 and 2000),
  status public.hr_query_status not null default 'open',
  answer text check (char_length(answer) <= 4000),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, org_id),
  constraint hr_queries_answered check ((status = 'answered') = (answer is not null))
);
create index hr_queries_org_idx on public.hr_queries (org_id, status, created_at desc);
create index hr_queries_requester_idx on public.hr_queries (requester_id, created_at desc);

-- Una consulta nueva avisa a admin y RRHH de la empresa (salvo a quien pregunta).
create or replace function private.notify_new_hr_query()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  select o.slug into v_slug from public.organizations o where o.id = new.org_id;
  insert into public.notifications (org_id, user_id, kind, link)
  select new.org_id, m.user_id, 'hr_query_created', '/app/' || v_slug || '/hr-queries'
  from public.memberships m
  where m.org_id = new.org_id
    and m.status = 'active'
    and m.role in ('admin', 'hr')
    and m.user_id <> new.requester_id;
  return new;
end;
$$;

create trigger hr_queries_notify_hr after insert on public.hr_queries
  for each row execute function private.notify_new_hr_query();

-- RRHH responde una consulta: guarda la respuesta y avisa a quien preguntó.
create or replace function public.answer_hr_query(p_query_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query public.hr_queries%rowtype;
  v_slug text;
  v_answer text := trim(coalesce(p_answer, ''));
begin
  select * into v_query from public.hr_queries q where q.id = p_query_id for update;
  if not found or auth.uid() is null or not private.is_hr(v_query.org_id) then
    raise exception 'Consulta no encontrada' using errcode = 'P0002';
  end if;
  if char_length(v_answer) not between 2 and 4000 then
    raise exception 'La respuesta debe tener entre 2 y 4000 caracteres' using errcode = '22023';
  end if;

  update public.hr_queries q
  set answer = v_answer, status = 'answered', answered_by = auth.uid(), answered_at = now()
  where q.id = p_query_id;

  select o.slug into v_slug from public.organizations o where o.id = v_query.org_id;
  insert into public.notifications (org_id, user_id, kind, link)
  values (v_query.org_id, v_query.requester_id, 'hr_query_answered',
    '/app/' || v_slug || '/faq/my-queries');

  perform private.log_audit(v_query.org_id, 'hr_query.answered', 'hr_query', p_query_id, '{}');
end;
$$;

-- -----------------------------------------------------------------------------
-- Panel de RRHH: preguntas anónimas y agregadas (sin identificar a nadie)
-- -----------------------------------------------------------------------------
-- Agrupa las preguntas de los últimos p_days días por similitud de embeddings.
-- Devuelve el texto de una pregunta representativa, cuántas hay en el grupo y
-- cuántas no tuvieron respuesta respaldada por los documentos.
create or replace function public.faq_question_clusters(
  p_org_id uuid,
  p_days integer default 90,
  p_min_similarity double precision default 0.8
)
returns table (
  question text,
  total integer,
  unanswered integer,
  last_asked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_cluster integer;
  v_centroids extensions.vector[] := '{}';
  v_questions text[] := '{}';
  v_totals integer[] := '{}';
  v_unanswered integer[] := '{}';
  v_last timestamptz[] := '{}';
  i integer;
begin
  if auth.uid() is null or not private.is_hr(p_org_id) then
    raise exception 'Solo RRHH' using errcode = '42501';
  end if;

  for v_row in
    select
      m.content,
      m.question_embedding,
      m.created_at,
      (
        select a.outcome
        from public.faq_messages a
        where a.conversation_id = m.conversation_id
          and a.role = 'assistant'
          and a.created_at >= m.created_at
        order by a.created_at
        limit 1
      ) as outcome
    from public.faq_messages m
    where m.org_id = p_org_id
      and m.role = 'user'
      and m.question_embedding is not null
      and m.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 365)))
    order by m.created_at desc
    limit 500
  loop
    v_cluster := null;
    for i in 1 .. coalesce(array_length(v_centroids, 1), 0) loop
      if 1 - (v_centroids[i] operator(extensions.<=>) v_row.question_embedding)
         >= p_min_similarity then
        v_cluster := i;
        exit;
      end if;
    end loop;

    if v_cluster is null then
      v_centroids := array_append(v_centroids, v_row.question_embedding);
      v_questions := array_append(v_questions, v_row.content);
      v_totals := array_append(v_totals, 1);
      v_unanswered := array_append(
        v_unanswered, case when v_row.outcome = 'answered' then 0 else 1 end
      );
      v_last := array_append(v_last, v_row.created_at);
    else
      v_totals[v_cluster] := v_totals[v_cluster] + 1;
      if v_row.outcome is distinct from 'answered' then
        v_unanswered[v_cluster] := v_unanswered[v_cluster] + 1;
      end if;
    end if;
  end loop;

  return query
    select t.question, t.total, t.unanswered, t.last_asked_at
    from unnest(v_questions, v_totals, v_unanswered, v_last)
      as t(question, total, unanswered, last_asked_at)
    order by t.total desc, t.last_asked_at desc
    limit 100;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.faq_conversations enable row level security;
alter table public.faq_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.hr_queries enable row level security;

create policy kb_documents_select on public.kb_documents
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    or (org_id = any ((select private.member_org_ids())::uuid[]) and status = 'ready')
  );
create policy kb_documents_hr_insert on public.kb_documents
  for insert to authenticated
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy kb_documents_hr_update on public.kb_documents
  for update to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]))
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy kb_documents_hr_delete on public.kb_documents
  for delete to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy kb_chunks_select on public.kb_chunks
  for select to authenticated
  using (
    org_id = any ((select private.hr_org_ids())::uuid[])
    or (
      org_id = any ((select private.member_org_ids())::uuid[])
      and private.kb_document_is_ready(document_id)
    )
  );
create policy kb_chunks_hr_insert on public.kb_chunks
  for insert to authenticated
  with check (org_id = any ((select private.hr_org_ids())::uuid[]));
create policy kb_chunks_hr_delete on public.kb_chunks
  for delete to authenticated
  using (org_id = any ((select private.hr_org_ids())::uuid[]));

create policy faq_conversations_own on public.faq_conversations
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = any ((select private.member_org_ids())::uuid[])
  )
  with check (
    user_id = (select auth.uid())
    and org_id = any ((select private.member_org_ids())::uuid[])
  );

create policy faq_messages_own on public.faq_messages
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and org_id = any ((select private.member_org_ids())::uuid[])
  )
  with check (
    user_id = (select auth.uid())
    and org_id = any ((select private.member_org_ids())::uuid[])
    -- Solo en conversaciones propias (la RLS de faq_conversations oculta las ajenas).
    and exists (
      select 1 from public.faq_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy notifications_own_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy hr_queries_select on public.hr_queries
  for select to authenticated
  using (
    (requester_id = (select auth.uid()) and org_id = any ((select private.member_org_ids())::uuid[]))
    or org_id = any ((select private.hr_org_ids())::uuid[])
  );
create policy hr_queries_insert_own on public.hr_queries
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and org_id = any ((select private.member_org_ids())::uuid[])
  );

-- Storage: el fichero de un documento de la FAQ solo lo lee la plantilla cuando
-- el documento está listo (sustituye a la política genérica de la Fase 0).
drop policy if exists "kb_documents_members_select" on storage.objects;
create policy "kb_documents_select_visible" on storage.objects
  for select to authenticated
  using (bucket_id = 'kb-documents' and private.can_read_kb_file(name));

-- -----------------------------------------------------------------------------
-- Privilegios explícitos
-- -----------------------------------------------------------------------------
revoke all on table public.kb_documents, public.kb_chunks, public.faq_conversations,
  public.faq_messages, public.notifications, public.hr_queries
  from public, anon, authenticated;
grant all on table public.kb_documents, public.kb_chunks, public.faq_conversations,
  public.faq_messages, public.notifications, public.hr_queries
  to service_role;

grant select, delete on table public.kb_documents to authenticated;
grant insert (id, org_id, title, doc_type, file_path, file_mime, file_size)
  on table public.kb_documents to authenticated;
grant update (title, doc_type, status, error, pages, chunk_count, embedding_model)
  on table public.kb_documents to authenticated;

grant select, delete on table public.kb_chunks to authenticated;
grant insert (org_id, document_id, chunk_index, heading, blocks, content, page_from, page_to,
  token_count, embedding) on table public.kb_chunks to authenticated;

grant select, delete on table public.faq_conversations to authenticated;
grant insert (id, org_id, title) on table public.faq_conversations to authenticated;

grant select on table public.faq_messages to authenticated;
grant insert (org_id, conversation_id, role, content, sources, segments, outcome,
  question_embedding, embedding_model) on table public.faq_messages to authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

grant select on table public.hr_queries to authenticated;
grant insert (org_id, question) on table public.hr_queries to authenticated;

revoke execute on function
  private.kb_document_is_ready(uuid),
  private.can_read_kb_file(text),
  private.touch_faq_conversation(),
  private.notify_new_hr_query()
  from public, anon;
grant execute on function
  private.kb_document_is_ready(uuid),
  private.can_read_kb_file(text)
  to authenticated, service_role;

revoke execute on function
  public.match_kb_chunks(uuid, extensions.vector, text, text, integer, double precision),
  public.answer_hr_query(uuid, text),
  public.faq_question_clusters(uuid, integer, double precision)
  from public, anon;
grant execute on function
  public.match_kb_chunks(uuid, extensions.vector, text, text, integer, double precision),
  public.answer_hr_query(uuid, text),
  public.faq_question_clusters(uuid, integer, double precision)
  to authenticated;
-- Responder es una acción de una persona de RRHH: tampoco la hace el servidor.
revoke execute on function public.answer_hr_query(uuid, text) from service_role;
