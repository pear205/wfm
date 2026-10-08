-- ═══════════════════════════════════════════════════════════
-- WFM 게시판 테이블 (docs/board-spec.md)
-- 사용법: Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 한 번 실행하세요.
-- 여러 번 실행해도 안전합니다(이미 있는 테이블·정책·제약은 건드리지 않음).
-- 기본 템플릿·게시판은 해당 테이블이 비어 있을 때만 넣습니다(사용자가 지운 기본 데이터를 되살리지 않음).
-- 게시물은 게시판·템플릿(버전)을 FK(on delete restrict)로 참조합니다: 글이 있는 게시판/템플릿은 서버가 삭제를 거부합니다.
-- FK 는 NOT VALID 로 추가됩니다(기존 고아 행이 있어도 스크립트가 중단되지 않음; 새/수정 행에는 즉시 적용).
-- 선택: 고아 글을 조회·정리한 뒤 아래로 제약을 검증(활성화)하세요.
--   select p.id, p.board_id, p.template_id, p.template_version from wfm_posts p
--     where not exists (select 1 from wfm_boards b where b.id = p.board_id)
--        or not exists (select 1 from wfm_board_templates t where t.id = p.template_id and t.version = p.template_version);
--   alter table wfm_posts validate constraint wfm_posts_board_id_fkey;
--   alter table wfm_posts validate constraint wfm_posts_template_fkey;
-- ═══════════════════════════════════════════════════════════

-- 템플릿 (같은 id 의 여러 버전이 각각 한 행)
create table if not exists wfm_board_templates (
  id          text        not null,
  version     int         not null default 1,
  name        text        not null,
  fields      jsonb       not null default '[]'::jsonb,
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  primary key (id, version)
);

-- 게시판
create table if not exists wfm_boards (
  id              text        primary key,
  name            text        not null,
  template_ids    jsonb       not null default '[]'::jsonb,
  allow_comments  boolean     not null default false,
  sort_order      int         not null default 0,
  active          boolean     not null default true,
  created_at      timestamptz not null default now()
);

-- 게시물 (data: 템플릿 필드 key → 값)
create table if not exists wfm_posts (
  id                text        primary key,
  board_id          text        not null,
  template_id       text        not null,
  template_version  int         not null default 1,
  title             text        not null default '',
  author_id         text        not null default '',
  data              jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 댓글 (게시물 삭제 시 함께 삭제)
create table if not exists wfm_comments (
  id          text        primary key,
  post_id     text        not null references wfm_posts(id) on delete cascade,
  author_id   text        not null default '',
  body        text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists wfm_posts_board_id_idx    on wfm_posts(board_id);
create index if not exists wfm_comments_post_id_idx  on wfm_comments(post_id);

-- 게시물 → 게시판 / 템플릿(버전) 참조 무결성 (idempotent)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wfm_posts_board_id_fkey' and conrelid = 'wfm_posts'::regclass) then
    alter table wfm_posts add constraint wfm_posts_board_id_fkey
      foreign key (board_id) references wfm_boards(id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wfm_posts_template_fkey' and conrelid = 'wfm_posts'::regclass) then
    alter table wfm_posts add constraint wfm_posts_template_fkey
      foreign key (template_id, template_version) references wfm_board_templates(id, version) on delete restrict not valid;
  end if;
end
$$;

-- RLS: 로그인한(authenticated) 사용자에게 전체 권한
alter table wfm_board_templates enable row level security;
alter table wfm_boards          enable row level security;
alter table wfm_posts           enable row level security;
alter table wfm_comments        enable row level security;

drop policy if exists "wfm_board_templates_auth_all" on wfm_board_templates;
create policy "wfm_board_templates_auth_all" on wfm_board_templates
  for all to authenticated using (true) with check (true);

drop policy if exists "wfm_boards_auth_all" on wfm_boards;
create policy "wfm_boards_auth_all" on wfm_boards
  for all to authenticated using (true) with check (true);

drop policy if exists "wfm_posts_auth_all" on wfm_posts;
create policy "wfm_posts_auth_all" on wfm_posts
  for all to authenticated using (true) with check (true);

drop policy if exists "wfm_comments_auth_all" on wfm_comments;
create policy "wfm_comments_auth_all" on wfm_comments
  for all to authenticated using (true) with check (true);

-- ─── 기본 템플릿 (테이블이 비어 있을 때만) ───
do $seed$
begin
if not exists (select 1 from wfm_board_templates) then
insert into wfm_board_templates (id, version, name, fields, active) values
('tpl_free', 1, '자유글', '[
  {"key":"body","label":"내용","type":"longtext","required":true}
]'::jsonb, true),

('tpl_maint', 1, '유지보수 지원', '[
  {"key":"project","label":"프로젝트","type":"project","required":true,"list":true},
  {"key":"member","label":"담당","type":"member","required":true,"list":true},
  {"key":"date","label":"지원일","type":"date","required":true,"list":true},
  {"key":"md","label":"공수","type":"number","required":true,"unit":"M/D","sum":true,"list":true},
  {"key":"kind","label":"구분","type":"select","options":["장애","문의","변경","점검","기타"],"list":true},
  {"key":"body","label":"내용","type":"longtext"}
]'::jsonb, true),

('tpl_iv_regular', 1, '정기 면담', '[
  {"key":"target","label":"대상","type":"member","required":true,"list":true},
  {"key":"date","label":"면담일","type":"date","required":true,"list":true},
  {"key":"q1","label":"최근 업무 만족도와 이유","type":"longtext"},
  {"key":"q2","label":"어려운 점·필요한 지원","type":"longtext"},
  {"key":"q3","label":"향후 희망 업무·성장 목표","type":"longtext"},
  {"key":"note","label":"면담자 메모","type":"longtext"}
]'::jsonb, true),

('tpl_iv_probation', 1, '수습 평가 면담', '[
  {"key":"target","label":"대상","type":"member","required":true,"list":true},
  {"key":"date","label":"면담일","type":"date","required":true,"list":true},
  {"key":"q1","label":"업무 적응 정도","type":"longtext"},
  {"key":"q2","label":"강점","type":"longtext"},
  {"key":"q3","label":"보완할 점","type":"longtext"},
  {"key":"result","label":"결과","type":"select","options":["정규 전환","연장","보류"],"list":true}
]'::jsonb, true);
end if;
end
$seed$;

-- ─── 기본 게시판 (테이블이 비어 있을 때만) ───
do $seed$
begin
if not exists (select 1 from wfm_boards) then
insert into wfm_boards (id, name, template_ids, allow_comments, sort_order, active) values
('brd_free',  '자유게시판',         '["tpl_free"]'::jsonb,                          true,  0, true),
('brd_maint', '유지보수 지원 이력', '["tpl_maint"]'::jsonb,                         true,  1, true),
('brd_iv',    '면담 이력',          '["tpl_iv_regular","tpl_iv_probation"]'::jsonb, false, 2, true);
end if;
end
$seed$;
