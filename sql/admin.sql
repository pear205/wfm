-- 관리 센터(사용자·권한 / 공수 산정 기준표 / 공통코드) 용 DB. 명세: docs/admin-spec.md
-- 선행: sql/allowlist.sql, sql/boards.sql, sql/estimates.sql. 여러 번 실행해도 안전하다(idempotent).
--
-- 구역 A (추가 전용, 기존 동작을 바꾸지 않음): 역할 열·함수·새 테이블·트리거·새 테이블 정책
-- 구역 B (기존 테이블의 쓰기 정책을 역할 기반으로 교체): A 적용·확인 후에 실행
-- 되돌리기: 맨 아래 "ROLLBACK" 주석 참고
--
-- 이 파일에는 이메일을 적지 않는다. 기존 허용 계정은 role 열을 추가할 때 모두 admin 이 된다.

do $$
begin
  if to_regprocedure('public.wfm_is_allowed()') is null then
    raise exception 'sql/allowlist.sql 을 먼저 실행하세요 (wfm_is_allowed() 없음)';
  end if;
end $$;

-- ════════ 구역 A ════════

-- 1) 허용 목록에 역할·멤버 연결 추가 (기존 행은 admin, 이후 새 행의 기본값은 editor)
alter table public.wfm_allowed_users add column if not exists role text not null default 'admin';
alter table public.wfm_allowed_users alter column role set default 'editor';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wfm_allowed_users_role_chk') then
    alter table public.wfm_allowed_users
      add constraint wfm_allowed_users_role_chk check (role in ('admin', 'editor', 'viewer'));
  end if;
end $$;
alter table public.wfm_allowed_users add column if not exists person_id text
  references public.wfm_members(id) on delete set null;

-- 2) 역할 함수. security definer 로 허용 목록을 RLS 밖에서 읽는다(허용 목록 자체의 정책이 이 함수를 쓰므로 재귀 방지)
create or replace function public.wfm_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.wfm_allowed_users
   where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1;
$$;
create or replace function public.wfm_role_rank(r text) returns int
language sql immutable set search_path = public as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'admin' then 3 else 0 end;
$$;
create or replace function public.wfm_has_role(min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.wfm_role_rank(public.wfm_role()) >= greatest(public.wfm_role_rank(min_role), 1);
$$;
revoke all on function public.wfm_role() from public;
revoke all on function public.wfm_has_role(text) from public;
grant execute on function public.wfm_role() to authenticated;
grant execute on function public.wfm_has_role(text) to authenticated;
grant execute on function public.wfm_role_rank(text) to authenticated;

-- 3) 허용 목록: admin 은 전체 관리. 본인 행 읽기(기존)는 유지. 마지막 admin 은 지킨다
drop policy if exists wfm_allowed_users_admin on public.wfm_allowed_users;
create policy wfm_allowed_users_admin on public.wfm_allowed_users
  for all to authenticated using (public.wfm_has_role('admin')) with check (public.wfm_has_role('admin'));

create or replace function public.wfm_allowed_users_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    new.email := lower(btrim(new.email));
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'admin') then
    perform pg_advisory_xact_lock(hashtext('wfm_admin_guard'));   -- 동시에 서로를 강등·삭제해 admin 이 0명이 되는 것 방지
    if old.role = 'admin' and not exists (
         select 1 from public.wfm_allowed_users u where u.role = 'admin' and lower(u.email) <> lower(old.email)) then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists wfm_allowed_users_guard on public.wfm_allowed_users;
create trigger wfm_allowed_users_guard before insert or update or delete on public.wfm_allowed_users
  for each row execute function public.wfm_allowed_users_guard();

-- 3-1) 이메일은 대소문자만 달라도 같은 계정이다(트리거가 소문자로 정규화). 기존 행을 정리한 뒤 유일 인덱스
update public.wfm_allowed_users set email = lower(btrim(email)) where email <> lower(btrim(email));
create unique index if not exists wfm_allowed_users_email_lower_uq on public.wfm_allowed_users (lower(email));

-- 4) 게시물 열람 함수(라이브 DB 에는 있었으나 저장소에 없던 정의 — 드리프트 해소). private_posts 열도 함께 보장
alter table public.wfm_boards add column if not exists private_posts boolean not null default false;
create or replace function public.wfm_post_visible(p_board text, p_created_by uuid) returns boolean
language sql stable set search_path = public as $$
  select public.wfm_is_allowed() and (
    p_created_by = auth.uid()
    or not coalesce((select b.private_posts from public.wfm_boards b where b.id = p_board), false));
$$;

-- 5) 공통코드
create table if not exists public.wfm_code_groups (
  id text primary key,
  name text not null,
  system boolean not null default false,
  sort_order integer not null default 0
);
create table if not exists public.wfm_codes (
  group_id text not null references public.wfm_code_groups(id) on delete restrict,
  code text not null,
  parent_code text,
  name text not null,
  color text check (color is null or color ~* '^#[0-9a-f]{3,8}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  primary key (group_id, code)
);
insert into public.wfm_code_groups (id, name, system, sort_order) values
  ('skill', '스킬', false, 1),
  ('pj_status', '프로젝트 상태', true, 2)
on conflict (id) do nothing;

create or replace function public.wfm_codes_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.wfm_code_groups g where g.id = new.group_id and g.system) then
      raise exception 'system_code' using errcode = 'P0001';   -- 시스템 그룹에는 코드를 추가할 수 없다
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id or new.code <> old.code then
      raise exception 'code_key_immutable' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' and exists (select 1 from public.wfm_code_groups g where g.id = old.group_id and g.system) then
    raise exception 'system_code' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists wfm_codes_guard on public.wfm_codes;
create trigger wfm_codes_guard before insert or update or delete on public.wfm_codes
  for each row execute function public.wfm_codes_guard();

create or replace function public.wfm_code_groups_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.system is distinct from old.system then
    raise exception 'system_flag_immutable' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.id <> old.id then
    raise exception 'code_key_immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists wfm_code_groups_guard on public.wfm_code_groups;
create trigger wfm_code_groups_guard before update on public.wfm_code_groups
  for each row execute function public.wfm_code_groups_guard();

-- 6) 공수 산정 기준표(버전 관리, insert-only)
create table if not exists public.wfm_estimate_basis (
  id text primary key,
  name text not null,
  current_version integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.wfm_estimate_basis_versions (
  basis_id text not null references public.wfm_estimate_basis(id) on delete restrict,
  version integer not null,
  reason text not null check (length(btrim(reason)) > 0),
  content jsonb not null check (jsonb_typeof(content -> 'roles') = 'array' and jsonb_typeof(content -> 'vars') = 'array'),
  saved_at timestamptz not null default now(),
  saved_by_email text not null default '',
  primary key (basis_id, version)
);
create or replace function public.wfm_basis_versions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.saved_by_email := coalesce(auth.jwt() ->> 'email', '');
  end if;
  new.saved_at := now();
  return new;
end $$;
drop trigger if exists wfm_basis_versions_guard on public.wfm_estimate_basis_versions;
create trigger wfm_basis_versions_guard before insert on public.wfm_estimate_basis_versions
  for each row execute function public.wfm_basis_versions_guard();

-- 산정 기록이 어느 기준표 버전으로 만들어졌는지(null = 코드 내장 기준표)
alter table public.wfm_estimate_versions add column if not exists basis_id text;
alter table public.wfm_estimate_versions add column if not exists basis_version integer;

-- 7) 새 테이블 RLS: 읽기는 허용된 모든 계정, 쓰기는 admin. 기준표 버전은 수정·삭제 정책 없음(불변)
alter table public.wfm_code_groups enable row level security;
alter table public.wfm_codes enable row level security;
alter table public.wfm_estimate_basis enable row level security;
alter table public.wfm_estimate_basis_versions enable row level security;

drop policy if exists wfm_code_groups_select on public.wfm_code_groups;
create policy wfm_code_groups_select on public.wfm_code_groups for select to authenticated using (public.wfm_is_allowed());
drop policy if exists wfm_code_groups_write on public.wfm_code_groups;
create policy wfm_code_groups_write on public.wfm_code_groups for all to authenticated
  using (public.wfm_has_role('admin')) with check (public.wfm_has_role('admin'));

drop policy if exists wfm_codes_select on public.wfm_codes;
create policy wfm_codes_select on public.wfm_codes for select to authenticated using (public.wfm_is_allowed());
drop policy if exists wfm_codes_write on public.wfm_codes;
create policy wfm_codes_write on public.wfm_codes for all to authenticated
  using (public.wfm_has_role('admin')) with check (public.wfm_has_role('admin'));

drop policy if exists wfm_estimate_basis_select on public.wfm_estimate_basis;
create policy wfm_estimate_basis_select on public.wfm_estimate_basis for select to authenticated using (public.wfm_is_allowed());
drop policy if exists wfm_estimate_basis_ins on public.wfm_estimate_basis;
create policy wfm_estimate_basis_ins on public.wfm_estimate_basis for insert to authenticated with check (public.wfm_has_role('admin'));
drop policy if exists wfm_estimate_basis_upd on public.wfm_estimate_basis;
create policy wfm_estimate_basis_upd on public.wfm_estimate_basis for update to authenticated
  using (public.wfm_has_role('admin')) with check (public.wfm_has_role('admin'));

drop policy if exists wfm_estimate_basis_versions_select on public.wfm_estimate_basis_versions;
create policy wfm_estimate_basis_versions_select on public.wfm_estimate_basis_versions for select to authenticated using (public.wfm_is_allowed());
drop policy if exists wfm_estimate_basis_versions_ins on public.wfm_estimate_basis_versions;
create policy wfm_estimate_basis_versions_ins on public.wfm_estimate_basis_versions for insert to authenticated with check (public.wfm_has_role('admin'));

grant select, insert, update, delete on public.wfm_code_groups, public.wfm_codes to authenticated;
grant select, insert, update on public.wfm_estimate_basis to authenticated;
grant select, insert on public.wfm_estimate_basis_versions to authenticated;

-- ════════ 구역 B ════════ (기존 테이블 쓰기 권한을 역할 기반으로. A 를 적용하고 admin 계정이 있는지 확인한 뒤 실행)

do $$
declare
  r record;
  pol text;
begin
  if not exists (select 1 from public.wfm_allowed_users where role = 'admin') then
    raise exception 'admin 계정이 없습니다. 구역 B 를 실행하면 모두 쓰기가 막힙니다.';
  end if;
  -- (테이블, 쓰기 최소 역할)
  for r in select * from (values
    ('wfm_members', 'editor'), ('wfm_projects', 'editor'), ('wfm_assignments', 'editor'), ('wfm_allowances', 'editor'),
    ('wfm_sales_people', 'editor'), ('wfm_boards', 'admin'), ('wfm_board_templates', 'admin')
  ) as t(tbl, minrole) loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = r.tbl loop
      execute format('drop policy if exists %I on public.%I', pol, r.tbl);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (public.wfm_is_allowed())', r.tbl || '_select', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.wfm_has_role(%L))', r.tbl || '_ins', r.tbl, r.minrole);
    execute format('create policy %I on public.%I for update to authenticated using (public.wfm_has_role(%L)) with check (public.wfm_has_role(%L))', r.tbl || '_upd', r.tbl, r.minrole, r.minrole);
    execute format('create policy %I on public.%I for delete to authenticated using (public.wfm_has_role(%L))', r.tbl || '_del', r.tbl, r.minrole);
  end loop;
end $$;

-- 게시물·댓글: 읽기는 기존 규칙, 쓰기는 editor 이상
drop policy if exists wfm_posts_allowed on public.wfm_posts;
drop policy if exists wfm_posts_select on public.wfm_posts;
drop policy if exists wfm_posts_ins on public.wfm_posts;
drop policy if exists wfm_posts_upd on public.wfm_posts;
drop policy if exists wfm_posts_del on public.wfm_posts;
create policy wfm_posts_select on public.wfm_posts for select to authenticated using (public.wfm_post_visible(board_id, created_by));
create policy wfm_posts_ins on public.wfm_posts for insert to authenticated
  with check (public.wfm_post_visible(board_id, created_by) and public.wfm_has_role('editor'));
create policy wfm_posts_upd on public.wfm_posts for update to authenticated
  using (public.wfm_post_visible(board_id, created_by) and public.wfm_has_role('editor'))
  with check (public.wfm_post_visible(board_id, created_by) and public.wfm_has_role('editor'));
create policy wfm_posts_del on public.wfm_posts for delete to authenticated
  using (public.wfm_post_visible(board_id, created_by) and public.wfm_has_role('editor'));

drop policy if exists wfm_comments_allowed on public.wfm_comments;
drop policy if exists wfm_comments_select on public.wfm_comments;
drop policy if exists wfm_comments_ins on public.wfm_comments;
drop policy if exists wfm_comments_upd on public.wfm_comments;
drop policy if exists wfm_comments_del on public.wfm_comments;
create policy wfm_comments_select on public.wfm_comments for select to authenticated
  using (exists (select 1 from public.wfm_posts p where p.id = wfm_comments.post_id));
create policy wfm_comments_ins on public.wfm_comments for insert to authenticated
  with check (public.wfm_has_role('editor') and exists (select 1 from public.wfm_posts p where p.id = wfm_comments.post_id));
create policy wfm_comments_upd on public.wfm_comments for update to authenticated
  using (public.wfm_has_role('editor') and exists (select 1 from public.wfm_posts p where p.id = wfm_comments.post_id))
  with check (public.wfm_has_role('editor') and exists (select 1 from public.wfm_posts p where p.id = wfm_comments.post_id));
create policy wfm_comments_del on public.wfm_comments for delete to authenticated
  using (public.wfm_has_role('editor') and exists (select 1 from public.wfm_posts p where p.id = wfm_comments.post_id));

-- 산정 기록: 쓰기 editor, 삭제는 만든 사람(editor 이상) 또는 admin
drop policy if exists wfm_estimates_insert on public.wfm_estimates;
drop policy if exists wfm_estimates_update on public.wfm_estimates;
drop policy if exists wfm_estimates_delete on public.wfm_estimates;
create policy wfm_estimates_insert on public.wfm_estimates for insert to authenticated with check (public.wfm_has_role('editor'));
create policy wfm_estimates_update on public.wfm_estimates for update to authenticated
  using (public.wfm_has_role('editor')) with check (public.wfm_has_role('editor'));
create policy wfm_estimates_delete on public.wfm_estimates for delete to authenticated
  using (public.wfm_has_role('admin') or (public.wfm_has_role('editor') and created_by = auth.uid()));
drop policy if exists wfm_estimate_versions_insert on public.wfm_estimate_versions;
create policy wfm_estimate_versions_insert on public.wfm_estimate_versions for insert to authenticated with check (public.wfm_has_role('editor'));

-- ════════ ROLLBACK (구역 B 만 되돌리기: 모든 허용 계정이 다시 읽기·쓰기 가능) ════════
-- 구역 B 의 정책을 지우고 아래로 복원한다. (구역 A 는 추가 전용이라 그대로 두어도 무해)
--   for t in members projects assignments allowances sales_people boards board_templates:
--     drop policy wfm_<t>_select/_ins/_upd/_del;  create policy wfm_<t>_allowed for all to authenticated
--       using (wfm_is_allowed()) with check (wfm_is_allowed());
--   wfm_posts : create policy wfm_posts_allowed for all using/with check (wfm_post_visible(board_id, created_by));
--   wfm_comments : create policy wfm_comments_allowed for all using/with check (exists (select 1 from wfm_posts p where p.id = wfm_comments.post_id));
--   wfm_estimates : insert/update with check/using wfm_is_allowed(); delete using (wfm_is_allowed() and created_by = auth.uid());
--   wfm_estimate_versions : insert with check (wfm_is_allowed());
