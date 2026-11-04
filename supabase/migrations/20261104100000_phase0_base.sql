-- =============================================================================
-- HRPilot · Fase 0 · Esquema base multiempresa
-- =============================================================================
-- Convenciones (ver CLAUDE.md):
--   * Toda tabla de negocio lleva org_id NOT NULL y RLS activado.
--   * Las políticas usan los helpers de `private` envueltos en (select ...) para
--     que Postgres los evalúe una sola vez por consulta.
--   * Permisos explícitos: nada se expone a `anon`; `authenticated` solo recibe
--     los privilegios (y columnas) que necesita; `service_role` lo usa el servidor.
--   * audit_events y ai_usage son de solo inserción (incluso para service_role).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
-- La extensión `vector` (pgvector) se añade en la Fase 4, que es quien la usa.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('admin', 'hr', 'employee');
create type public.member_status as enum ('active', 'disabled');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Convierte texto a uuid sin lanzar error (para rutas de Storage manipuladas).
create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

-- Genera un slug ASCII a partir de un nombre en español.
create or replace function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(p_value, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc'
    ),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  country text not null check (country in ('ES', 'CR')),
  legal_name text check (char_length(legal_name) <= 200),
  tax_id text check (char_length(tax_id) <= 40),
  address text check (char_length(address) <= 300),
  privacy_email extensions.citext
    check (privacy_email is null or privacy_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  timezone text not null check (char_length(timezone) between 3 and 64),
  currency text not null check (currency in ('EUR', 'CRC', 'USD')),
  cv_retention_months smallint not null default 12 check (cv_retention_months between 1 and 60),
  ai_monthly_budget_usd numeric(10, 2) not null default 20 check (ai_monthly_budget_usd >= 0),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is 'Empresas (tenants). Todo dato de negocio cuelga de una organización.';
comment on column public.organizations.ai_monthly_budget_usd is
  'Tope de gasto estimado de IA al mes. Lo gestiona la plataforma, no el admin de la empresa.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext,
  full_name text check (char_length(full_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Datos públicos de cada usuario (1:1 con auth.users).';

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_org_idx on public.memberships (user_id, org_id);
comment on table public.memberships is 'Pertenencia de un usuario a una empresa con un rol.';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email extensions.citext not null
    check (email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role public.member_role not null,
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_one_pending_per_email
  on public.invitations (org_id, email)
  where accepted_at is null and revoked_at is null;
create index invitations_org_created_idx on public.invitations (org_id, created_at desc);
comment on table public.invitations is
  'Invitaciones pendientes. Solo se guarda el hash SHA-256 del token; el enlace se muestra una vez.';

-- Registro de auditoría: solo inserción. actor_id sin FK a propósito (seudónimo
-- que sobrevive al borrado del usuario). details nunca lleva datos personales.
create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user', 'system')),
  action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events (org_id, created_at desc);
create index audit_events_entity_idx
  on public.audit_events (org_id, entity_type, entity_id, created_at desc);
comment on table public.audit_events is
  'Registro de auditoría (solo inserción). Sin datos personales en details.';

-- Uso de IA por empresa (base para facturar por consumo). Solo inserción.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid,
  feature text not null,
  prompt_id text,
  prompt_version integer,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_creation_input_tokens integer not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens integer not null default 0 check (cache_read_input_tokens >= 0),
  cost_usd_est numeric(12, 6) not null default 0 check (cost_usd_est >= 0),
  duration_ms integer check (duration_ms >= 0),
  status text not null
    check (status in ('ok', 'error', 'validation_failed', 'refused', 'budget_exceeded')),
  attempts smallint not null default 1 check (attempts >= 1),
  error_code text,
  request_id text,
  created_at timestamptz not null default now()
);
create index ai_usage_org_created_idx on public.ai_usage (org_id, created_at desc);
comment on table public.ai_usage is 'Cada llamada a la IA: tokens, coste estimado y estado. Solo inserción.';

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers de autorización (security definer, esquema no expuesto)
-- -----------------------------------------------------------------------------
-- Devuelven los ids de las empresas en las que el usuario actual tiene un
-- rol activo. En las políticas se usan como `org_id = any ((select private.x())::uuid[])`:
-- el cast obliga a tratarlo como array y la subconsulta se evalúa una vez por consulta.
create or replace function private.org_ids_with_role(p_roles public.member_role[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.org_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role = any (p_roles);
$$;

create or replace function private.member_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_ids_with_role(array['admin', 'hr', 'employee']::public.member_role[]);
$$;

create or replace function private.hr_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_ids_with_role(array['admin', 'hr']::public.member_role[]);
$$;

create or replace function private.admin_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_ids_with_role(array['admin']::public.member_role[]);
$$;

-- Comprobaciones puntuales (para RPCs y código de servidor).
create or replace function private.has_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org, array['admin', 'hr', 'employee']::public.member_role[]);
$$;

create or replace function private.is_hr(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org, array['admin', 'hr']::public.member_role[]);
$$;

create or replace function private.is_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_org, array['admin']::public.member_role[]);
$$;

-- Perfiles visibles: el propio y los de las personas de las empresas donde el
-- usuario es admin o RRHH.
create or replace function private.visible_profile_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct target.user_id), '{}'::uuid[])
  from public.memberships viewer
  join public.memberships target on target.org_id = viewer.org_id
  where viewer.user_id = (select auth.uid())
    and viewer.status = 'active'
    and viewer.role in ('admin', 'hr');
$$;

-- -----------------------------------------------------------------------------
-- Integridad: solo inserción, último admin, perfiles
-- -----------------------------------------------------------------------------
create or replace function private.prevent_append_only_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Única excepción: borrado en cascada al eliminar la empresa completa.
    if not exists (select 1 from public.organizations o where o.id = old.org_id) then
      return old;
    end if;
  end if;
  raise exception 'La tabla % es de solo inserción', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function private.prevent_append_only_changes();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.prevent_append_only_changes();
create trigger ai_usage_append_only before update or delete on public.ai_usage
  for each row execute function private.prevent_append_only_changes();
create trigger ai_usage_no_truncate before truncate on public.ai_usage
  for each statement execute function private.prevent_append_only_changes();

create or replace function private.ensure_org_keeps_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Borrado en cascada de la empresa: no hay nada que proteger.
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    -- Serializa cambios concurrentes de administradores de la misma empresa.
    perform 1 from public.organizations o where o.id = old.org_id for update;
    if not exists (
      select 1
      from public.memberships m
      where m.org_id = old.org_id
        and m.id <> old.id
        and m.role = 'admin'
        and m.status = 'active'
    ) then
      raise exception 'La empresa debe tener al menos un administrador activo'
        using errcode = 'P0001';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger memberships_keep_an_admin before update or delete on public.memberships
  for each row execute function private.ensure_org_keeps_an_admin();

-- Perfil automático al darse de alta un usuario en Supabase Auth.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p set email = new.email where p.id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Auditoría automática (independiente de la ruta de código)
-- -----------------------------------------------------------------------------
create or replace function private.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  insert into public.audit_events (org_id, actor_id, actor_type, action, entity_type, entity_id, details)
  values (
    p_org,
    v_actor,
    case when v_actor is null then 'system' else 'user' end,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create or replace function private.audit_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit(new.org_id, 'member.added', 'membership', new.id,
      jsonb_build_object('user_id', new.user_id, 'role', new.role));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.log_audit(new.org_id, 'member.role_changed', 'membership', new.id,
        jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    end if;
    if new.status is distinct from old.status then
      perform private.log_audit(new.org_id, 'member.status_changed', 'membership', new.id,
        jsonb_build_object('user_id', new.user_id, 'from', old.status, 'to', new.status));
    end if;
    return new;
  else
    if exists (select 1 from public.organizations o where o.id = old.org_id) then
      perform private.log_audit(old.org_id, 'member.removed', 'membership', old.id,
        jsonb_build_object('user_id', old.user_id, 'role', old.role));
    end if;
    return old;
  end if;
end;
$$;

create trigger memberships_audit after insert or update or delete on public.memberships
  for each row execute function private.audit_membership_changes();

create or replace function private.audit_invitation_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit(new.org_id, 'invitation.created', 'invitation', new.id,
      jsonb_build_object('role', new.role));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform private.log_audit(new.org_id, 'invitation.revoked', 'invitation', new.id, '{}'::jsonb);
  elsif new.accepted_at is not null and old.accepted_at is null then
    perform private.log_audit(new.org_id, 'invitation.accepted', 'invitation', new.id,
      jsonb_build_object('role', new.role));
  elsif new.token_hash is distinct from old.token_hash then
    perform private.log_audit(new.org_id, 'invitation.link_regenerated', 'invitation', new.id,
      '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger invitations_audit after insert or update on public.invitations
  for each row execute function private.audit_invitation_changes();

create or replace function private.audit_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[];
begin
  select coalesce(array_agg(n.key order by n.key), '{}'::text[])
    into v_fields
  from jsonb_each(to_jsonb(new)) n
  where n.key <> 'updated_at'
    and n.value is distinct from (to_jsonb(old) -> n.key);

  if cardinality(v_fields) > 0 then
    perform private.log_audit(new.id, 'organization.updated', 'organization', new.id,
      jsonb_build_object('fields', to_jsonb(v_fields)));
  end if;
  return new;
end;
$$;

create trigger organizations_audit_update after update on public.organizations
  for each row execute function private.audit_organization_update();

-- -----------------------------------------------------------------------------
-- RPCs expuestas a la app
-- -----------------------------------------------------------------------------
-- Crea una empresa y deja a quien la crea como admin.
create or replace function public.create_organization(
  p_name text,
  p_country text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_address text default null,
  p_privacy_email text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org public.organizations;
  v_base text;
  v_slug text;
  v_attempts integer := 0;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if p_country is null or p_country not in ('ES', 'CR') then
    raise exception 'País no soportado' using errcode = '22023';
  end if;

  -- Defensa: el perfil debería existir (trigger de auth), pero lo garantizamos.
  insert into public.profiles (id, email)
  select u.id, u.email from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  v_base := left(private.slugify(p_name), 40);
  if char_length(v_base) < 2 then
    v_base := 'empresa';
  end if;
  v_slug := v_base;
  -- 'new' está reservado: /app/new es la pantalla de alta de empresa.
  while v_slug in ('new') or exists (select 1 from public.organizations o where o.slug = v_slug) loop
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then
      raise exception 'No se pudo generar un identificador único para la empresa';
    end if;
    v_slug := v_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  end loop;

  insert into public.organizations (
    name, slug, country, legal_name, tax_id, address, privacy_email, timezone, currency, created_by
  )
  values (
    trim(p_name),
    v_slug,
    p_country,
    nullif(trim(p_legal_name), ''),
    nullif(trim(p_tax_id), ''),
    nullif(trim(p_address), ''),
    nullif(trim(p_privacy_email), ''),
    case p_country when 'ES' then 'Europe/Madrid' else 'America/Costa_Rica' end,
    case p_country when 'ES' then 'EUR' else 'CRC' end,
    v_user
  )
  returning * into v_org;

  insert into public.memberships (org_id, user_id, role, status)
  values (v_org.id, v_user, 'admin', 'active');

  perform private.log_audit(v_org.id, 'organization.created', 'organization', v_org.id,
    jsonb_build_object('country', p_country));

  return v_org;
end;
$$;

-- Datos mínimos de una invitación a partir de su token (para la página pública).
create or replace function public.get_invitation_preview(p_token text)
returns table (organization_name text, role public.member_role, email text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.role,
    i.email::text,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.organizations o on o.id = i.org_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- Acepta una invitación: exige sesión y que el email coincida.
create or replace function public.accept_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations;
  v_member public.memberships;
  v_slug text;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user;

  select * into v_inv
  from public.invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'La invitación no es válida' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'La invitación ha sido revocada' using errcode = 'P0001';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'La invitación ya se ha utilizado' using errcode = 'P0001';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'La invitación ha caducado' using errcode = 'P0001';
  end if;
  if v_email is null or lower(v_email) <> lower(v_inv.email::text) then
    raise exception 'La invitación es para otra dirección de email' using errcode = '42501';
  end if;

  insert into public.profiles (id, email) values (v_user, v_email)
  on conflict (id) do nothing;

  select * into v_member
  from public.memberships m
  where m.org_id = v_inv.org_id and m.user_id = v_user;

  if not found then
    insert into public.memberships (org_id, user_id, role, invited_by)
    values (v_inv.org_id, v_user, v_inv.role, v_inv.invited_by);
  elsif v_member.status = 'disabled' then
    update public.memberships
    set role = v_inv.role, status = 'active'
    where id = v_member.id;
  end if;
  -- Si ya era miembro activo se mantiene su rol (una invitación no degrada).

  update public.invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_inv.id;

  select o.slug into v_slug from public.organizations o where o.id = v_inv.org_id;
  return v_slug;
end;
$$;

-- Gasto estimado de IA del mes en curso (lo usa el servidor para el tope).
create or replace function public.org_ai_spend_current_month(p_org uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(u.cost_usd_est), 0)
  from public.ai_usage u
  where u.org_id = p_org
    and u.created_at >= date_trunc('month', now());
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_events enable row level security;
alter table public.ai_usage enable row level security;

-- organizations
create policy organizations_select_members on public.organizations
  for select to authenticated
  using (id = any ((select private.member_org_ids())::uuid[]));
create policy organizations_update_admins on public.organizations
  for update to authenticated
  using (id = any ((select private.admin_org_ids())::uuid[]))
  with check (id = any ((select private.admin_org_ids())::uuid[]));

-- profiles
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id = any ((select private.visible_profile_ids())::uuid[]));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships
create policy memberships_select_own_or_hr on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or org_id = any ((select private.hr_org_ids())::uuid[]));
create policy memberships_update_admins on public.memberships
  for update to authenticated
  using (org_id = any ((select private.admin_org_ids())::uuid[]))
  with check (org_id = any ((select private.admin_org_ids())::uuid[]));
create policy memberships_delete_admins on public.memberships
  for delete to authenticated
  using (org_id = any ((select private.admin_org_ids())::uuid[]));

-- invitations
create policy invitations_admins_all on public.invitations
  for all to authenticated
  using (org_id = any ((select private.admin_org_ids())::uuid[]))
  with check (org_id = any ((select private.admin_org_ids())::uuid[]));

-- audit_events: admin todo; RRHH solo eventos de selección y onboarding.
create policy audit_events_select on public.audit_events
  for select to authenticated
  using (
    org_id = any ((select private.admin_org_ids())::uuid[])
    or (
      org_id = any ((select private.hr_org_ids())::uuid[])
      and entity_type in ('job', 'candidate', 'cv_analysis', 'interview_guide', 'onboarding')
    )
  );

-- ai_usage: solo admin.
create policy ai_usage_select_admins on public.ai_usage
  for select to authenticated
  using (org_id = any ((select private.admin_org_ids())::uuid[]));

-- -----------------------------------------------------------------------------
-- Privilegios explícitos (no dependemos de los privilegios por defecto)
-- -----------------------------------------------------------------------------
revoke all on table
  public.organizations, public.profiles, public.memberships,
  public.invitations, public.audit_events, public.ai_usage
from public, anon, authenticated;

grant all on table
  public.organizations, public.profiles, public.memberships,
  public.invitations, public.audit_events, public.ai_usage
to service_role;

grant select on table public.organizations to authenticated;
grant update (name, country, legal_name, tax_id, address, privacy_email, timezone, currency,
  cv_retention_months) on table public.organizations to authenticated;

grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

grant select, delete on table public.memberships to authenticated;
grant update (role, status) on table public.memberships to authenticated;

grant select, delete on table public.invitations to authenticated;
grant insert (org_id, email, role, token_hash, expires_at) on table public.invitations
  to authenticated;
grant update (role, token_hash, expires_at, revoked_at) on table public.invitations
  to authenticated;

grant select on table public.audit_events to authenticated;
grant select on table public.ai_usage to authenticated;

-- Funciones: nada ejecutable por defecto; se concede caso a caso.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.create_organization(text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text)
  to authenticated;

revoke execute on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

revoke execute on function public.org_ai_spend_current_month(uuid)
  from public, anon, authenticated;
grant execute on function public.org_ai_spend_current_month(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Storage: buckets privados con la empresa como primera carpeta de la ruta
--   {org_id}/... → solo accesible por miembros con el rol adecuado.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cvs', 'cvs', false, 10485760, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('kb-documents', 'kb-documents', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('training-sources', 'training-sources', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
on conflict (id) do nothing;

-- CVs: solo admin y RRHH de la empresa (el anonimato se añade en la Fase 2).
create policy "cvs_hr_all" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'cvs'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  )
  with check (
    bucket_id = 'cvs'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  );

-- Documentos de la FAQ: lectura para cualquier miembro; gestión admin y RRHH.
create policy "kb_documents_members_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kb-documents'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.member_org_ids())::uuid[])
  );
create policy "kb_documents_hr_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kb-documents'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  );
create policy "kb_documents_hr_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kb-documents'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  )
  with check (
    bucket_id = 'kb-documents'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  );
create policy "kb_documents_hr_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kb-documents'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  );

-- Fuentes de formación: solo admin y RRHH.
create policy "training_sources_hr_all" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'training-sources'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  )
  with check (
    bucket_id = 'training-sources'
    and private.try_uuid((storage.foldername(name))[1]) = any ((select private.hr_org_ids())::uuid[])
  );
