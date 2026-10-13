# 공수 산정 기록 명세 (구현 계약서)

> 공수 산정(WiseNTM) 화면에 **산정 기록(건별 저장·버전 이력)** 을 더한다. 시안 D: 왼쪽 기록 목록 + 가운데 산정표 + 오른쪽 정보 패널.
> 이 문서는 `data.js`(데이터), `wisenm.js`(화면), `estimate-admin.js`(영업 담당 관리)가 따르는 **계약**이다. 바꾸려면 먼저 이 문서를 고친다.

## 결정 사항 (사용자 확정)
- 담당 영업은 **별도 목록(`wfm_sales_people`)을 관리 드로어에서 관리**하고 기록에서 선택한다.
- 산정 참여자는 **등록 멤버 선택 + 직접 입력** 모두 가능, 각자 역할을 적는다.
- 저장은 **수정마다 새 버전**(불변), **변경 사유 필수**(첫 저장은 "최초 작성"). 이력은 **보기 + 복원(새 버전으로 저장)**.
- 이력에는 **총공수 변화만** 표시한다(항목별 비교 없음).
- 삭제는 **만든 사람만**(서버 RLS 가 강제), 확인 한 번. 영업 담당자는 기록에서 쓰이면 삭제 불가(비활성만).
- 총공수 합산 규칙은 지금 그대로(지점 설치 M/D, 유지보수 MM/월은 **미포함** — 화면에 "총공수 미포함" 표시).
- 버전마다 **기준표 스냅샷**을 저장해, 나중에 기준표가 바뀌어도 과거 기록은 그때 기준으로 본다.

## DB (sql/estimates.sql — 이미 적용됨)
- `wfm_sales_people(id, name, dept, active, sort_order, created_at)`
- `wfm_estimates(id, title, client, sales_id→sales(restrict), project_id→projects(set null), estimated_on date, participants jsonb, memo, current_version, total_mm, created_at, updated_at, created_by uuid default auth.uid(), created_by_email default jwt email)`
- `wfm_estimate_versions(estimate_id→estimates(cascade), version, reason, snapshot jsonb, total_mm, saved_at, saved_by_email)` PK(estimate_id, version)
- RLS: 전부 `wfm_is_allowed()`. estimates 삭제는 `created_by = auth.uid()` 만. versions 는 select/insert 만(수정·삭제 불가).
- `created_by`/`created_by_email`/`saved_by_email` 은 서버 기본값이 채운다 → **클라이언트가 insert/upsert 에 넣지 않는다**(update 시 created_* 도 보내지 않는다).

## JS 데이터 (data.js, 전역)
```js
const CURRENT_USER = { id, email }            // app.js _checkAuth 가 채움 (이미 추가됨)
const EST   = { sales: [], estimates: [], versions: {} }   // versions[estimateId] = EstimateVersion[] (열 때 로드·캐시)
const ELOAD = { status: 'idle'|'loading'|'ok'|'missing'|'error', errors: [] }
```
- SalesPerson: `{ id, name, dept, active, sortOrder, createdAt }`
- Estimate(머리말): `{ id, title, client, salesId|null, projectId|null, estimatedOn:'YYYY-MM-DD', participants:[{memberId?, name, role}], memo, currentVersion, totalMm, createdAt, updatedAt, createdBy, createdByEmail }`
- EstimateVersion: `{ estimateId, version, reason, snapshot, totalMm, savedAt, savedByEmail }`
- **snapshot** = `{ header:{title,client,salesId,salesName,projectId,estimatedOn,participants,memo}, basis:{roles:[...],vars:[...]}, inputs:{dur,custom,roleChecked,vars,varChecked,siItems,siOverride} }`
  - `basis.roles/vars` 는 wisenm.js 의 `WISENM_ROLES`/`WISENM_VARS` 와 같은 모양(깊은 복사). `inputs` 는 `_wn` 의 입력 상태와 같은 모양.
  - snapshot 은 JSON 직렬화 가능해야 한다(함수·undefined 금지).
- 행 변환: `_rowToSales/_salesToRow`, `_rowToEstimate/_estimateToRow`, `_rowToEstimateVersion` — 컬럼은 snake_case, 날짜는 `estimated_on`(date 문자열), 숫자는 `Number()` 로 변환.

## API (data.js, `EstimateAPI` 객체 + 전역 헬퍼)
모든 쓰기는 기존 `_track(label, key, thunk, waitAll?, deps?)` 경유(저장 상태 표시·재시도). 낙관적 갱신(EST 먼저 변경 → 서버 반영). 테이블이 없으면 `ELOAD.status='missing'`(`_isMissingTable` 재사용).

| 함수 | 반환 | 동작 |
|------|------|------|
| `EstimateAPI.load()` | `Promise<boolean>` | 영업 목록 + 기록 머리말만 읽음. 진행 중이면 같은 promise(중복 방지). `loadBoards` 패턴 |
| `EstimateAPI.loadVersions(id)` | `Promise<EstimateVersion[]>` | 해당 기록 이력을 version 오름차순으로 읽어 `EST.versions[id]` 에 캐시. 실패 시 reject |
| `EstimateAPI.save({id?, header, snapshot, reason, baseVersion})` | `Promise<{ok:true, estimate, version}\|{ok:false, code:'conflict'\|'invalid'\|'error', message}>` | id 없으면 새 기록(version 1, reason 비면 "최초 작성"). 있으면 **서버의 current_version 을 조회해 baseVersion 과 다르면 `conflict`**(저장 안 함, 로컬을 서버 값으로 갱신하지 않음). reason 이 비었고 version>1 이면 `invalid`. 성공 시 version = base+1, 머리말(upsert)과 버전 행(insert)을 같은 키 체인으로 저장. `totalMm` 은 호출자가 `header.totalMm` 으로 넘긴다 |
| `EstimateAPI.copy(id)` | `Promise<Estimate>` | 최신 버전 snapshot 으로 새 기록(v1, 사유 "복제: <원본 건명>", 건명 "<원본> (복사)") |
| `EstimateAPI.remove(id)` | `Promise<true\|'not-owner'\|'error'>` | `canDelete` 가 아니면 `'not-owner'`. 서버 삭제 실패(RLS)는 로컬 복구 후 `'error'` |
| `EstimateAPI.canDelete(est)` | `boolean` | `est.createdBy && est.createdBy === CURRENT_USER.id` |
| `EstimateAPI.saveSales({id?,name,dept,active})` | `SalesPerson` | 이름 비면 throw 하지 말고 호출 전 UI 에서 검증. id 없으면 `_bid('sal_')` |
| `EstimateAPI.setSalesActive(id, active)` | `void` | |
| `EstimateAPI.removeSales(id)` | `Promise<true\|'in-use'\|'check-failed'>` | 로컬·서버(estimates.sales_id 개수)에서 쓰이면 `'in-use'`. FK restrict 가 최종 방어 |
| `salesName(id)` | `string` | 없으면 `''` |
| `estimateById(id)`, `latestEstimateVersion(id)` | | 로컬 조회 |

- id 접두어: 기록 `est_`, 영업 `sal_` (`_bid`).
- `save()` 는 `EST.estimates` 를 갱신하고 `EST.versions[id]` 가 로드돼 있으면 새 버전을 push 한다.
- 저장 키: `est:<id>`(머리말·버전·삭제가 한 키 체인), `sales:<id>`. 삭제는 `waitAll=true`.

## 화면 (wisenm.js)
- `renderWisenmView()` 진입점은 그대로. 상태 `ELOAD` 로 로딩/missing/error 안내(재시도 버튼), `idle` 이면 `EstimateAPI.load()` 후 재렌더.
- **계산 공통화**: 순수 함수 `wnCompute(basis, inputs) → { mms:{roleId:mm}, total, excluded:[{id,name,unit}] }` 하나로 화면·저장값·이력 요약이 같은 결과를 쓴다. 기존 `_wnCalcMM`, `_wnRefreshTotal` 의 중복 계산을 이것으로 대체. 반올림은 기존과 같이 0.5 단위(`Math.round(x*2)/2`)이며 결과 값은 지금 화면과 **동일**해야 한다.
- 상태: `_wn.basis`(기본 = `WISENM_ROLES/VARS` 깊은 복사), `_wn.inputs`(기존 `dur/custom/roleChecked/vars/varChecked/siItems/siOverride/_siNext`), `_wn.header`, `_wn.est`(현재 기록 id 또는 null), `_wn.baseVersion`, `_wn.viewVersion`(과거 버전 보기 중이면 그 번호), `_wn.dirty`.
- 레이아웃(시안 D): 왼쪽 목록(검색, 영업 필터, 항목: 건명·고객·영업·총공수·산정일·수정일·버전·참여자 칩·프로젝트 태그) / 가운데 기존 산정표 + 상단 상태 줄(저장됨 vN, 이력, 복제, 삭제, 저장) + 표 아래 "총공수 미포함: …" 줄 / 오른쪽 정보 패널(건명, 고객사, 담당 영업, 산정일, 프로젝트 연결, 참여자, 메모, 최근 이력 3건의 총공수 변화).
- 저장: 변경 사유 입력 모달 → `EstimateAPI.save`. `conflict` 면 "다른 곳에서 먼저 저장되었습니다. 새로고침 후 다시 저장하세요" 안내.
- 이력 모달: 버전 목록(번호·일시·작성자·사유·총공수·직전 대비 변화), "보기"(그때 기준표로 읽기 전용 표시, `viewVersion`), "이 버전으로 복원"(그 내용을 편집판에 불러와 dirty 상태로 두고, 저장하면 새 버전).
- 미저장 보호: 기록 전환/새 산정/복제 시 dirty 면 확인 바. 전역 훅 `wnLeaveGuard(proceed)` 를 노출해 `switchView` 가 쓸 수 있게 한다(없으면 통과).
- 삭제 버튼은 `EstimateAPI.canDelete` 일 때만 보이고, 누르면 확인 한 번(`confirmable`).
- 좁은 화면(≈900px 이하): 목록은 위로 접히고 정보 패널은 산정표 위 접이식.
- 모달은 JS 로 만든다(`board-admin.js` 의 `_badmInitModal` 처럼: `.modal-overlay.hidden` + `data-backdrop` 없이 `Modal.open/close`). 접근성: 라벨, 포커스, aria. 모든 동적 값은 `esc()`.

## 영업 담당 관리 (estimate-admin.js)
- 관리 드로어에 탭 **영업 담당**(`data-tab="sales"`) 추가(`board-admin.js` 의 탭 주입 방식). `app.js renderDrawerContent` 가 이미 `renderSalesAdminDrawer(body)` 를 호출하도록 연결돼 있다.
- 목록(이름, 소속, 활성 토글, 사용 기록 수), 맨 위 고정 [영업 담당 추가] 버튼, 편집 모달(이름 필수, 소속), 삭제(`removeSales` 결과 'in-use' 면 "사용 중이라 삭제할 수 없습니다. 비활성으로 바꾸세요").
- `ELOAD` 상태 안내(로딩/missing/error + 다시 시도). 편집 모달은 `Modal.track/requestClose` 로 편집 중 닫기 경고.

## 건드리지 않는 것
- 기존 투입 현황·가용인력·게시판 화면, 기존 `DATA`/`BOARD` 로직. 총공수 합산 규칙. 기준표 항목 관리 화면(다음 단계).
