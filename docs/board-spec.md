# 게시판 기능 명세 (구현 계약서)

> 여러 에이전트가 병렬로 구현하기 위한 공통 계약. 데이터 형태·함수 이름은 이 문서를 기준으로 맞춘다.

## 결정 사항
- 메뉴: 투입 현황 / 가용인력 / **게시판** / 공수 산정(WiseNTM). `state.viewMode === 'board'`.
- 구조: **템플릿**(필드 정의) + **게시판**(허용 템플릿 목록, 댓글 사용 여부) + **게시물**(게시판·템플릿·버전·작성자·입력값) + **댓글**.
- 템플릿은 **버전 관리**: 이미 게시물이 쓰는 버전을 수정하면 새 버전 행을 만든다. 게시물은 `templateId + templateVersion` 으로 자기 양식을 찾으므로 예전 글이 깨지지 않는다.
- 작성자: 기존 멤버 중 선택(`authorId` = member id). 마지막 선택을 localStorage `wfm_lastAuthor` 에 기억.
- 기능: 검색(제목 + 텍스트 값), 댓글(게시판 설정으로 켬), 숫자 필드 합계(`sum:true`, 단위 표시 예: M/D).
- M/D 는 M/M 으로 환산하지 않는다(투입 현황과 별개). 면담 이력은 공용 계정이라 모두에게 보임(현 단계 제한 없음).
- 첨부파일·공지 고정은 이번 범위 아님.
- 게시판 데이터는 **게시판 화면에 처음 들어갈 때** 따로 불러온다(`loadBoards`). 테이블이 없으면(SQL 미실행) 안내 화면.

## DB (sql/boards.sql — 사용자가 Supabase SQL Editor 에서 직접 실행)
```
wfm_board_templates(id text, version int, name text, fields jsonb, active bool, created_at timestamptz, PK(id, version))
wfm_boards(id text PK, name text, template_ids jsonb, allow_comments bool, sort_order int, active bool, created_at)
wfm_posts(id text PK, board_id text → wfm_boards ON DELETE RESTRICT, (template_id, template_version) → wfm_board_templates ON DELETE RESTRICT, title text, author_id text, data jsonb, created_at, updated_at)
wfm_comments(id text PK, post_id text → wfm_posts ON DELETE CASCADE, author_id text, body text, created_at)
```
- 값 컬럼 이름은 `data` (`values` 는 SQL 예약어라 쓰지 않음).
- RLS: 인증 사용자(authenticated) 전체 권한 정책.
- 기본 템플릿·게시판 시드 포함(아래 "기본 데이터"). 각 테이블이 **비어 있을 때만** 넣는다(재실행해도 사용자가 지운 기본 데이터를 되살리지 않음). FK 는 `pg_constraint` 확인 후 추가(재실행 안전).
- 글이 있는 게시판/템플릿 버전은 서버가 삭제를 거부(restrict) — 다른 클라이언트(공용 계정)의 글도 보호.

## JS 데이터 (data.js)
```js
const BOARD = { templates: [], boards: [], posts: [], comments: [] };
const BLOAD = { status: 'idle' | 'loading' | 'ok' | 'error' | 'missing', errors: [] };  // missing = 테이블 없음
```
- Template: `{ id, version, name, fields: Field[], active, createdAt }` — 같은 id 의 여러 버전이 모두 들어 있음.
- Field: `{ key, label, type, required?, options?, unit?, sum?, list? }`
  - `type`: `'text' | 'longtext' | 'number' | 'date' | 'member' | 'project' | 'select' | 'checkbox'`
  - `options`: select 의 선택지 배열(문자열)
  - `unit`: number 단위 문자열(예 `'M/D'`), `sum`: true 면 합계 대상, `list`: true 면 목록 열로 표시
  - `key` 는 템플릿 안에서 고유한 영문 식별자, 한 번 정하면 버전이 바뀌어도 유지(통계 연속성)
- Board: `{ id, name, templateIds: string[], allowComments, sortOrder, active, createdAt }`
- Post: `{ id, boardId, templateId, templateVersion, title, authorId, data: {key: value}, createdAt, updatedAt }` (날짜는 ISO 문자열)
- Comment: `{ id, postId, authorId, body, createdAt }`

### 헬퍼 (data.js, 전역)
- `latestTemplate(id)` → 해당 id 의 최고 버전 Template (없으면 null)
- `templateOf(post)` → 게시물이 쓰는 정확한 버전 Template (없으면 latest 로 대체)
- `boardPosts(boardId)` → 해당 게시판 글, 최신순
- `postComments(postId)` → 오래된 순
- `templateInUse(id, version)` → 그 버전을 쓰는 글이 있으면 true

### BoardAPI (data.js) — 모든 쓰기는 `_track(label, key, thunk)` 경유, DATA 와 같은 낙관적 방식
- `loadBoards()` → Promise<bool>. 4개 테이블 조회. 테이블 없음(에러 코드 `42P01` 또는 메시지에 'does not exist'/'schema cache')이면 `BLOAD.status='missing'`.
- `addPost({boardId, templateId, templateVersion, title, authorId, data})` → post (id 생성, createdAt/updatedAt 설정)
- `updatePost(id, {title, authorId, data})` — templateId/version 은 유지
- `deletePost(id)` — 로컬 댓글도 제거, 서버는 FK cascade
- `addComment({postId, authorId, body})` → comment
- `deleteComment(id)`
- `saveTemplate({id?, name, fields, active})` → **Promise<template>** (async). id 없으면 새로 만듦(version 1). 최신 버전이 로컬에서 `templateInUse` 이거나 **서버에 그 버전을 쓰는 글이 있거나 서버 확인이 실패하면** version+1 새 행, 아니면 같은 버전 덮어씀. 반드시 `await`.
- `setTemplateActive(id, active)` — 모든 버전에 반영
- `deleteTemplate(id)` → **Promise<true|'in-use'|'check-failed'>** (async). 로컬 또는 서버(다른 클라이언트 포함)에 어떤 버전이든 글이 있으면 `'in-use'`, 서버 확인이 실패하면 `'check-failed'`(로컬 상태 변경 없음). `true` 면 로컬을 바꾸고 삭제를 큐에 넣음, 게시판의 templateIds 에서도 제거
- `addBoard({name, templateIds, allowComments})` → board / `updateBoard(id, patch)` / `deleteBoard(id)` → **Promise<true|'in-use'|'check-failed'>** (async, deleteTemplate 와 같은 서버 글 확인; 글이 있으면 `'in-use'`, 확인 실패면 `'check-failed'`) / `reorderBoards(ids)`
- id 생성: 접두어 + `Date.now().toString(36)` + 랜덤 4자 (`'p_'`→ 게시물은 `'post_'`, 댓글 `'cmt_'`, 템플릿 `'tpl_'`, 게시판 `'brd_'`)
- 키: `post:<id>`, `cmt:<id>`, `tpl:<id>:<version>`, `brd:<id>`, `reorder:boards`. 삭제는 `waitAll`.
- FK 순서: 게시물 추가/수정은 `_track(..., deps)` 로 `tpl:<templateId>:<templateVersion>`, `brd:<boardId>` 체인(등록 시점에 진행 중인 것)이 끝난 뒤 업서트한다. `SaveState._run/_track` 의 5번째 인자 `deps`(키 배열, 선택) — 기존 호출자는 영향 없음.
- `SaveState.revert()`: 게시판이 로드된 상태(`BLOAD.status` 가 idle/missing 이 아님)면 함께 다시 읽는다. 로드 진행 중이면 끝난 뒤 다시 읽는다. idle/missing 은 건너뛰며 실패로 보지 않는다.

## 화면 — board.js (게시판 보기)
- 헤더 메뉴 버튼 `#btnBoard`(가용인력과 공수 산정 사이). `render()` 에서 `renderBoardView()` 호출, `kpi-wrap` 비움, 필터 바 숨김.
- 처음 진입 시 `BLOAD.status==='idle'` 이면 `loadBoards()` 후 다시 그림. `loading`/`error`/`missing` 은 `#grid-container` 에 안내(missing 은 "sql/boards.sql 을 Supabase 에서 실행하세요").
- 상단: 게시판 탭(활성 게시판, sortOrder 순) + 검색창 + [글쓰기].
- 합계 줄: 현재 게시판 글(검색 결과 기준)에 `sum` 필드가 있으면 필드별 총합 + 묶음 보기(월별 / 프로젝트별 / 멤버별 — 템플릿에 date/project/member 필드가 있을 때만). 월 기준은 첫 번째 date 필드, 없으면 createdAt.
- 목록: 제목 · (최신 템플릿의 `list` 필드 열) · 작성자 · 작성일 · 댓글 수. 게시판에 템플릿이 여러 개면 "양식" 열 표시. 행 클릭/Enter → 상세.
- 상세: 패널 또는 모달. 필드 값을 해당 버전 양식대로 표시(member/project 는 이름, longtext 줄바꿈 보존, 모든 출력 `esc()`), [수정] [삭제(confirmable)], 댓글 목록 + 작성(작성자 선택 + 내용).
- 글쓰기/수정 폼: `Modal` + `Modal.track` 로 닫기 경고. 템플릿이 여러 개면 먼저 양식 선택. 필드 종류별 입력: text/longtext/number(step 0.5, 0 이상)/date/member(select)/project(`mountProjectPicker`)/select/checkbox. required 검증, number 는 숫자 검증.
- CSS 접두어 `.board-*`. 다크/라이트 토큰 사용, 760px 이하에서 표가 가로 스크롤.

## 화면 — board-admin.js (관리)
- 관리 드로어에 탭 **게시판**, **템플릿** 추가(기존 멤버/프로젝트 탭과 같은 패턴). 드로어 열 때 `BLOAD.status==='idle'` 이면 `loadBoards()`.
- 템플릿 탭: 목록(이름, 최신 버전, 필드 수, 사용 글 수, 활성 토글) + [템플릿 추가](맨 위 고정, `.mgmt-add-btn.is-top`). 편집 모달: 이름 + 필드 목록(추가/삭제/위아래 이동, label, key(새 필드는 label 에서 자동 생성·수정 가능, 저장된 필드는 고정), type, required, list, select 의 options(쉼표 구분), number 의 unit/sum). 저장 시 "사용 중인 버전이라 새 버전(vN)으로 저장됩니다" 안내(`saveTemplate` 가 async 이므로 반환된 template.version 으로 안내). 삭제는 글이 없을 때만(`await deleteTemplate` 가 `true` 가 아니면 사유별(`'in-use'`/`'check-failed'`) 거부 안내).
- 게시판 탭: 목록(이름, 템플릿들, 댓글, 글 수, 활성) + [게시판 추가]. 편집 모달: 이름, 허용 템플릿(체크박스, 최소 1개), 댓글 사용. 끌어서 순서 변경(`_initDragReorder` 재사용 가능하면). 삭제는 글이 없을 때만.
- CSS 접두어 `.badm-*`.

## 기본 데이터 (SQL 시드)
- 템플릿 `tpl_free` "자유글": body(longtext, 필수)
- 템플릿 `tpl_maint` "유지보수 지원": project(project, 필수, list), member(member 담당, 필수, list), date(date 지원일, 필수, list), md(number 공수, unit M/D, sum, 필수, list), kind(select 구분: 장애/문의/변경/점검/기타, list), body(longtext 내용)
- 템플릿 `tpl_iv_regular` "정기 면담": target(member 대상, 필수, list), date(date 면담일, 필수, list), q1(longtext "최근 업무 만족도와 이유"), q2(longtext "어려운 점·필요한 지원"), q3(longtext "향후 희망 업무·성장 목표"), note(longtext 면담자 메모)
- 템플릿 `tpl_iv_probation` "수습 평가 면담": target(member, 필수, list), date(date, 필수, list), q1(longtext "업무 적응 정도"), q2(longtext "강점"), q3(longtext "보완할 점"), result(select 결과: 정규 전환/연장/보류, list)
- 게시판 `brd_free` 자유게시판 [tpl_free] 댓글 O / `brd_maint` 유지보수 지원 이력 [tpl_maint] 댓글 O / `brd_iv` 면담 이력 [tpl_iv_regular, tpl_iv_probation] 댓글 X
