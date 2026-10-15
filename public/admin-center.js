// ██████████████████████████████████████████████████████████
// █  ADMIN CENTER  —  관리 드로어 "설정" 탭 + 관리 센터 모달      █
// █  (공통코드 / 공수 산정 기준표 / 사용자·권한)                  █
// ██████████████████████████████████████████████████████████
// 계약: docs/admin-spec.md "화면". 데이터(data.js): CODES·CodeAPI, BASIS·BasisAPI, UserAPI,
//       hasRole/isAdmin, skillPresets/skillCategories, CURRENT_USER, DATA, PRESET_COLORS.
//       데이터 층이 아직 없으면 typeof 가드로 "데이터 층이 아직 없습니다" 를 그린다.
// 의존(app.js): esc, safeColor, showToast, confirmable, Modal, state, renderDrawerContent
// 스타일: style.css 의 .ac-* 구역 (토큰만 사용, 다크/라이트 공용)
// 순수 함수(테스트 대상): _acSlug, _acMakeKey, _acMove, _acStable, _acBasisNormalize,
//       _acBasisDiff, _acBasisDiffText, _acBasisFieldErrors, _acBasisRestore, _acBasisAddRole, _acBasisAddSi

// ═══ 화면 문자열·상수 (한곳에 모음) ═══
const AC_TABS = [
  { id: 'codes', label: '공통코드' },
  { id: 'basis', label: '공수 산정 기준표' },
  { id: 'users', label: '사용자·권한', adminOnly: true },
];
const AC_ROLES = [
  { id: 'admin',  label: '관리자', tone: 'over',   desc: '모든 일. 사용자·권한·코드·기준표 관리, 남의 산정 기록 삭제.' },
  { id: 'editor', label: '편집자', tone: 'accent', desc: '투입·산정·게시물 쓰기. 사용자와 기준표는 볼 수만 있음.' },
  { id: 'viewer', label: '조회자', tone: 'ok',     desc: '읽기만. 수정·삭제 버튼이 보이지 않고, 쓰기는 서버가 거부.' },
];
const AC_SCALES = [
  { id: 'linear', label: '기간 비례 (기간 × 기준÷2)' },
  { id: 'dev',    label: '기준 + 추가월 × 0.5' },
  { id: 'fixed',  label: '고정값' },
];
// 내장 코드 그룹(DB 에 없어도 항상 보임). 새 그룹은 DB(wfm_code_groups)에 생기면 코드 수정 없이 목록에 나타난다
const AC_BUILTIN_GROUPS = [
  { id: 'skill',     name: '스킬',          system: false, sortOrder: 10 },
  { id: 'pj_status', name: '프로젝트 상태', system: true,  sortOrder: 20 },
];
// data.js 의 skillCategories() 가 없을 때만 쓰는 대체값(data.js BUILTIN_SKILL_CATS 와 같게)
const AC_BUILTIN_SKILL_CATS = [
  { key: 'lang',  label: '언어 / 프레임워크', color: '#3D6FEB' },
  { key: 'cloud', label: '클라우드',          color: '#0F6E56' },
  { key: 'ai',    label: 'AI / ML',           color: '#7F77DD' },
  { key: 'sol',   label: '솔루션',            color: '#0891B2' },
  { key: 'etc',   label: '기타',              color: '#B45309' },
];
const AC_FALLBACK_PALETTE = ['#3D6FEB','#00A878','#E85C4A','#9259D1','#F5A623','#16BFAD','#E91E8C','#4DB36A','#7C8FD6','#EF6C00','#0288D1','#C62828'];
const AC_LIMITS = { codeName: 40, roleName: 40, note: 200, reason: 200, userNote: 100, baseMax: 24 };
const AC_FIELD_LABEL = { cat: '분류', name: '이름', base: '기준 M/M', scale: '계산 방식', note: '메모', active: '사용',
  unit: '단위', placeholder: '입력 예시', inTotal: '총공수 합산', mm: 'M/M', color: '색', title: '제목', subtitle: '부제', assumptions: '기준 가정' };
const AC_KIND_LABEL = { role: '역할', var: '추가 항목', si: 'SI 기본 항목', meta: '머리말', category: '분류' };
const AC_T = {
  title: '관리 센터',
  noLayer: api => `데이터 층이 아직 없습니다. data.js 에 ${api} 가 들어오면 이 화면이 동작합니다.`,
  loading: '불러오는 중입니다…',
  retry: '다시 시도',
  reload: '다시 불러오기',
  adminOnly: '관리자만 사용할 수 있습니다.',
  readOnly: '관리자만 바꿀 수 있습니다. 지금은 읽기 전용으로 보입니다.',
  noChange: '수정한 내용이 없습니다',
  unsavedTab: '저장하지 않은 변경 사항이 있습니다. 다른 탭으로 이동하면 이 탭의 변경 내용이 버려집니다.',
  keep: '계속 편집', discardMove: '버리고 이동',
  saving: '저장 중…', saved: '저장했습니다.',
  codes: {
    h: '공통코드 관리',
    lead: '화면에 나오는 분류와 목록을 코드를 고치지 않고 바꿉니다. 이미 쓰이는 값의 <b>코드 키는 바뀌지 않고</b>, 표시 이름·색·순서·사용 여부만 바뀝니다.',
    builtin: '내장 기본값을 사용 중입니다. DB 로 가져오면 이 화면에서 이름·색·순서·사용 여부를 바꿀 수 있습니다.',
    importBtn: 'DB 로 가져와서 관리 시작',
    missing: '공통코드 테이블이 아직 없습니다(sql/admin.sql 적용 필요). 지금은 내장 기본값으로 동작합니다.',
    error: '공통코드를 불러오지 못했습니다. 지금은 내장 기본값으로 보입니다.',
    groupHint: '새 그룹은 DB 에 추가하면 여기에 자동으로 나타납니다.',
    sysOnly: '이 그룹은 중분류만 사용합니다.',
    noItems: '아직 항목이 없습니다.',
    noCats: '아직 분류가 없습니다.',
    keyFixed: '저장된 데이터가 이 키로 연결돼 있어 바꿀 수 없습니다.',
    keyNew: '이름에서 자동으로 만듭니다(영문 소문자·숫자·밑줄, 항목은 "분류키.이름"). 저장하면 바꿀 수 없습니다.',
    sysLock: '시스템 코드라 이름만 바꿀 수 있습니다(값이 프로그램 동작과 연결돼 있음).',
    nameReq: '이름을 입력하세요.',
    imported: '내장 기본값을 DB 로 가져왔습니다. 이제 이 화면에서 관리할 수 있습니다.',
  },
  basis: {
    missing: '기준표 테이블이 아직 없습니다(sql/admin.sql 적용 필요). 산정 화면은 내장 기준표로 동작합니다.',
    error: '기준표를 불러오지 못했습니다.',
    builtin: '내장 기준표를 읽기 전용으로 보여 줍니다. 관리하려면 DB 로 가져오세요(v1 로 게시됩니다).',
    importBtn: 'DB 로 가져와서 관리 시작',
    importReason: '내장 기본값에서 가져옴',
    conflict: '다른 곳에서 먼저 게시되었습니다. 최신 버전을 불러올까요?',
    conflictSub: '불러오면 지금 편집한 내용은 버려집니다.',
    loadLatest: '불러오기',
    draft: n => `수정한 내용 ${n}건 · 초안 (게시 전에는 산정 화면에 반영되지 않음)`,
    publishing: '게시 중…',
    reasonReq: '변경 사유를 입력하세요.',
    fixFirst: '표시된 항목을 고친 뒤 게시하세요.',
    published: v => `v${v} 으로 게시했습니다. 새로 만드는 산정부터 적용됩니다.`,
    histNote: '이미 저장된 산정 기록은 저장 당시의 버전 기준으로 계속 보입니다. 게시해도 과거 기록의 총공수는 바뀌지 않습니다.',
    roleLock: '게시된 역할은 삭제할 수 없습니다. 사용을 끄세요.',
    restoreHint: v => `v${v} 내용을 편집본에 불러왔습니다. 게시해야 반영됩니다.`,
  },
  users: {
    h: '사용자·권한',
    lead: '로그인할 수 있는 계정과 할 수 있는 일을 정합니다. 역할은 서버(RLS)에서도 똑같이 적용됩니다.',
    lastAdmin: '마지막 관리자는 강등하거나 해제할 수 없습니다. 다른 계정을 먼저 관리자로 지정하세요.',
    self: '본인 계정은 역할을 바꾸거나 해제할 수 없습니다.',
    invalid: '이메일 형식이 올바르지 않습니다.',
    exists: '이미 등록된 이메일입니다.',
    forbidden: '관리자만 바꿀 수 있습니다.',
    ivTitle: '면담 이력 열람 범위',
    ivBody: '지금은 허용된 모든 계정이 열람합니다. 범위는 결정 후 적용됩니다.',
  },
};

// ═══ 상태 ═══
const _acNewUserForm = () => ({ email: '', role: 'editor', personId: '', note: '' });
const _ac = {
  tab: 'codes',
  pending: null,          // 탭 전환 확인 대기 중인 탭
  focusKey: null,         // 다음 렌더 후 포커스할 컨트롤 키
  loading: { codes: false, basis: false },
  autoTried: { codes: false, basis: false },
  codes: { group: null, cat: null, item: null, drafts: {}, baseRows: {}, busy: false },
  basis: { draft: null, baseJson: '', published: null, baseVersion: -1, source: null, view: null, reason: '', busy: false, conflict: false, serverErrors: [] },
  users: { status: 'idle', list: [], adding: false, busy: false, form: _acNewUserForm(), formMsg: '' },
};

// ═══ 공통 헬퍼 ═══
const _acClone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const _acHasCodes = () => typeof CODES !== 'undefined' && typeof CodeAPI !== 'undefined';
const _acHasBasis = () => typeof BASIS !== 'undefined' && typeof BasisAPI !== 'undefined';
const _acHasUsers = () => typeof UserAPI !== 'undefined';
function _acAdmin() { try { return typeof isAdmin === 'function' && !!isAdmin(); } catch (e) { return false; } }
const _acMe = () => String((typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.email) || '').toLowerCase();
const _acPalette = () => (typeof PRESET_COLORS !== 'undefined' && Array.isArray(PRESET_COLORS) && PRESET_COLORS.length ? PRESET_COLORS : AC_FALLBACK_PALETTE);
const _acMembers = () => (typeof DATA !== 'undefined' && Array.isArray(DATA.members) ? DATA.members : []);
const _acModalOpen = () => { const m = document.getElementById('acModal'); return !!m && !m.classList.contains('hidden'); };
const _acDrawerOnSettings = () => !!document.getElementById('mgmtDrawer')?.classList.contains('open')
  && typeof state !== 'undefined' && state.mgmtTab === 'settings';
function _acRefreshDrawer() { if (_acDrawerOnSettings() && typeof renderDrawerContent === 'function') renderDrawerContent(); }
function _acSay(msg, tone) {
  const el = document.getElementById('acLive'); if (!el) return;
  el.textContent = msg || ''; el.dataset.tone = tone || '';
}
const _acNoLayer = api => `<div class="ac-state" role="status">${esc(AC_T.noLayer(api))}</div>`;
const _acStateBox = (msg, act, label) => `<div class="ac-state" role="status">${esc(msg)}${act
  ? `<br><button type="button" class="btn-ghost" data-ac-act="${esc(act)}">${esc(label || AC_T.retry)}</button>` : ''}</div>`;
const _acBanner = (tone, html, btns = '') => `<div class="ac-banner is-${tone}"${tone === 'err' ? ' role="alert"' : ''}><div class="ac-banner-msg">${html}</div>${btns ? `<div class="ac-banner-acts">${btns}</div>` : ''}</div>`;
const _acSw = (attrs, checked, label, disabled) => `<label class="ac-sw"><input type="checkbox" role="switch" ${attrs} ${checked ? 'checked' : ''}${disabled ? ' disabled' : ''} aria-label="${esc(label)}"><span class="ac-sw-ui" aria-hidden="true"></span></label>`;

// ═══ 순수 함수 ═══
// 키 정렬 JSON (변경 비교용 스냅샷)
function _acStable(v) {
  if (Array.isArray(v)) return '[' + v.map(_acStable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + _acStable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
// 이름 → 키 후보 (영문 소문자·숫자·밑줄)
function _acSlug(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
}
// 중복 없는 키. 이름에서 만들 수 없으면(한글 등) prefix_1, prefix_2 …
function _acMakeKey(name, taken, prefix = 'code') {
  const set = taken instanceof Set ? taken : new Set(taken || []);
  let base = _acSlug(name);
  if (base && !/^[a-z]/.test(base)) base = `${prefix}_${base}`;
  if (!base) { let n = 1; while (set.has(`${prefix}_${n}`)) n++; return `${prefix}_${n}`; }
  let k = base, n = 2;
  while (set.has(k)) k = `${base}_${n++}`;
  return k;
}
// 항목 키: '분류키.이름슬러그' (data.js 내장 가져오기와 같은 모양). 중복이면 _2, _3 …
function _acItemKey(name, parent, taken) {
  const set = taken instanceof Set ? taken : new Set(taken || []);
  const slug = _acSlug(name);
  if (!slug) { let n = 1; while (set.has(`${parent}.item_${n}`)) n++; return `${parent}.item_${n}`; }
  let k = `${parent}.${slug}`, n = 2;
  while (set.has(k)) k = `${parent}.${slug}_${n++}`;
  return k;
}
// 배열에서 i 번째를 d(-1|1) 만큼 옮긴 새 배열
function _acMove(list, i, d) {
  const a = list.slice(), j = i + d;
  if (i < 0 || j < 0 || i >= a.length || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}
const _acNum = (v, d = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : d;
};
const _acStr = v => String(v ?? '').trim();
const _acArr = v => (Array.isArray(v) ? v : []);

// 기준표 content 정규화(모르는 필드는 보존 — 확장 대비). 입력은 바꾸지 않는다
function _acBasisNormalize(content) {
  const src = content && typeof content === 'object' ? content : {};
  const m = src.meta && typeof src.meta === 'object' ? src.meta : {};
  const scales = AC_SCALES.map(s => s.id);
  return {
    ...src,
    meta: { ...m, title: _acStr(m.title), subtitle: _acStr(m.subtitle), assumptions: _acArr(m.assumptions).map(_acStr).filter(Boolean) },
    categories: _acArr(src.categories).map(c => ({ ...c, name: _acStr(c.name), color: _acStr(c.color) })),
    roles: _acArr(src.roles).map(r => ({ ...r, id: _acStr(r.id), cat: _acStr(r.cat), name: _acStr(r.name), base: _acNum(r.base),
      scale: scales.includes(r.scale) ? r.scale : 'dev', note: _acStr(r.note), active: r.active !== false })),
    vars: _acArr(src.vars).map(v => {
      const o = { ...v, id: _acStr(v.id), name: _acStr(v.name), unit: _acStr(v.unit), placeholder: _acStr(v.placeholder),
        note: _acStr(v.note), active: v.active !== false, inTotal: !!v.inTotal };
      if (v.scale == null || v.scale === '') delete o.scale; else o.scale = _acStr(v.scale);
      return o;
    }),
    siPresets: _acArr(src.siPresets).map(s => ({ ...s, id: _acStr(s.id), name: _acStr(s.name), mm: _acNum(s.mm) })),
  };
}

// 두 content 의 차이 목록: {kind, id?, field?, op:'add'|'remove'|'change'|'order', from?, to?}
function _acBasisDiff(prev, next) {
  const a = _acBasisNormalize(prev), b = _acBasisNormalize(next), out = [];
  ['title', 'subtitle'].forEach(f => {
    if (a.meta[f] !== b.meta[f]) out.push({ kind: 'meta', id: f, field: f, op: 'change', from: a.meta[f], to: b.meta[f] });
  });
  if (_acStable(a.meta.assumptions) !== _acStable(b.meta.assumptions))
    out.push({ kind: 'meta', id: 'assumptions', field: 'assumptions', op: 'change', from: a.meta.assumptions, to: b.meta.assumptions });
  const list = (kind, xs, ys, fields) => {
    const am = new Map(xs.map(x => [x.id, x])), bm = new Map(ys.map(y => [y.id, y]));
    ys.forEach(y => {
      const x = am.get(y.id);
      if (!x) { out.push({ kind, id: y.id, op: 'add', to: y }); return; }
      fields.forEach(f => { if (_acStable(x[f]) !== _acStable(y[f])) out.push({ kind, id: y.id, field: f, op: 'change', from: x[f], to: y[f] }); });
    });
    xs.forEach(x => { if (!bm.has(x.id)) out.push({ kind, id: x.id, op: 'remove', from: x }); });
    const ao = xs.filter(x => bm.has(x.id)).map(x => x.id), bo = ys.filter(y => am.has(y.id)).map(y => y.id);
    if (ao.join('\u0001') !== bo.join('\u0001')) out.push({ kind, op: 'order' });
  };
  list('category', a.categories.map(c => ({ ...c, id: c.name })), b.categories.map(c => ({ ...c, id: c.name })), ['color']);
  list('role', a.roles, b.roles, ['cat', 'name', 'base', 'scale', 'note', 'active']);
  list('var', a.vars, b.vars, ['name', 'unit', 'placeholder', 'note', 'scale', 'active', 'inTotal']);
  list('si', a.siPresets, b.siPresets, ['name', 'mm']);
  return out;
}
function _acFmtVal(field, v) {
  if (typeof v === 'boolean') return v ? '켬' : '끔';
  if (field === 'scale') return AC_SCALES.find(s => s.id === v)?.label || String(v ?? '');
  if (Array.isArray(v)) return `${v.length}줄`;
  if (typeof v === 'number') return String(v);
  const s = String(v ?? '');
  return s ? (s.length > 24 ? `“${s.slice(0, 24)}…”` : `“${s}”`) : '(빈 값)';
}
// 차이 한 줄 설명 (next: 이름을 찾을 최신 content)
function _acBasisDiffText(d, next) {
  const n = _acBasisNormalize(next);
  const pool = { role: n.roles, var: n.vars, si: n.siPresets, category: n.categories.map(c => ({ ...c, id: c.name })) }[d.kind] || [];
  const nm = (d.to && d.to.name) || (d.from && d.from.name) || pool.find(x => x.id === d.id)?.name || d.id || '';
  const kind = AC_KIND_LABEL[d.kind] || d.kind;
  if (d.op === 'order') return `${kind} 순서 변경`;
  if (d.op === 'add') return `${kind} 추가: ${nm || '(이름 없음)'}`;
  if (d.op === 'remove') return `${kind} 삭제: ${nm}`;
  const field = AC_FIELD_LABEL[d.field] || d.field;
  if (d.kind === 'meta') return `${field}: ${_acFmtVal(d.field, d.from)} → ${_acFmtVal(d.field, d.to)}`;
  return `${kind} ${nm} · ${field}: ${_acFmtVal(d.field, d.from)} → ${_acFmtVal(d.field, d.to)}`;
}
// 화면 항목 옆에 붙일 입력 오류 { 'roles.3.base': '…' } (원본 입력값 기준)
function _acBasisFieldErrors(content) {
  const c = content || {}, e = {};
  const isNum = v => _acStr(v) !== '' && Number.isFinite(Number(_acStr(v)));
  const range = (v, max) => isNum(v) && +_acStr(v) >= 0 && +_acStr(v) <= max;
  const cats = new Set(_acArr(c.categories).map(x => _acStr(x.name)));
  const ids = new Set();
  _acArr(c.roles).forEach((r, i) => {
    const id = _acStr(r.id);
    if (!_acStr(r.name)) e[`roles.${i}.name`] = '역할 이름을 입력하세요.';
    else if (ids.has(id)) e[`roles.${i}.name`] = `역할 id 가 중복됩니다(${id}).`;
    ids.add(id);
    if (!range(r.base, AC_LIMITS.baseMax)) e[`roles.${i}.base`] = `0~${AC_LIMITS.baseMax} 사이 숫자`;
    if (cats.size && !cats.has(_acStr(r.cat))) e[`roles.${i}.cat`] = '없는 분류입니다.';
  });
  _acArr(c.vars).forEach((v, i) => { if (!_acStr(v.name)) e[`vars.${i}.name`] = '항목 이름을 입력하세요.'; });
  _acArr(c.siPresets).forEach((s, i) => {
    if (!_acStr(s.name)) e[`siPresets.${i}.name`] = '이름을 입력하세요.';
    if (!range(s.mm, AC_LIMITS.baseMax)) e[`siPresets.${i}.mm`] = `0~${AC_LIMITS.baseMax} 사이 숫자`;
  });
  return e;
}
// 이전 버전 복원: 그 버전 내용 + (현재 게시본에만 있는 역할은 지울 수 없으므로 '사용 끔' 으로 덧붙임)
function _acBasisRestore(versionContent, publishedContent) {
  const v = _acBasisNormalize(versionContent);
  if (!publishedContent) return v;
  const p = _acBasisNormalize(publishedContent);
  const roleIds = new Set(v.roles.map(r => r.id));
  p.roles.forEach(r => { if (!roleIds.has(r.id)) v.roles.push({ ...r, active: false }); });
  const varIds = new Set(v.vars.map(x => x.id));
  p.vars.forEach(x => { if (!varIds.has(x.id)) v.vars.push({ ...x }); });
  const catNames = new Set(v.categories.map(c => c.name));
  p.categories.forEach(c => { if (!catNames.has(c.name) && v.roles.some(r => r.cat === c.name)) { v.categories.push({ ...c }); catNames.add(c.name); } });
  return v;
}
function _acBasisAddRole(content, cat) {
  const n = _acClone(content);
  n.roles = _acArr(n.roles);
  const id = _acMakeKey('', new Set(n.roles.map(r => _acStr(r.id))), 'role');
  n.roles.push({ id, cat: cat || _acArr(n.categories)[0]?.name || '', name: '', base: 1, scale: 'dev', note: '', active: true });
  return n;
}
function _acBasisAddSi(content) {
  const n = _acClone(content);
  n.siPresets = _acArr(n.siPresets);
  n.siPresets.push({ id: _acMakeKey('', new Set(n.siPresets.map(s => _acStr(s.id))), 'si'), name: '', mm: 1 });
  return n;
}
function _acSetPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o = o?.[/^\d+$/.test(ks[i]) ? +ks[i] : ks[i]]; if (o == null) return; }
  const last = ks[ks.length - 1];
  if (last === '__proto__' || last === 'constructor') return;
  o[/^\d+$/.test(last) ? +last : last] = val;
}

// ═══ 공통코드: 모델 ═══
function _acCodeRow(r) {
  return { groupId: String(r.groupId ?? r.group_id ?? ''), code: String(r.code ?? ''),
    parentCode: (r.parentCode ?? r.parent_code) || null, name: String(r.name ?? ''), color: r.color || null,
    sortOrder: Number(r.sortOrder ?? r.sort_order ?? 0) || 0, active: r.active !== false,
    meta: r.meta && typeof r.meta === 'object' ? r.meta : {} };
}
const _acGroupRow = g => ({ id: String(g.id ?? ''), name: String(g.name ?? g.id ?? ''), system: !!g.system, sortOrder: Number(g.sortOrder ?? g.sort_order ?? 0) || 0 });
const _acCodesOk = () => _acHasCodes() && CODES.status === 'ok';
const _acDbRows = gid => (_acCodesOk() ? _acArr(CODES.codes).map(_acCodeRow).filter(r => r.groupId === gid) : []);
function _acGroups() {
  const map = new Map(AC_BUILTIN_GROUPS.map(g => [g.id, { ...g }]));
  if (_acCodesOk()) _acArr(CODES.groups).map(_acGroupRow).forEach(g => {
    if (!g.id) return;
    const b = map.get(g.id);
    map.set(g.id, { ...g, name: g.name || b?.name || g.id, system: g.system || !!b?.system });
  });
  return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
function _acBuiltinRows(gid) {
  const rows = [];
  if (gid === 'skill') {
    let cats = AC_BUILTIN_SKILL_CATS, presets = typeof PRESET_SKILLS !== 'undefined' ? PRESET_SKILLS : {};
    try { if (typeof skillCategories === 'function') cats = skillCategories() || cats; } catch (e) { /* 내장 사용 */ }
    try { if (typeof skillPresets === 'function') presets = skillPresets() || presets; } catch (e) { /* 내장 사용 */ }
    const taken = new Set();
    cats.forEach((c, i) => {
      taken.add(String(c.key));
      rows.push({ groupId: 'skill', code: String(c.key), parentCode: null, name: String(c.label ?? c.key),
        color: c.color || AC_BUILTIN_SKILL_CATS.find(x => x.key === c.key)?.color || null, sortOrder: (i + 1) * 10, active: true, meta: {} });
    });
    cats.forEach(c => _acArr(presets[c.key]).forEach((n, j) => {
      const code = _acItemKey(n, String(c.key), taken); taken.add(code);
      rows.push({ groupId: 'skill', code, parentCode: String(c.key), name: String(n), color: null, sortOrder: (j + 1) * 10, active: true, meta: {} });
    }));
  } else if (gid === 'pj_status') {
    const map = typeof STATUS_KR !== 'undefined' ? STATUS_KR : {};
    Object.keys(map).forEach((k, i) => rows.push({ groupId: 'pj_status', code: k, parentCode: null, name: String(map[k]),
      color: null, sortOrder: (i + 1) * 10, active: true, meta: {} }));
  }
  return rows;
}
// 'db' = DB 값으로 관리 중, 'builtin' = 내장 기본값을 보여 주는 중(읽기 전용)
const _acGroupSource = gid => (_acDbRows(gid).length ? 'db' : AC_BUILTIN_GROUPS.some(g => g.id === gid) ? 'builtin' : 'db');
let _acUid = 0;
const _acCodesPlain = rows => rows.map(({ _uid, _new, ...r }) => r);
function _acCodesDraft(gid) {
  const C = _ac.codes;
  if (!C.drafts[gid]) {
    const src = _acGroupSource(gid) === 'db' ? _acDbRows(gid) : _acBuiltinRows(gid);
    C.drafts[gid] = src.map(r => ({ ...r, _uid: 'u' + (++_acUid) }));
    C.baseRows[gid] = _acClone(_acCodesPlain(C.drafts[gid]));
  }
  return C.drafts[gid];
}
function _acCodesChanges(gid) {
  const C = _ac.codes, rows = C.drafts[gid];
  if (!rows) return 0;
  const base = new Map(_acArr(C.baseRows[gid]).map(r => [r.code, _acStable(r)]));
  return _acCodesPlain(rows).filter(r => base.get(r.code) !== _acStable(r)).length;
}
const _acCodesDirtyGroups = () => Object.keys(_ac.codes.drafts).filter(g => _acCodesChanges(g) > 0);
const _acBySort = (a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'ko');
const _acCats = rows => rows.filter(r => !r.parentCode).sort(_acBySort);
const _acItems = (rows, catCode) => rows.filter(r => r.parentCode === catCode).sort(_acBySort);
const _acCodesCanEdit = gid => _acAdmin() && _acCodesOk() && _acGroupSource(gid) === 'db' && !_ac.codes.busy;
// 현재 선택(그룹·분류·항목)과 상세 대상
function _acCodesSel() {
  const C = _ac.codes, groups = _acGroups();
  if (!groups.some(g => g.id === C.group)) { C.group = groups[0]?.id || null; C.cat = C.item = null; }
  const g = groups.find(x => x.id === C.group) || null;
  const rows = g ? _acCodesDraft(g.id) : [];
  const cats = _acCats(rows);
  if (!cats.some(r => r._uid === C.cat)) { C.cat = cats[0]?._uid || null; C.item = null; }
  const cat = cats.find(r => r._uid === C.cat) || null;
  const items = cat ? _acItems(rows, cat.code) : [];
  if (C.item && !items.some(r => r._uid === C.item)) C.item = null;
  const item = items.find(r => r._uid === C.item) || null;
  return { groups, g, rows, cats, cat, items, item, target: item || cat };
}
// 그룹 초안을 버리고 DB 에서 다시 만든다(선택은 코드 키로 유지)
function _acCodesReset(gid) {
  const C = _ac.codes;
  const keep = gid === C.group ? (() => { const s = _acCodesSel(); return { cat: s.cat?.code, item: s.item?.code }; })() : null;
  delete C.drafts[gid]; delete C.baseRows[gid];
  if (keep) {
    const rows = _acCodesDraft(gid);
    C.cat = rows.find(r => !r.parentCode && r.code === keep.cat)?._uid || null;
    C.item = rows.find(r => r.parentCode && r.code === keep.item)?._uid || null;
  }
}

// ═══ 공통코드: 화면 ═══
function _acRenderCodes() {
  if (!_acHasCodes()) return _acNoLayer('CODES / CodeAPI');
  const st = CODES.status;
  if (st === 'idle' || st === 'loading') return _acStateBox(AC_T.loading);
  const C = _ac.codes, admin = _acAdmin();
  const { groups, g, rows, cats, cat, items, item, target } = _acCodesSel();
  const src = g ? _acGroupSource(g.id) : 'db';
  const edit = !!g && _acCodesCanEdit(g.id);
  const sys = !!g?.system;
  const T = AC_T.codes;

  let banner = '';
  if (st === 'missing') banner = _acBanner('warn', esc(T.missing), `<button type="button" class="btn-ghost ac-btn-sm" data-ac-act="codes-retry">${esc(AC_T.reload)}</button>`);
  else if (st === 'error') banner = _acBanner('err', esc(T.error), `<button type="button" class="btn-ghost ac-btn-sm" data-ac-act="codes-retry">${esc(AC_T.retry)}</button>`);
  else if (src === 'builtin') banner = _acBanner('info', esc(T.builtin), admin
    ? `<button type="button" class="btn-primary ac-btn-sm" data-ac-act="codes-import"${C.busy ? ' disabled' : ''}>${esc(T.importBtn)}</button>` : '');
  if (!admin) banner += _acBanner('info', esc(AC_T.readOnly));

  const lv1 = groups.map(x => {
    const r = _acCodesDraft(x.id), nc = r.filter(y => !y.parentCode).length, ni = r.length - nc;
    const sub = x.system ? `시스템 코드 · ${nc}개` : `분류 ${nc} · 항목 ${ni}`;
    const dirty = _acCodesChanges(x.id) > 0;
    return `<li><button type="button" class="ac-it" data-ac-act="code-group" data-gid="${esc(x.id)}" ${x.id === C.group ? 'aria-current="true"' : ''}>
      <span class="ac-it-nm">${esc(x.name)}${dirty ? ' <span class="ac-chip is-warn">저장 안 됨</span>' : ''}<span class="ac-it-sub">키 ${esc(x.id)} · ${esc(sub)}</span></span>
      ${x.system ? '<span class="ac-chip is-lock" title="코드 값이 프로그램 동작과 연결돼 있어 항목을 추가·삭제할 수 없습니다">🔒 시스템</span>' : ''}</button></li>`;
  }).join('');

  const lv2 = cats.map(x => `<li><button type="button" class="ac-it${x.active ? '' : ' is-off'}" data-ac-act="code-cat" data-uid="${esc(x._uid)}" ${x._uid === C.cat ? 'aria-current="true"' : ''}>
      <span class="ac-dot" style="background:${safeColor(x.color)}" aria-hidden="true"></span>
      <span class="ac-it-nm"><span data-ac-label="${esc(x._uid)}">${esc(x.name || '(이름 없음)')}</span>${x._new ? ' <span class="ac-chip is-ok">새 분류</span>' : ''}
        <span class="ac-it-sub">키 <span data-ac-keylabel="${esc(x._uid)}">${esc(x.code)}</span>${x.active ? '' : ' · 사용 안 함'}</span></span></button></li>`).join('')
    || `<li class="ac-empty">${esc(T.noCats)}</li>`;

  const lv3 = sys ? `<li class="ac-empty">${esc(T.sysOnly)}</li>`
    : items.map(x => `<li><button type="button" class="ac-it${x.active ? '' : ' is-off'}" data-ac-act="code-item" data-uid="${esc(x._uid)}" ${x._uid === C.item ? 'aria-current="true"' : ''}>
        <span class="ac-it-nm"><span data-ac-label="${esc(x._uid)}">${esc(x.name || '(이름 없음)')}</span>${x._new ? ' <span class="ac-chip is-ok">새 항목</span>' : ''}${x.active ? '' : ' <span class="ac-it-sub">사용 안 함</span>'}</span></button></li>`).join('')
      || `<li class="ac-empty">${esc(T.noItems)}${edit && cat ? ' 아래 버튼으로 추가하세요.' : ''}</li>`;

  const detail = target ? _acCodeDetailHtml(target, rows, { edit, sys }) : '';
  const changes = g ? _acCodesChanges(g.id) : 0;
  const foot = g && admin && src === 'db' && _acCodesOk() ? `<div class="ac-foot">
      <span class="ac-foot-st" id="acCodesSt">${esc(changes ? `수정한 내용 ${changes}건 · 저장 전` : AC_T.noChange)}</span>
      <button type="button" class="btn-ghost" data-ac-act="codes-revert" id="acCodesRevert"${changes && !C.busy ? '' : ' disabled'}>변경 취소</button>
      <button type="button" class="btn-primary" data-ac-act="codes-save" id="acCodesSave"${changes && !C.busy ? '' : ' disabled'}>${C.busy ? esc(AC_T.saving) : '저장'}</button>
    </div>` : '';

  return `<div class="ac-hd"><div><h3 class="ac-h">${esc(T.h)}</h3><p class="ac-lead">${T.lead}</p></div></div>
    ${banner}
    <div class="ac-cols">
      <section class="ac-col" aria-labelledby="acLv1T"><div class="ac-col-hd"><b id="acLv1T">대분류</b><small>코드 그룹</small></div>
        <ul class="ac-items">${lv1}</ul><p class="ac-col-note">${esc(T.groupHint)}</p></section>
      <section class="ac-col" aria-labelledby="acLv2T"><div class="ac-col-hd"><b id="acLv2T">${esc(g ? `${g.name} · 중분류` : '중분류')}</b><small>분류</small></div>
        <ul class="ac-items">${lv2}</ul>
        ${edit && !sys ? '<button type="button" class="ac-add" data-ac-act="code-add-cat">+ 분류 추가</button>' : ''}</section>
      <section class="ac-col" aria-labelledby="acLv3T"><div class="ac-col-hd"><b id="acLv3T">${esc(cat ? `${cat.name || '(이름 없음)'} · 항목` : '항목')}</b><small>항목</small></div>
        <ul class="ac-items">${lv3}</ul>
        ${edit && !sys && cat ? '<button type="button" class="ac-add" data-ac-act="code-add-item">+ 항목 추가</button>' : ''}
        ${detail}</section>
    </div>
    ${foot}`;
}
function _acCodeDetailHtml(t, rows, { edit, sys }) {
  const T = AC_T.codes, isCat = !t.parentCode;
  const sibs = isCat ? _acCats(rows) : _acItems(rows, t.parentCode);
  const idx = sibs.indexOf(t);
  const lockOthers = !edit || sys;      // system 그룹은 이름만 편집
  const colors = isCat ? `<div class="ac-fld"><span class="ac-fld-l" id="acCodeColorL">색</span>
      <div class="ac-swatches" role="group" aria-labelledby="acCodeColorL">${_acPalette().map((c, i) => `<button type="button" data-ac-act="code-color" data-color="${esc(c)}"
        style="background:${safeColor(c)}" aria-label="색 ${i + 1} ${esc(c)}" aria-pressed="${String(t.color || '').toLowerCase() === c.toLowerCase()}"${lockOthers ? ' disabled' : ''}></button>`).join('')}</div></div>` : '';
  return `<div class="ac-detail" role="group" aria-label="${isCat ? '분류' : '항목'} 상세">
    <div class="ac-fld"><label for="acCodeName">표시 이름</label>
      <input class="ac-inp" id="acCodeName" maxlength="${AC_LIMITS.codeName}" value="${esc(t.name)}" autocomplete="off"${edit ? '' : ' disabled'} aria-describedby="acCodeNameErr">
      <span class="ac-err" id="acCodeNameErr"></span></div>
    ${colors}
    <div class="ac-fld"><span class="ac-fld-l">코드 키</span><span class="ac-mono" id="acCodeKey">${esc(t.code)}</span>
      <small>${esc(t._new ? T.keyNew : T.keyFixed)}</small></div>
    ${sys ? `<p class="ac-note">${esc(T.sysLock)}</p>` : ''}
    <div class="ac-detail-row">
      <label class="ac-inline">${_acSw('id="acCodeActive"', t.active, '사용', lockOthers)} 사용</label>
      <span class="ac-order" role="group" aria-label="순서">
        <button type="button" class="ac-ibtn" data-ac-act="code-move" data-d="-1" aria-label="위로"${lockOthers || idx <= 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="ac-ibtn" data-ac-act="code-move" data-d="1" aria-label="아래로"${lockOthers || idx < 0 || idx >= sibs.length - 1 ? ' disabled' : ''}>▼</button>
      </span>
    </div>
    ${t._new && edit ? '<div class="ac-detail-row is-end"><button type="button" class="btn-ghost ac-btn-sm" data-ac-act="code-remove-new">추가 취소</button></div>'
      : (!sys && edit ? '<small class="ac-muted">삭제 대신 사용을 끄세요. 저장된 데이터가 이 키를 참조할 수 있습니다.</small>' : '')}
  </div>`;
}
// 입력 중 부분 갱신(재렌더 없이)
function _acCodesRefresh() {
  const C = _ac.codes, s = _acCodesSel(), n = s.g ? _acCodesChanges(s.g.id) : 0;
  const st = document.getElementById('acCodesSt'); if (st) st.textContent = n ? `수정한 내용 ${n}건 · 저장 전` : AC_T.noChange;
  ['acCodesRevert', 'acCodesSave'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !n || C.busy; });
  if (s.target) {
    document.querySelectorAll(`[data-ac-label="${CSS.escape(s.target._uid)}"]`).forEach(el => { el.textContent = s.target.name || '(이름 없음)'; });
    document.querySelectorAll(`[data-ac-keylabel="${CSS.escape(s.target._uid)}"]`).forEach(el => { el.textContent = s.target.code; });
    const k = document.getElementById('acCodeKey'); if (k) k.textContent = s.target.code;
    const e = document.getElementById('acCodeNameErr'); if (e) e.textContent = s.target.name.trim() ? '' : AC_T.codes.nameReq;
    if (!s.target.parentCode) { const h = document.getElementById('acLv3T'); if (h) h.textContent = `${s.target.name || '(이름 없음)'} · 항목`; }
  }
  _acUpdateTabDots();
}
function _acCodeSetName(v) {
  const s = _acCodesSel(), t = s.target;
  if (!t || !_acCodesCanEdit(s.g.id)) return;
  t.name = v;
  if (t._new) {
    const old = t.code, others = () => new Set(s.rows.filter(r => r !== t).map(r => r.code));
    t.code = t.parentCode ? _acItemKey(v, t.parentCode, others()) : _acMakeKey(v, others(), 'cat');
    // 새 분류의 키가 바뀌면 그 아래 새 항목들의 상위·키도 따라간다
    if (!t.parentCode && old !== t.code) s.rows.forEach(r => {
      if (r.parentCode !== old) return;
      r.parentCode = t.code;
      if (r._new) r.code = _acItemKey(r.name, t.code, new Set(s.rows.filter(x => x !== r).map(x => x.code)));
    });
  }
  _acCodesRefresh();
}
function _acCodeAdd(kind) {
  const s = _acCodesSel();
  if (!s.g || !_acCodesCanEdit(s.g.id) || s.g.system || (kind === 'item' && !s.cat)) return;
  const sibs = kind === 'cat' ? s.cats : s.items;
  const taken = new Set(s.rows.map(r => r.code));
  const row = { groupId: s.g.id, code: kind === 'cat' ? _acMakeKey('', taken, 'cat') : _acItemKey('', s.cat.code, taken), parentCode: kind === 'cat' ? null : s.cat.code,
    name: '', color: kind === 'cat' ? _acPalette()[sibs.length % _acPalette().length] : null,
    sortOrder: Math.max(0, ...sibs.map(r => r.sortOrder)) + 10, active: true, meta: {}, _new: true, _uid: 'u' + (++_acUid) };
  s.rows.push(row);
  if (kind === 'cat') { _ac.codes.cat = row._uid; _ac.codes.item = null; } else _ac.codes.item = row._uid;
  _ac.focusKey = '#acCodeName';
  _acRenderPanel();
}
function _acCodeMove(d) {
  const s = _acCodesSel(), t = s.target;
  if (!t || !_acCodesCanEdit(s.g.id) || s.g.system) return;
  const sibs = t.parentCode ? s.items : s.cats;
  _acMove(sibs, sibs.indexOf(t), d).forEach((r, k) => { r.sortOrder = (k + 1) * 10; });
  _ac.focusKey = `act:code-move:${d}`;
  _acRenderPanel();
}
async function _acCodesSave() {
  const C = _ac.codes, s = _acCodesSel();
  if (!s.g || !_acCodesCanEdit(s.g.id) || !_acCodesChanges(s.g.id)) return;
  const bad = s.rows.find(r => !r.name.trim());
  if (bad) {
    if (bad.parentCode) { C.cat = s.rows.find(r => !r.parentCode && r.code === bad.parentCode)?._uid || C.cat; C.item = bad._uid; }
    else { C.cat = bad._uid; C.item = null; }
    _ac.focusKey = '#acCodeName'; _acRenderPanel(); _acCodesRefresh();
    _acSay(AC_T.codes.nameReq, 'err'); return;
  }
  const keys = new Set();
  for (const r of s.rows) { if (keys.has(r.code)) { _acSay(`코드 키가 중복됩니다(${r.code}).`, 'err'); return; } keys.add(r.code); }
  const gid = s.g.id;
  const rows = _acCodesPlain(s.rows).map(r => ({ ...r, name: r.name.trim() }));
  const gen = C.gen = (C.gen || 0) + 1;   // 응답이 돌아왔을 때 모달이 닫혔다 다시 열렸으면(세대 번호가 바뀜) 새 초안을 건드리지 않는다
  C.busy = true; _ac.focusKey = '#acCodesSave'; _acRenderPanel(); _acSay(AC_T.saving);
  let r;
  try { r = await CodeAPI.save(gid, rows); } catch (e) { console.error(e); r = { code: 'error', message: e?.message }; }
  if (gen !== C.gen) return;   // 모달이 닫힌 사이 끝난 저장: 서버 반영은 끝났으니 화면 상태만 건드리지 않는다
  C.busy = false;
  if (r === true) {
    try { await CodeAPI.load(); } catch (e) { console.error(e); }
    _acCodesReset(gid);
    _acSay(`${s.g.name}: ${AC_T.saved}`, 'ok');
  } else {
    _acSay(r?.code === 'forbidden' ? AC_T.users.forbidden : `저장하지 못했습니다.${r?.message ? ` (${r.message})` : ''}`, 'err');
  }
  _acRenderPanel(); _acRefreshDrawer();
}
async function _acCodesImport() {
  const C = _ac.codes;
  if (!_acAdmin() || !_acCodesOk() || C.busy) return;
  C.busy = true; _acRenderPanel(); _acSay('가져오는 중…');
  let r;
  try { r = await CodeAPI.importBuiltin(); } catch (e) { console.error(e); r = { code: 'error', message: e?.message }; }
  C.busy = false;
  if (r === true) {
    try { await CodeAPI.load(); } catch (e) { console.error(e); }
    C.drafts = {}; C.baseRows = {}; C.cat = C.item = null;
    _acSay(AC_T.codes.imported, 'ok');
  } else _acSay(`가져오지 못했습니다.${r?.message ? ` (${r.message})` : ''}`, 'err');
  _acRenderPanel(); _acRefreshDrawer();
}

// ═══ 기준표: 모델 ═══
function _acSafeBuiltin() { try { return BasisAPI.builtinContent(); } catch (e) { console.error(e); return {}; } }
function _acBasisDirty() {
  const B = _ac.basis;
  return !!B.draft && B.source === 'db' && _acStable(_acBasisNormalize(B.draft)) !== B.baseJson;
}
// BASIS 에서 편집 기준선을 맞춘다(편집 중이면 그대로 두고 충돌은 게시 때 감지)
function _acBasisSync() {
  const B = _ac.basis;
  let cur = null;
  try { cur = BasisAPI.current(); } catch (e) { console.error(e); }
  if (!cur || !cur.content) cur = { id: null, version: 0, content: _acSafeBuiltin(), source: 'builtin' };
  // 게시본이 있는데 current() 가 내장을 돌려주면(게시본이 규칙에 어긋남) 게시본 기준으로 고쳐서 다시 게시할 수 있게 한다
  const headV = BASIS.status === 'ok' ? Number(BASIS.basis?.currentVersion) || 0 : 0;
  const broken = cur.source !== 'db' && headV > 0 ? _acVersions().find(v => Number(v.version) === headV) : null;
  const src = (cur.source === 'db' && BASIS.status === 'ok') || broken ? 'db' : 'builtin';
  const ver = broken ? headV : src === 'db' ? Number(cur.version) || 0 : 0;
  B.broken = broken ? headV : 0;
  if (B.draft === null || B.source !== src || (B.baseVersion !== ver && !_acBasisDirty())) {
    if (broken) {
      const pub = _acBasisNormalize(broken.content);
      B.published = pub; B.baseJson = _acStable(pub);
      B.draft = _acBasisRestore(cur.content, pub);   // 내장값 + 게시된 역할 id 보존(사용 끔)
    } else {
      const norm = _acBasisNormalize(cur.content);
      B.draft = _acClone(norm); B.baseJson = _acStable(norm);
      B.published = src === 'db' ? norm : null;
    }
    B.baseVersion = ver; B.source = src; B.conflict = false; B.serverErrors = [];
  }
}
const _acBasisEditable = () => {
  const B = _ac.basis;
  return _acAdmin() && _acHasBasis() && BASIS.status === 'ok' && B.source === 'db' && B.view == null && !B.busy && !!B.draft;
};
const _acVersions = () => (_acHasBasis() ? _acArr(BASIS.versions) : []);
const _acCurVersion = () => Number(BASIS?.basis?.currentVersion ?? _ac.basis.baseVersion) || 0;
function _acBasisValidate() {
  const B = _ac.basis;
  if (!_acBasisDirty() || typeof BasisAPI.validate !== 'function') return [];
  try { return _acArr(BasisAPI.validate(_acBasisNormalize(B.draft), B.published || undefined)).map(String); }
  catch (e) { return [String(e?.message || e)]; }
}
function _acBasisErr(r) {
  switch (r?.code) {
    case 'conflict': return AC_T.basis.conflict;
    case 'forbidden': return '관리자만 게시할 수 있습니다.';
    case 'invalid': return `입력값을 확인하세요.${r.message ? ` (${r.message})` : ''}`;
    default: return `게시하지 못했습니다.${r?.message ? ` (${r.message})` : ''}`;
  }
}

// ═══ 기준표: 화면 ═══
function _acRenderBasis() {
  if (!_acHasBasis()) return _acNoLayer('BASIS / BasisAPI');
  const st = BASIS.status, T = AC_T.basis;
  if (st === 'idle' || st === 'loading') return _acStateBox(AC_T.loading);
  if (st === 'error') return _acStateBox(T.error, 'basis-retry');
  _acBasisSync();
  const B = _ac.basis, admin = _acAdmin();
  const viewV = B.view != null ? _acVersions().find(v => Number(v.version) === B.view) : null;
  if (B.view != null && !viewV) B.view = null;
  const content = viewV ? _acBasisNormalize(viewV.content) : B.draft;
  const edit = _acBasisEditable();
  const publishedIds = new Set((B.published?.roles || []).map(r => r.id));
  const curV = _acCurVersion();

  let banner = '';
  if (st === 'missing') banner += _acBanner('warn', esc(T.missing), `<button type="button" class="btn-ghost ac-btn-sm" data-ac-act="basis-retry">${esc(AC_T.reload)}</button>`);
  else if (B.source === 'builtin') banner += _acBanner('info', esc(T.builtin), admin
    ? `<button type="button" class="btn-primary ac-btn-sm" data-ac-act="basis-import"${B.busy ? ' disabled' : ''}>${esc(T.importBtn)}</button>` : '');
  if (B.broken) banner += _acBanner('warn', `게시된 <b>v${esc(B.broken)}</b> 이 규칙에 맞지 않아 산정 화면은 내장 기준표를 쓰고 있습니다. 아래 내용(내장값 기준)을 확인해 새 버전으로 게시하세요.`);
  if (!admin) banner += _acBanner('info', esc(AC_T.readOnly));
  if (viewV) banner += _acBanner('view', `<b>v${esc(viewV.version)}</b> 내용을 보는 중입니다(읽기 전용).${viewV.reason ? ` 사유: ${esc(viewV.reason)}` : ''}`,
    `${admin && B.source === 'db' ? `<button type="button" class="btn-primary ac-btn-sm" data-ac-act="basis-restore" data-v="${esc(viewV.version)}">이 버전으로 복원</button>` : ''}
     <button type="button" class="btn-ghost ac-btn-sm" data-ac-act="basis-back">편집으로 돌아가기</button>`);
  if (B.conflict) banner += _acBanner('err', `${esc(T.conflict)} <span class="ac-muted">${esc(T.conflictSub)}</span>`,
    `<button type="button" class="btn-primary ac-btn-sm" data-ac-act="basis-reload">${esc(T.loadLatest)}</button>`);

  const dis = edit ? '' : ' disabled';
  const catOf = name => content.categories.find(c => c.name === name);
  const catOpts = cur => {
    const names = content.categories.map(c => c.name);
    if (cur && !names.includes(cur)) names.push(cur);
    return names.map(n => `<option value="${esc(n)}"${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
  };
  const err = key => `<span class="ac-err" id="acErr-${esc(key.replace(/\./g, '-'))}" data-ac-err="${esc(key)}"></span>`;
  const desc = key => `aria-describedby="acErr-${esc(key.replace(/\./g, '-'))}"`;

  const roles = content.roles.map((r, i) => {
    const nm = r.name || r.id, pub = publishedIds.has(r.id), p = `roles.${i}`;
    return `<tr class="${r.active === false ? 'is-off' : ''}">
      <td class="ac-order-cell"><span class="ac-order" role="group" aria-label="${esc(nm)} 순서">
        <button type="button" class="ac-ibtn" data-ac-act="role-move" data-i="${i}" data-d="-1" aria-label="${esc(nm)} 위로"${!edit || i === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="ac-ibtn" data-ac-act="role-move" data-i="${i}" data-d="1" aria-label="${esc(nm)} 아래로"${!edit || i === content.roles.length - 1 ? ' disabled' : ''}>▼</button></span></td>
      <td><span class="ac-catsel"><span class="ac-dot" style="background:${safeColor(catOf(r.cat)?.color)}" aria-hidden="true"></span>
        <select class="ac-inp" data-ac-b="${p}.cat" aria-label="${esc(nm)} 분류" ${desc(p + '.cat')}${dis}>${catOpts(r.cat)}</select></span>${err(p + '.cat')}</td>
      <td><input class="ac-inp" data-ac-b="${p}.name" value="${esc(r.name)}" maxlength="${AC_LIMITS.roleName}" aria-label="역할 이름 (${esc(r.id)})" ${desc(p + '.name')}${dis}>
        <small class="ac-id">id ${esc(r.id)}${pub || B.source !== 'db' ? '' : ' · 새 역할'}</small>${err(p + '.name')}</td>
      <td><select class="ac-inp" data-ac-b="${p}.scale" aria-label="${esc(nm)} 계산 방식"${dis}>${AC_SCALES.map(s => `<option value="${s.id}"${s.id === r.scale ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></td>
      <td class="is-num"><input class="ac-inp is-num" data-ac-b="${p}.base" value="${esc(r.base)}" inputmode="decimal" aria-label="${esc(nm)} 기준 M/M" ${desc(p + '.base')}${dis}>${err(p + '.base')}</td>
      <td><input class="ac-inp" data-ac-b="${p}.note" value="${esc(r.note)}" maxlength="${AC_LIMITS.note}" aria-label="${esc(nm)} 메모"${dis}></td>
      <td>${_acSw(`data-ac-b="${p}.active"`, r.active !== false, `${nm} 사용`, !edit)}</td>
      <td class="is-end">${pub ? `<span class="ac-lock" title="${esc(T.roleLock)}" aria-label="${esc(T.roleLock)}">🔒</span>`
        : edit ? `<button type="button" class="ac-ibtn is-danger" data-ac-act="role-del" data-i="${i}" aria-label="${esc(nm)} 삭제">✕</button>` : ''}</td>
    </tr>`;
  }).join('');

  const vars = content.vars.map((v, i) => {
    const nm = v.name || v.id, p = `vars.${i}`;
    return `<tr class="${v.active === false ? 'is-off' : ''}">
      <td><input class="ac-inp" data-ac-b="${p}.name" value="${esc(v.name)}" maxlength="${AC_LIMITS.roleName}" aria-label="항목 이름 (${esc(v.id)})" ${desc(p + '.name')}${dis}>
        <small class="ac-id">id ${esc(v.id)}</small>${err(p + '.name')}</td>
      <td><input class="ac-inp is-short" data-ac-b="${p}.unit" value="${esc(v.unit)}" maxlength="20" aria-label="${esc(nm)} 단위"${dis}></td>
      <td><input class="ac-inp is-short" data-ac-b="${p}.placeholder" value="${esc(v.placeholder)}" maxlength="40" aria-label="${esc(nm)} 입력 예시"${dis}></td>
      <td><span class="ac-chip${v.inTotal ? ' is-ok' : ''}" title="읽기 전용(예약)">${v.inTotal ? '합산' : '미포함'}</span></td>
      <td><input class="ac-inp" data-ac-b="${p}.note" value="${esc(v.note)}" maxlength="${AC_LIMITS.note}" aria-label="${esc(nm)} 메모"${dis}></td>
      <td>${_acSw(`data-ac-b="${p}.active"`, v.active !== false, `${nm} 사용`, !edit)}</td>
    </tr>`;
  }).join('');

  const si = content.siPresets.map((s, i) => {
    const nm = s.name || s.id, p = `siPresets.${i}`;
    return `<tr>
      <td class="ac-order-cell"><span class="ac-order" role="group" aria-label="${esc(nm)} 순서">
        <button type="button" class="ac-ibtn" data-ac-act="si-move" data-i="${i}" data-d="-1" aria-label="${esc(nm)} 위로"${!edit || i === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="ac-ibtn" data-ac-act="si-move" data-i="${i}" data-d="1" aria-label="${esc(nm)} 아래로"${!edit || i === content.siPresets.length - 1 ? ' disabled' : ''}>▼</button></span></td>
      <td><input class="ac-inp" data-ac-b="${p}.name" value="${esc(s.name)}" maxlength="${AC_LIMITS.roleName}" aria-label="SI 항목 이름 (${esc(s.id)})" ${desc(p + '.name')}${dis}>${err(p + '.name')}</td>
      <td class="is-num"><input class="ac-inp is-num" data-ac-b="${p}.mm" value="${esc(s.mm)}" inputmode="decimal" aria-label="${esc(nm)} M/M" ${desc(p + '.mm')}${dis}>${err(p + '.mm')}</td>
      <td class="is-end">${edit ? `<button type="button" class="ac-ibtn is-danger" data-ac-act="si-del" data-i="${i}" aria-label="${esc(nm)} 삭제">✕</button>` : ''}</td>
    </tr>`;
  }).join('');

  const hist = _acVersions().map(v => {
    const n = Number(v.version), cur = n === curV;
    return `<li><button type="button" class="ac-hist-it${cur ? ' is-cur' : ''}" data-ac-act="basis-view" data-v="${esc(n)}" ${B.view === n ? 'aria-current="true"' : ''}>
      <b>v${esc(n)}</b>${cur ? ' <span class="ac-chip is-ok">사용 중</span>' : ''}
      <small>${esc(String(v.savedAt || '').slice(0, 10))}${v.savedByEmail ? ` · ${esc(v.savedByEmail)}` : ''}</small>
      ${v.reason ? `<small class="ac-hist-reason">${esc(v.reason)}</small>` : ''}</button></li>`;
  }).join('') || '<li class="ac-empty">아직 게시된 버전이 없습니다.</li>';

  const pub = admin && B.source === 'db' && !viewV ? `<div class="ac-errlist" id="acBasisErrs" role="alert" hidden></div>
    <div class="ac-pub">
      <div class="ac-fld"><label for="acReason">변경 사유 <span class="ac-muted">(필수, 이력에 남습니다)</span></label>
        <input class="ac-inp" id="acReason" maxlength="${AC_LIMITS.reason}" value="${esc(B.reason)}" placeholder="예: 인프라 담당 기준을 1.0 → 1.5 M/M 로 조정" autocomplete="off"${B.busy ? ' disabled' : ''}></div>
      <button type="button" class="btn-primary" id="acPublish" data-ac-act="basis-publish" disabled>${B.busy ? esc(T.publishing) : '새 버전으로 게시'}</button>
      <details class="ac-diff" id="acBasisDiff" hidden><summary></summary><ul></ul></details>
    </div>` : '';

  const title = content.meta.title || '공수 산정 기준표';
  return `<div class="ac-topbar">
      <h3 class="ac-topbar-h"><span class="ac-badge">WiseN TM</span>${esc(title)}
        <span class="ac-chip is-dark">${B.source === 'db' ? `v${esc(B.baseVersion)} 게시됨` : '내장 기본값'}</span></h3>
      <div class="ac-topbar-acts"><span class="ac-topbar-st" id="acBasisSt"></span>
        ${admin && B.source === 'db' && !viewV ? '<button type="button" class="btn-ghost ac-btn-sm" data-ac-act="basis-revert" id="acBasisRevert" disabled>변경 취소</button>' : ''}</div>
    </div>
    ${banner}
    <div class="ac-split">
      <div class="ac-main">
        <div class="ac-meta">
          <div class="ac-fld"><label for="acMetaTitle">제목</label><input class="ac-inp" id="acMetaTitle" data-ac-b="meta.title" value="${esc(content.meta.title)}" maxlength="60"${dis}></div>
          <div class="ac-fld"><label for="acMetaSub">부제</label><input class="ac-inp" id="acMetaSub" data-ac-b="meta.subtitle" value="${esc(content.meta.subtitle)}" maxlength="120"${dis}></div>
        </div>
        <h4 class="ac-sub-h">역할</h4>
        <div class="ac-tbl-wrap"><table class="ac-tbl" aria-label="역할 기준표">
          <thead><tr><th scope="col"><span class="ac-sr">순서</span></th><th scope="col">분류</th><th scope="col">역할</th><th scope="col">계산 방식</th><th scope="col" class="is-num">기준 M/M</th><th scope="col">메모</th><th scope="col">사용</th><th scope="col"><span class="ac-sr">삭제</span></th></tr></thead>
          <tbody>${roles || '<tr><td colspan="8" class="ac-empty">역할이 없습니다.</td></tr>'}</tbody></table></div>
        ${edit ? '<button type="button" class="ac-add is-wide" data-ac-act="role-add">+ 역할 추가</button>' : ''}
        <h4 class="ac-sub-h">추가 항목 <small class="ac-muted">(id 고정, 총공수 합산은 예약)</small></h4>
        <div class="ac-tbl-wrap"><table class="ac-tbl is-mid" aria-label="추가 항목">
          <thead><tr><th scope="col">항목</th><th scope="col">단위</th><th scope="col">입력 예시</th><th scope="col">총공수 합산</th><th scope="col">메모</th><th scope="col">사용</th></tr></thead>
          <tbody>${vars || '<tr><td colspan="6" class="ac-empty">추가 항목이 없습니다.</td></tr>'}</tbody></table></div>
        <h4 class="ac-sub-h">SI 기본 항목</h4>
        <div class="ac-tbl-wrap"><table class="ac-tbl is-small" aria-label="SI 기본 항목">
          <thead><tr><th scope="col"><span class="ac-sr">순서</span></th><th scope="col">항목</th><th scope="col" class="is-num">M/M</th><th scope="col"><span class="ac-sr">삭제</span></th></tr></thead>
          <tbody>${si || '<tr><td colspan="4" class="ac-empty">SI 기본 항목이 없습니다.</td></tr>'}</tbody></table></div>
        ${edit ? '<button type="button" class="ac-add is-wide" data-ac-act="si-add">+ SI 항목 추가</button>' : ''}
        <div class="ac-fld ac-assume"><label for="acAssume">기준 가정 <span class="ac-muted">(한 줄에 하나, 산정 화면 하단에 표시)</span></label>
          <textarea class="ac-inp ac-ta" id="acAssume" data-ac-b="meta.assumptions" rows="4"${dis}>${esc(_acArr(content.meta.assumptions).join('\n'))}</textarea></div>
        ${pub}
      </div>
      <aside class="ac-hist" aria-labelledby="acHistH"><h4 id="acHistH">버전 이력</h4>
        <ol>${hist}</ol>
        <p class="ac-hist-note">${esc(T.histNote)}</p></aside>
    </div>`;
}
// 입력 중 부분 갱신: 상태 문구·게시 버튼·항목 옆 오류·검증 목록·변경 목록
function _acBasisRefresh() {
  const B = _ac.basis, panel = document.getElementById('acPanel');
  if (!panel || _ac.tab !== 'basis' || !B.draft || !_acHasBasis()) return;
  const editing = B.view == null && B.source === 'db';
  const dirty = _acBasisDirty();
  const diff = dirty ? _acBasisDiff(B.published, B.draft) : [];
  const ferr = editing && _acAdmin() ? _acBasisFieldErrors(B.draft) : {};
  const verr = editing && _acAdmin() ? _acBasisValidate() : [];
  const st = document.getElementById('acBasisSt');
  if (st) st.textContent = B.busy ? AC_T.basis.publishing : B.view != null ? '이전 버전 보기' : dirty ? AC_T.basis.draft(diff.length) : AC_T.noChange;
  panel.querySelectorAll('[data-ac-err]').forEach(s => {
    const k = s.dataset.acErr, msg = ferr[k] || '';
    s.textContent = msg;
    const inp = panel.querySelector(`[data-ac-b="${CSS.escape(k)}"]`);
    if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
  });
  const box = document.getElementById('acBasisErrs');
  const all = [...new Set([...verr, ...B.serverErrors])];
  if (box) {
    box.hidden = !all.length;
    box.innerHTML = all.length ? `<b>게시 전에 고칠 것</b><ul>${all.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  }
  const dd = document.getElementById('acBasisDiff');
  if (dd) {
    dd.hidden = !diff.length;
    dd.querySelector('summary').textContent = `변경 내용 ${diff.length}건 보기`;
    dd.querySelector('ul').innerHTML = diff.map(d => `<li>${esc(_acBasisDiffText(d, B.draft))}</li>`).join('');
  }
  const pb = document.getElementById('acPublish');
  if (pb) pb.disabled = !dirty || B.busy || Object.keys(ferr).length > 0 || verr.length > 0;
  const rv = document.getElementById('acBasisRevert');
  if (rv) rv.disabled = !dirty || B.busy;
  _acUpdateTabDots();
}
function _acBasisSet(t) {
  const B = _ac.basis;
  if (!_acBasisEditable()) return;
  const path = t.dataset.acB;
  const v = t.type === 'checkbox' ? t.checked : path === 'meta.assumptions' ? t.value.split('\n') : t.value;
  _acSetPath(B.draft, path, v);
  B.serverErrors = [];
  if (t.type === 'checkbox' && /\.active$/.test(path)) t.closest('tr')?.classList.toggle('is-off', !t.checked);
  if (/^roles\.\d+\.cat$/.test(path)) {
    const c = _acArr(B.draft.categories).find(x => _acStr(x.name) === t.value);
    const dot = t.parentElement?.querySelector('.ac-dot'); if (dot) dot.style.background = safeColor(c?.color);
  }
  _acBasisRefresh();
}
function _acBasisStruct(fn, focusKey) {
  const B = _ac.basis;
  if (!_acBasisEditable()) return;
  B.draft = fn(B.draft); B.serverErrors = [];
  _ac.focusKey = focusKey || null;
  _acRenderPanel();
}
// 다시 읽기. 실패(false)면 호출자가 안내한다. BasisAPI.load 는 성공 시 true
async function _acReloadBasis() { try { return (await BasisAPI.load()) !== false; } catch (e) { console.error(e); return false; } }
async function _acBasisPublish() {
  const B = _ac.basis;
  if (!_acBasisEditable() || !_acBasisDirty()) return;
  const ferr = _acBasisFieldErrors(B.draft), keys = Object.keys(ferr);
  if (keys.length) {
    document.querySelector(`#acPanel [data-ac-b="${CSS.escape(keys[0])}"]`)?.focus();
    _acSay(AC_T.basis.fixFirst, 'err'); return;
  }
  const reason = _acStr(B.reason);
  if (!reason) {
    const r = document.getElementById('acReason');
    if (r) { r.setAttribute('aria-invalid', 'true'); r.focus(); }
    _acSay(AC_T.basis.reasonReq, 'err'); return;
  }
  const content = _acBasisNormalize(B.draft);
  B.busy = true; B.serverErrors = []; _acRenderPanel(); _acSay(AC_T.basis.publishing);
  let r;
  try { r = await BasisAPI.publish({ content, reason, baseVersion: B.baseVersion }); }
  catch (e) { console.error(e); r = { ok: false, code: 'error', message: e?.message }; }
  B.busy = false;
  if (r?.ok) {
    B.draft = null; B.reason = ''; B.conflict = false;
    const fresh = await _acReloadBasis();
    if (fresh) {
      _acSay(AC_T.basis.published(r.version), 'ok');
      showToast(AC_T.basis.published(r.version));
    } else {   // 게시는 끝났지만 최신 내용을 읽지 못했다. 같은 baseVersion 으로 다시 게시하면 충돌하므로 불러오기를 안내한다
      B.conflict = true;
      _acSay(`v${r.version} 로 게시했지만 최신 내용을 불러오지 못했습니다. [불러오기]를 눌러 새로 고치세요.`, 'err');
      showToast('게시했지만 최신 내용을 불러오지 못했습니다.');
    }
    _ac.focusKey = fresh ? '#acPanel' : 'act:basis-reload';
  } else if (r?.code === 'conflict') {
    B.conflict = true; _acSay(AC_T.basis.conflict, 'err'); _ac.focusKey = 'act:basis-reload';
  } else if (r?.code === 'invalid') {
    B.serverErrors = _acArr(r.errors).length ? r.errors.map(String) : [r.message || '입력값이 올바르지 않습니다.'];
    _acSay('게시하지 못했습니다. 오류를 확인하세요.', 'err'); _ac.focusKey = '#acReason';
  } else { _acSay(_acBasisErr(r), 'err'); _ac.focusKey = '#acReason'; }
  _acRenderPanel(); _acRefreshDrawer();
}
async function _acBasisImport() {
  const B = _ac.basis;
  if (!_acAdmin() || BASIS.status !== 'ok' || B.busy) return;
  B.busy = true; _acRenderPanel(); _acSay('가져오는 중…');
  let r;
  try { r = await BasisAPI.publish({ content: _acSafeBuiltin(), reason: AC_T.basis.importReason, baseVersion: 0 }); }
  catch (e) { console.error(e); r = { ok: false, code: 'error', message: e?.message }; }
  B.busy = false;
  if (r?.ok) { await _acReloadBasis(); B.draft = null; _acSay(`내장 기준표를 v${r.version} 으로 가져왔습니다. 이제 편집할 수 있습니다.`, 'ok'); }
  else if (r?.code === 'conflict') { await _acReloadBasis(); B.draft = null; _acSay('이미 다른 곳에서 가져왔습니다. 최신 버전을 불러왔습니다.', 'ok'); }
  else _acSay(_acBasisErr(r), 'err');
  _acRenderPanel(); _acRefreshDrawer();
}
async function _acBasisReloadLatest() {
  const B = _ac.basis;
  B.busy = true; _acRenderPanel();
  await _acReloadBasis();
  B.busy = false; B.draft = null; B.conflict = false; B.serverErrors = []; B.view = null;
  _ac.focusKey = '#acReason';
  _acRenderPanel(); _acSay('최신 버전을 불러왔습니다. 필요하면 다시 고친 뒤 게시하세요.', 'ok');
  _acRefreshDrawer();
}

// ═══ 사용자·권한 ═══
function _acUserErr(r) {
  const T = AC_T.users;
  switch (r?.code) {
    case 'last-admin': return T.lastAdmin;
    case 'self': return T.self;
    case 'invalid': return r.message ? String(r.message) : T.invalid;   // 이메일 형식·없는 멤버·역할 값
    case 'exists': return T.exists;
    case 'forbidden': return T.forbidden;
    default: return `저장하지 못했습니다.${r?.message ? ` (${r.message})` : ''}`;
  }
}
async function _acUsersLoad() {
  const U = _ac.users;
  if (!_acHasUsers() || !_acAdmin() || U.status === 'loading') return;
  U.status = 'loading'; _acRenderIf('users');
  try { const list = await UserAPI.list(); U.list = _acArr(list); U.status = 'ok'; U.error = ''; }
  catch (e) { console.error(e); U.status = 'error'; U.error = String(e?.message || ''); }
  _acRenderIf('users'); _acRefreshDrawer();
}
function _acRenderUsers() {
  const T = AC_T.users, U = _ac.users;
  if (!_acAdmin()) return `<div class="ac-state" role="status">${esc(AC_T.adminOnly)}</div>`;
  if (!_acHasUsers()) return _acNoLayer('UserAPI');
  const roleCards = AC_ROLES.map(r => `<div class="ac-role"><b><span class="ac-dot is-${r.tone}" aria-hidden="true"></span>${esc(r.label)} <span class="ac-muted ac-mono">${esc(r.id)}</span></b><p>${esc(r.desc)}</p></div>`).join('');
  const memberOpts = sel => {
    const ms = _acMembers();
    let o = `<option value="">연결 안 함</option>` + ms.map(m => `<option value="${esc(m.id)}"${m.id === sel ? ' selected' : ''}>${esc(m.name)}${m.role ? ` · ${esc(m.role)}` : ''}</option>`).join('');
    if (sel && !ms.some(m => m.id === sel)) o += `<option value="${esc(sel)}" selected>(없는 멤버 ${esc(sel)})</option>`;
    return o;
  };
  const roleOpts = sel => AC_ROLES.map(r => `<option value="${r.id}"${r.id === sel ? ' selected' : ''}>${esc(r.label)}</option>`).join('');
  const F = U.form;
  const form = U.adding ? `<div class="ac-userform" role="group" aria-labelledby="acUfH">
      <h4 class="ac-sub-h" id="acUfH">사용자 추가</h4>
      <div class="ac-userform-grid">
        <div class="ac-fld"><label for="acUfEmail">이메일 (구글 계정)</label><input class="ac-inp" id="acUfEmail" type="email" data-ac-uf="email" value="${esc(F.email)}" autocomplete="off" required aria-required="true" aria-describedby="acUfMsg"></div>
        <div class="ac-fld"><label for="acUfRole">역할</label><select class="ac-inp" id="acUfRole" data-ac-uf="role">${roleOpts(F.role)}</select></div>
        <div class="ac-fld"><label for="acUfPerson">연결된 멤버</label><select class="ac-inp" id="acUfPerson" data-ac-uf="personId">${memberOpts(F.personId)}</select></div>
        <div class="ac-fld"><label for="acUfNote">메모</label><input class="ac-inp" id="acUfNote" data-ac-uf="note" value="${esc(F.note)}" maxlength="${AC_LIMITS.userNote}" autocomplete="off"></div>
      </div>
      <p class="ac-err" id="acUfMsg" role="alert">${esc(U.formMsg)}</p>
      <div class="ac-detail-row is-end">
        <button type="button" class="btn-ghost" data-ac-act="user-cancel">취소</button>
        <button type="button" class="btn-primary" data-ac-act="user-add"${U.busy ? ' disabled' : ''}>${U.busy ? esc(AC_T.saving) : '추가'}</button>
      </div></div>` : '';
  let table;
  if (U.status === 'idle' || U.status === 'loading') table = _acStateBox(AC_T.loading);
  else if (U.status === 'error') table = _acStateBox(U.error || '사용자 목록을 불러오지 못했습니다.', 'users-retry');
  else {
    const me = _acMe(), admins = U.list.filter(u => u.role === 'admin').length;
    const rows = U.list.map(u => {
      const email = String(u.email || ''), self = !!me && email.toLowerCase() === me;
      const lastAdmin = u.role === 'admin' && admins <= 1;
      const lockWhy = self ? T.self : lastAdmin ? T.lastAdmin : '';
      const fk = k => `data-ac-focus="u:${esc(email)}:${k}"`;
      return `<tr>
        <td class="ac-mono ac-email">${esc(email)}${self ? ' <span class="ac-chip is-ok">본인</span>' : ''}</td>
        <td><select class="ac-inp" data-ac-u="personId" data-email="${esc(email)}" ${fk('p')} aria-label="${esc(email)} 연결된 멤버"${U.busy ? ' disabled' : ''}>${memberOpts(u.personId || '')}</select></td>
        <td><select class="ac-inp is-role" data-ac-u="role" data-email="${esc(email)}" ${fk('r')} aria-label="${esc(email)} 역할"${lockWhy || U.busy ? ' disabled' : ''}${lockWhy ? ` title="${esc(lockWhy)}"` : ''}>${roleOpts(u.role)}</select></td>
        <td><input class="ac-inp" data-ac-u="note" data-ac-keep="1" data-email="${esc(email)}" ${fk('n')} value="${esc(u.note || '')}" maxlength="${AC_LIMITS.userNote}" aria-label="${esc(email)} 메모"${U.busy ? ' disabled' : ''}></td>
        <td class="is-end"><button type="button" class="btn-ghost ac-btn-sm" data-ac-act="user-remove" data-email="${esc(email)}" ${fk('x')}${lockWhy || U.busy ? ` disabled title="${esc(lockWhy || '')}"` : ''}>접근 해제</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="ac-empty">등록된 계정이 없습니다.</td></tr>';
    table = `<div class="ac-tbl-wrap"><table class="ac-tbl is-mid" aria-label="허용된 계정">
      <thead><tr><th scope="col">이메일</th><th scope="col">연결된 멤버</th><th scope="col">역할</th><th scope="col">메모</th><th scope="col"><span class="ac-sr">접근 해제</span></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="ac-note">본인 계정과 마지막 관리자는 화면에서도 강등·해제할 수 없습니다(서버가 한 번 더 막습니다). 변경은 바로 저장됩니다.</p>`;
  }
  return `<div class="ac-hd"><div><h3 class="ac-h">${esc(T.h)}</h3><p class="ac-lead">${esc(T.lead)}</p></div>
      <button type="button" class="btn-primary" data-ac-act="user-form" aria-expanded="${U.adding}"${U.adding ? ' disabled' : ''}>+ 사용자 추가</button></div>
    <div class="ac-roles">${roleCards}</div>
    ${form}
    ${table}
    <div class="ac-box"><h4>${esc(T.ivTitle)} <span class="ac-chip is-warn">결정 대기</span></h4><p>${esc(T.ivBody)}</p></div>`;
}
async function _acUserUpdate(el) {
  const U = _ac.users, email = el.dataset.email, field = el.dataset.acU;
  const u = U.list.find(x => x.email === email);
  if (!u || !_acAdmin() || !['role', 'personId', 'note'].includes(field)) return;
  let val = el.value;
  if (field === 'personId') val = val || null;
  if (field === 'note') val = val.trim();
  const before = field === 'note' ? (u.note || '') : field === 'personId' ? (u.personId || null) : u.role;
  if (before === val) return;
  el.disabled = true; el.setAttribute('aria-busy', 'true'); _acSay(AC_T.saving);
  let r;
  try { r = await UserAPI.update(email, { [field]: val }); } catch (e) { console.error(e); r = { code: 'error', message: e?.message }; }
  if (r === true) { u[field] = val; _acSay(`${email}: ${AC_T.saved}`, 'ok'); }
  else _acSay(_acUserErr(r), 'err');
  _ac.focusKey = `u:${email}:${field === 'role' ? 'r' : field === 'personId' ? 'p' : 'n'}`;
  _acRenderIf('users', true);   // 실패면 목록 값(원래 값)으로 되돌려 그린다
  _acRefreshDrawer();
}
async function _acUserAdd() {
  const U = _ac.users, F = U.form;
  if (U.busy) return;   // Enter 연타·더블 클릭으로 같은 요청이 두 번 나가지 않게
  const email = _acStr(F.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { U.formMsg = AC_T.users.invalid; _ac.focusKey = '#acUfEmail'; _acRenderPanel(); return; }
  if (U.list.some(u => String(u.email).toLowerCase() === email)) { U.formMsg = AC_T.users.exists; _ac.focusKey = '#acUfEmail'; _acRenderPanel(); return; }
  U.busy = true; U.formMsg = ''; _acRenderPanel(); _acSay(AC_T.saving);
  let r;
  try { r = await UserAPI.add({ email, role: F.role, personId: F.personId || null, note: _acStr(F.note) }); }
  catch (e) { console.error(e); r = { code: 'error', message: e?.message }; }
  U.busy = false;
  if (r === true) {
    U.adding = false; U.form = _acNewUserForm();
    _acSay(`${email} 계정을 추가했습니다.`, 'ok');
    _ac.focusKey = 'act:user-form';
    await _acUsersLoad();
  } else { U.formMsg = _acUserErr(r); _ac.focusKey = '#acUfEmail'; _acSay(U.formMsg, 'err'); }
  _acRenderPanel();
}
async function _acUserRemove(btn, email) {
  const U = _ac.users;
  if (!_acAdmin()) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); _acSay('해제하는 중…');
  let r;
  try { r = await UserAPI.remove(email); } catch (e) { console.error(e); r = { code: 'error', message: e?.message }; }
  if (r === true) { U.list = U.list.filter(u => u.email !== email); _acSay(`${email} 의 접근을 해제했습니다.`, 'ok'); _ac.focusKey = 'act:user-form'; }
  else _acSay(_acUserErr(r), 'err');
  _acRenderIf('users', true); _acRefreshDrawer();
}

// ═══ 탭·렌더·포커스 ═══
const _acVisibleTabs = () => AC_TABS.filter(t => !t.adminOnly || _acAdmin());
function _acDirtyTabs() {
  const out = [];
  if (_acCodesDirtyGroups().length) out.push('codes');
  if (_acBasisDirty()) out.push('basis');
  if (_ac.users.adding && _acStr(_ac.users.form.email)) out.push('users');
  return out;
}
function _acRenderTabs() {
  const el = document.getElementById('acTabs'); if (!el) return;
  if (!_acVisibleTabs().some(t => t.id === _ac.tab)) _ac.tab = 'codes';
  const dirty = _acDirtyTabs();
  el.innerHTML = _acVisibleTabs().map(t => `<button type="button" role="tab" class="ac-tab${dirty.includes(t.id) ? ' is-dirty' : ''}" id="acTab-${t.id}" data-ac-tab="${t.id}"
    aria-controls="acPanel" aria-selected="${t.id === _ac.tab}" tabindex="${t.id === _ac.tab ? 0 : -1}">${esc(t.label)}<span class="ac-tab-dot" aria-hidden="true"></span><span class="ac-sr ac-tab-sr">${dirty.includes(t.id) ? ' (저장 안 됨)' : ''}</span></button>`).join('');
  document.getElementById('acPanel')?.setAttribute('aria-labelledby', `acTab-${_ac.tab}`);
}
function _acUpdateTabDots() {
  const dirty = _acDirtyTabs();
  document.querySelectorAll('#acTabs [data-ac-tab]').forEach(b => {
    const on = dirty.includes(b.dataset.acTab);
    b.classList.toggle('is-dirty', on);
    const sr = b.querySelector('.ac-tab-sr'); if (sr) sr.textContent = on ? ' (저장 안 됨)' : '';
  });
}
function _acFocusKey(el) {
  if (!el || !el.dataset) return null;
  const d = el.dataset;
  if (d.acFocus) return d.acFocus;
  if (d.acB) return 'b:' + d.acB;
  if (d.acAct) return `act:${d.acAct}${d.i != null ? ':' + d.i : ''}${d.d != null ? ':' + d.d : ''}${d.uid ? ':' + d.uid : ''}${d.gid ? ':' + d.gid : ''}${d.v ? ':' + d.v : ''}`;
  if (el.id) return '#' + el.id;
  return null;
}
function _acRenderPanel() {
  const panel = document.getElementById('acPanel'); if (!panel) return;
  const a = document.activeElement;
  const had = a && panel.contains(a);
  const key = _ac.focusKey || (had ? _acFocusKey(a) : null);
  const keepVal = had && a.dataset?.acKeep ? a.value : null;
  const onTab = a && a.closest?.('#acTabs') ? a.dataset.acTab : null;
  _ac.focusKey = null;
  const scroll = panel.scrollTop;
  _acRenderTabs();
  if (onTab && !key) document.getElementById('acTab-' + onTab)?.focus({ preventScroll: true });
  panel.innerHTML = _ac.tab === 'basis' ? _acRenderBasis() : _ac.tab === 'users' ? _acRenderUsers() : _acRenderCodes();
  panel.scrollTop = scroll;
  if (_ac.tab === 'basis') _acBasisRefresh();
  if (_ac.tab === 'codes' && _acHasCodes()) _acCodesRefresh();
  if (!key) { if (had) panel.focus({ preventScroll: true }); return; }
  let el = null;
  if (key === '#acPanel') el = panel;
  else if (key.startsWith('#')) el = document.getElementById(key.slice(1));
  else el = [...panel.querySelectorAll('button,input,select,textarea')].find(x => _acFocusKey(x) === key);
  if (el && !el.disabled) {
    if (keepVal != null && el.dataset?.acKeep && 'value' in el) el.value = keepVal;
    el.focus({ preventScroll: true });
  } else if (had || key) panel.focus({ preventScroll: true });
}
function _acRenderIf(tab, force) {
  if (!_acModalOpen()) return;
  if (_ac.tab === tab) {
    // 입력 중인 칸이 있으면(사용자 메모 등) 강제 요청이 아닐 때 다시 그리지 않는다
    const a = document.activeElement;
    if (!force && a && a.closest?.('#acPanel') && a.matches('input[type=text],input:not([type]),textarea') && a.dataset.acKeep) { _acUpdateTabDots(); return; }
    _acRenderPanel();
  } else _acUpdateTabDots();
}
function _acLoad(kind) {
  const ok = kind === 'codes' ? _acHasCodes() : _acHasBasis();
  if (!ok || _ac.loading[kind]) return;
  _ac.loading[kind] = true;
  let p;
  try { p = Promise.resolve((kind === 'codes' ? CodeAPI : BasisAPI).load()); } catch (e) { p = Promise.reject(e); }
  _acRenderIf(kind);
  p.catch(e => console.error(e)).then(() => {
    _ac.loading[kind] = false;
    if (kind === 'codes' && !_acCodesDirtyGroups().length) { _ac.codes.drafts = {}; _ac.codes.baseRows = {}; }
    _acRenderIf(kind); _acRefreshDrawer();
  });
}
function _acEnsure(tab) {
  if (tab === 'codes' && _acHasCodes() && CODES.status === 'idle' && !_ac.autoTried.codes) { _ac.autoTried.codes = true; _acLoad('codes'); }
  if (tab === 'basis' && _acHasBasis() && BASIS.status === 'idle' && !_ac.autoTried.basis) { _ac.autoTried.basis = true; _acLoad('basis'); }
  if (tab === 'users' && _ac.users.status === 'idle') _acUsersLoad();
}
function _acRequestTab(t, focusTab = true) {
  if (t === _ac.tab || !_acVisibleTabs().some(x => x.id === t)) { if (focusTab) document.getElementById('acTab-' + _ac.tab)?.focus(); return; }
  if (_acDirtyTabs().includes(_ac.tab)) { _ac.pending = t; _acShowConfirm(); return; }
  _acGoTab(t, focusTab);
}
function _acGoTab(t, focusTab = true) {
  _ac.tab = t; _ac.pending = null;
  _acHideConfirm(false);
  _acEnsure(t);
  _acRenderPanel();
  document.getElementById('acPanel').scrollTop = 0;
  if (focusTab) document.getElementById('acTab-' + t)?.focus({ preventScroll: true });
}
function _acDiscard(tab) {
  if (tab === 'codes') { _ac.codes.drafts = {}; _ac.codes.baseRows = {}; }
  if (tab === 'basis') Object.assign(_ac.basis, { draft: null, reason: '', view: null, serverErrors: [], conflict: false });
  if (tab === 'users') Object.assign(_ac.users, { adding: false, form: _acNewUserForm(), formMsg: '' });
}
function _acShowConfirm() {
  const bar = document.getElementById('acConfirm'); if (!bar) return;
  bar.hidden = false;
  bar.querySelector('[data-ac-confirm="keep"]').focus({ preventScroll: true });
}
function _acHideConfirm(restore) {
  const bar = document.getElementById('acConfirm'); if (!bar || bar.hidden) return false;
  bar.hidden = true; _ac.pending = null;
  if (restore) document.getElementById('acTab-' + _ac.tab)?.focus({ preventScroll: true });
  return true;
}

// ═══ 이벤트 ═══
function _acOnClick(e) {
  const b = e.target.closest('[data-ac-act]');
  const panel = document.getElementById('acPanel');
  if (!b || b.disabled || !panel.contains(b)) return;
  const act = b.dataset.acAct, i = Number(b.dataset.i), d = Number(b.dataset.d);
  const C = _ac.codes, B = _ac.basis, U = _ac.users;
  switch (act) {
    // 공통코드
    case 'codes-retry': _acLoad('codes'); break;
    case 'codes-import': _acCodesImport(); break;
    case 'code-group': C.group = b.dataset.gid; C.cat = C.item = null; _ac.focusKey = _acFocusKey(b); _acRenderPanel(); break;
    case 'code-cat': C.cat = b.dataset.uid; C.item = null; _ac.focusKey = _acFocusKey(b); _acRenderPanel(); break;
    case 'code-item': C.item = C.item === b.dataset.uid ? null : b.dataset.uid; _ac.focusKey = _acFocusKey(b); _acRenderPanel(); break;
    case 'code-add-cat': _acCodeAdd('cat'); break;
    case 'code-add-item': _acCodeAdd('item'); break;
    case 'code-color': {
      const s = _acCodesSel();
      if (s.target && !s.target.parentCode && _acCodesCanEdit(s.g.id) && !s.g.system) { s.target.color = b.dataset.color; _ac.focusKey = _acFocusKey(b); _acRenderPanel(); }
      break;
    }
    case 'code-move': _acCodeMove(d); break;
    case 'code-remove-new': {
      const s = _acCodesSel(), t = s.target;
      if (!t || !t._new) break;
      C.drafts[s.g.id] = s.rows.filter(r => r !== t && !(r._new && !t.parentCode && r.parentCode === t.code));
      if (t.parentCode) C.item = null; else { C.cat = null; C.item = null; }
      _ac.focusKey = t.parentCode ? 'act:code-add-item' : 'act:code-add-cat';
      _acRenderPanel(); break;
    }
    case 'codes-revert': if (C.group) { _acCodesReset(C.group); _acRenderPanel(); _acSay('변경을 취소했습니다.'); } break;
    case 'codes-save': _acCodesSave(); break;
    // 기준표
    case 'basis-retry': _acLoad('basis'); break;
    case 'basis-import': _acBasisImport(); break;
    case 'basis-revert': B.draft = null; B.serverErrors = []; B.conflict = false; _ac.focusKey = '#acPanel'; _acRenderPanel(); _acSay('변경을 취소했습니다.'); break;
    case 'role-move': _acBasisStruct(c => ({ ...c, roles: _acMove(c.roles, i, d) }), `act:role-move:${i + d}:${d}`); break;
    case 'role-add': _acBasisStruct(c => _acBasisAddRole(c), `b:roles.${B.draft.roles.length}.name`); break;
    case 'role-del': {
      const r = B.draft.roles[i];
      if (!r || (B.published?.roles || []).some(x => x.id === _acStr(r.id))) { _acSay(AC_T.basis.roleLock, 'err'); break; }
      _acBasisStruct(c => ({ ...c, roles: c.roles.filter((_, k) => k !== i) }), 'act:role-add'); break;
    }
    case 'si-move': _acBasisStruct(c => ({ ...c, siPresets: _acMove(c.siPresets, i, d) }), `act:si-move:${i + d}:${d}`); break;
    case 'si-add': _acBasisStruct(c => _acBasisAddSi(c), `b:siPresets.${_acArr(B.draft.siPresets).length}.name`); break;
    case 'si-del': _acBasisStruct(c => ({ ...c, siPresets: c.siPresets.filter((_, k) => k !== i) }), 'act:si-add'); break;
    case 'basis-view': {
      const v = Number(b.dataset.v);
      B.view = B.view === v ? null : v; _ac.focusKey = _acFocusKey(b); _acRenderPanel();
      _acSay(B.view != null ? `v${v} 내용을 읽기 전용으로 보여 줍니다.` : '편집 화면으로 돌아왔습니다.');
      break;
    }
    case 'basis-back': B.view = null; _ac.focusKey = '#acPanel'; _acRenderPanel(); _acSay('편집 화면으로 돌아왔습니다.'); break;
    case 'basis-restore': {
      const v = _acVersions().find(x => Number(x.version) === Number(b.dataset.v));
      if (!v || !_acAdmin() || B.source !== 'db') break;
      B.draft = _acBasisRestore(v.content, B.published); B.view = null; B.serverErrors = [];
      if (!_acStr(B.reason)) B.reason = `v${v.version} 으로 복원`;
      _ac.focusKey = '#acReason'; _acRenderPanel(); _acSay(AC_T.basis.restoreHint(v.version), 'ok');
      break;
    }
    case 'basis-reload': _acBasisReloadLatest(); break;
    case 'basis-publish': _acBasisPublish(); break;
    // 사용자
    case 'users-retry': U.status = 'idle'; _acUsersLoad(); break;
    case 'user-form': U.adding = true; U.formMsg = ''; _ac.focusKey = '#acUfEmail'; _acRenderPanel(); break;
    case 'user-cancel': _acDiscard('users'); _ac.focusKey = 'act:user-form'; _acRenderPanel(); break;
    case 'user-add': _acUserAdd(); break;
    case 'user-remove': confirmable(b, () => _acUserRemove(b, b.dataset.email), { label: '정말 해제?', color: '#fff' }); break;
  }
}
function _acOnInput(e) {
  const t = e.target;
  if (t.id === 'acCodeName') { _acCodeSetName(t.value); return; }
  if (t.dataset.acB && t.type !== 'checkbox' && t.tagName !== 'SELECT') { _acBasisSet(t); return; }
  if (t.id === 'acReason') { _ac.basis.reason = t.value; t.removeAttribute('aria-invalid'); return; }
  if (t.dataset.acUf) { _ac.users.form[t.dataset.acUf] = t.value; if (t.dataset.acUf === 'email') { _ac.users.formMsg = ''; const m = document.getElementById('acUfMsg'); if (m) m.textContent = ''; } _acUpdateTabDots(); }
}
function _acOnChange(e) {
  const t = e.target;
  if (t.id === 'acCodeActive') {
    const s = _acCodesSel();
    if (s.target && _acCodesCanEdit(s.g.id) && !s.g.system) { s.target.active = t.checked; _ac.focusKey = '#acCodeActive'; _acRenderPanel(); }
    return;
  }
  if (t.dataset.acB && (t.type === 'checkbox' || t.tagName === 'SELECT')) { _acBasisSet(t); return; }
  if (t.dataset.acU) { _acUserUpdate(t); return; }
  if (t.dataset.acUf) _ac.users.form[t.dataset.acUf] = t.value;
}
function _acOnTabsKey(e) {
  const tabs = _acVisibleTabs().map(t => t.id);
  const cur = e.target.closest('[data-ac-tab]')?.dataset.acTab;
  if (!cur) return;
  let i = tabs.indexOf(cur);
  if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = tabs.length - 1;
  else return;
  e.preventDefault();
  _acRequestTab(tabs[i]);
}

// ═══ 모달 초기화 / 열기 ═══
function _acInitModal() {
  if (document.getElementById('acModal')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay hidden';
  ov.id = 'acModal';
  ov.dataset.backdrop = 'close';
  ov.setAttribute('aria-labelledby', 'acTitle');
  ov.innerHTML = `<div class="modal-card ac-card">
    <div class="modal-header ac-head">
      <span class="modal-title ac-title" id="acTitle">${esc(AC_T.title)}</span>
      <div class="ac-tabs" role="tablist" aria-label="관리 센터 화면" id="acTabs"></div>
      <button type="button" class="modal-close-btn" id="acClose" aria-label="닫기">✕</button>
    </div>
    <div class="ac-confirm" id="acConfirm" role="alertdialog" aria-labelledby="acConfirmMsg" hidden>
      <span class="ac-confirm-msg" id="acConfirmMsg">${esc(AC_T.unsavedTab)}</span>
      <span class="ac-confirm-btns">
        <button type="button" class="btn-ghost" data-ac-confirm="keep">${esc(AC_T.keep)}</button>
        <button type="button" class="btn-danger" data-ac-confirm="discard">${esc(AC_T.discardMove)}</button>
      </span>
    </div>
    <div class="modal-body ac-body" id="acPanel" role="tabpanel" tabindex="-1"></div>
    <div class="ac-live" id="acLive" role="status" aria-live="polite"></div>
  </div>`;
  document.body.appendChild(ov);
  if (typeof Modal !== 'undefined') Modal.onClose.acModal = _acOnClose;
  document.getElementById('acClose').onclick = () => Modal.requestClose('acModal');
  const tabs = document.getElementById('acTabs');
  tabs.addEventListener('click', e => { const b = e.target.closest('[data-ac-tab]'); if (b) _acRequestTab(b.dataset.acTab); });
  tabs.addEventListener('keydown', _acOnTabsKey);
  const panel = document.getElementById('acPanel');
  panel.addEventListener('click', _acOnClick);
  panel.addEventListener('input', _acOnInput);
  panel.addEventListener('change', _acOnChange);
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing && e.target.dataset?.acUf && e.target.tagName === 'INPUT') { e.preventDefault(); _acUserAdd(); }
  });
  document.getElementById('acConfirm').addEventListener('click', e => {
    const b = e.target.closest('[data-ac-confirm]'); if (!b) return;
    if (b.dataset.acConfirm === 'keep') { _acHideConfirm(true); return; }
    const to = _ac.pending;
    _acDiscard(_ac.tab);
    if (to) _acGoTab(to); else _acHideConfirm(true);
  });
  // 탭 전환 확인 바가 떠 있으면 Escape = 계속 편집 (문서 단위 Escape 처리보다 먼저)
  ov.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('acConfirm').hidden) { e.preventDefault(); e.stopPropagation(); _acHideConfirm(true); }
  });
}
function _acOnClose() {
  _acHideConfirm(false);
  _acDiscard('codes'); _acDiscard('basis'); _acDiscard('users');
  _ac.codes.busy = false; _ac.codes.gen = (_ac.codes.gen || 0) + 1;   // 진행 중이던 저장 응답은 무시
  _acSay('');
  _acRefreshDrawer();
}
// 관리 센터 열기 (tab: 'codes' | 'basis' | 'users')
function openAdminCenter(tab) {
  if (typeof Modal === 'undefined') return;
  _acInitModal();
  const ids = _acVisibleTabs().map(t => t.id);
  if (tab === 'users' && !ids.includes('users')) showToast(AC_T.adminOnly);
  const want = ids.includes(tab) ? tab : ids.includes(_ac.tab) ? _ac.tab : 'codes';
  if (_acModalOpen()) { _acRequestTab(want); return; }
  _ac.tab = want;
  _acSay('');
  if (_acAdmin() && _acHasUsers()) { _ac.users.status = _ac.users.status === 'loading' ? 'loading' : 'idle'; _acUsersLoad(); }
  _acEnsure('codes'); _acEnsure('basis');
  _acRenderPanel();
  Modal.open('acModal');
  Modal.track('acModal', () => _acDirtyTabs().join(','));
  document.getElementById('acTab-' + want)?.focus({ preventScroll: true });
}

// ═══ 관리 드로어 "설정" 탭 ═══
// admin 일 때만 탭을 보인다. role 은 로그인 뒤 늦게 채워질 수 있어 드로어를 그릴 때마다 다시 확인한다
function _acSyncDrawerTab() {
  const tabs = document.querySelector('.drawer-tabs'); if (!tabs) return;
  let b = tabs.querySelector('[data-tab="settings"]');
  const admin = _acAdmin();
  if (admin && !b) {
    b = document.createElement('button');
    b.type = 'button'; b.className = 'dtab'; b.dataset.tab = 'settings'; b.textContent = '설정';
    tabs.appendChild(b);
  } else if (!admin && b) {
    b.remove();
    if (typeof state !== 'undefined' && state.mgmtTab === 'settings') state.mgmtTab = 'members';
  }
  if (b && b.isConnected && typeof state !== 'undefined') b.classList.toggle('active', state.mgmtTab === 'settings');
  // 게시판·템플릿 구조는 admin 만 쓸 수 있다(서버 RLS). editor 에게 보이면 저장이 실패하므로 탭을 뗀다. role 이 빈 값(구 DB)이면 그대로 둔다
  const roleKnown = typeof CURRENT_USER !== 'undefined' && !!CURRENT_USER.role;
  ['boards', 'templates'].forEach(k => {
    const t = tabs.querySelector('[data-tab="' + k + '"]');
    if (t) t.hidden = roleKnown && !admin;
  });
  if (roleKnown && !admin && typeof state !== 'undefined' && (state.mgmtTab === 'boards' || state.mgmtTab === 'templates')) state.mgmtTab = 'members';
}
function _acDrawerStat(kind) {
  if (kind === 'users') {
    if (!_acHasUsers()) return '데이터 층 준비 중';
    const U = _ac.users;
    if (U.status === 'ok') return `계정 ${U.list.length}개 · 관리자 ${U.list.filter(u => u.role === 'admin').length}명`;
    return U.status === 'error' ? '불러오지 못함' : '불러오는 중…';
  }
  if (kind === 'basis') {
    if (!_acHasBasis()) return '데이터 층 준비 중';
    const st = BASIS.status;
    if (st === 'ok') { const v = Number(BASIS.basis?.currentVersion) || 0; return v ? `v${v} 게시됨` : '내장 기본값 사용 중'; }
    return st === 'missing' ? '테이블 없음 · 내장값 사용' : st === 'error' ? '불러오지 못함' : '불러오는 중…';
  }
  if (!_acHasCodes()) return '데이터 층 준비 중';
  const st = CODES.status;
  if (st === 'ok') return _acArr(CODES.codes).length ? `그룹 ${_acGroups().length}개 · 코드 ${CODES.codes.length}개` : '내장 기본값 사용 중';
  return st === 'missing' ? '테이블 없음 · 내장값 사용' : st === 'error' ? '불러오지 못함' : '불러오는 중…';
}
// 드로어 "설정" 탭 본문: 요약 카드 3개 + [관리 센터 열기]
function renderAdminDrawer(body) {
  _acSyncDrawerTab();
  if (!body) return;
  if (!_acAdmin()) { body.innerHTML = `<div class="badm-state" role="status">${esc(AC_T.adminOnly)}</div>`; return; }
  const a = document.activeElement, prev = a && body.contains(a) ? a.dataset.acOpen : null;
  _acEnsure('codes'); _acEnsure('basis');
  if (_acHasUsers() && _ac.users.status === 'idle') _acUsersLoad();
  const cards = [
    { tab: 'users', title: '사용자·권한', desc: '로그인 계정과 역할(관리자·편집자·조회자), 멤버 연결' },
    { tab: 'basis', title: '공수 산정 기준표', desc: '역할별 기준 M/M·계산 방식. 게시할 때마다 새 버전' },
    { tab: 'codes', title: '공통코드', desc: '스킬 분류·항목, 프로젝트 상태 이름' },
  ].map(c => `<button type="button" class="ac-dcard" data-ac-open="${c.tab}">
      <span class="ac-dcard-t">${esc(c.title)}</span><span class="ac-dcard-d">${esc(c.desc)}</span>
      <span class="ac-dcard-s">${esc(_acDrawerStat(c.tab))}</span></button>`).join('');
  body.innerHTML = `<div class="ac-dcards">${cards}</div>
    <button type="button" class="btn-primary ac-dopen" id="acDrawerOpen">관리 센터 열기</button>`;
  body.querySelectorAll('[data-ac-open]').forEach(b => { b.onclick = () => openAdminCenter(b.dataset.acOpen); });
  document.getElementById('acDrawerOpen').onclick = () => openAdminCenter();
  if (prev) body.querySelector(`[data-ac-open="${CSS.escape(prev)}"]`)?.focus({ preventScroll: true });
}

function _acInit() {
  _acInitModal();
  _acSyncDrawerTab();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _acInit);
else _acInit();
