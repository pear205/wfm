# WFM — Workforce Management App

## 프로젝트 개요
팀 인력 투입 현황 관리 Single-Page App (Vanilla JS, 빌드 도구 없음).
- **투입 현황 뷰**(연도별): 멤버 × 월별 공수 그리드(기준 연도 앞뒤 6개월 포함 24개월), KPI 패널, 연간 스파크라인
- **가용인력 뷰**: 월별 여유공수 현황, 멤버 검색·스킬 필터
- **게시판 뷰**: 템플릿 기반 게시판(자유·유지보수 M/D·면담), `BOARD`/`BLOAD`/`BoardAPI` (`data.js`), 명세는 `docs/board-spec.md`

## 파일 구조
```
wfm/
├── index.html   # HTML 뼈대
├── style.css    # 전체 CSS (상단 주석에 디자인 시스템/토큰 설명)
├── app.js       # UI 로직 (섹션 구분: COMMON / YEAR VIEW / BENCH VIEW)
├── wisenm.js    # WiseNTM 공수 산정 화면 (독립 상태 `_wn`, DATA와 무관)
├── board.js     # 게시판 화면 (목록·검색·합계·상세·댓글·글쓰기, CSV)
├── board-admin.js # 관리 드로어 게시판/템플릿 탭 (템플릿 필드 편집기)
├── sql/boards.sql # 게시판 테이블 생성 SQL (사용자가 Supabase 에서 직접 실행)
├── docs/board-spec.md # 게시판 명세(데이터 형태·API 계약)
└── data.js      # 데이터 레이어 (Supabase CRUD, 조회 상태 `LOAD`, `showToast`)
```

## 로컬 실행 / 배포
- 정적 서버로 포트 7900에 띄움: `python -m http.server 7900` 또는 `.claude/launch.json` 의 `npx serve -p 7900 -s .`
- 로그인은 Supabase Auth **Google OAuth 만**(허용 목록 `wfm_allowed_users`, 비밀번호 로그인은 2026-10-09 제거)이며 **키·토큰은 문서·코드·채팅에 남기지 말 것**. 에이전트는 로그인할 수 없으므로, 로컬 검증은 `DATA`/`LOAD` 를 직접 채우고 `render()` 를 호출하는 방식으로 한다.
- 배포: `master` 푸시 → GitHub Pages(https://pear205.github.io/wfm/) 에 1~2분 뒤 반영. 확인 시 Ctrl+F5(캐시).

## 핵심 기술 사항
- `DATA` 객체 (`data.js`): `members`, `projects`, `assignments` 배열, Supabase 영속화 (조회 실패 시 오류 화면+재시도. 샘플/시드 데이터는 코드에 없음 — 모든 데이터는 DB 에서만 옴)
- `state` 객체 (`app.js`): 현재 뷰·필터·모달 상태 관리
- `DataAPI` (`data.js`): CRUD 메서드 (addMember, updateMember, setAssignment 등)
- `render()` → `switchView()` → `renderYearView()` / `renderBenchView()`
- `confirmable(btn, onConfirm)`: 3초 확인 버튼 헬퍼
- `_afterMutate()`: 드로어 열려있을 때 자동 갱신
- `Modal` (`app.js` 상단): 모달 공통 열기/닫기. 스택 기반 Escape, 배경 클릭 닫기(`data-backdrop="close"`), 포커스 트랩·복귀, 열리면 `#app` inert. 모달은 `Modal.open/close(id)` 로만 연다.
- `mountProjectPicker(host, {id, ...})`: 프로젝트 선택 콤보박스(검색 + "완료 포함/기간 내만" 옵션 + 상태 그룹). 같은 id 의 숨은 input 에 값을 담고 `change` 이벤트로 알린다. 멤버 투입 팝업·일괄 모달이 사용.
- 월 키: 투입 팝업은 `ymOf(year, month)` = `year*12+month-1` 정수 키를 쓴다. `yearWindow(year)` 는 표에 보이는 구간(기본 앞뒤 6개월 포함 24개월, 토글로 12개월), `_maScope()` 는 팝업이 읽고 쓰는 편집 범위(= 표에 보이는 구간).
- `LOAD` (`data.js`): 조회 상태 `loading|ok|error`. 실패/빈 데이터는 `renderDataGate()` 가 표 대신 안내한다.
- `showToast(msg)` / `parseMM()` / `isYM()`: 알림과 입력 검증 공용 헬퍼.
- `SaveState` (`data.js`): 모든 Supabase 쓰기는 `_track(label, key, thunk)` 경유(키별 순차 실행, 최신 작업이 예전 실패 건을 대체, 재시도는 현재 DATA 재조회). 상단 `#saveStatus` 에 저장 중/저장됨/실패+다시 시도·되돌리기. 새 쓰기 경로를 추가할 때 반드시 `_track` 을 쓴다.
- `Modal.track(id, getState)` / `Modal.requestClose(id)`: 편집 모달의 변경 감지와 닫기 경고(모달 안 확인 바). 사용자 닫기 경로는 `requestClose`, 저장·삭제 후에는 `Modal.close`.

## 계산 규칙 (변경 시 반드시 일관 유지)
- **용량**: `memberActive(m, y, mo)` 가 재직(입사~퇴사 월 포함) 판단의 유일한 기준. 월 용량 = 재직 1명당 1.0 M/M. `monthlyMaxCap`, `getMemberAnnual`, 가용인력 화면, PNG 내보내기가 모두 이것을 쓴다.
- **여유 부호**: 여유 = 용량 − 투입. **여유는 양수, 초과는 음수** (개인·팀 동일).
- **표시 공수 `getDisplayMM(a)`**: 계획 모드는 계획, 실제/비교 모드는 실제값이 0보다 크면 실제 아니면 계획으로 대체. KPI·합계·패널·내보내기가 모두 이 함수를 쓴다.
- **집계 범위**: KPI·연간 가용은 기준 연도 12개월만. 앞뒤 6개월은 표시만 하고 합산하지 않는다. 필터(이름/스킬/프로젝트) 결과는 표·합계 행·KPI·추천 목록에 동일하게 적용된다.
- **초과 판정**: 개인 월 합계 > 용량 + 0.05(허용 오차). 팀 합계는 부동소수 오차 `MM_EPS` 허용.
- **공수 입력 규칙**: 0~2, 0.05 단위(`parseMM`). 계획 0 은 실제값이 있을 때만(계획 없는 실투입).

## CSS 설계
- CSS 변수 기반 다크/라이트 테마 (`data-theme` + `prefers-color-scheme`)
- BEM-lite 네이밍: `kpi-*`, `grid-total-*`, `assign-*`, `filter-bar-*`, `skill-filter-*`
- `.sk-tag.lang/.cloud/.ai/.sol/.etc`: 스킬 카테고리별 색상 칩

## PRESET_SKILLS (app.js 상단)
```js
const PRESET_SKILLS = {
  lang:  ['Java', 'Spring', 'Kotlin', 'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Flutter', 'CSS'],
  cloud: ['AWS', 'GCP', 'Azure', 'Firebase', 'Kubernetes', 'Docker'],
  ai:    ['GPT API', 'LangChain', 'MLflow', 'PyTorch', 'HuggingFace'],
  sol:   ['WiseN TM', 'Zendesk', 'Salesforce'],
  etc:   ['Figma', 'Adobe XD', 'Jira', 'Confluence', 'Git', 'Notion'],
};
```

## 레이아웃 템플릿 & 디자인 시스템
> 자세한 내용은 `style.css` 상단 주석 참고

### 빌딩 블록 (Building Blocks)
| 블록 | 클래스 접두어 | 설명 |
|------|-------------|------|
| AppBar | `.hd-*` | 최상단 네비게이션 바 |
| Toolbar | `.filter-bar-*` | 검색·필터·액션 바 |
| KPIPanel / KPICard | `.kpi-panel`, `.kpi-card` | 지표 카드 모음 |
| DataGrid | `.year-table .col-*` | 데이터 그리드 |
| AssignCell | `.assign-cell`, `.assign-bars`, `.proj-bar` | 공수 투입 셀·바 |
| MemberCell | `.member-cell` | 멤버 아이덴티티 블록 |
| Drawer | `.drawer-*` | 우측 슬라이드 패널 |
| Modal / FormModal | `.modal-*`, `.form-*` | 오버레이·폼 모달 |

### 화면 템플릿 (View Templates)
```
GridView  ── 연도별·가용인력 등 그리드 화면
  AppBar + Toolbar + KPIPanel + DataGrid

MgmtView  ── 관리 화면 (멤버·프로젝트 CRUD)
  AppBar + Drawer + FormModal
```

> **신규 화면 추가 시:** 위 블록을 조합하고, 화면 전용 요소만 새 접두어(예: `.report-*`)로 추가.

## 구현 완료 항목
- [x] 연도별 그리드 뷰 (공수 입력·수정·삭제)
- [x] 가용인력 뷰 (월별 여유공수, 색상 인디케이터)
- [x] KPI 패널 (총 M/M, 평균 가동률, 초과·여유 월 수)
- [x] 연간 스파크라인 + 툴팁 (화면 경계 자동 반전)
- [x] 멤버·프로젝트 CRUD (관리 드로어)
- [x] 멤버 입사월/퇴사월 (monthlyMaxCap 반영)
- [x] 스킬 프리셋 드롭다운 (카테고리 선택 + 직접입력 fallback)
- [x] 솔루션 카테고리 추가 (WiseN TM, Zendesk, Salesforce)
- [x] 가용인력 스킬 필터 (멀티셀렉트 드롭다운, OR 로직)
- [x] 다크/라이트 테마 토글
- [x] CSS/JS 파일 분리 (index.html → style.css + app.js)
- [x] GitHub 업로드 (https://github.com/pear205/wfm)
- [x] 24개월 표시(앞뒤 6개월) + "앞뒤 기간 보기" 토글, 현재 달 가운데 맞추기, 연도 경계 막대 이음
- [x] 멤버 투입 팝업: 연·월 키 12개월 창(◀▶, 헤더 끌기 이동), 월 단위 diff 저장, 달별 유형 보존
- [x] 공통 `Modal`, `ProjectPicker`, 표 끌어서 스크롤(관성), 저장 실패 토스트
- [x] 조회 실패 오류 화면+재시도 (샘플 자동 대체·자동 업로드 제거)
- [x] 하드코딩 제거: 샘플 시드 데이터·"데이터 초기화" 버튼·로그인 이메일(이후 구글 로그인만 남김)
- [x] 재직 기반 공통 용량, 필터 일관 적용, KPI/부호/라벨 정리, 입력 검증
- [x] 접근성: 포커스 트랩, 패널/드로어 inert, 막대 키보드 조작(roving tabindex), aria, 큰 글씨, 대비 개선
- [x] 관리 드로어: 프로젝트·멤버 추가 버튼을 목록 맨 위(스크롤 시 고정)
- [x] 저장 상태 표시 + 다시 시도/되돌리기, 편집 중 모달 닫기 경고
- [x] 게시판(템플릿·버전 관리, 검색, 댓글, M/D 합계, CSV, 관리 탭)

## 진행 상황 · 결정 · 백로그
> **`HANDOFF.md` 를 먼저 읽을 것.** 집/회사 PC 가 달라 로컬 기억이 공유되지 않으므로, 대기 중인 결정·백로그·합의 사항·작업 이력은 `HANDOFF.md` 한 곳에만 기록한다. 작업을 끝낼 때 갱신하고 커밋·푸시한다.

## 작업 규칙 (사용자 요청)
- 코드 수정 전 **계획 → 근거 확인(grep으로 영향도·공통화 점검) → 문제 시 계획 수정 → 최종 계획 공유** 순서로 진행한다. 결정이 필요한 것은 미리 묻는다.
- 구현 후 **검증(브라우저 시나리오 + 필요 시 읽기 전용 코드 리뷰 에이전트 병행)** → 오류가 있으면 수정·재검증 반복 → 오류가 없을 때 푸시.
- 비밀번호·키는 입력하거나 기록하지 않는다.
- **푸시할 때마다** 먼저 `HANDOFF.md`(현재 상태 / 대기 중인 결정 / 백로그 / 합의 사항 / 작업 이력)를 최신화해서 **같은 푸시에 포함**한다. 그다음 푸시하고 원격과 일치하는지(`git status -sb`, `git ls-remote`) 확인한다.
- 사용자가 **"최신화"** 를 요청하면 `HANDOFF.md`·`CLAUDE.md` 가 실제 코드/커밋과 맞는지 **항상 먼저 확인**하고 어긋난 부분을 고친 뒤 푸시까지 완료한다.
