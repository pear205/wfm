# WFM — Workforce Management App

## 프로젝트 개요
팀 인력 투입 현황 관리 Single-Page App (Vanilla JS, 빌드 도구 없음).
- **연도별 뷰**: 멤버 × 월별 공수 그리드, KPI 패널, 연간 스파크라인
- **가용인력 뷰**: 월별 여유공수 현황, 멤버 검색·스킬 필터

## 파일 구조
```
wfm/
├── index.html   # HTML 뼈대 (134줄)
├── style.css    # 전체 CSS
├── app.js       # UI 로직 (섹션 구분: COMMON / YEAR VIEW / BENCH VIEW)
└── data.js      # 데이터 레이어 (localStorage CRUD)
```

## 로컬 실행
Python http.server 사용 (포트 7900):
```bash
python -m http.server 7900
```
브라우저에서 http://localhost:7900 접속.

## 핵심 기술 사항
- `DATA` 객체 (`data.js`): `members`, `projects`, `assignments` 배열, localStorage 영속화
- `state` 객체 (`app.js`): 현재 뷰·필터·모달 상태 관리
- `DataAPI` (`data.js`): CRUD 메서드 (addMember, updateMember, setAssignment 등)
- `render()` → `switchView()` → `renderYearView()` / `renderBenchView()`
- `confirmable(btn, onConfirm)`: 3초 확인 버튼 헬퍼
- `_afterMutate()`: 드로어 열려있을 때 자동 갱신

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
  etc:   ['Figma', 'Adobe XB', 'Jira', 'Confluence', 'Git', 'Notion'],
};
```

## ⚠️ 절대 수정 금지
**`data.js`의 m1~m8 멤버 identity 필드 (name, role, color, skills)는 절대 변경하지 말 것.**
실제 팀원 정보입니다. `start`/`end` 날짜 필드 추가는 허용.

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
