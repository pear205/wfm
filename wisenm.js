// ██████████████████████████████████████████████████████████
// █  WISENM VIEW  —  WiseNTM 공수 산정표 + 산정 기록           █
// █  계약: docs/estimate-spec.md  (데이터: data.js EST·ELOAD·EstimateAPI) █
// ██████████████████████████████████████████████████████████
// 레이아웃(시안 D): 왼쪽 기록 목록 / 가운데 기준표(상태 줄 + 표 + 미포함 줄) / 오른쪽 정보 패널.
// 영역별 부분 렌더: _wnRenderList·_wnRenderItems / _wnRenderStatus·_wnRenderSheet / _wnRenderInfo.
// 계산은 순수 함수 wnCompute(basis, inputs) 하나만 쓴다(표·합계·저장값·이력 요약 공통).

// 기준 역할 정의 (2개월 기준 M/M)
const WISENM_ROLES = [
  { id:'pm',    cat:'관리',   name:'PM',              base:2.0, scale:'linear', note:'전체 기간 상주' },
  { id:'pl',    cat:'관리',   name:'PL',              base:2.0, scale:'linear', note:'전체 기간 상주' },
  { id:'bm',    cat:'관리',   name:'사업관리',         base:2.0, scale:'linear', note:'프로젝트 진행 관리' },
  { id:'ta',    cat:'기술',   name:'TA',              base:1.0, scale:'dev',    note:'인프라·아키텍처·기술 검토 (고객 별도 요건없을경우 제외 가능)' },
  { id:'infra', cat:'인프라', name:'인프라 담당',      base:1.0, scale:'dev',    note:'고객사 서버 설치, 네트워크 구성, 방화벽 업무 담당' },
  { id:'sec',   cat:'보안',   name:'인프라 보안',      base:1.0, scale:'dev',    note:'네트워크·서버 보안' },
  { id:'comp',  cat:'보안',   name:'보안성 심의',      base:1.0, scale:'dev',    note:'문서 및 심의 대응' },
  { id:'aos',   cat:'개발',   name:'Android 개발자',   base:2.0, scale:'dev',    note:'법인폰 앱 수정 개발' },
  { id:'be',    cat:'개발',   name:'백엔드 개발자',    base:2.0, scale:'dev',    note:'백엔드 수정 개발' },
  { id:'fe',    cat:'개발',   name:'프론트엔드 개발자',base:2.0, scale:'dev',    note:'프론트엔드 수정 개발' },
];

function _wnScaleDesc(r) {
  if (r.scale === 'fixed')  return '고정값';
  if (r.scale === 'linear') return `기간 × ${r.base/2} M/M`;
  if (r.scale === 'dev')    return `${r.base}M/M + 추가월×0.5`;
  return '';
}

const WISENM_VARS = [
  { id:'db',    name:'DB 설치 및 이중화', unit:'M/M', placeholder:'별도 산정', note:'HA 구성 규모에 따라 상이 (고객 제공시 제외) 외부업체' },
  { id:'branch',name:'지점 설치',        unit:'MD/지점', placeholder:'0.5', scale:'일정 협의 기간 + (지점 × n M/D)', note:'현장 설치·테스트·교육 (고객사에 따라 공수 편차가 커 사전 협의 필요)' },
  { id:'maint', name:'유지보수',         unit:'MM/월', placeholder:'0.5', note:'운영 안정화 후 적용 (인력 배정을 위해 M/M단위 필요)' },
  { id:'si',    name:'SI 커스터마이징',   unit:'M/M', placeholder:'별도 산정', note:'고객사 개발 요건에 따라 상이' },
];

const WN_CAT_COLORS = { '관리':'#3D6FEB', '기술':'#9259D1', '인프라':'#16BFAD', '보안':'#E85C4A', '개발':'#00A878' };
const WN_VAR_COLOR  = '#8A8D9F';
const WN_LIMITS = { title:100, client:100, ptName:40, ptRole:40, memo:2000, reason:200 };

// ─── 기본값 / 정규화 (스냅샷 복원에도 사용) ───
function _wnDefaultBasis() { return { roles: _deepCopy(WISENM_ROLES), vars: _deepCopy(WISENM_VARS) }; }
function _wnDefaultInputs() {
  return {
    dur: 2,
    custom: {},
    vars: {},
    roleChecked: {},  // key: roleId, undefined/true = 포함, false = 제외
    varChecked: {},   // key: varId, true = 포함, undefined/false = 제외
    siItems: [
      { id:'si_1', name:'데이터 마이그레이션',    mm:1.0, checked:false },
      { id:'si_2', name:'CRM / 콜센터 연동',      mm:2.0, checked:false },
      { id:'si_3', name:'업무 특화 기능 개발',     mm:1.5, checked:false },
      { id:'si_4', name:'보고서 커스터마이징',     mm:0.5, checked:false },
      { id:'si_5', name:'기존 시스템 인터페이스',  mm:1.0, checked:false },
    ],
    siOverride: '',
    _siNext: 6,
  };
}
function _wnTodayStr() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function _wnDefaultHeader() {
  return { title:'', client:'', salesId:null, projectId:null, estimatedOn:_wnTodayStr(), participants:[], memo:'' };
}
function _wnNormalizeBasis(b) {
  const d = _wnDefaultBasis();
  if (!b || typeof b !== 'object') return d;
  return {
    roles: Array.isArray(b.roles) && b.roles.length ? _deepCopy(b.roles) : d.roles,
    vars:  Array.isArray(b.vars)  && b.vars.length  ? _deepCopy(b.vars)  : d.vars,
  };
}
function _wnNormalizeInputs(src) {
  const d = _wnDefaultInputs(), s = src && typeof src === 'object' ? src : {};
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? _deepCopy(v) : {};
  const items = Array.isArray(s.siItems)
    ? s.siItems.filter(i => i && i.id != null).map(i => ({ id:String(i.id), name:String(i.name ?? ''), mm:Number(i.mm) || 0, checked:!!i.checked }))
    : d.siItems;
  const maxN = items.reduce((m, i) => { const n = Number(String(i.id).replace(/^si_/, '')); return Number.isFinite(n) ? Math.max(m, n) : m; }, 6);
  const dur = Math.round(Number(s.dur));
  // 체크/빈 값은 "기본값이면 키 없음" 한 가지 모양으로 맞춘다(껐다 켜도 dirty 로 보이지 않게). 계산 결과는 같다
  const only = (o, keep) => Object.keys(o).reduce((r, k) => { if (keep(o[k])) r[k] = o[k]; return r; }, {});
  return {
    dur: Number.isFinite(dur) ? Math.min(24, Math.max(1, dur)) : d.dur,
    custom: only(obj(s.custom), v => typeof v === 'number' && Number.isFinite(v) && v >= 0),   // 숫자만(문자열이면 합계가 문자열 연결이 됨)
    vars: only(obj(s.vars), v => v != null && v !== ''),
    roleChecked: only(obj(s.roleChecked), v => v === false),
    varChecked: only(obj(s.varChecked), v => v === true),
    siItems: items,
    siOverride: s.siOverride == null ? '' : String(s.siOverride),
    _siNext: Math.max(Number(s._siNext) || 6, maxN),
  };
}
function _wnNormalizeHeader(h) {
  const s = h && typeof h === 'object' ? h : {};
  const str = v => v == null ? '' : String(v);
  return {
    title: str(s.title), client: str(s.client),
    salesId: s.salesId || null, projectId: s.projectId || null,
    estimatedOn: str(s.estimatedOn).slice(0, 10),
    participants: (Array.isArray(s.participants) ? s.participants : []).filter(p => p && typeof p === 'object').map(p => {
      const o = { name: str(p.name), role: str(p.role) };
      if (p.memberId) o.memberId = String(p.memberId);
      return o;
    }),
    memo: str(s.memo),
  };
}

// 입력 상태 변경 헬퍼(정규화된 모양 유지) — 표 이벤트 핸들러가 사용
function _wnSetChecked(I, type, id, checked) {
  if (type === 'role') { if (checked) delete I.roleChecked[id]; else I.roleChecked[id] = false; }
  else { if (checked) I.varChecked[id] = true; else delete I.varChecked[id]; }
}
function _wnSetVar(I, id, value) {
  if (value == null || value === '') delete I.vars[id]; else I.vars[id] = value;
}
// 키 정렬 JSON (서버 jsonb 를 거쳐 키 순서가 바뀌어도 같은 값이면 같은 문자열)
function _wnStable(v) {
  const norm = x => Array.isArray(x) ? x.map(norm)
    : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { if (x[k] !== undefined) o[k] = norm(x[k]); return o; }, {}) : x;
  return JSON.stringify(norm(v));
}
// 삭제된 영업 담당/프로젝트 참조 정리: 목록이 로드된 경우에만 판단. { header(복사본), dropped:['sales'|'project'] }
function _wnSanitizeRefs(h, { sales, salesReady, projects, projectsReady } = {}) {
  const out = { ...h }, dropped = [];
  if (out.salesId && salesReady && !(sales || []).some(s => s.id === out.salesId)) { out.salesId = null; dropped.push('sales'); }
  if (out.projectId && projectsReady && !(projects || []).some(p => p.id === out.projectId)) { out.projectId = null; dropped.push('project'); }
  return { header: out, dropped };
}

// ─── 계산 (순수 함수 — 기존 _wnCalcMM / render 합계 / _wnRefreshTotal 과 동일한 규칙·순서) ───
// 역할: custom 값이 있으면 그대로, 없으면 dev(기본+추가월×0.5)/linear(기본×기간/2)/fixed 후 0.5 반올림.
// 합계: 체크된 역할(기본 포함) → SI(체크 시: override 또는 체크된 부가 항목 합) → 그 밖의 M/M 변수(db, 체크 시) 순서로 더한 뒤 0.5 반올림.
// M/M 이 아닌 변수(지점 설치, 유지보수)는 합산하지 않고 excluded 로 돌려준다.
function wnCompute(basis, inputs) {
  const roles = (basis && basis.roles) || [], vars = (basis && basis.vars) || [];
  const I = inputs || {};
  const custom = I.custom || {}, roleChecked = I.roleChecked || {}, varChecked = I.varChecked || {}, vv = I.vars || {};
  const dur = I.dur;
  const mms = {};
  let total = 0;
  roles.forEach(r => {
    let mm;
    if (custom[r.id] !== undefined) mm = custom[r.id];
    else {
      if (r.scale === 'dev')         mm = r.base + Math.max(0, dur - 2) * 0.5;
      else if (r.scale === 'linear') mm = r.base * (dur / 2);
      else                           mm = r.base;
      mm = Math.round(mm * 2) / 2;
    }
    mms[r.id] = mm;
    if (roleChecked[r.id] !== false) total += mm;
  });
  const items = I.siItems || [];
  const siSum = Math.round(items.filter(i => i.checked).reduce((s, i) => s + i.mm, 0) * 2) / 2;
  const siHasChecked = items.some(i => i.checked);
  const siOverride = I.siOverride == null ? '' : I.siOverride;
  const siValue = siOverride !== '' ? siOverride : (siHasChecked ? siSum : '');
  if (varChecked.si === true) total += parseFloat(siValue) || 0;
  const excluded = [];
  vars.forEach(v => {
    if (v.id === 'si') return;
    if (v.unit === 'M/M') { if (varChecked[v.id] === true) total += parseFloat(vv[v.id]) || 0; }
    else excluded.push({ id:v.id, name:v.name, unit:v.unit, value: vv[v.id] == null ? '' : String(vv[v.id]), checked: varChecked[v.id] === true });
  });
  total = Math.round(total * 2) / 2;
  return { mms, total, excluded, si: { sum: siSum, hasChecked: siHasChecked, value: siValue, override: siOverride !== '' } };
}

// 이력 요약: 버전 오름차순 + 직전 대비 총공수 변화 (총공수는 스냅샷이 있으면 wnCompute 로 다시 계산)
function _wnVersionTotal(v) {
  // 저장 당시 총공수를 우선한다(계산 규칙이 바뀌어도 과거 이력이 변하지 않도록). 없을 때만 스냅샷으로 재계산.
  const n = Number(v && v.totalMm);
  if (v && v.totalMm != null && Number.isFinite(n)) return n;
  const s = v && v.snapshot;
  if (s && s.basis && s.inputs) return wnCompute(_wnNormalizeBasis(s.basis), _wnNormalizeInputs(s.inputs)).total;
  return 0;
}
function wnVersionSummaries(versions) {
  const list = (Array.isArray(versions) ? versions : [])
    .filter(v => v && Number.isFinite(Number(v.version)))
    .slice().sort((a, b) => Number(a.version) - Number(b.version));
  let prev = null;
  return list.map(v => {
    const total = _wnVersionTotal(v);
    const delta = prev == null ? null : Math.round((total - prev) * 100) / 100;
    prev = total;
    return { version: Number(v.version), savedAt: v.savedAt || '', savedByEmail: v.savedByEmail || '', reason: v.reason || '', total, delta };
  });
}
function wnFmtDelta(d) {
  if (d == null || !Number.isFinite(d)) return '';
  if (Math.abs(d) < 0.05) return '±0';
  return (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1);
}

// 정보 패널 검증 → { field: message } (비었으면 통과)
function _wnValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number), dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function wnValidateHeader(h) {
  const e = {};
  const title = String(h.title || '').trim();
  if (!title) e.title = '건명을 입력하세요.';
  else if (title.length > WN_LIMITS.title) e.title = `건명은 ${WN_LIMITS.title}자 이내로 입력하세요.`;
  if (String(h.client || '').trim().length > WN_LIMITS.client) e.client = `고객사는 ${WN_LIMITS.client}자 이내로 입력하세요.`;
  if (!h.estimatedOn) e.estimatedOn = '산정일을 입력하세요.';
  else if (!_wnValidDate(h.estimatedOn)) e.estimatedOn = '산정일은 YYYY-MM-DD 형식의 올바른 날짜여야 합니다.';
  if ((h.participants || []).some(p => !String(p.name || '').trim())) e.participants = '참여자 이름은 비울 수 없습니다.';
  if (String(h.memo || '').length > WN_LIMITS.memo) e.memo = `메모는 ${WN_LIMITS.memo}자 이내로 입력하세요.`;
  return e;
}

// ─── 상태 ───
const _wn = {
  basis: _wnDefaultBasis(),
  inputs: _wnDefaultInputs(),
  header: _wnDefaultHeader(),
  est: null,            // 현재 기록 id (새 산정이면 null)
  baseVersion: 0,       // 편집 기준 버전 (저장 시 충돌 검사)
  viewVersion: null,    // 과거 버전 읽기 전용 보기 중이면 그 번호
  view: null,           // { basis, inputs, header, ver } — viewVersion 의 내용
  dirty: false,
  restoredFrom: null,   // 이력에서 복원한 버전 번호(저장 사유 기본값)
  pending: null,        // 불러오는 중인 기록 id
  saving: false,
  q: '', salesFilter: '',
  listOpen: false, infoOpen: false,   // 좁은 화면 접힘 상태
  _baseline: '',
  _loading: false,
};

const _wnEditSnap = () => _wnStable({ h: _wn.header, b: _wn.basis, i: _wn.inputs });
function _wnSetBaseline() { _wn._baseline = _wnEditSnap(); _wn.dirty = false; }
_wnSetBaseline();
function _wnRevert() {
  const s = JSON.parse(_wn._baseline);
  _wn.header = s.h; _wn.basis = s.b; _wn.inputs = s.i;
  _wn.dirty = false; _wn.restoredFrom = null;
}
function _wnNewState() {
  Object.assign(_wn, { est:null, baseVersion:0, viewVersion:null, view:null, restoredFrom:null, pending:null,
    basis:_wnDefaultBasis(), inputs:_wnDefaultInputs(), header:_wnDefaultHeader() });
  _wnSetBaseline();
  if (typeof document !== 'undefined') _wnSetBusy(false);
}
// 참조 정리에 쓰는 현재 목록(로드 여부 포함)
function _wnRefCtx() {
  return {
    sales: _wnSales(), salesReady: _wnStatus() === 'ok',
    projects: typeof DATA !== 'undefined' && Array.isArray(DATA.projects) ? DATA.projects : [],
    projectsReady: typeof DATA !== 'undefined' && typeof LOAD !== 'undefined' && LOAD.status === 'ok',
  };
}
// 저장용 스냅샷 (JSON 직렬화 가능)
function _wnSnapshot() {
  const header = _wnSanitizeRefs(_wnNormalizeHeader(_wn.header), _wnRefCtx()).header;   // 삭제된 참조는 null 로(FK 위반 방지)
  header.title = header.title.trim(); header.client = header.client.trim();
  header.participants = header.participants.map(p => ({ ...p, name: p.name.trim(), role: p.role.trim() }));
  header.salesName = _wnSalesName(header.salesId);
  return _deepCopy({ header, basis: _wn.basis, inputs: _wn.inputs });
}

// 외부 노출: 저장 안 된 변경 여부 / 화면 이탈 보호 (switchView 가 사용)
function wnLeaveGuard(proceed) {
  if (typeof proceed !== 'function') return;
  if (!_wn.dirty || typeof document === 'undefined' || !document.getElementById('wnEstGuard')) { proceed(); return; }
  _wnGuard(proceed, { msg: '저장하지 않은 변경 사항이 있습니다. 버리고 화면을 떠날까요?' });
}
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeunload', e => { if (_wn.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', () => _wnSyncPanelMax());
}
// 고정(sticky) 패널 최대 높이: 표 스크롤 영역(#grid-wrap)의 실제 위치에서 계산(헤더 높이 하드코딩 없음)
function _wnSyncPanelMax() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('wnEst');
  if (!root) return;
  const gw = document.getElementById('grid-wrap');
  const r = gw ? gw.getBoundingClientRect() : null;
  const avail = r && r.height > 0 ? Math.min(r.height, window.innerHeight - Math.max(0, r.top)) : window.innerHeight;
  root.style.setProperty('--wn-est-avail', Math.max(240, Math.floor(avail - 28)) + 'px');
}

// ─── 데이터 계약 접근 (data.js 가 아직 없을 수 있으므로 가드) ───
const _wnApiReady = () => typeof EstimateAPI !== 'undefined' && typeof ELOAD !== 'undefined' && typeof EST !== 'undefined';
const _wnStatus = () => _wnApiReady() ? ELOAD.status : 'unavailable';
const _wnEstimates = () => (_wnApiReady() && Array.isArray(EST.estimates)) ? EST.estimates : [];
const _wnSales = () => (_wnApiReady() && Array.isArray(EST.sales)) ? EST.sales : [];
function _wnEstById(id) {
  if (!id) return null;
  if (typeof estimateById === 'function') return estimateById(id) || null;
  return _wnEstimates().find(e => e.id === id) || null;
}
function _wnSalesName(id) {
  if (!id) return '';
  if (typeof salesName === 'function') return salesName(id) || '';
  return (_wnSales().find(s => s.id === id) || {}).name || '';
}
const _wnVersions = id => (_wnApiReady() && EST.versions && Array.isArray(EST.versions[id])) ? EST.versions[id] : null;
function _wnLatestVersion(id) {
  if (typeof latestEstimateVersion === 'function') { const v = latestEstimateVersion(id); if (v) return v; }
  const vs = _wnVersions(id);
  return vs && vs.length ? vs[vs.length - 1] : null;
}
const _wnCanDelete = est => !!est && _wnApiReady() && typeof EstimateAPI.canDelete === 'function' && EstimateAPI.canDelete(est);
const _wnToast = m => { if (typeof showToast === 'function') showToast(m); };
const _wnE = v => esc(v == null ? '' : v);
const _wnOnScreen = () => typeof document !== 'undefined' && !!document.getElementById('wnEst') && (typeof state === 'undefined' || state.viewMode === 'wisenm');
const $wn = id => document.getElementById(id);

// ─── 날짜 표시 ───
const _wnP2 = n => String(n).padStart(2, '0');
function _wnFmtDate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? '' : `${d.getFullYear()}-${_wnP2(d.getMonth() + 1)}-${_wnP2(d.getDate())}`;
}
function _wnFmtDT(s) {
  const d = new Date(s);
  return !s || isNaN(d) ? '' : `${_wnFmtDate(s)} ${_wnP2(d.getHours())}:${_wnP2(d.getMinutes())}`;
}
function _wnFmtShort(s) {
  const d = new Date(s);
  return !s || isNaN(d) ? '' : `${_wnP2(d.getMonth() + 1)}/${_wnP2(d.getDate())}`;
}

// ─── 포커스 보존 (부분 렌더 후 같은 요소로 복귀) ───
function _wnFocusKey(el) {
  if (!el || !el.closest || !el.closest('#wnEst')) return null;
  let sel = null;
  if (el.id) sel = '#' + el.id;
  else {
    const a = ['data-si', 'data-role', 'data-var', 'data-id', 'data-pt'].find(k => el.hasAttribute(k));
    if (a && el.classList[0]) sel = `${el.tagName.toLowerCase()}.${el.classList[0]}[${a}="${String(el.getAttribute(a)).replace(/["\\]/g, '\\$&')}"]`;
  }
  if (!sel) return null;
  let s = null, e = null;
  try { s = el.selectionStart; e = el.selectionEnd; } catch (_) {}
  return { sel, s, e };
}
function _wnRestoreFocus(k) {
  if (!k) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && document.contains(ae)) return;
  let el = null;
  try { el = document.querySelector(k.sel); } catch (_) {}
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  if (k.s != null) { try { el.setSelectionRange(k.s, k.e); } catch (_) {} }
}
function _wnKeepFocus(fn) {
  const k = _wnFocusKey(document.activeElement);
  fn();
  _wnRestoreFocus(k);
}

// ═══════════════════════════════════════════════════════════
// 진입점
// ═══════════════════════════════════════════════════════════
function renderWisenmView() {
  _wnInitModals();
  const host = $wn('grid-container');
  if (!host) return;
  _wnKeepFocus(() => {
    host.innerHTML = `<div class="wn-est" id="wnEst">
      <aside class="wn-est-list${_wn.listOpen ? ' is-open' : ''}" id="wnEstList" aria-label="산정 기록 목록"></aside>
      <section class="wn-est-main" id="wnEstMain" aria-label="공수 산정표">
        <div id="wnEstGuard"></div>
        <div class="wn-est-status" id="wnEstStatus">
          <span class="wn-est-state" id="wnEstState" role="status" aria-live="polite"></span>
          <div class="wn-est-status-body" id="wnEstStatusBody"></div>
        </div>
        <div id="wnSheet"></div>
      </section>
      <aside class="wn-est-info${_wn.infoOpen ? ' is-open' : ''}" id="wnEstInfo" aria-label="산정 정보"></aside>
    </div>`;
    _wnRenderList();
    _wnRenderMain();
    _wnRenderInfo();
  });
  if (_wn.pending) _wnSetBusy(true);
  _wnSyncPanelMax();
  _wnEnsureLoad();
}

// 좁은 화면 접이식 패널 열고 닫기 + 토글 버튼 동기화
function _wnSetFold(kind, open) {
  const key = kind === 'list' ? 'listOpen' : 'infoOpen';
  _wn[key] = !!open;
  if (typeof document === 'undefined') return;
  $wn(kind === 'list' ? 'wnEstList' : 'wnEstInfo')?.classList.toggle('is-open', _wn[key]);
  const btn = $wn(kind === 'list' ? 'wnListToggle' : 'wnInfoToggle');
  if (btn) { btn.setAttribute('aria-expanded', String(_wn[key])); btn.textContent = _wn[key] ? '접기' : '펼치기'; }
}

// 포커스가 산정표/정보 패널의 입력 칸에 있으면 그 영역은 다시 그리지 않는다(입력 중 값·IME 보호)
function _wnTypingInside() {
  const ae = document.activeElement;
  return !!(ae && ae.closest && ae.closest('#wnEstMain, #wnEstInfo') && ae.matches('input, textarea, select'));
}
// 정보 패널을 다시 그리지 않고 영업 select·안내만 갱신
function _wnRefreshSalesSelect() {
  const sel = $wn('wnHdSales');
  if (!sel || document.activeElement === sel) return;
  const so = _wnSalesOptions(_wn.header.salesId);
  sel.innerHTML = so.html;
  sel.disabled = _wnStatus() !== 'ok';
  const hint = $wn('wnHdSalesHint');
  if (hint) hint.innerHTML = _wnSalesHint(so);
}

function _wnEnsureLoad() {
  if (!_wnApiReady() || _wn._loading) return;
  if (ELOAD.status === 'idle' || ELOAD.status === 'loading') _wnStartLoad();
}
function _wnStartLoad() {
  if (!_wnApiReady() || _wn._loading) return;
  _wn._loading = true;
  Promise.resolve().then(() => EstimateAPI.load()).catch(() => {}).then(() => {
    _wn._loading = false;
    if (!_wnOnScreen()) return;
    // 현재 기록이 사라졌으면(다른 곳에서 삭제) 새 산정으로
    if (_wn.est && !_wnEstById(_wn.est) && !_wn.dirty) _wnNewState();
    if (_wnTypingInside()) {
      // 입력 중: 목록·상태 줄·영업 select 만 갱신
      _wnKeepFocus(() => { _wnRenderList(); if (!$wn('wnEstDel')?.dataset.confirming) _wnRenderStatus(); });
      _wnRefreshSalesSelect();
    } else {
      _wnKeepFocus(() => { _wnRenderList(); _wnRenderMain(); _wnRenderInfo(); });
    }
    // 다시 불러오면 이력 캐시가 비므로 현재 기록의 이력을 뒤에서 채운다(최근 이력·마지막 저장 표시용)
    const id = _wn.est;
    if (id && _wnEstById(id) && !_wnVersions(id) && ELOAD.status === 'ok') {
      Promise.resolve().then(() => EstimateAPI.loadVersions(id))
        .then(() => { if (_wn.est === id && _wnOnScreen()) { _wnRenderHistMini(); if (_wn.viewVersion == null && !$wn('wnEstDel')?.dataset.confirming) _wnKeepFocus(_wnRenderStatus); } })
        .catch(() => {});
    }
  });
  if (_wnOnScreen()) _wnKeepFocus(_wnRenderList);
}

function _wnRenderMain() { _wnRenderStatus(); _wnRenderSheet(); }

// ═══════════════════════════════════════════════════════════
// 왼쪽: 기록 목록
// ═══════════════════════════════════════════════════════════
function _wnPanelHd(kind, title, extra) {
  const open = kind === 'list' ? _wn.listOpen : _wn.infoOpen;
  const bodyId = kind === 'list' ? 'wnListBody' : 'wnInfoBody';
  return `<div class="wn-est-panel-hd">
    <h3 class="wn-est-panel-title" id="${kind === 'list' ? 'wnListTitle' : 'wnInfoTitle'}">${title}</h3>
    ${extra || ''}
    <button type="button" class="wn-est-fold" id="${kind === 'list' ? 'wnListToggle' : 'wnInfoToggle'}" aria-controls="${bodyId}" aria-expanded="${open}">${open ? '접기' : '펼치기'}</button>
  </div>`;
}
function _wnBindFold(kind) {
  const btn = $wn(kind === 'list' ? 'wnListToggle' : 'wnInfoToggle');
  if (!btn) return;
  btn.onclick = () => _wnSetFold(kind, !(kind === 'list' ? _wn.listOpen : _wn.infoOpen));
}

function _wnRenderList() {
  const el = $wn('wnEstList');
  if (!el) return;
  const st = _wnStatus();
  const n = _wnEstimates().length;
  const newBtn = `<button type="button" class="btn-primary wn-est-btn" id="wnEstNew">+ 새 산정</button>`;
  let body;
  if (st === 'ok') {
    const sales = _wnSales().slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ko'));
    if (_wn.salesFilter && _wn.salesFilter !== '__none' && !sales.some(s => s.id === _wn.salesFilter)) _wn.salesFilter = '';
    body = `<div class="wn-est-tools">
        <input type="search" class="form-input wn-est-search" id="wnEstSearch" placeholder="건명·고객·영업·참여자 검색" aria-label="산정 기록 검색" value="${_wnE(_wn.q)}" autocomplete="off">
        <select class="form-select" id="wnEstSalesFilter" aria-label="담당 영업으로 거르기">
          <option value="">영업 전체</option>
          <option value="__none"${_wn.salesFilter === '__none' ? ' selected' : ''}>담당 없음</option>
          ${sales.map(s => `<option value="${_wnE(s.id)}"${_wn.salesFilter === s.id ? ' selected' : ''}>${_wnE(s.name)}${s.active === false ? ' (비활성)' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="wn-est-items" id="wnEstItems" role="listbox" aria-labelledby="wnListTitle"></div>`;
  } else {
    const gate = {
      unavailable: ['is-error', '기록 기능을 사용할 수 없습니다', '데이터 모듈(EstimateAPI)이 로드되지 않았습니다. 산정표 계산은 그대로 쓸 수 있습니다.', false],
      idle:    ['', '불러오는 중…', '산정 기록을 불러오고 있습니다.', false],
      loading: ['', '불러오는 중…', '산정 기록을 불러오고 있습니다.', false],
      missing: ['is-error', '산정 기록 테이블이 없습니다', '<b>sql/estimates.sql</b> 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도하세요.', true],
      error:   ['is-error', '산정 기록을 불러오지 못했습니다',
        `<ul>${((typeof ELOAD !== 'undefined' && ELOAD.errors) || []).map(e => `<li><b>${_wnE(e.table)}</b> — ${_wnE(e.message)}</li>`).join('')}</ul>`, true],
    }[st] || ['is-error', '알 수 없는 상태', '', true];
    body = `<div class="wn-est-gate ${gate[0]}" role="${gate[0] ? 'alert' : 'status'}">
      <h4>${gate[1]}</h4><div>${gate[2]}</div>
      ${gate[3] ? `<button type="button" class="btn-ghost wn-est-btn" id="wnEstRetry">다시 시도</button>` : ''}</div>`;
  }
  el.innerHTML = _wnPanelHd('list', `산정 기록${st === 'ok' ? ` <span class="wn-est-count">${n}</span>` : ''}`, newBtn)
    + `<div class="wn-est-panel-body" id="wnListBody">${body}</div>`;
  _wnBindFold('list');
  $wn('wnEstNew').onclick = () => _wnRequestNew();
  const retry = $wn('wnEstRetry');
  if (retry) retry.onclick = () => { retry.disabled = true; retry.textContent = '불러오는 중…'; _wnStartLoad(); };
  if (st !== 'ok') return;

  const search = $wn('wnEstSearch');
  search.addEventListener('input', () => { _wn.q = search.value; _wnRenderItems(); });
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; _wn.q = ''; _wnRenderItems(); }
    else if (e.key === 'ArrowDown') { const f = document.querySelector('#wnEstItems .wn-est-item'); if (f) { e.preventDefault(); f.focus(); } }
  });
  $wn('wnEstSalesFilter').onchange = e => { _wn.salesFilter = e.target.value; _wnRenderItems(); };

  const items = $wn('wnEstItems');
  items.addEventListener('click', e => { const it = e.target.closest('.wn-est-item'); if (it) _wnRequestSelect(it.dataset.id); });
  items.addEventListener('keydown', e => {
    const it = e.target.closest('.wn-est-item'); if (!it) return;
    const all = [...items.querySelectorAll('.wn-est-item')], i = all.indexOf(it);
    let t = null;
    if (e.key === 'ArrowDown') t = all[i + 1];
    else if (e.key === 'ArrowUp') t = all[i - 1] || null;
    else if (e.key === 'Home') t = all[0];
    else if (e.key === 'End') t = all[all.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _wnRequestSelect(it.dataset.id); return; }
    else return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) { search.focus(); return; }
    if (t) { all.forEach(x => { x.tabIndex = -1; }); t.tabIndex = 0; t.focus(); }
  });
  _wnRenderItems();
}

function _wnFilteredEstimates() {
  const q = _wn.q.trim().toLowerCase();
  const f = _wn.salesFilter;
  return _wnEstimates().filter(e => {
    if (f === '__none' && e.salesId) return false;
    if (f && f !== '__none' && e.salesId !== f) return false;
    if (!q) return true;
    const proj = e.projectId && typeof getProject === 'function' ? (getProject(e.projectId) || {}).name || '' : '';
    const hay = [e.title, e.client, _wnSalesName(e.salesId), proj, ...(e.participants || []).map(p => `${p.name} ${p.role || ''}`)].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function _wnRenderItems() {
  const box = $wn('wnEstItems');
  if (!box) return;
  const list = _wnFilteredEstimates();
  const cur = _wn.pending || _wn.est;
  if (!list.length) {
    box.innerHTML = `<div class="wn-est-empty">${_wnEstimates().length ? '조건에 맞는 기록이 없습니다.' : '저장된 산정 기록이 없습니다.<br>산정표를 작성하고 저장하세요.'}</div>`;
    return;
  }
  const hasSel = list.some(e => e.id === cur);
  box.innerHTML = list.map((e, i) => {
    const sel = e.id === cur;
    const sales = _wnSalesName(e.salesId);
    const parts = Array.isArray(e.participants) ? e.participants : [];
    const chips = parts.slice(0, 3).map(p => `<span class="wn-est-chip">${_wnE(p.name)}</span>`).join('')
      + (parts.length > 3 ? `<span class="wn-est-chip wn-est-chip-more">+${parts.length - 3}</span>` : '');
    const proj = e.projectId && typeof getProject === 'function' ? getProject(e.projectId) : null;
    const total = Number(e.totalMm);
    return `<div class="wn-est-item${sel ? ' is-sel' : ''}" role="option" data-id="${_wnE(e.id)}" aria-selected="${sel}" tabindex="${sel || (!hasSel && i === 0) ? 0 : -1}">
      <div class="wn-est-item-top">
        <span class="wn-est-item-title">${_wnE(e.title || '(건명 없음)')}</span>
        <span class="wn-est-item-mm">${Number.isFinite(total) ? total.toFixed(1) : '-'}<small>M/M</small></span>
      </div>
      <div class="wn-est-item-sub">${_wnE(e.client || '고객사 미입력')}${sales ? ` · ${_wnE(sales)}` : ''}</div>
      <div class="wn-est-item-meta">산정 ${_wnE(_wnFmtDate(e.estimatedOn) || '-')} · 수정 ${_wnE(_wnFmtDate(e.updatedAt) || '-')} · v${_wnE(e.currentVersion ?? '-')}${sel && _wn.pending ? ' · 불러오는 중…' : ''}</div>
      ${chips || proj ? `<div class="wn-est-tags">${chips}${proj ? `<span class="wn-est-chip wn-est-ptag" title="연결 프로젝트">${_wnE(proj.name)}</span>` : ''}</div>` : ''}
    </div>`;
  }).join('');
}

// ─── 기록 전환 / 새 산정 / 복제 / 삭제 ───
function _wnRequestSelect(id) {
  if (!id || _wn.pending === id) return;
  if (id === _wn.est) {
    if (_wn.viewVersion != null) _wnExitView();
    return;
  }
  _wnGuard(() => {
    // 좁은 화면: 고른 뒤 목록을 접고 토글 버튼으로 포커스(숨은 항목에 포커스가 남지 않게)
    const wasOpen = _wn.listOpen;
    _wnSetFold('list', false);
    const t = $wn('wnListToggle');
    if (wasOpen && t && t.offsetParent !== null) t.focus({ preventScroll: true });
    _wnSelect(id);
  }, { msg: '저장하지 않은 변경 사항이 있습니다. 버리고 다른 기록을 열까요?' });
}
function _wnRequestNew() {
  _wnGuard(() => {
    _wnNewState();
    if (!_wnOnScreen()) return;
    _wnRenderItems(); _wnRenderMain(); _wnRenderInfo();
    _wnSetFold('info', true);
    $wn('wnHdTitle')?.focus();
  }, { msg: '저장하지 않은 변경 사항이 있습니다. 버리고 새 산정을 시작할까요?' });
}

async function _wnSelect(id) {
  const est = _wnEstById(id);
  if (!est || !_wnApiReady()) return;
  const wasView = _wn.viewVersion != null;
  _wn.viewVersion = null; _wn.view = null;
  _wn.pending = id;
  _wnKeepFocus(() => {
    _wnRenderItems();
    if (wasView) { _wnRenderMain(); _wnRenderInfo(); } else _wnUpdateDirtyUI();
  });
  _wnSetBusy(true);
  let vers;
  try { vers = await EstimateAPI.loadVersions(id); }
  catch (e) {
    if (_wn.pending !== id) return;
    _wn.pending = null; _wnSetBusy(false);
    _wnToast('기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
    _wnRenderItems(); _wnUpdateDirtyUI();
    return;
  }
  if (_wn.pending !== id) return;
  _wn.pending = null; _wnSetBusy(false);
  const cur = _wnEstById(id) || est;
  const list = Array.isArray(vers) ? vers : (_wnVersions(id) || []);
  const ver = list.find(v => Number(v.version) === Number(cur.currentVersion)) || list[list.length - 1];
  if (!ver || !ver.snapshot) {
    _wnToast('이 기록의 저장 내용을 찾지 못했습니다.');
    _wnRenderItems(); _wnUpdateDirtyUI();
    return;
  }
  const finish = () => {
    _wnApply(cur, ver);
    if (_wnOnScreen()) _wnKeepFocus(() => { _wnRenderItems(); _wnRenderMain(); _wnRenderInfo(); });
  };
  // 불러오는 동안(복제 대기 등) 편집이 생겼으면 덮어쓰기 전에 확인
  if (_wn.dirty && _wnOnScreen()) {
    _wnRenderItems(); _wnUpdateDirtyUI();
    _wnGuard(finish, { msg: '불러오는 동안 바뀐 내용이 있습니다. 버리고 선택한 기록을 열까요?', discard: '버리고 열기' });
  } else finish();
}
// 기록 열기: salesId/projectId 는 기록 행(est)이 정본(null 포함 — 삭제된 프로젝트가 스냅샷에서 되살아나지 않게),
// 나머지 머리말은 행 값이 없을 때만 스냅샷 header 로 대체
function _wnApply(est, ver) {
  const snap = ver.snapshot || {};
  const sh = snap.header || {};
  const pick = (k, d) => est[k] !== undefined && est[k] !== null ? est[k] : (sh[k] !== undefined ? sh[k] : d);
  const ref = k => ('salesId' in est || 'projectId' in est) ? (est[k] || null) : (sh[k] || null);
  _wn.est = est.id;
  _wn.baseVersion = Number(ver.version) || 0;
  _wn.viewVersion = null; _wn.view = null; _wn.restoredFrom = null;
  _wn.basis = _wnNormalizeBasis(snap.basis);
  _wn.inputs = _wnNormalizeInputs(snap.inputs);
  _wn.header = _wnNormalizeHeader({
    title: pick('title', ''), client: pick('client', ''), salesId: ref('salesId'), projectId: ref('projectId'),
    estimatedOn: pick('estimatedOn', ''), participants: pick('participants', []), memo: pick('memo', ''),
  });
  _wnSetBaseline();
}
// 불러오는 중: 산정표·정보 패널을 inert 로 막아 옛 기록 편집을 방지
function _wnSetBusy(on) {
  ['wnEstMain', 'wnEstInfo'].forEach(id => {
    const m = $wn(id);
    if (!m) return;
    m.inert = !!on;
    if (on) m.setAttribute('aria-busy', 'true'); else m.removeAttribute('aria-busy');
  });
}

function _wnCopy(btn) {
  const id = _wn.est;
  if (!id || !_wnApiReady()) return;
  _wnGuard(async () => {
    if (btn && btn.isConnected) { btn.disabled = true; btn.textContent = '복제 중…'; }
    _wnSetBusy(true);   // 복제가 끝나 새 기록을 열 때까지 편집 막음
    let ne = null;
    try { ne = await EstimateAPI.copy(id); } catch (e) { ne = null; }
    if (!_wn.pending) _wnSetBusy(false);
    if (!ne || !ne.id) {
      _wnToast('복제하지 못했습니다.');
      if (_wnOnScreen()) _wnRenderStatus();
      return;
    }
    _wnToast(`복제했습니다: ${ne.title || ''}`);
    if (_wnOnScreen()) _wnRenderList();
    _wnSelect(ne.id);
  }, { msg: '저장하지 않은 변경은 복제에 포함되지 않습니다(저장된 최신 버전을 복제). 버리고 복제할까요?', discard: '버리고 복제' });
}

function _wnDelete(btn) {
  const id = _wn.est;
  if (!id || typeof confirmable !== 'function') return;
  confirmable(btn, async () => {
    btn.disabled = true;
    let r;
    try { r = await EstimateAPI.remove(id); } catch (e) { r = 'error'; }
    if (r === true) {
      if (_wn.est === id) _wnNewState();
      _wnToast('산정 기록을 삭제했습니다.');
      if (_wnOnScreen()) { _wnRenderList(); _wnRenderMain(); _wnRenderInfo(); $wn('wnEstNew')?.focus(); }
    } else {
      _wnToast(r === 'not-owner' ? '만든 사람만 삭제할 수 있습니다.' : '삭제하지 못했습니다. 다시 시도하세요.');
      if (_wnOnScreen()) { _wnRenderList(); _wnRenderStatus(); }
    }
  });
}

// ─── 미저장 확인 바 (화면 안 / 모달 안 공용) ───
// opts: { host: 바를 넣을 요소 id(기본 wnEstGuard), msg, discard: 버리기 버튼 문구 }
function _wnGuard(proceed, opts = {}) {
  if (!_wn.dirty) { proceed(); return; }
  const hostId = opts.host || 'wnEstGuard';
  const host = $wn(hostId);
  if (!host) { proceed(); return; }
  // 이미 바가 떠 있으면 처음 바를 띄우기 전 포커스 위치를 그대로 유지(사라질 이전 바 버튼으로 덮지 않음)
  if (!host.firstElementChild || !host._wnPrev) host._wnPrev = document.activeElement;
  const prev = host._wnPrev;
  host.innerHTML = `<div class="wn-est-guard" role="alert">
    <span class="wn-est-guard-msg" id="${hostId}Msg">${_wnE(opts.msg || '저장하지 않은 변경 사항이 있습니다.')}</span>
    <span class="wn-est-guard-btns">
      <button type="button" class="btn-ghost wn-est-btn" data-g="keep">계속 편집</button>
      <button type="button" class="btn-danger wn-est-btn" data-g="discard">${_wnE(opts.discard || '버리고 이동')}</button>
    </span></div>`;
  const bar = host.firstElementChild;
  const keep = () => {
    host.innerHTML = ''; host._wnPrev = null;
    if (prev && document.contains(prev) && prev.focus) prev.focus({ preventScroll: true });
  };
  bar.querySelector('[data-g="keep"]').onclick = keep;
  bar.querySelector('[data-g="discard"]').onclick = () => {
    host.innerHTML = ''; host._wnPrev = null;
    _wnRevert();
    if (_wnOnScreen()) { _wnRenderMain(); _wnRenderInfo(); }   // 화면도 저장본으로(이후 동작이 실패해도 상태와 화면이 일치)
    proceed();
  };
  bar.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); keep(); } });
  const k = bar.querySelector('[data-g="keep"]');
  k.focus({ preventScroll: true });
  if (bar.scrollIntoView) bar.scrollIntoView({ block: 'nearest' });
}

// ═══════════════════════════════════════════════════════════
// 가운데: 상태 줄
// ═══════════════════════════════════════════════════════════
function _wnCanSave() {
  return _wnApiReady() && ELOAD.status === 'ok' && _wn.viewVersion == null && !_wn.pending && !_wn.saving && (_wn.dirty || !_wn.est);
}
// 상태 줄: aria-live 영역(#wnEstState)은 정적 골격에 두고, 나머지(#wnEstStatusBody)만 다시 그린다
function _wnRenderStatus() {
  const wrap = $wn('wnEstStatus'), el = $wn('wnEstStatusBody');
  if (!wrap || !el) return;
  if (_wn.viewVersion != null && _wn.view) {
    const v = _wn.view.ver || {};
    wrap.className = 'wn-est-status is-view';
    el.innerHTML = `<span class="wn-est-meta">${_wnE(_wnFmtDT(v.savedAt))}${v.savedByEmail ? ' · ' + _wnE(v.savedByEmail) : ''}${v.reason ? ' · ' + _wnE(v.reason) : ''} · 그때 기준표</span>
      <span class="wn-est-sp"></span>
      <button type="button" class="btn-ghost wn-est-btn" id="wnViewBack">편집으로 돌아가기</button>
      <button type="button" class="btn-primary wn-est-btn" id="wnViewRestore">이 버전으로 복원</button>`;
    $wn('wnViewBack').onclick = () => { _wnExitView(); $wn('wnEstSave')?.focus(); };
    $wn('wnViewRestore').onclick = () => _wnRequestRestore(_wn.est, _wn.viewVersion, 'wnEstGuard');
    _wnUpdateDirtyUI();
    return;
  }
  const est = _wnEstById(_wn.est);
  const last = est ? _wnLatestVersion(est.id) : null;
  const when = est ? (last && last.savedAt) || est.updatedAt : '';
  const meta = est
    ? `마지막 저장 ${_wnE(_wnFmtDT(when) || '-')}${last && last.savedByEmail ? ' · ' + _wnE(last.savedByEmail) : ''}`
    : (_wnStatus() === 'ok' ? '아직 저장하지 않은 새 산정입니다.' : '');
  wrap.className = 'wn-est-status';
  el.innerHTML = `<span class="wn-est-meta">${meta}</span>
    <span class="wn-est-sp"></span>
    <button type="button" class="btn-ghost wn-est-btn" id="wnEstHist"${est ? '' : ' disabled'} aria-label="산정 이력 보기">이력</button>
    <button type="button" class="btn-ghost wn-est-btn" id="wnEstCopy"${est ? '' : ' disabled'} aria-label="이 기록 복제">복제</button>
    ${_wnCanDelete(est) ? `<button type="button" class="btn-danger wn-est-btn" id="wnEstDel" title="이 기록 삭제(만든 사람만)">삭제</button>` : ''}
    <button type="button" class="btn-primary wn-est-btn" id="wnEstSave">저장</button>`;
  $wn('wnEstHist').onclick = () => _wnOpenHistory();
  $wn('wnEstCopy').onclick = e => _wnCopy(e.currentTarget);
  const del = $wn('wnEstDel'); if (del) del.onclick = () => _wnDelete(del);
  $wn('wnEstSave').onclick = () => _wnOpenSave();
  _wnUpdateDirtyUI();
}
// 입력마다 호출되는 가벼운 갱신: 상태 문구와 저장 버튼만
function _wnUpdateDirtyUI() {
  const s = $wn('wnEstState');
  if (s) {
    let txt, cls;
    if (_wn.viewVersion != null && _wn.view) { txt = `v${_wn.viewVersion} 보기 · 읽기 전용`; cls = 'is-view'; }
    else if (_wn.pending) { txt = '불러오는 중…'; cls = 'is-new'; }
    else if (_wn.dirty) { txt = _wn.est ? `저장 안 됨 · v${_wn.baseVersion} 기준` : '저장 안 됨 · 새 산정'; cls = 'is-dirty'; }
    else if (_wn.est) { txt = `저장됨 v${_wn.baseVersion}`; cls = 'is-saved'; }
    else { txt = '새 산정'; cls = 'is-new'; }
    if (s.textContent !== txt) s.textContent = txt;
    s.className = 'wn-est-state ' + cls;
  }
  const b = $wn('wnEstSave');
  if (b) {
    const ok = _wnCanSave();
    b.disabled = !ok;
    b.title = ok ? '' : (!_wnApiReady() || ELOAD.status !== 'ok') ? '산정 기록을 불러온 뒤 저장할 수 있습니다' : (_wn.est && !_wn.dirty ? '변경 사항이 없습니다' : '');
  }
}
function _wnTouch() {
  if (_wn.viewVersion != null) return;
  _wn.dirty = _wnEditSnap() !== _wn._baseline;
  _wnUpdateDirtyUI();
}

// ═══════════════════════════════════════════════════════════
// 가운데: 기준표 (기존 모양·동작 유지)
// ═══════════════════════════════════════════════════════════
function _wnSheetHtml(basis, I, c, ro) {
  const dis = ro ? ' disabled' : '';
  const roles = basis.roles, vars = basis.vars;
  const catColor = cat => WN_CAT_COLORS[cat] || WN_VAR_COLOR;

  // 카테고리별 rowspan 계산
  const catSpan = {};
  roles.forEach(r => { catSpan[r.cat] = (catSpan[r.cat] || 0) + 1; });
  const catSeen = {};

  // 역할 행
  let rolesHtml = '';
  roles.forEach(r => {
    const mm = c.mms[r.id];
    const isCustom = I.custom[r.id] !== undefined;
    const isChecked = I.roleChecked[r.id] !== false;
    const col = catColor(r.cat);
    let catCell = '';
    if (!catSeen[r.cat]) {
      catSeen[r.cat] = true;
      catCell = `<td class="wn-cat-cell" rowspan="${catSpan[r.cat]}" style="background:${col}15">
        <span class="wn-cat-chip" style="background:${col};color:#fff">${_wnE(r.cat)}</span>
      </td>`;
    }
    rolesHtml += `<tr class="wn-role-row${!isChecked ? ' wn-row-dimmed' : ''}">
      ${catCell}
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="role" data-id="${_wnE(r.id)}" ${isChecked ? 'checked' : ''}${dis} aria-label="${_wnE(r.name)} 포함"></td>
      <td class="wn-td-name" title="${_wnE(r.note)}">${_wnE(r.name)}</td>
      <td class="wn-td-scale"><span class="wn-scale-badge${r.scale !== 'fixed' ? ' scale-var' : ' scale-fix'}">${r.scale === 'dev' ? '비례' : r.scale === 'linear' ? '기간 비례' : '고정'}</span><span class="wn-scale-desc">${_wnE(_wnScaleDesc(r))}</span></td>
      <td class="wn-td-mm">
        <input class="wn-mm-input${isCustom ? ' is-custom' : ''}" type="number" step="0.5" min="0" value="${_wnE(mm)}" data-role="${_wnE(r.id)}"${dis} aria-label="${_wnE(r.name)} M/M">
      </td>
      <td class="wn-td-note wn-est-note-col">${_wnE(r.note)}</td>
    </tr>`;
  });

  // SI 섹션
  const siCustom = c.si.override;
  const siVarChecked = I.varChecked['si'] === true;
  const siDef = vars.find(v => v.id === 'si');
  const siItemsHtml = I.siItems.map(it => `
    <tr class="wn-si-item${!siVarChecked ? ' wn-row-dimmed' : ''}">
      <td colspan="6">
        <div class="wn-si-item-row">
          <input type="checkbox" class="wn-si-chk" data-si="${_wnE(it.id)}" ${it.checked ? 'checked' : ''}${dis} aria-label="${_wnE(it.name)} 포함">
          <input type="text" class="wn-si-name" data-si="${_wnE(it.id)}" value="${_wnE(it.name)}"${dis} aria-label="부가 항목 이름">
          <input type="number" class="wn-si-mm" step="0.5" min="0" data-si="${_wnE(it.id)}" value="${_wnE(it.mm)}"${dis} aria-label="${_wnE(it.name)} M/M">
          <span class="wn-td-unit">M/M</span>
          ${ro ? '' : `<button class="wn-si-del" data-si="${_wnE(it.id)}" aria-label="${_wnE(it.name)} 삭제">✕</button>`}
        </div>
      </td>
    </tr>`).join('');
  const siHtml = !siDef ? '' : `
    <tr class="wn-var-row wn-si-main-row${!siVarChecked ? ' wn-row-dimmed' : ''}">
      <td class="wn-cat-cell" style="background:${WN_VAR_COLOR}15">
        <span class="wn-cat-chip" style="background:${WN_VAR_COLOR};color:#fff">별도</span>
      </td>
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="var" data-id="si" ${siVarChecked ? 'checked' : ''}${dis} aria-label="SI 커스터마이징 포함"></td>
      <td class="wn-td-name" title="CRM 연동, 업무 특화 기능">SI 커스터마이징</td>
      <td></td>
      <td class="wn-td-mm">
        <input class="wn-var-input${siCustom ? ' is-custom' : ''}" id="wnSiInput" type="number" step="0.5" min="0"
          value="${_wnE(c.si.value)}" placeholder="별도 산정" data-var="si"${dis} aria-label="SI 커스터마이징 M/M">
        ${c.si.hasChecked && !siCustom ? `<span class="wn-si-badge">${_wnE(c.si.sum)} M/M</span>` : ''}
      </td>
      <td class="wn-td-note wn-est-note-col">CRM 연동, 업무 특화 기능</td>
    </tr>
    <tr class="wn-si-subhd${!siVarChecked ? ' wn-row-dimmed' : ''}">
      <td colspan="6">
        <div class="wn-si-subhd-bar">
          <span>부가 항목</span>
          ${ro ? '' : `<button class="wn-si-add" id="wnSiAdd">+ 추가</button>`}
        </div>
      </td>
    </tr>
    ${siItemsHtml}`;

  // 나머지 var 행
  const otherVarsHtml = vars.filter(v => v.id !== 'si').map(v => {
    const val = I.vars[v.id] !== undefined ? I.vars[v.id] : '';
    const isVarChecked = I.varChecked[v.id] === true;
    const unitPrefix = v.unit !== 'M/M' ? `<span class="wn-td-unit" style="margin-right:4px">${_wnE(v.unit)}</span>` : '';
    return `<tr class="wn-var-row${!isVarChecked ? ' wn-row-dimmed' : ''}">
      <td class="wn-cat-cell" style="background:${WN_VAR_COLOR}15">
        <span class="wn-cat-chip" style="background:${WN_VAR_COLOR};color:#fff">별도</span>
      </td>
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="var" data-id="${_wnE(v.id)}" ${isVarChecked ? 'checked' : ''}${dis} aria-label="${_wnE(v.name)} 포함"></td>
      <td class="wn-td-name" title="${_wnE((v.unit !== 'M/M' ? v.unit + ' · ' : '') + v.note)}">${_wnE(v.name)}</td>
      <td class="wn-td-scale">${v.scale ? `<span class="wn-scale-desc">${_wnE(v.scale)}</span>` : ''}</td>
      <td class="wn-td-mm">
        <input class="wn-var-input" type="number" step="0.5" min="0" placeholder="${_wnE(v.placeholder || '')}" value="${_wnE(val)}" data-var="${_wnE(v.id)}"${dis} aria-label="${_wnE(v.name)} ${_wnE(v.unit)}">
      </td>
      <td class="wn-td-note wn-est-note-col">${unitPrefix}${_wnE(v.note)}</td>
    </tr>`;
  }).join('');

  const total = c.total.toFixed(1);
  return `
    <div class="wn-wrap">
      <div class="wn-topbar">
        <div class="wn-topbar-left">
          <span class="wn-badge">WiseN TM</span>
          <span class="wn-title">공수 산정 기준표</span>
          <span class="wn-subtitle">하드웨어 포함 고객사 납품 기준 · 커스터마이징 없음</span>
        </div>
        <div class="wn-topbar-right">
          <div class="wn-total-kpi">
            <span class="wn-total-label">총 공수</span>
            <span class="wn-total-val" id="wnTotalMM">${total}</span>
            <span class="wn-total-unit">M/M</span>
          </div>
          <div class="wn-dur-block">
            <span class="wn-dur-label">기간</span>
            <div class="wn-dur-controls">
              <button class="wn-dur-btn" id="wnDurMinus"${dis} aria-label="기간 1개월 줄이기">−</button>
              <span class="wn-dur-val" id="wnDurVal">${_wnE(I.dur)}<em>개월</em></span>
              <button class="wn-dur-btn" id="wnDurPlus"${dis} aria-label="기간 1개월 늘리기">+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="wn-body">
        <div class="wn-section">
          <table class="wn-table">
            <colgroup>
              <col style="width:60px">
              <col style="width:32px">
              <col style="width:150px">
              <col style="width:200px">
              <col style="width:100px">
              <col class="wn-est-note-col">
            </colgroup>
            <thead><tr>
              <th>구분</th><th></th><th>역할</th><th>산정방식</th><th>M/M</th><th class="wn-est-note-col">비고</th>
            </tr></thead>
            <tbody>${rolesHtml}${otherVarsHtml}${siHtml}</tbody>
            <tfoot><tr class="wn-total-row">
              <td colspan="4">합계</td>
              <td><span class="wn-total-ft" id="wnTotalFt">${total}</span> <span class="wn-td-unit">M/M</span></td>
              <td class="wn-est-note-col"></td>
            </tr></tfoot>
          </table>
        </div>

        <div class="wn-est-excl" id="wnExcluded">${_wnExclHtml(c)}</div>

        <div class="wn-footnote">
          <span class="wn-fn-title">기준 가정</span>
          서버 4~5개 단일 컨테이너 구성 · 하드웨어(법인폰 포함) 고객사 직납 · CRM/콜센터 연동 없음 ·
          <strong>기간 비례:</strong> PM·PL·AOS·BE·FE &nbsp;<strong>고정:</strong> TA·인프라·보안
        </div>
      </div>
    </div>`;
}
function _wnExclHtml(c) {
  if (!c.excluded.length) return '';
  const parts = c.excluded.map(x => `${_wnE(x.name)}${x.checked && x.value !== '' ? ` <b>${_wnE(x.value)} ${_wnE(x.unit)}</b>` : ''}`);
  return `<span class="wn-est-excl-lbl">총공수 미포함</span> ${parts.join(' · ')}`;
}

function _wnRenderSheet() {
  const el = $wn('wnSheet');
  if (!el) return;
  const ro = _wn.viewVersion != null && !!_wn.view;
  const basis = ro ? _wn.view.basis : _wn.basis, I = ro ? _wn.view.inputs : _wn.inputs;
  _wnKeepFocus(() => {
    el.innerHTML = _wnSheetHtml(basis, I, wnCompute(basis, I), ro);
    if (!ro) _wnBindSheet();
  });
}

// 표 입력 후 합계·SI 값·배지·미포함 줄만 갱신 (포커스 유지)
function _wnRefreshTotal() {
  if (_wn.viewVersion != null) return null;
  const c = wnCompute(_wn.basis, _wn.inputs);
  const str = c.total.toFixed(1);
  const tmm = $wn('wnTotalMM'), tft = $wn('wnTotalFt');
  if (tmm) tmm.textContent = str;
  if (tft) tft.textContent = str;
  const si = $wn('wnSiInput');
  if (si && !c.si.override) {
    if (document.activeElement !== si) si.value = c.si.hasChecked ? c.si.sum : '';
    const cell = si.closest('.wn-td-mm');
    let badge = cell && cell.querySelector('.wn-si-badge');
    if (c.si.hasChecked) {
      if (!badge && cell) { badge = document.createElement('span'); badge.className = 'wn-si-badge'; cell.appendChild(badge); }
      if (badge) badge.textContent = c.si.sum + ' M/M';
    } else if (badge) badge.remove();
  }
  const ex = $wn('wnExcluded');
  if (ex) ex.innerHTML = _wnExclHtml(c);
  return c;
}
function _wnChanged() { _wnRefreshTotal(); _wnTouch(); }
// 기간 ± 는 기존 규칙대로 역할 수동값을 초기화한다. 값이 있었으면 알린다
function _wnResetCustom() {
  const n = Object.keys(_wn.inputs.custom || {}).length;
  _wn.inputs.custom = {};
  if (n) _wnToast(`기간이 바뀌어 직접 입력한 역할 M/M ${n}건이 기본 계산값으로 초기화되었습니다.`);
}

function _wnBindSheet() {
  const I = () => _wn.inputs;   // 상태 객체는 복원 시 교체되므로 항상 최신을 읽는다
  // 기간 ±: 역할 수동값(custom)을 초기화하고 표만 다시 그림(포커스는 _wnKeepFocus 가 같은 버튼으로 복귀)
  $wn('wnDurMinus').onclick = () => {
    if (I().dur > 1) { I().dur--; _wnResetCustom(); _wnRenderSheet(); _wnTouch(); }
  };
  $wn('wnDurPlus').onclick = () => {
    if (I().dur < 24) { I().dur++; _wnResetCustom(); _wnRenderSheet(); _wnTouch(); }
  };

  // 역할 M/M 입력
  document.querySelectorAll('#wnSheet .wn-mm-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v >= 0) {
        I().custom[inp.dataset.role] = Math.round(v * 10) / 10;
        inp.value = I().custom[inp.dataset.role];
        inp.classList.add('is-custom');
      } else {
        inp.value = wnCompute(_wn.basis, I()).mms[inp.dataset.role];   // 잘못된 값은 되돌림
      }
      _wnChanged();
    });
  });

  // 행 체크박스 (역할 / var)
  document.querySelectorAll('#wnSheet .wn-row-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const tr = chk.closest('tr');
      _wnSetChecked(I(), chk.dataset.type, chk.dataset.id, chk.checked);
      if (tr) tr.classList.toggle('wn-row-dimmed', !chk.checked);
      // SI 체크박스면 부가항목 행도 함께 dim
      if (chk.dataset.type === 'var' && chk.dataset.id === 'si') {
        document.querySelectorAll('#wnSheet .wn-si-subhd, #wnSheet .wn-si-item').forEach(row => row.classList.toggle('wn-row-dimmed', !chk.checked));
      }
      _wnChanged();
    });
  });

  // var 입력 저장
  document.querySelectorAll('#wnSheet .wn-var-input:not(#wnSiInput)').forEach(inp => {
    inp.addEventListener('change', () => { _wnSetVar(I(), inp.dataset.var, inp.value); _wnChanged(); });
  });

  // SI 수동 입력
  const siInp = $wn('wnSiInput');
  if (siInp) {
    siInp.addEventListener('change', () => { I().siOverride = siInp.value.trim(); _wnRenderSheet(); _wnTouch(); });
    siInp.addEventListener('input', () => { if (siInp.value === '') { I().siOverride = ''; _wnTouch(); } });
  }

  // SI 서브아이템 체크박스
  document.querySelectorAll('#wnSheet .wn-si-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const it = I().siItems.find(i => i.id === chk.dataset.si);
      if (it) it.checked = chk.checked;
      _wnChanged();
    });
  });

  // SI 항목 이름 편집
  document.querySelectorAll('#wnSheet .wn-si-name').forEach(inp => {
    inp.addEventListener('change', () => {
      const it = I().siItems.find(i => i.id === inp.dataset.si);
      if (it) { it.name = inp.value; _wnTouch(); }
    });
  });

  // SI 항목 M/M 편집
  document.querySelectorAll('#wnSheet .wn-si-mm').forEach(inp => {
    inp.addEventListener('change', () => {
      const it = I().siItems.find(i => i.id === inp.dataset.si);
      if (!it) return;
      const v = Math.round(parseFloat(inp.value || 0) * 2) / 2;
      it.mm = Number.isFinite(v) && v >= 0 ? v : 0;
      inp.value = it.mm;
      _wnChanged();
    });
  });

  // SI 항목 추가
  const siAddBtn = $wn('wnSiAdd');
  if (siAddBtn) siAddBtn.addEventListener('click', () => {
    I()._siNext = (I()._siNext || 6) + 1;
    const id = 'si_' + I()._siNext;
    I().siItems.push({ id, name: '새 항목', mm: 0.5, checked: false });
    _wnRenderSheet(); _wnTouch();
    const n = document.querySelector(`#wnSheet .wn-si-name[data-si="${id}"]`);
    if (n) { n.focus(); n.select(); }
  });

  // SI 항목 삭제
  document.querySelectorAll('#wnSheet .wn-si-del').forEach(btn => {
    btn.addEventListener('click', () => {
      I().siItems = I().siItems.filter(i => i.id !== btn.dataset.si);
      _wnRenderSheet(); _wnTouch();
      $wn('wnSiAdd')?.focus();
    });
  });
}

// ─── 과거 버전 보기 / 복원 ───
function _wnFindVersion(id, n) {
  return (_wnVersions(id) || []).find(v => Number(v.version) === Number(n)) || null;
}
function _wnEnterView(id, n) {
  const ver = _wnFindVersion(id, n);
  if (!ver || !ver.snapshot) { _wnToast('해당 버전 내용을 찾지 못했습니다.'); return; }
  const s = ver.snapshot;
  _wn.viewVersion = Number(n);
  _wn.view = { basis: _wnNormalizeBasis(s.basis), inputs: _wnNormalizeInputs(s.inputs), header: _wnNormalizeHeader(s.header), ver };
  _wnKeepFocus(() => { _wnRenderMain(); _wnRenderInfo(); });
  $wn('wnViewBack')?.focus();
}
function _wnExitView() {
  _wn.viewVersion = null; _wn.view = null;
  _wnKeepFocus(() => { _wnRenderMain(); _wnRenderInfo(); });
}
function _wnRequestRestore(id, n, host) {
  _wnGuard(() => {
    if (host === 'wnHistGuard' && typeof Modal !== 'undefined') Modal.close('wnHistModal');
    _wnRestore(id, n);
  }, { host, msg: `편집 중인 변경 사항을 버리고 v${n} 내용으로 바꿀까요?`, discard: '버리고 복원' });
}
function _wnRestore(id, n) {
  if (id !== _wn.est) return;
  const ver = _wnFindVersion(id, n);
  if (!ver || !ver.snapshot) { _wnToast('해당 버전 내용을 찾지 못했습니다.'); return; }
  const s = ver.snapshot;
  _wn.basis = _wnNormalizeBasis(s.basis);
  _wn.inputs = _wnNormalizeInputs(s.inputs);
  // 그 사이 삭제된 영업 담당·프로젝트는 연결 해제(저장 시 FK 위반 방지)
  const san = _wnSanitizeRefs(_wnNormalizeHeader(s.header), _wnRefCtx());
  _wn.header = san.header;
  _wn.viewVersion = null; _wn.view = null;
  _wn.dirty = _wnEditSnap() !== _wn._baseline;
  _wn.restoredFrom = _wn.dirty ? Number(n) : null;
  if (_wnOnScreen()) { _wnRenderMain(); _wnRenderInfo(); $wn('wnEstSave')?.focus(); }
  const lost = san.dropped.map(k => k === 'sales' ? '담당 영업' : '연결 프로젝트').join('·');
  _wnToast((_wn.dirty ? `v${n} 내용을 불러왔습니다. 저장하면 새 버전으로 기록됩니다.` : `v${n} 은 현재 저장본과 같습니다.`)
    + (lost ? ` (삭제된 ${lost} 연결은 해제했습니다)` : ''));
}

// ═══════════════════════════════════════════════════════════
// 오른쪽: 정보 패널
// ═══════════════════════════════════════════════════════════
function _wnSalesOptions(cur) {
  const all = _wnSales();
  const act = all.filter(s => s.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ko'));
  let html = `<option value="">선택 안 함</option>` + act.map(s => `<option value="${_wnE(s.id)}"${s.id === cur ? ' selected' : ''}>${_wnE(s.name)}${s.dept ? ` (${_wnE(s.dept)})` : ''}</option>`).join('');
  let missing = false;
  if (cur && !act.some(s => s.id === cur)) {
    const s = all.find(x => x.id === cur);
    const ready = _wnStatus() === 'ok';
    missing = !s && ready;
    const label = s ? `${s.name} (비활성)` : ready ? '삭제된 담당자 (저장 시 해제)' : '불러오는 중…';
    html += `<option value="${_wnE(cur)}" selected>${_wnE(label)}</option>`;
  }
  return { html, activeCount: act.length, missing };
}
function _wnSalesHint(so) {
  if (_wnStatus() !== 'ok') return '산정 기록을 불러온 뒤 선택할 수 있습니다.';
  if (so.missing) return '선택된 영업 담당이 삭제되었습니다. 다른 담당을 고르거나 저장하면 연결이 해제됩니다.';
  return so.activeCount ? '' : '등록된 영업 담당이 없습니다. 관리 &gt; 영업 담당에서 추가하세요.';
}
// 연결된 프로젝트가 삭제됐는지(프로젝트 목록이 로드된 경우만 판단)
function _wnProjectMissing(pid) {
  const c = _wnRefCtx();
  return !!pid && c.projectsReady && !c.projects.some(p => p.id === pid);
}

function _wnRenderInfo() {
  const el = $wn('wnEstInfo');
  if (!el) return;
  if (typeof closeProjectPickers === 'function') closeProjectPickers();   // 교체될 선택 버튼에 붙은 드롭다운 정리
  const ro = _wn.viewVersion != null && !!_wn.view;
  if (ro) {
    const h = _wn.view.header;
    const proj = h.projectId && typeof getProject === 'function' ? getProject(h.projectId) : null;
    const dd = v => v ? _wnE(v) : '<span class="wn-est-muted">-</span>';
    el.innerHTML = _wnPanelHd('info', `산정 정보 <span class="wn-est-count">v${_wnE(_wn.viewVersion)}</span>`)
      + `<div class="wn-est-panel-body" id="wnInfoBody"><dl class="wn-est-dl">
        <dt>건명</dt><dd>${dd(h.title)}</dd>
        <dt>고객사</dt><dd>${dd(h.client)}</dd>
        <dt>담당 영업</dt><dd>${dd((_wn.view.ver && _wn.view.ver.snapshot && _wn.view.ver.snapshot.header && _wn.view.ver.snapshot.header.salesName) || _wnSalesName(h.salesId))}</dd>
        <dt>산정일</dt><dd>${dd(h.estimatedOn)}</dd>
        <dt>프로젝트</dt><dd>${proj ? dd(proj.name) : h.projectId ? '<span class="wn-est-muted">삭제된 프로젝트</span>' : dd('')}</dd>
        <dt>참여자</dt><dd>${h.participants.length ? `<div class="wn-est-tags" role="list">${h.participants.map(p => `<span class="wn-est-chip" role="listitem">${_wnE(p.name)}${p.role ? ` <em>${_wnE(p.role)}</em>` : ''}</span>`).join('')}</div>` : dd('')}</dd>
        <dt>메모</dt><dd class="wn-est-memo-ro">${dd(h.memo)}</dd>
      </dl><p class="wn-est-hint">과거 버전은 읽기 전용입니다.</p></div>`;
    _wnBindFold('info');
    return;
  }
  const h = _wn.header;
  const so = _wnSalesOptions(h.salesId);
  const salesReady = _wnStatus() === 'ok';
  const err = id => `<div class="wn-est-err" id="${id}" role="alert"></div>`;
  el.innerHTML = _wnPanelHd('info', '산정 정보') + `<div class="wn-est-panel-body" id="wnInfoBody">
    <div class="form-group">
      <label class="form-label" for="wnHdTitle">건명 <span class="wn-est-req" aria-hidden="true">*</span></label>
      <input type="text" class="form-input" id="wnHdTitle" maxlength="${WN_LIMITS.title}" aria-required="true" aria-describedby="wnHdTitleErr" value="${_wnE(h.title)}" autocomplete="off">
      ${err('wnHdTitleErr')}
    </div>
    <div class="form-group">
      <label class="form-label" for="wnHdClient">고객사</label>
      <input type="text" class="form-input" id="wnHdClient" maxlength="${WN_LIMITS.client}" aria-describedby="wnHdClientErr" value="${_wnE(h.client)}" autocomplete="off">
      ${err('wnHdClientErr')}
    </div>
    <div class="form-group">
      <label class="form-label" for="wnHdSales">담당 영업</label>
      <select class="form-select" id="wnHdSales"${salesReady ? '' : ' disabled'} aria-describedby="wnHdSalesHint">${so.html}</select>
      <div class="wn-est-hint" id="wnHdSalesHint">${_wnSalesHint(so)}</div>
    </div>
    <div class="form-group">
      <label class="form-label" for="wnHdDate">산정일 <span class="wn-est-req" aria-hidden="true">*</span></label>
      <input type="date" class="form-input" id="wnHdDate" aria-required="true" aria-describedby="wnHdDateErr" value="${_wnE(h.estimatedOn)}">
      ${err('wnHdDateErr')}
    </div>
    <div class="form-group">
      <span class="form-label" id="wnHdProjectLbl">프로젝트 연결 <span class="wn-est-muted">(선택)</span></span>
      <div id="wnHdProjectHost" class="wn-est-proj" role="group" aria-labelledby="wnHdProjectLbl" aria-describedby="wnHdProjectHint"></div>
      <div class="wn-est-hint" id="wnHdProjectHint">${_wnProjectMissing(h.projectId) ? '연결된 프로젝트가 삭제되었습니다. 다른 프로젝트를 고르거나 저장하면 연결이 해제됩니다.' : ''}</div>
    </div>
    <div class="form-group">
      <span class="form-label" id="wnPtLbl">참여자</span>
      <ul class="wn-est-pts" id="wnPtList" role="list" aria-labelledby="wnPtLbl"></ul>
      <div class="wn-est-pt-add" role="group" aria-label="참여자 추가">
        <select class="form-select wn-est-pt-member" id="wnPtMember" aria-label="등록 멤버 선택"></select>
        <input type="text" class="form-input" id="wnPtName" placeholder="이름" aria-label="참여자 이름" maxlength="${WN_LIMITS.ptName}" autocomplete="off">
        <input type="text" class="form-input" id="wnPtRole" placeholder="역할 (예: PM, 개발)" aria-label="참여자 역할" maxlength="${WN_LIMITS.ptRole}" autocomplete="off">
        <button type="button" class="btn-ghost wn-est-btn" id="wnPtAdd">참여자 추가</button>
      </div>
      ${err('wnPtErr')}
    </div>
    <div class="form-group">
      <label class="form-label" for="wnHdMemo">메모</label>
      <textarea class="form-textarea wn-est-memo" id="wnHdMemo" maxlength="${WN_LIMITS.memo}" aria-describedby="wnHdMemoErr">${_wnE(h.memo)}</textarea>
      ${err('wnHdMemoErr')}
    </div>
    <div class="form-group">
      <span class="form-label" id="wnHistMiniLbl">최근 이력</span>
      <ul class="wn-est-mini" id="wnInfoHist" role="list" aria-labelledby="wnHistMiniLbl"></ul>
    </div>
  </div>`;
  _wnBindFold('info');
  _wnBindInfo();
  _wnRenderParticipants();
  _wnRenderHistMini();
}

function _wnBindInfo() {
  const H = () => _wn.header;
  const text = (id, key, errKey) => {
    const inp = $wn(id);
    // 입력 중에는 상태만 갱신(재렌더 없음 → 포커스·IME 유지), 검증 표시는 blur/change 에서
    inp.addEventListener('input', () => {
      H()[key] = inp.value; _wnTouch();
      if (inp.getAttribute('aria-invalid') === 'true') _wnShowHeaderErrors(wnValidateHeader(H()), [errKey]);
    });
    inp.addEventListener('change', () => { H()[key] = inp.value; _wnTouch(); _wnShowHeaderErrors(wnValidateHeader(H()), [errKey]); });
  };
  text('wnHdTitle', 'title', 'title');
  text('wnHdClient', 'client', 'client');
  text('wnHdDate', 'estimatedOn', 'estimatedOn');
  text('wnHdMemo', 'memo', 'memo');
  $wn('wnHdSales').addEventListener('change', e => { H().salesId = e.target.value || null; _wnTouch(); const hint = $wn('wnHdSalesHint'); if (hint) hint.innerHTML = _wnSalesHint(_wnSalesOptions(H().salesId)); });

  // 프로젝트 연결: 공통 ProjectPicker 재사용(전체 기간·완료 포함). 없으면 단순 select
  const host = $wn('wnHdProjectHost');
  if (typeof mountProjectPicker === 'function' && typeof DATA !== 'undefined') {
    mountProjectPicker(host, {
      id: 'wnHdProject', value: H().projectId || '',
      getRange: () => ({ lo: -Infinity, hi: Infinity }),
      placeholder: '프로젝트 검색·선택 (선택 사항)',
      opts: { includeDone: true, periodOnly: false },
    });
    $wn('wnHdProject').addEventListener('change', e => { H().projectId = e.target.value || null; _wnTouch(); const hint = $wn('wnHdProjectHint'); if (hint) hint.textContent = ''; });
  } else {
    const projs = typeof DATA !== 'undefined' && Array.isArray(DATA.projects) ? DATA.projects : [];
    host.innerHTML = `<select class="form-select" id="wnHdProject" aria-labelledby="wnHdProjectLbl"><option value="">선택 안 함</option>${projs.map(p => `<option value="${_wnE(p.id)}"${p.id === H().projectId ? ' selected' : ''}>${_wnE(p.name)}</option>`).join('')}</select>`;
    $wn('wnHdProject').addEventListener('change', e => { H().projectId = e.target.value || null; _wnTouch(); });
  }

  // 참여자 추가
  const mSel = $wn('wnPtMember'), nInp = $wn('wnPtName'), rInp = $wn('wnPtRole');
  mSel.addEventListener('change', () => {
    const m = _wnMembers().find(x => x.id === mSel.value);
    if (m) { nInp.value = m.name || ''; nInp.disabled = !!m.name; if (!rInp.value.trim() && m.role) rInp.value = String(m.role).slice(0, WN_LIMITS.ptRole); }
    else { nInp.disabled = false; nInp.value = ''; }
    _wnSetErr('wnPtErr', '', nInp);
  });
  const add = () => {
    const m = _wnMembers().find(x => x.id === mSel.value);
    const name = (m ? m.name || '' : nInp.value).trim(), role = rInp.value.trim();
    _wnSetErr('wnPtErr', '', rInp);
    // 이름 오류는 직접 입력으로 고칠 수 있게 이름 칸을 활성화(멤버 선택 해제)
    const nameErr = msg => { mSel.value = ''; nInp.disabled = false; nInp.value = name; _wnSetErr('wnPtErr', msg, nInp); nInp.focus(); };
    if (!name) { nameErr('참여자 이름을 입력하거나 등록 멤버를 선택하세요.'); return; }
    if (name.length > WN_LIMITS.ptName) { nameErr(`이름은 ${WN_LIMITS.ptName}자 이내로 입력하세요.`); return; }
    if (role.length > WN_LIMITS.ptRole) { _wnSetErr('wnPtErr', `역할은 ${WN_LIMITS.ptRole}자 이내로 입력하세요.`, rInp); rInp.focus(); return; }
    const p = { name, role };
    if (m) p.memberId = m.id;
    H().participants.push(p);
    nInp.value = ''; rInp.value = ''; nInp.disabled = false;
    _wnSetErr('wnPtErr', '', nInp);
    _wnRenderParticipants();
    _wnTouch();
    mSel.focus();
  };
  $wn('wnPtAdd').onclick = add;
  [nInp, rInp].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }));
}
const _wnMembers = () => (typeof DATA !== 'undefined' && Array.isArray(DATA.members)) ? DATA.members : [];

function _wnSetErr(errId, msg, input) {
  const e = $wn(errId);
  if (e) e.textContent = msg;
  if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
}
// keys: 표시할 필드만(생략 시 전부). 오류가 없는 필드는 표시를 지운다
function _wnShowHeaderErrors(errs, keys) {
  const map = { title: ['wnHdTitleErr', 'wnHdTitle'], client: ['wnHdClientErr', 'wnHdClient'], estimatedOn: ['wnHdDateErr', 'wnHdDate'],
    memo: ['wnHdMemoErr', 'wnHdMemo'], participants: ['wnPtErr', null] };
  (keys || Object.keys(map)).forEach(k => {
    const m = map[k]; if (!m) return;
    _wnSetErr(m[0], errs[k] || '', m[1] ? $wn(m[1]) : null);
  });
}

function _wnRenderParticipants() {
  const ul = $wn('wnPtList'), sel = $wn('wnPtMember');
  if (!ul) return;
  const ps = _wn.header.participants;
  ul.innerHTML = ps.length ? ps.map((p, i) => `<li class="wn-est-chip wn-est-pt" role="listitem">
      <span>${_wnE(p.name || '(이름 없음)')}${p.role ? ` <em>${_wnE(p.role)}</em>` : ''}${p.memberId ? '' : ' <small class="wn-est-muted">직접</small>'}</span>
      <button type="button" class="wn-est-chip-x" data-pt="${i}" aria-label="참여자 ${_wnE(p.name)} 제거">✕</button></li>`).join('')
    : `<li class="wn-est-muted wn-est-pt-none" role="listitem">아직 참여자가 없습니다.</li>`;
  ul.querySelectorAll('.wn-est-chip-x').forEach(b => b.onclick = () => {
    _wn.header.participants.splice(Number(b.dataset.pt), 1);
    _wnRenderParticipants(); _wnTouch();
    const next = ul.querySelector(`.wn-est-chip-x[data-pt="${Math.min(Number(b.dataset.pt), _wn.header.participants.length - 1)}"]`);
    (next || $wn('wnPtMember'))?.focus();
  });
  if (sel) {
    const used = new Set(ps.map(p => p.memberId).filter(Boolean));
    const cur = sel.value;
    sel.innerHTML = `<option value="">직접 입력</option>` + _wnMembers().filter(m => !used.has(m.id))
      .map(m => `<option value="${_wnE(m.id)}"${m.id === cur ? ' selected' : ''}>${_wnE(m.name)}${m.role ? ` · ${_wnE(m.role)}` : ''}</option>`).join('');
    if (sel.value !== cur) { const n = $wn('wnPtName'); if (n) n.disabled = false; }
  }
}

function _wnRenderHistMini() {
  const ul = $wn('wnInfoHist');
  if (!ul) return;
  if (!_wn.est) { ul.innerHTML = '<li class="wn-est-muted" role="listitem">저장하면 이력이 쌓입니다.</li>'; return; }
  const vs = _wnVersions(_wn.est);
  if (!vs) { ul.innerHTML = '<li class="wn-est-muted" role="listitem">이력을 불러오는 중이거나 아직 불러오지 않았습니다.</li>'; return; }
  const rows = wnVersionSummaries(vs).slice(-3).reverse();
  ul.innerHTML = rows.length ? rows.map(r => {
    const d = wnFmtDelta(r.delta);
    const cls = r.delta > 0.04 ? 'is-up' : r.delta < -0.04 ? 'is-down' : '';
    return `<li role="listitem"><b>v${r.version}</b> · ${_wnE(_wnFmtShort(r.savedAt))} · <span class="wn-est-mini-reason">${_wnE(r.reason || '-')}</span>
      <span class="wn-est-delta ${cls}">${d ? _wnE(d) : _wnE(r.total.toFixed(1))}</span></li>`;
  }).join('') + `<li role="listitem"><button type="button" class="wn-est-link" id="wnHistMore">전체 이력 보기</button></li>`
    : '<li class="wn-est-muted" role="listitem">이력이 없습니다.</li>';
  const more = $wn('wnHistMore'); if (more) more.onclick = () => _wnOpenHistory();
}

// ═══════════════════════════════════════════════════════════
// 모달: 저장(변경 사유) / 이력
// ═══════════════════════════════════════════════════════════
function _wnInitModals() {
  if (typeof Modal === 'undefined' || typeof document === 'undefined' || $wn('wnSaveModal')) return;
  const mk = (id, titleId, cardCls, inner, backdropClose) => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay hidden';
    ov.id = id;
    if (backdropClose) ov.dataset.backdrop = 'close';
    ov.setAttribute('aria-labelledby', titleId);   // role=dialog 은 Modal.open 이 부여
    ov.innerHTML = `<div class="modal-card ${cardCls}">${inner}</div>`;
    document.body.appendChild(ov);
  };
  mk('wnSaveModal', 'wnSaveTitle', 'wn-est-save-card', `
    <div class="modal-header">
      <span class="modal-title" id="wnSaveTitle">산정 저장</span>
      <button class="modal-close-btn" id="wnSaveClose" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">
      <div class="wn-est-sum" id="wnSaveSum"></div>
      <div class="form-group">
        <label class="form-label" for="wnSaveReason" id="wnSaveReasonLbl">변경 사유</label>
        <input type="text" class="form-input" id="wnSaveReason" maxlength="${WN_LIMITS.reason}" aria-describedby="wnSaveMsg" autocomplete="off">
      </div>
      <div class="wn-est-err" id="wnSaveMsg" role="alert"></div>
      <div class="wn-est-conflict" id="wnSaveConflict" hidden>
        <p>다른 곳에서 이 기록이 먼저 저장되었습니다. 서버의 최신 버전을 기준으로 내 편집 내용을 이어서 저장하거나, 취소할 수 있습니다.</p>
        <div class="wn-est-conflict-btns">
          <button type="button" class="btn-primary wn-est-btn" id="wnConflictGo">최신 버전 기준으로 계속</button>
          <button type="button" class="btn-ghost wn-est-btn" id="wnConflictCancel">취소</button>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <div style="flex:1"></div>
      <button class="btn-ghost" id="wnSaveCancel">취소</button>
      <button class="btn-primary" id="wnSaveGo">저장</button>
    </div>`);
  mk('wnHistModal', 'wnHistTitle', 'wn-est-hist-card', `
    <div class="modal-header">
      <span class="modal-title" id="wnHistTitle">산정 이력</span>
      <button class="modal-close-btn" id="wnHistClose" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">
      <div id="wnHistGuard"></div>
      <div id="wnHistBody"></div>
    </div>
    <div class="modal-footer">
      <span class="wn-est-hint">보기는 그때 기준표로 읽기 전용, 복원은 편집판에 불러와 저장하면 새 버전이 됩니다.</span>
      <div style="flex:1"></div>
      <button class="btn-ghost" id="wnHistDone">닫기</button>
    </div>`, true);
  Modal.onClose.wnSaveModal = () => { const m = $wn('wnSaveMsg'); if (m) m.textContent = ''; const c = $wn('wnSaveConflict'); if (c) c.hidden = true; };
  Modal.onClose.wnHistModal = () => { const g = $wn('wnHistGuard'); if (g) g.innerHTML = ''; };
  $wn('wnSaveClose').onclick = () => Modal.requestClose('wnSaveModal');
  $wn('wnSaveCancel').onclick = () => Modal.requestClose('wnSaveModal');
  $wn('wnSaveGo').onclick = () => _wnDoSave();
  $wn('wnSaveReason').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); _wnDoSave(); } });
  $wn('wnSaveReason').addEventListener('input', e => { if (e.target.value.trim()) _wnSetErr('wnSaveMsg', '', e.target); });
  $wn('wnConflictGo').onclick = () => _wnConflictContinue();
  $wn('wnConflictCancel').onclick = () => Modal.close('wnSaveModal');
  $wn('wnHistClose').onclick = () => Modal.requestClose('wnHistModal');
  $wn('wnHistDone').onclick = () => Modal.requestClose('wnHistModal');
}

function _wnOpenSave() {
  if (!_wnCanSave() || typeof Modal === 'undefined') return;
  const errs = wnValidateHeader(_wn.header);
  if (Object.keys(errs).length) {
    _wnSetFold('info', true);
    _wnShowHeaderErrors(errs);
    const first = { title: 'wnHdTitle', client: 'wnHdClient', estimatedOn: 'wnHdDate', participants: 'wnPtMember', memo: 'wnHdMemo' };
    const k = Object.keys(first).find(x => errs[x]);
    $wn(first[k])?.focus();
    _wnToast('정보 패널의 입력을 확인하세요.');
    return;
  }
  const isNew = !_wn.est;
  $wn('wnSaveSum').innerHTML = _wnSaveSummaryHtml();
  $wn('wnSaveConflict').hidden = true;
  $wn('wnSaveTitle').textContent = isNew ? '새 산정 저장' : '산정 저장 (새 버전)';
  $wn('wnSaveReasonLbl').innerHTML = isNew ? '변경 사유 <span class="wn-est-muted">(비우면 "최초 작성")</span>' : '변경 사유 <span class="wn-est-req" aria-hidden="true">*</span>';
  const r = $wn('wnSaveReason');
  r.value = _wn.restoredFrom ? `v${_wn.restoredFrom} 내용으로 복원` : '';
  r.placeholder = isNew ? '최초 작성' : '예: 기간 3개월로 변경, SI 항목 추가';
  r.setAttribute('aria-required', String(!isNew));
  _wnSetErr('wnSaveMsg', '', r);
  const go = $wn('wnSaveGo'); go.disabled = false; go.textContent = '저장';
  Modal.open('wnSaveModal');
  Modal.track('wnSaveModal', () => r.value);
}

// 저장 모달 요약: 총공수, 직전 버전 대비 변화, 저장될 버전, 삭제된 참조 해제 안내
function _wnSaveSummaryHtml() {
  const c = wnCompute(_wn.basis, _wn.inputs);
  let sum = `총공수 <b>${c.total.toFixed(1)} M/M</b>`;
  if (_wn.est) {
    const prev = _wnFindVersion(_wn.est, _wn.baseVersion);
    if (prev) {
      const pt = _wnVersionTotal(prev), d = wnFmtDelta(Math.round((c.total - pt) * 100) / 100);
      sum += ` <span class="wn-est-muted">(v${_wn.baseVersion} ${pt.toFixed(1)} → ${d})</span>`;
    }
    sum += ` · <b>v${_wn.baseVersion + 1}</b> 로 저장됩니다.`;
  } else sum += ' · 새 기록 <b>v1</b> 로 저장됩니다.';
  const lost = _wnSanitizeRefs(_wn.header, _wnRefCtx()).dropped.map(k => k === 'sales' ? '담당 영업' : '연결 프로젝트');
  if (lost.length) sum += `<br>삭제된 ${lost.join('·')} 연결은 저장 시 해제됩니다.`;
  return sum;
}
// Modal.close 가 돌려줄 포커스 대상을 지정(재렌더로 교체된 버튼의 키가 _pendingFocus 로 남지 않게)
function _wnRetargetSaveFocus(el) {
  if (typeof Modal === 'undefined') return;
  if (Modal._focusKey) delete Modal._focusKey.wnSaveModal;
  if (Modal._focus) Modal._focus.wnSaveModal = el || null;
}
// 충돌 후 "최신 버전 기준으로 계속": 서버 최신 current_version 으로 baseVersion 만 올리고 내 편집은 유지
async function _wnConflictContinue() {
  const id = _wn.est, go = $wn('wnConflictGo'), msg = $wn('wnSaveMsg');
  if (!id || !_wnApiReady()) return;
  go.disabled = true; go.textContent = '최신 버전 확인 중…';
  try { await EstimateAPI.load(); } catch (e) {}
  const est = _wnEstById(id);
  go.disabled = false; go.textContent = '최신 버전 기준으로 계속';
  if (!est) { msg.textContent = '서버에서 이 기록을 찾지 못했습니다(삭제되었거나 불러오기 실패). 취소 후 확인하세요.'; return; }
  try { await EstimateAPI.loadVersions(id); } catch (e) {}
  const prevBase = _wn.baseVersion;
  _wn.baseVersion = Number(est.currentVersion) || prevBase;
  _wnTouch();
  if (_wnOnScreen()) { _wnRenderList(); _wnRenderStatus(); _wnRenderHistMini(); }
  _wnRetargetSaveFocus($wn('wnEstSave'));
  $wn('wnSaveConflict').hidden = true;
  $wn('wnSaveSum').innerHTML = _wnSaveSummaryHtml();
  msg.textContent = `서버의 최신 v${_wn.baseVersion} 을 기준으로 바꿨습니다. 저장하면 v${_wn.baseVersion + 1} 이 되며, v${prevBase + 1}~v${_wn.baseVersion} 의 변경은 지금 내용으로 대체됩니다.`;
  $wn('wnSaveReason').focus();
}

async function _wnDoSave() {
  if (_wn.saving || !_wnApiReady()) return;
  const r = $wn('wnSaveReason'), go = $wn('wnSaveGo');
  const reason = r.value.trim();
  if (_wn.est && !reason) { _wnSetErr('wnSaveMsg', '변경 사유를 입력하세요.', r); r.focus(); return; }
  if (reason.length > WN_LIMITS.reason) { _wnSetErr('wnSaveMsg', `변경 사유는 ${WN_LIMITS.reason}자 이내로 입력하세요.`, r); r.focus(); return; }
  const c = wnCompute(_wn.basis, _wn.inputs);
  const snapshot = _wnSnapshot();
  const header = { ...snapshot.header, totalMm: c.total };
  const savedState = _wnEditSnap();
  const wasId = _wn.est;
  _wn.saving = true; go.disabled = true; go.textContent = '저장 중…';
  let res;
  try {
    res = await EstimateAPI.save({ id: wasId || undefined, header, snapshot, reason: reason || (wasId ? '' : '최초 작성'), baseVersion: _wn.baseVersion });
  } catch (e) {
    res = { ok: false, code: 'error', message: (e && e.message) || String(e) };
  }
  _wn.saving = false; go.disabled = false; go.textContent = '저장';
  if (!res || !res.ok) {
    const code = res && res.code;
    if (code === 'conflict') {
      _wnSetErr('wnSaveMsg', '', null);
      $wn('wnSaveConflict').hidden = false;
      $wn('wnConflictGo').focus();
      _wnUpdateDirtyUI();
      return;
    }
    const msg = code === 'invalid' ? ((res && res.message) || '변경 사유를 입력하세요.')
      : `저장하지 못했습니다.${res && res.message ? ' (' + res.message + ')' : ''}`;
    _wnSetErr('wnSaveMsg', msg, code === 'invalid' ? r : null);
    if (code === 'invalid') r.focus();
    _wnUpdateDirtyUI();
    return;
  }
  const est = res.estimate || {};
  const vn = res.version && typeof res.version === 'object' ? Number(res.version.version) : Number(res.version);
  _wn.est = est.id || wasId;
  _wn.baseVersion = Number.isFinite(vn) && vn > 0 ? vn : _wn.baseVersion + 1;
  _wn.restoredFrom = null;
  _wn.header = JSON.parse(savedState).h;
  _wn._baseline = savedState;
  _wn.dirty = false;
  if (_wnOnScreen()) { _wnRenderList(); _wnRenderStatus(); _wnRenderHistMini(); }
  // 상태 줄을 먼저 다시 그려 원래 저장 버튼은 교체됨 → 닫을 때 이력 버튼으로 포커스(교체된 버튼 키를 남기지 않음)
  _wnRetargetSaveFocus($wn('wnEstHist'));
  Modal.close('wnSaveModal');
  _wnToast(`저장했습니다 (v${_wn.baseVersion}).`);
  // 새 기록은 이력이 캐시돼 있지 않을 수 있으므로 뒤에서 읽어 최근 이력을 채운다
  if (_wn.est && !_wnVersions(_wn.est)) {
    const id = _wn.est;
    Promise.resolve().then(() => EstimateAPI.loadVersions(id)).then(() => { if (_wn.est === id && _wnOnScreen()) _wnRenderHistMini(); }).catch(() => {});
  }
}

async function _wnOpenHistory() {
  const id = _wn.est;
  if (!id || !_wnApiReady() || typeof Modal === 'undefined') return;
  const est = _wnEstById(id);
  $wn('wnHistTitle').textContent = `산정 이력 — ${est ? est.title || '(건명 없음)' : ''}`;
  $wn('wnHistGuard').innerHTML = '';
  if ($wn('wnHistModal').classList.contains('hidden')) Modal.open('wnHistModal');
  _wnLoadHistBody(id);
}
async function _wnLoadHistBody(id) {
  const body = $wn('wnHistBody');
  body.innerHTML = '<div class="wn-est-gate" role="status">이력을 불러오는 중…</div>';
  try { await EstimateAPI.loadVersions(id); }
  catch (e) {
    if (_wn.est !== id) return;
    body.innerHTML = `<div class="wn-est-gate is-error" role="alert"><h4>이력을 불러오지 못했습니다</h4><button type="button" class="btn-ghost wn-est-btn" id="wnHistRetry">다시 시도</button></div>`;
    $wn('wnHistRetry').onclick = () => _wnLoadHistBody(id);
    $wn('wnHistRetry').focus();
    return;
  }
  if (_wn.est !== id) return;
  const hadFocus = body.contains(document.activeElement);
  _wnRenderHistTable(id);
  _wnRenderHistMini();
  if (hadFocus) body.querySelector('button')?.focus();
}
function _wnRenderHistTable(id) {
  const body = $wn('wnHistBody');
  const rows = wnVersionSummaries(_wnVersions(id) || []).reverse();
  if (!rows.length) { body.innerHTML = '<div class="wn-est-gate">이력이 없습니다.</div>'; return; }
  body.innerHTML = `<div class="wn-est-hist-scroll"><table class="wn-est-hist-table">
    <caption class="wn-est-sr">버전별 저장 이력 (최신순)</caption>
    <thead><tr><th scope="col">버전</th><th scope="col">저장 일시</th><th scope="col">작성자</th><th scope="col">사유</th><th scope="col">총공수</th><th scope="col">변화</th><th scope="col"><span class="wn-est-sr">동작</span></th></tr></thead>
    <tbody>${rows.map(r => {
      const d = wnFmtDelta(r.delta), cls = r.delta > 0.04 ? 'is-up' : r.delta < -0.04 ? 'is-down' : '';
      const isBase = r.version === _wn.baseVersion, isView = r.version === _wn.viewVersion;
      return `<tr class="${isBase ? 'is-base' : ''}${isView ? ' is-view' : ''}">
        <td><b>v${r.version}</b>${isBase ? ' <span class="wn-est-tag">편집 기준</span>' : ''}</td>
        <td>${_wnE(_wnFmtDT(r.savedAt) || '-')}</td>
        <td>${_wnE(r.savedByEmail || '-')}</td>
        <td class="wn-est-hist-reason">${_wnE(r.reason || '-')}</td>
        <td class="wn-est-num">${r.total.toFixed(1)}</td>
        <td class="wn-est-num"><span class="wn-est-delta ${cls}">${_wnE(d || '-')}</span></td>
        <td class="wn-est-hist-act">
          <button type="button" class="btn-ghost-xs" data-act="view" data-v="${r.version}" aria-label="v${r.version} 보기">보기</button>
          <button type="button" class="btn-ghost-xs" data-act="restore" data-v="${r.version}" aria-label="v${r.version} 이 버전으로 복원">이 버전으로 복원</button>
        </td></tr>`;
    }).join('')}</tbody></table></div>`;
  body.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.v);
    if (b.dataset.act === 'view') { Modal.close('wnHistModal'); _wnEnterView(id, n); }
    else _wnRequestRestore(id, n, 'wnHistGuard');
  });
}
