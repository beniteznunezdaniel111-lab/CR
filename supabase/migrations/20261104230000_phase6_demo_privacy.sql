-- =============================================================================
-- HRPilot · Fase 6 · Demo, privacidad y tope de IA visible para el admin
-- =============================================================================
-- Garantías (tests en tests/db/privacy-demo.test.ts):
--   * Solo el admin de la empresa ve su consumo frente al tope.
--   * Una empresa demo se marca como tal (is_demo) y caduca (la borra el cron).
--   * Cerrar una empresa exige ser admin y escribir su nombre; borra todo en cascada.
--   * Borrar los datos de una persona en la empresa elimina su actividad personal
--     (conversaciones, consultas, avisos, formaciones, onboarding) y su membresía.
-- =============================================================================

-- Consumo del mes frente al tope (aviso al 80 % y página de uso de IA).
create or replace function public.org_ai_budget_status(p_org_id uuid)
returns table (limit_usd numeric, spent_usd numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select o.ai_monthly_budget_usd, public.org_ai_spend_current_month(o.id)
  from public.organizations o
  where o.id = p_org_id
    and auth.uid() is not null
    and private.is_admin(o.id);
$$;

-- Empresa demo: como create_organization, marcada como demo (datos ficticios y
-- desechables). Como mucho 3 empresas demo por persona.
create or replace function public.create_demo_organization(p_name text, p_country text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if (
    select count(*)
    from public.organizations o
    join public.memberships m on m.org_id = o.id
    where o.is_demo and m.user_id = auth.uid() and m.role = 'admin'
  ) >= 3 then
    raise exception 'Ya tienes 3 empresas demo: cierra alguna antes de crear otra'
      using errcode = '22023';
  end if;

  v_org := public.create_organization(p_name, p_country);
  update public.organizations o set is_demo = true where o.id = v_org.id returning * into v_org;
  return v_org;
end;
$$;

-- Cierre de una empresa: borra todo en cascada (también su auditoría y su uso de
-- IA). Los ficheros de Storage los borra antes el servidor.
create or replace function public.close_organization(p_org_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations%rowtype;
begin
  select * into v_org from public.organizations o where o.id = p_org_id for update;
  if not found or auth.uid() is null or not private.is_admin(p_org_id) then
    raise exception 'Empresa no encontrada' using errcode = 'P0002';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> v_org.name then
    raise exception 'El nombre no coincide' using errcode = '22023';
  end if;
  delete from public.organizations o where o.id = p_org_id;
end;
$$;

-- Borra los datos personales de un miembro en la empresa y su membresía. Se
-- conservan los registros de trabajo que hizo (p. ej. respuestas de RRHH). La
-- auditoría no guarda quién era.
create or replace function public.erase_member_data(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_admin(p_org_id) then
    raise exception 'Empresa no encontrada' using errcode = 'P0002';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes borrar tus propios datos desde aquí' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.memberships m where m.org_id = p_org_id and m.user_id = p_user_id
  ) then
    raise exception 'Persona no encontrada' using errcode = 'P0002';
  end if;

  delete from public.faq_conversations c where c.org_id = p_org_id and c.user_id = p_user_id;
  delete from public.hr_queries q where q.org_id = p_org_id and q.requester_id = p_user_id;
  delete from public.notifications n where n.org_id = p_org_id and n.user_id = p_user_id;
  delete from public.training_assignments a where a.org_id = p_org_id and a.user_id = p_user_id;
  delete from public.onboarding_assignments a
  where a.org_id = p_org_id and a.member_user_id = p_user_id;
  delete from public.memberships m where m.org_id = p_org_id and m.user_id = p_user_id;

  perform private.log_audit(p_org_id, 'member.data_erased', 'membership', null, '{}');
end;
$$;

revoke execute on function
  public.org_ai_budget_status(uuid),
  public.create_demo_organization(text, text),
  public.close_organization(uuid, text),
  public.erase_member_data(uuid, uuid)
  from public, anon;
grant execute on function
  public.org_ai_budget_status(uuid),
  public.create_demo_organization(text, text),
  public.close_organization(uuid, text),
  public.erase_member_data(uuid, uuid)
  to authenticated;
-- Son decisiones de una persona admin: el servidor no las toma con su clave.
revoke execute on function
  public.close_organization(uuid, text),
  public.erase_member_data(uuid, uuid)
  from service_role;
