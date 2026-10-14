-- 화면의 style / class / 속성으로 들어가는 값의 형식을 서버에서도 강제한다(저장형 XSS 방어 심층화, 2026-10-14 적용).
-- 클라이언트는 safeColor()/safeStatus()/esc() 로 이미 막지만, 허용된 계정이 API 로 직접 쓰는 경우를 대비한다.
-- 기존 데이터가 모두 형식에 맞는지 먼저 확인한 뒤 적용했다(멤버 8, 프로젝트 14 전부 통과).
alter table public.wfm_members
  add constraint wfm_members_color_hex check (color ~* '^#[0-9a-f]{3,8}$'),
  add constraint wfm_members_id_fmt    check (id ~ '^[A-Za-z0-9_-]+$');
alter table public.wfm_projects
  add constraint wfm_projects_color_hex check (color ~* '^#[0-9a-f]{3,8}$'),
  add constraint wfm_projects_status_val check (status in ('active','done','planned')),
  add constraint wfm_projects_id_fmt     check (id ~ '^[A-Za-z0-9_-]+$');
-- 되돌리기: alter table ... drop constraint <이름>;
