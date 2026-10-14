-- ═══════════════════════════════════════════════════════════
-- WFM 공수 산정 기록 (docs/estimate-spec.md)
-- 선행 조건: sql/allowlist.sql (wfm_is_allowed()), wfm_projects 테이블
-- 여러 번 실행해도 안전합니다(IF NOT EXISTS, 정책은 drop 후 재생성).
-- 되돌리기(데이터가 모두 지워집니다):
--   drop table if exists public.wfm_estimate_versions, public.wfm_estimates, public.wfm_sales_people cascade;
-- ═══════════════════════════════════════════════════════════
do $$ begin
  if to_regprocedure('public.wfm_is_allowed()') is null then
    raise exception 'sql/allowlist.sql 을 먼저 실행하세요 (wfm_is_allowed() 없음)';
  end if;
end $$;

create table if not exists public.wfm_sales_people (
  id text primary key,
  name text not null,
  role text not null default '',     -- 직급(2026-10-14 추가)
  dept text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 이미 만들어진 DB 용(직급 컬럼 추가, 2026-10-14)
alter table public.wfm_sales_people add column if not exists role text not null default '';

create table if not exists public.wfm_estimates (
  id text primary key,
  title text not null default '',
  client text not null default '',
  sales_id text references public.wfm_sales_people(id) on delete restrict,
  project_id text references public.wfm_projects(id) on delete set null,
  estimated_on date not null default current_date,
  participants jsonb not null default '[]'::jsonb,   -- [{memberId?, name, role}]
  memo text not null default '',
  current_version integer not null default 1,
  total_mm numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_by_email text not null default coalesce(auth.jwt() ->> 'email', '')
);

create table if not exists public.wfm_estimate_versions (
  estimate_id text not null references public.wfm_estimates(id) on delete cascade,
  version integer not null,
  reason text not null default '',
  snapshot jsonb not null,                           -- {header, basis(기준표), inputs}
  total_mm numeric not null default 0,
  saved_at timestamptz not null default now(),
  saved_by_email text not null default coalesce(auth.jwt() ->> 'email', ''),
  primary key (estimate_id, version)
);

create index if not exists wfm_estimates_updated_idx on public.wfm_estimates (updated_at desc);
create index if not exists wfm_estimates_project_idx on public.wfm_estimates (project_id);
create index if not exists wfm_estimates_sales_idx on public.wfm_estimates (sales_id);

alter table public.wfm_sales_people      enable row level security;
alter table public.wfm_estimates         enable row level security;
alter table public.wfm_estimate_versions enable row level security;

-- 영업 담당자: 허용 목록 계정 전체 권한
drop policy if exists "wfm_sales_people_allowed" on public.wfm_sales_people;
create policy "wfm_sales_people_allowed" on public.wfm_sales_people
  for all to authenticated using (public.wfm_is_allowed()) with check (public.wfm_is_allowed());

-- 산정 기록: 조회·추가·수정은 허용 목록 계정, 삭제는 만든 사람만
drop policy if exists "wfm_estimates_select" on public.wfm_estimates;
drop policy if exists "wfm_estimates_insert" on public.wfm_estimates;
drop policy if exists "wfm_estimates_update" on public.wfm_estimates;
drop policy if exists "wfm_estimates_delete" on public.wfm_estimates;
create policy "wfm_estimates_select" on public.wfm_estimates for select to authenticated using (public.wfm_is_allowed());
create policy "wfm_estimates_insert" on public.wfm_estimates for insert to authenticated with check (public.wfm_is_allowed());
create policy "wfm_estimates_update" on public.wfm_estimates for update to authenticated using (public.wfm_is_allowed()) with check (public.wfm_is_allowed());
create policy "wfm_estimates_delete" on public.wfm_estimates for delete to authenticated using (public.wfm_is_allowed() and created_by = auth.uid());

-- 버전 이력: 조회·추가만 (수정·삭제 정책 없음 = 이력 보호). 기록 삭제 시 연쇄 삭제는 FK 가 처리.
drop policy if exists "wfm_estimate_versions_select" on public.wfm_estimate_versions;
drop policy if exists "wfm_estimate_versions_insert" on public.wfm_estimate_versions;
create policy "wfm_estimate_versions_select" on public.wfm_estimate_versions for select to authenticated using (public.wfm_is_allowed());
create policy "wfm_estimate_versions_insert" on public.wfm_estimate_versions for insert to authenticated with check (public.wfm_is_allowed());

-- 소유자·작성자 위조 방지: 클라이언트가 보낸 값과 무관하게 서버가 로그인 정보로 강제한다.
-- (RLS 의 delete 정책이 created_by 에 의존하므로, 값을 직접 넣거나 바꿔 소유권을 가로채는 것을 막음)
create or replace function public.wfm_estimates_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_by_email := coalesce(auth.jwt() ->> 'email', '');
    end if;
  else
    new.created_by := old.created_by;
    new.created_by_email := old.created_by_email;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists wfm_estimates_guard_trg on public.wfm_estimates;
create trigger wfm_estimates_guard_trg before insert or update on public.wfm_estimates
  for each row execute function public.wfm_estimates_guard();

create or replace function public.wfm_estimate_versions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.saved_by_email := coalesce(auth.jwt() ->> 'email', '');
  end if;
  new.saved_at := now();
  return new;
end $$;
drop trigger if exists wfm_estimate_versions_guard_trg on public.wfm_estimate_versions;
create trigger wfm_estimate_versions_guard_trg before insert on public.wfm_estimate_versions
  for each row execute function public.wfm_estimate_versions_guard();
