-- ═══════════════════════════════════════════════════════════
-- WFM 접근 허용 목록 (2026-10-09 common 프로젝트에 적용 완료 — 기록용)
-- 로그인(비밀번호·구글)만으로는 데이터에 접근할 수 없고, wfm_allowed_users 에 등록된 이메일만 허용.
-- 팀원 추가: insert into public.wfm_allowed_users (email, note) values ('someone@gsneotek.com', '메모');
-- pear205@gmail.com 은 구글 로그인 계정(2026-10-09 확인)이라 유지.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.wfm_allowed_users (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.wfm_allowed_users enable row level security;
drop policy if exists "wfm_allowed_users_self" on public.wfm_allowed_users;
create policy "wfm_allowed_users_self" on public.wfm_allowed_users
  for select to authenticated using (lower(email) = lower(auth.jwt()->>'email'));

-- 호출자 권한(invoker)으로 실행: 자기 행만 보이는 위 정책으로 판정
create or replace function public.wfm_is_allowed() returns boolean
  language sql stable security invoker set search_path = public as $$
  select exists (select 1 from public.wfm_allowed_users
                 where lower(email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
revoke all on function public.wfm_is_allowed() from public, anon;
grant execute on function public.wfm_is_allowed() to authenticated;

insert into public.wfm_allowed_users (email, note) values
  ('pear205@gsneotek.com', '구글 로그인'),
  ('pear205@gmail.com', '전환 기간용 비밀번호 계정 — 전환 완료 후 삭제')
on conflict (email) do nothing;

do $$
declare t text;
begin
  foreach t in array array['wfm_members','wfm_projects','wfm_assignments','wfm_allowances',
                           'wfm_board_templates','wfm_boards','wfm_posts','wfm_comments'] loop
    execute format('drop policy if exists "Authenticated only" on public.%I', t);
    execute format('drop policy if exists "%s_auth_all" on public.%I', t, t);
    execute format('drop policy if exists "%s_allowed" on public.%I', t, t);
    execute format('create policy "%s_allowed" on public.%I for all to authenticated using (public.wfm_is_allowed()) with check (public.wfm_is_allowed())', t, t);
  end loop;
end $$;
