# 관리 센터 명세 (구현 계약서) — 사용자·권한 / 공수 산정 기준표 / 공통코드

> 시안: 관리 화면 시안 3종(공통코드·기준표·사용자·권한)을 고도화한 최종 설계. 바꾸려면 먼저 이 문서를 고친다.
> 담당 파일: `sql/admin.sql`(DB), `public/data.js`(데이터 층), `public/admin-center.js`(화면), `public/wisenm.js`(기준표 소비), `public/app.js`(로그인 역할·연결).

## 설계 원칙 (확장을 위한 규칙)
1. **내장 기본값이 항상 폴백**: DB 테이블이 없거나 비어 있어도 앱은 지금과 똑같이 동작한다(`WISENM_ROLES/VARS`, `PRESET_SKILLS`, `STATUS_KR`). 관리 센터에서 "내장 기본값을 DB로 가져오기"를 눌러야 DB 값이 생기고, 그 뒤부터 DB 값이 우선한다.
2. **코드 키는 불변**: 저장된 데이터가 참조하는 키(스킬 분류 `lang`, 프로젝트 상태 `active`, 기준표 역할 id)는 바꾸거나 지울 수 없다. 이름·색·순서·사용 여부만 바뀐다(지우는 대신 "사용 끄기").
3. **계산에 영향 주는 값은 버전 관리**(기준표): 게시마다 새 버전(불변·insert-only), 변경 사유 필수, 동시 게시는 `current_version` 조건부 갱신으로 충돌 감지. 장식용 값(코드)은 단순 upsert.
4. **권한은 순위 하나**: `viewer(1) < editor(2) < admin(3)`. 정책은 역할 이름이 아니라 `wfm_has_role('editor')` 같은 **최소 역할**로 쓴다. 역할을 늘릴 때는 `wfm_role_rank()` 한 곳만 고친다.
5. **서버가 최종 방어**: 화면에서 버튼을 숨겨도 RLS 가 막는다. 마지막 관리자는 트리거가 지킨다.
6. **새로 만든 사람 목록은 만들지 않는다**: 사용자(로그인 계정) ↔ 멤버(투입 인력)는 `wfm_allowed_users.person_id` 로 **선택적으로 연결**만 한다. 멤버 종류(`kind`)·영업 담당 통합은 다음 단계(이 문서 끝 "확장 지점").

## 역할 (최소 역할 기준)
| 역할 | 순위 | 할 수 있는 일 |
|---|---|---|
| viewer | 1 | 읽기만(화면에서 수정 버튼이 숨겨짐, 쓰기 시도는 서버가 거부) |
| editor | 2 | 투입·현장수당·프로젝트·멤버·산정 기록(영업 담당 포함)·게시물·댓글 쓰기 |
| admin | 3 | editor + 사용자·역할 관리, 기준표 게시, 공통코드 편집, 게시판/템플릿 구조 편집, 남의 산정 기록 삭제 |

## DB (`sql/admin.sql`)
**함수** (`security definer`, `search_path=public`, 정책 재귀를 피하려고 허용 목록을 RLS 밖에서 읽는다)
- `wfm_role() → text` : 로그인 이메일의 `wfm_allowed_users.role`, 없으면 null.
- `wfm_role_rank(r text) → int` : viewer 1, editor 2, admin 3, 그 외/null 0.
- `wfm_has_role(min_role text) → boolean` : `wfm_role_rank(wfm_role()) >= wfm_role_rank(min_role)`.

**`wfm_allowed_users`** 추가 열: `role text not null default 'editor' check (role in ('admin','editor','viewer'))`, `person_id text null references wfm_members(id) on delete set null`. 기존 계정은 `admin`. 정책: 본인 행 select(기존) + admin 전체(select·insert·update·delete). 트리거: 마지막 admin 을 삭제하거나 강등하면 `last_admin` 예외.

**쓰기 권한 변경** (읽기 정책은 그대로 `wfm_is_allowed()`)
| 테이블 | 쓰기 최소 역할 |
|---|---|
| wfm_members, wfm_projects, wfm_assignments, wfm_allowances | editor |
| wfm_sales_people, wfm_estimates, wfm_estimate_versions | editor (estimates 삭제: 만든 사람(editor 이상) 또는 admin) |
| wfm_posts, wfm_comments | editor (posts 읽기는 기존 `wfm_post_visible`) |
| wfm_boards, wfm_board_templates | admin |
| wfm_allowed_users, wfm_code_groups, wfm_codes, wfm_estimate_basis, wfm_estimate_basis_versions | admin (읽기: 허용된 모든 계정) |

**새 테이블**
- `wfm_code_groups(id text pk, name text, system boolean default false, sort_order int default 0)`
- `wfm_codes(group_id text fk→groups on delete restrict, code text, parent_code text null, name text, color text null check hex, sort_order int default 0, active boolean default true, meta jsonb default '{}', pk(group_id, code))` — `code`·`group_id` 변경 금지(트리거). 삭제는 `system` 그룹이면 금지.
- `wfm_estimate_basis(id text pk, name text, current_version int default 0, created_at)`
- `wfm_estimate_basis_versions(basis_id fk→basis restrict, version int, reason text not null, content jsonb not null, saved_at, saved_by_email, pk(basis_id, version))` — insert-only(수정·삭제 정책 없음), 서버가 `saved_by_email`·`saved_at` 을 채움.
- `wfm_estimate_versions` 추가 열: `basis_id text null`, `basis_version int null` (null = 코드 내장 기준표).

## JS 데이터 (data.js, 전역)
```js
CURRENT_USER = { id, email, role: 'admin'|'editor'|'viewer'|'' , personId }
ROLE_RANK = { viewer: 1, editor: 2, admin: 3 }
hasRole(min) → boolean   // CURRENT_USER.role 이 min 이상인가 (role 이 빈 값이면 false)
canWrite() → hasRole('editor');  isAdmin() → hasRole('admin')
```
- **viewer 가드**: `SaveState._run`(= `_track`) 맨 앞에서 `!canWrite()` 이면 thunk 를 실행하지 않고 토스트 "조회 전용 계정입니다. 변경은 저장되지 않습니다."를 띄우고 `loadData()` 로 되돌린다(낙관적 변경 복구). role 이 빈 값(로드 전·구 DB)이면 막지 않는다.
- `EstimateAPI.canDelete(est)`: `isAdmin() || (est.createdBy && est.createdBy === CURRENT_USER.id && canWrite())`.

### 사용자 (`UserAPI`, admin 전용, 낙관적 갱신 없이 서버 결과를 기다린다)
`UserAPI.list() → Promise<AllowedUser[]>` `{ email, role, personId, note, createdAt }` (이메일 오름차순)
`UserAPI.add({email, role, personId?, note?}) → Promise<true|{code:'invalid'|'exists'|'error', message}>` — 이메일 형식·소문자 정규화.
`UserAPI.update(email, {role?, personId?, note?}) → Promise<true|{code:'last-admin'|'error', message}>`
`UserAPI.remove(email) → Promise<true|{code:'last-admin'|'self'|'error', message}>` — 본인 계정은 삭제 불가('self').

### 공통코드 (`CODES`, `CodeAPI`)
```js
CODES = { status: 'idle'|'loading'|'ok'|'missing'|'error', groups: [], codes: [] }   // 읽기: 허용된 모든 계정
CodeAPI.load() → Promise<boolean>      // 중복 호출은 같은 promise. 실패해도 앱은 내장 기본값으로 계속
CodeAPI.save(group, rows) → Promise<true|{code,message}>   // admin. rows = 그 그룹의 전체 행(upsert) — 키 변경·삭제 불가 규칙은 UI·DB 모두 강제
CodeAPI.importBuiltin() → Promise<true|{code,message}>      // 내장 기본값(PRESET_SKILLS, STATUS_KR)을 DB 로 복사(이미 있으면 건너뜀)
// 소비자용 게터 — DB 값이 있으면 그것, 없으면 내장 기본값. 항상 같은 모양을 돌려준다
skillPresets() → { [catKey]: string[] }      // 사용 중인 항목만, sort_order 순
skillCategories() → [{ key, label, color }]  // 사용 중인 분류, sort_order 순. 내장은 lang/cloud/ai/sol/etc
statusLabel(key) → string                     // 'active' → '진행중' (없으면 key 그대로)
```
- 코드 그룹 id: `skill`(분류=parent_code null, 항목=parent_code 가 분류 코드), `pj_status`(system, 이름만 편집). 항목(스킬 이름)은 멤버에 **이름 문자열로 저장**되므로 항목 이름을 바꿔도 기존 멤버 스킬은 바뀌지 않는다(프리셋 제안 목록일 뿐). 분류 키는 멤버 스킬이 참조(`c`)하므로 불변.
- 새 분류의 칩 색은 `style` 로 직접 준다(내장 5개는 기존 CSS 클래스 `.sk-tag.lang…` 유지).

### 기준표 (`BASIS`, `BasisAPI`)
```js
BASIS = { status: 'idle'|'loading'|'ok'|'missing'|'error', basis: null | {id, name, currentVersion}, versions: [] /* 최신순 BasisVersion */ }
BasisVersion = { basisId, version, reason, content, savedAt, savedByEmail }
content = {
  meta: { title, subtitle, assumptions: [string] },          // 하단 "기준 가정" 줄들
  categories: [{ name, color }],                              // role.cat 이 name 을 참조
  roles: [{ id, cat, name, base, scale: 'linear'|'dev'|'fixed', note, active }],
  vars:  [{ id, name, unit, placeholder, note, scale?, active, inTotal }],   // id 는 db/branch/maint/si 4개 고정(이번 단계). inTotal 은 읽기 전용(예약)
  siPresets: [{ id, name, mm }]                               // SI 기본 항목
}
BasisAPI.load() → Promise<boolean>
BasisAPI.current() → { id: 'wisentm'|null, version: number|0, content, source: 'db'|'builtin' }   // 게시된 최신 버전, 없으면 내장(version 0)
BasisAPI.builtinContent() → content        // WISENM_ROLES/VARS/기본 SI 에서 만든 내장 기준표(깊은 복사)
BasisAPI.validate(content, prevContent?) → string[]   // 오류 목록(빈 배열이면 통과): id 중복·빈 이름·base 0~24·scale 값·참조 분류 존재·**이전 게시본의 역할 id 를 지우거나 바꾸지 않았는지**
BasisAPI.publish({ content, reason, baseVersion }) → Promise<{ok:true, version}|{ok:false, code:'conflict'|'invalid'|'forbidden'|'error', message, errors?}>
```
- 게시: 사유 필수(빈 값 `invalid`). `basis` 행이 없으면 만든다(`id='wisentm'`, 이름 "WiseN TM 공수 산정 기준표"). 버전 행 insert → `current_version` 조건부 update(0행이면 `conflict`, 같은 내용이면 재시도로 보고 성공 — `EstimateAPI` 와 같은 규칙).
- **소비 규칙**: 새 산정을 만들 때(`_wnDefaultBasis`)만 `BasisAPI.current().content` 를 쓴다. `active:false` 역할은 새 산정의 `basis.roles` 에서 뺀다. 이미 저장된 기록·열려 있는 기록은 자기 스냅샷 기준을 유지한다.
- 산정 저장 시 `snapshot.basisRef = { id, version }`(내장이면 `{id:null, version:0}`) 를 넣고, `EstimateAPI.save` 가 이를 `wfm_estimate_versions.basis_id/basis_version` 에 기록한다(`_rowToEstimateVersion` 도 읽는다).
- `wnCompute`·정규화 함수의 **계산 결과는 바뀌지 않는다**(DB 기준표가 내장과 같은 값이면 3,027 케이스 동등). 기준표의 `meta.assumptions` 는 화면 하단 설명을 대체한다(내장 문구는 실제 규칙에 맞게 정정: "기간 비례: PM·PL·사업관리, 나머지는 기준 + 추가월×0.5").

## 화면 (`public/admin-center.js`)
- 진입: 관리 드로어에 탭 `data-tab="settings"` (이름 "설정", **admin 에게만 보임**) → `renderAdminDrawer(body)` 가 3개 카드(사용자·권한 / 공수 산정 기준표 / 공통코드)와 [관리 센터 열기]를 그린다. 전역 `openAdminCenter(tab?)` 로 직접 열 수도 있다.
- 관리 센터 = 큰 모달 `#acModal`(`Modal.open`, 폭 최대 1180px, 안에서 스크롤). 탭 `codes | basis | users`. admin 이 아니면 `users` 탭은 숨기고 나머지는 읽기 전용(입력 비활성). 시안(`관리 화면 시안`)과 같은 모양: 공통코드=3단(대분류/중분류/항목+상세), 기준표=어두운 상단 바+표+우측 버전 이력+게시 영역(사유 필수), 사용자=역할 카드+표.
- **공통코드 3단**: 대분류=코드 그룹 목록(`skill`, `pj_status`), 중분류=그룹의 최상위 코드(분류), 항목=`parent_code` 가 그 분류인 코드. `system` 그룹은 🔒, 항목 추가·삭제 불가. 편집은 메모리에서 하다가 [저장]에서 `CodeAPI.save`. DB 값이 없으면 상단에 "내장 기본값을 사용 중입니다" 안내와 [DB 로 가져와서 관리 시작] 버튼.
- **기준표**: DB 기준표가 없으면 내장 값을 읽기 전용으로 보여주고 [DB 로 가져와서 관리 시작](= `publish` v1, 사유 "내장 기본값에서 가져옴"). 편집 후 변경 사유를 입력해 [새 버전으로 게시]. 변경이 없으면 게시 버튼 비활성. 역할 추가·순서 변경·사용 끄기 가능, **게시된 역할 id 는 삭제 불가**(사용 끄기만). 버전 이력 클릭 → 그 버전 내용을 읽기 전용으로 보기 + [이 버전으로 복원](편집본에 불러오기).
- **사용자**: `UserAPI` 표(이메일, 연결된 멤버 선택, 역할 select, 메모, 접근 해제). 마지막 admin·본인은 강등/해제 불가를 화면에서도 막고 서버 오류를 한국어 안내로 바꾼다. 면담 열람 범위는 **이번에 구현하지 않음**(결정 대기: 현재는 허용된 모든 계정이 열람) — 안내 카드로 현재 상태만 설명한다.
- 접근성: 모달 포커스·Esc(`Modal`), 탭은 `role=tablist`, 모든 입력에 라벨, 저장 결과는 `aria-live`. 모든 동적 값은 `esc()`, 색은 `safeColor()`.
- 미저장 보호: 편집 중 닫기/탭 전환은 `Modal.track`/`requestClose` + 탭 전환 확인 바.

## 소비자 변경 (app.js / wisenm.js)
- `app.js`: `_checkAuth` 가 로그인 직후 본인 행의 `role, person_id` 를 읽어 `CURRENT_USER` 에 채운다(컬럼이 없거나 오류면 role 은 빈 값 = 제한 없음). viewer 이면 `document.body.classList.add('role-viewer')`. `PRESET_SKILLS`/`STATUS_KR` 소비처는 `skillPresets()/skillCategories()/statusLabel()` 로 바꾼다. 앱 시작 후 백그라운드로 `CodeAPI.load()` (실패해도 무시), 성공하면 열려 있는 폼이 아니라면 `render()`.
- `wisenm.js`: 위 "소비 규칙". 공수 산정 화면 진입 시 `BasisAPI.load()` 후 필요하면 재렌더(`EstimateAPI.load` 와 같은 패턴).

## 구현 결과로 확정된 세부 사항 (명세 대비)
- **로그인 역할 조회**: `_loadMyAccess(email)` 가 허용 목록에서 **본인 행만**(`eq("email", 소문자)`) 읽는다. admin 은 RLS 상 전체 행이 보이므로 조건이 없으면 다른 계정의 역할이 잡힌다(리뷰에서 발견된 버그). `role` 열이 없는 구 DB 는 email 만 읽고 role 은 빈 값(= 제한 없음).
- **빈 role(구 DB)**: `canDelete` 는 예전처럼 만든 사람이 지울 수 있고, viewer 가드는 role 이 `viewer` 로 확정된 경우에만 작동한다.
- **viewer 가드**: `SaveState._run` 이 서버 호출 없이 `false` 를 돌려주고 `SaveState.revert()`(+`render`)로 낙관적 변경을 되돌린다(토스트는 3초에 1회). `EstimateAPI.save` 는 로컬 변경 전에 `{ok:false, code:"forbidden"}`.
- **오류 코드**: `UserAPI`·`CodeAPI`·`BasisAPI` 는 명세의 코드 외에 `forbidden`(역할이 확정된 비관리자 또는 RLS 거부)을 돌려줄 수 있다. `UserAPI.update` 는 잘못된 역할에 `invalid`. `UserAPI.list()` 는 실패 시 한국어 메시지의 Error 로 reject.
- **CodeAPI.save 규칙**: 행은 지우지 않고 upsert 만, 분류↔항목 전환 금지, system 그룹에는 새 코드 추가 불가, 코드 키는 공백 없이 60자 이내. 스킬 항목 키는 `분류.슬러그`(예: `lang.java`). 항목 이름은 멤버에 문자열로 저장되므로 이름을 바꿔도 기존 멤버 스킬은 바뀌지 않는다.
- **BasisAPI.validate 추가 규칙**: 역할 id `[A-Za-z0-9_-]{1,40}`, 사용 중 역할 1개 이상, 변수 id 는 `db/branch/maint/si` 4개 고정, 분류 색 hex, SI 항목 mm 0~24. DB 내용이 검증을 통과하지 못하면 `current()` 는 내장 기준표로 돌아간다. `inTotal` 은 `unit === "M/M"` 로 정한 읽기 전용 값(예약).
- **DB 가드(서버가 강제)**: 마지막 admin 삭제·강등 금지(advisory lock 으로 동시 요청 포함), 허용 이메일은 소문자 정규화 + `lower(email)` 유일 인덱스, 코드 키 변경 금지, system 그룹의 코드 추가·수정·삭제 금지와 그룹 `system` 값 변경 금지, 기준표 버전은 insert-only. **서버가 강제하지 않는 것**: 게시된 기준표 역할 id 삭제 금지(클라이언트 검증).
- **탭 노출**: 드로어의 `settings`·`boards`·`templates` 탭은 admin 에게만(role 이 확정된 경우). editor 에게 보이면 저장이 RLS 로 실패하기 때문.

## 확장 지점 (이번 범위 밖, 구조는 이미 맞춰 둠)
- 멤버 종류(`wfm_members.kind`)와 영업 담당 통합: 코드 그룹 `member_kind` 를 추가하면 같은 `wfm_codes` 로 관리된다.
- 팀별 범위·세부 권한: `wfm_role_rank` 와 `wfm_has_role` 만 확장하고, 정책은 최소 역할 이름만 바꾼다. 사용자↔멤버 연결(`person_id`)로 "내 투입만 보기"를 만들 수 있다.
- 기준표 변수 추가·계산 규칙 종류 추가: `content.vars[].inTotal` 과 `roles[].scale` 이 이미 데이터이므로, `wnCompute` 에 규칙 종류만 더하면 된다(문자열 수식·eval 금지).
- 면담 열람 범위: `wfm_post_visible(board_id, created_by)` 한 함수에서 처리(결정 9 후).
