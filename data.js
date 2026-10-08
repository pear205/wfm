// ═══════════════════════════════════════════════════════════
// WFM Data Layer — Supabase 버전
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://juqlposwwqbkbpfndmnh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1cWxwb3N3d3Fia2JwZm5kbW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzE1MDUsImV4cCI6MjEwMzcwNzUwNX0.8iLDVhnVO1DN9n8opvq6Qo09Mj8ftQytRkgeIqkWyfs';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Seed: 멤버 ───
const DEFAULT_MEMBERS = [
  { id:'m1',  name:'김유정', role:'과장',   color:'#3D6FEB', start:null, end:null,
    skills:[{c:'lang',name:'Java',lv:3},{c:'lang',name:'Spring',lv:3},{c:'cloud',name:'AWS',lv:2},{c:'ai',name:'GPT API',lv:1}] },
  { id:'m6',  name:'이정현', role:'과장', color:'#E91E8C', start:null, end:null,
    skills:[{c:'etc',name:'Figma',lv:3},{c:'etc',name:'Adobe XD',lv:2},{c:'lang',name:'CSS',lv:2}] },
  { id:'m2',  name:'전정환', role:'과장',         color:'#00A878', start:null, end:null,
    skills:[{c:'lang',name:'Python',lv:3},{c:'lang',name:'React',lv:2},{c:'ai',name:'LangChain',lv:2}] },
  { id:'m3',  name:'김경민', role:'대리',   color:'#9259D1', start:null, end:null,
    skills:[{c:'lang',name:'Java',lv:3},{c:'lang',name:'Kotlin',lv:2},{c:'cloud',name:'GCP',lv:2}] },
  { id:'m4',  name:'김소라', role:'대리',         color:'#E85C4A', start:null, end:null,
    skills:[{c:'lang',name:'JavaScript',lv:3},{c:'lang',name:'Vue',lv:2},{c:'etc',name:'Figma',lv:1}] },
  { id:'m5',  name:'강다은', role:'대리',             color:'#F5A623', start:null, end:null,
    skills:[{c:'etc',name:'Jira',lv:3},{c:'etc',name:'Confluence',lv:3},{c:'cloud',name:'AWS',lv:1}] },
  { id:'m7',  name:'박석현', role:'대리',         color:'#16BFAD', start:null, end:null,
    skills:[{c:'lang',name:'Python',lv:2},{c:'lang',name:'Flutter',lv:3},{c:'cloud',name:'Firebase',lv:2}] },
  { id:'m8',  name:'정다솔', role:'대리',   color:'#7C8FD6', start:null, end:null,
    skills:[{c:'lang',name:'Java',lv:3},{c:'lang',name:'React',lv:3},{c:'cloud',name:'AWS',lv:3},{c:'ai',name:'MLflow',lv:1}] },
];

// ─── Seed: 프로젝트 ───
const DEFAULT_PROJECTS = [
  { id:'p1', color:'#3D6FEB', name:'GS리테일',  client:'GS리테일',   start:'2026-09', end:'2027-01', status:'active',    desc:'Zendesk' },
  { id:'p2', color:'#00A878', name:'물류시스템 고도화',  client:'CJ대한통운', start:'2025-03', end:'2025-12', status:'done',    desc:'배송 추적 및 재고 관리 시스템 고도화. 실시간 차량 위치 추적 및 자동 배차 알고리즘 적용.' },
  { id:'p3', color:'#E85C4A', name:'금융 플랫폼 재구축', client:'KB국민은행', start:'2025-01', end:'2025-07', status:'done',    desc:'레거시 코어뱅킹 시스템의 MSA 전환. API-first 설계로 핀테크 연동 확대.' },
  { id:'p4', color:'#9259D1', name:'ERP 시스템 도입',   client:'LG화학',    start:'2025-05', end:'2025-11', status:'done',    desc:'SAP S/4HANA 기반 ERP 도입. 생산, 구매, 회계 모듈 통합 구현.' },
  { id:'p5', color:'#F5A623', name:'클라우드 마이그레이션', client:'SK텔레콤', start:'2026-01', end:'2026-06', status:'done',        desc:'온프레미스 인프라의 AWS 클라우드 전환. 멀티 AZ 고가용성 구성 및 CI/CD 파이프라인 구축.' },
  { id:'p6', color:'#16BFAD', name:'AI 챗봇 고도화',    client:'현대카드',  start:'2026-01', end:'2026-12', status:'active',        desc:'GPT 기반 금융 특화 AI 상담사 개발. 자연어 처리 및 개인화 추천 엔진 탑재.' },
  { id:'p7', color:'#E91E8C', name:'모바일 커머스 앱',  client:'GS리테일',  start:'2026-03', end:'2026-09', status:'active',  desc:'편의점 O2O 연동 모바일 앱 개발. iOS/Android 크로스플랫폼(Flutter) 구현.' },
  { id:'p8', color:'#4DB36A', name:'스마트팩토리 2차',  client:'포스코',    start:'2026-05', end:'2026-12', status:'active',  desc:'1차 구축 기반 AI 불량 검출 시스템 추가. 엣지 컴퓨팅 기반 실시간 품질 분석.' },
  { id:'p9', color:'#7C8FD6', name:'공공데이터 포털',   client:'행정안전부', start:'2026-06', end:'2027-03', status:'active',  desc:'정부 공공데이터 통합 포털 구축. 오픈 API 표준화 및 실시간 데이터 연계 허브 구현.' },
];

// ─── Seed: 공수 생성 헬퍼 ───
function _mkA(memberId, projectId, startY, startM, endY, endM, mm, type) {
  const result = [];
  let y = startY, m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    result.push({ memberId, projectId, year: y, month: m, mm, mm_plan: mm, mm_actual: 0, type });
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
}

// ─── Seed: 공수 ───
const DEFAULT_ASSIGNMENTS = [
  // ── 2025 ──
  ..._mkA('m1','p1', 2025,1, 2025,8, 1.0,'상주'),
  ..._mkA('m1','p2', 2025,7, 2025,8, 0.2,'비상주'),
  ..._mkA('m2','p3', 2025,1, 2025,7, 1.0,'상주'),
  ..._mkA('m2','p2', 2025,8, 2025,12, 1.0,'상주'),
  ..._mkA('m3','p1', 2025,1, 2025,5, 1.0,'상주'),
  ..._mkA('m3','p4', 2025,6, 2025,11, 1.0,'상주'),
  ..._mkA('m3','p2', 2025,10, 2025,12, 0.3,'비상주'),
  ..._mkA('m4','p2', 2025,3, 2025,12, 1.0,'상주'),
  ..._mkA('m4','p4', 2025,5, 2025,6, 0.3,'비상주'),
  ..._mkA('m5','p3', 2025,1, 2025,7, 1.0,'상주'),
  ..._mkA('m5','p4', 2025,5, 2025,11, 0.5,'비상주'),
  ..._mkA('m6','p3', 2025,1, 2025,6, 1.0,'상주'),
  ..._mkA('m6','p2', 2025,7, 2025,11, 0.8,'상주'),
  ..._mkA('m7','p1', 2025,1, 2025,2, 1.0,'상주'),
  ..._mkA('m7','p2', 2025,3, 2025,12, 1.0,'상주'),
  ..._mkA('m8','p3', 2025,1, 2025,7, 1.0,'상주'),
  ..._mkA('m8','p4', 2025,8, 2025,11, 1.0,'상주'),
  // ── 2026 ──
  ..._mkA('m1','p5', 2026,1, 2026,6, 1.0,'상주'),
  ..._mkA('m1','p8', 2026,7, 2026,12, 1.0,'상주'),
  ..._mkA('m2','p6', 2026,1, 2026,4, 1.0,'상주'),
  ..._mkA('m2','p7', 2026,5, 2026,9, 1.0,'상주'),
  ..._mkA('m2','p6', 2026,5, 2026,6, 0.3,'비상주'),
  ..._mkA('m3','p5', 2026,1, 2026,6, 1.0,'상주'),
  ..._mkA('m3','p7', 2026,3, 2026,5, 0.3,'비상주'),
  ..._mkA('m3','p8', 2026,7, 2026,12, 1.0,'상주'),
  ..._mkA('m4','p6', 2026,1, 2026,12, 1.0,'상주'),
  ..._mkA('m5','p5', 2026,1, 2026,6, 1.0,'상주'),
  ..._mkA('m5','p8', 2026,5, 2026,12, 0.5,'비상주'),
  ..._mkA('m6','p6', 2026,1, 2026,6, 0.7,'상주'),
  ..._mkA('m6','p7', 2026,5, 2026,9, 1.0,'상주'),
  ..._mkA('m6','p5', 2026,2, 2026,4, 0.3,'비상주'),
  ..._mkA('m7','p6', 2026,1, 2026,2, 1.0,'상주'),
  ..._mkA('m7','p7', 2026,3, 2026,9, 1.0,'상주'),
  ..._mkA('m7','p9', 2026,6, 2026,8, 0.2,'비상주'),
  ..._mkA('m8','p5', 2026,1, 2026,6, 1.0,'상주'),
  ..._mkA('m8','p8', 2026,7, 2026,12, 1.0,'상주'),
  ..._mkA('m8','p6', 2026,4, 2026,6, 0.3,'비상주'),
];

// ─── 컬러 팔레트 ───
const PRESET_COLORS = [
  '#3D6FEB','#00A878','#E85C4A','#9259D1',
  '#F5A623','#16BFAD','#E91E8C','#4DB36A',
  '#7C8FD6','#EF6C00','#0288D1','#C62828',
];

// ─── Row ↔ JS 변환 ───
function _rowToMember(r) {
  return { id: r.id, name: r.name, role: r.role, color: r.color,
           start: r.start_month || null, end: r.end_month || null, skills: r.skills || [],
           sort_order: r.sort_order ?? 0 };
}
function _memberToRow(m) {
  return { id: m.id, name: m.name, role: m.role, color: m.color,
           start_month: m.start || null, end_month: m.end || null, skills: m.skills || [],
           sort_order: m.sort_order ?? 0 };
}
function _rowToProject(r) {
  return { id: r.id, name: r.name, client: r.client || '', color: r.color,
           start: r.start_month || '', end: r.end_month || '', status: r.status, desc: r.description || '',
           sort_order: r.sort_order ?? 0 };
}
function _projectToRow(p) {
  return { id: p.id, name: p.name, client: p.client, color: p.color,
           start_month: p.start, end_month: p.end, status: p.status, description: p.desc || '',
           sort_order: p.sort_order ?? 0 };
}
function _rowToAssignment(r) {
  const mm_plan = parseFloat(r.mm_plan) || parseFloat(r.mm) || 0;
  const mm_actual = parseFloat(r.mm_actual) || 0;
  return { memberId: r.member_id, projectId: r.project_id,
           year: r.year, month: r.month, mm: mm_plan, mm_plan, mm_actual, type: r.type };
}
function _assignmentToRow(a) {
  const mm_plan = a.mm_plan != null ? a.mm_plan : (a.mm || 0);
  return { member_id: a.memberId, project_id: a.projectId,
           year: a.year, month: a.month, mm: mm_plan, mm_plan, mm_actual: a.mm_actual || 0, type: a.type };
}
function _rowToAllowance(r) {
  return { memberId: r.member_id, year: r.year, month: r.month };
}

// ─── 런타임 데이터 ───
const DATA = { members: [], projects: [], assignments: [], allowances: [] };

// 화면 하단 알림 (저장 실패, 입력 오류 공용)
function showToast(message) {
  let t = document.getElementById('dbToast');
  if (!t) { t = document.createElement('div'); t.id = 'dbToast'; t.className = 'db-toast'; t.setAttribute('role', 'alert'); document.body.appendChild(t); }
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 6000);
}

// ─── 저장 상태 추적 ───
// 모든 Supabase 쓰기는 _track(label, thunk) 를 거친다. thunk 는 `{error}` 를 돌려주는 Promise 를 만든다.
// 실패한 작업은 thunk 째 보관해 재시도(retry)하고, 포기하려면 서버 기준으로 다시 불러온다(revert).
// 재시도해도 안전하도록 thunk 는 멱등(upsert / delete / delete→insert)으로 만든다.
const SaveState = {
  status: 'idle',            // 'idle' | 'saving' | 'saved' | 'error'
  pending: 0,                // 진행 중인 쓰기 수
  failed: [],                // [{label, thunk, message}] 실패 순서 유지
  reverting: false,          // revert() 진행 중(UI 가 컨트롤을 막을 수 있다)
  _inflight: new Set(),
  _chains: {},               // key -> 마지막 작업 Promise (같은 key 직렬화)
  _gen: {},                  // key -> 등록 세대 번호
  _seq: 0,
  _revertP: null,
  _listeners: [],
  _toasted: false,           // 연속 실패 시 토스트는 한 번만
  _savedTimer: null,
  onChange(fn) { this._listeners.push(fn); return () => { this._listeners = this._listeners.filter(f => f !== fn); }; },
  _set() {
    const prev = this.status;
    this.status = this.pending > 0 ? 'saving' : this.failed.length ? 'error' : (prev === 'saving' || prev === 'saved' ? 'saved' : 'idle');
    if (this.status !== 'saved') { clearTimeout(this._savedTimer); }
    else if (prev !== 'saved') { this._savedTimer = setTimeout(() => { if (this.status === 'saved') { this.status = 'idle'; this._emit(); } }, 2000); }
    this._emit();
  },
  _emit() { this._listeners.forEach(fn => { try { fn(this); } catch (e) { console.error(e); } }); },
  // 작업 하나를 실행하고 결과를 기록한다. 절대 reject 하지 않는다(true=성공)
  // 같은 key 의 작업은 순서대로 직렬 실행(_chains), 다른 key 는 동시에 실행한다.
  // pending 은 등록 시점에 센다(대기 중에도 '저장 중').
  async _run(label, thunk, key, waitAll) {
    const seq = ++this._seq;
    // 같은 key 의 새 쓰기는 이전에 실패한 쓰기를 대체한다. 'reset' 은 실패한 모든 쓰기를 대체
    if (key) this.failed = this.failed.filter(f => key === 'reset' ? false : f.key !== key);
    const gen = key ? (this._gen[key] = (this._gen[key] || 0) + 1) : 0;
    this.pending++;
    // waitAll(삭제 등): 등록 시점에 진행/대기 중인 모든 쓰기가 끝난 뒤 실행(고아 행·되살림 방지). 이후 등록분은 기다리지 않아 교착 없음
    const before = waitAll ? [...Object.values(this._chains), ...this._inflight] : null;
    const exec = async () => {
      if (before) await Promise.all(before);
      let err = null;
      try { const res = await thunk(); if (res && res.error) err = res.error; }
      catch (e) { err = e; }
      return err;
    };
    const p = key ? (this._chains[key] || Promise.resolve()).then(exec) : exec();
    if (key) this._chains[key] = p;
    this._inflight.add(p);
    this._set();
    const err = await p;
    this._inflight.delete(p);
    this.pending--;
    const latest = !key || this._gen[key] === gen;   // 더 새로운 같은 key 작업이 있으면 이 결과는 낡았다
    if (key && this._chains[key] === p) { delete this._chains[key]; delete this._gen[key]; }
    if (!err && this.pending === 0 && this.failed.length === 0) this._toasted = false;
    if (err) {
      console.error('저장 실패 [' + label + ']', err);
      if (latest) {
        this.failed.push({ label, thunk, key, waitAll, seq, message: (err && err.message) || String(err) });
        if (!this._toasted) { this._toasted = true; showToast('저장에 실패했습니다 — 상단에서 다시 시도할 수 있습니다'); }
      }
    }
    this._set();
    return !err;
  },
  // 실패한 작업을 원래 순서대로(순차) 다시 실행
  async retry() {
    const list = this.failed; this.failed = [];
    this._set();
    for (const f of list) await this._run(f.label, f.thunk, f.key, f.waitAll);
  },
  // timeout 이 지나면 남은 작업이 있어도 포기하고 true 를 돌려준다(revert 가 영원히 멈추지 않도록)
  async _drain(ms = 15000) {
    let timer, timedOut = false;
    const timeout = new Promise(r => { timer = setTimeout(() => { timedOut = true; r(); }, ms); });
    try { await Promise.race([(async () => { while (this._inflight.size) await Promise.all([...this._inflight]); })(), timeout]); }
    finally { clearTimeout(timer); }
    return timedOut;
  },
  // 저장되지 않은 로컬 변경을 버리고 서버 상태를 다시 불러온다. 호출한 쪽이 render() 한다
  // 되돌리는 중에 새로 들어온 쓰기는 버리지 않고 실행하며, 끝날 때까지 기다린 뒤 다시 불러온다.
  revert() {
    if (this._revertP) return this._revertP;
    this.reverting = true;
    const cut = this._seq;   // 이 시점 이전에 등록된 작업만 실패 목록에서 지운다
    this._emit();
    this._revertP = (async () => {
      try {
        let ok;
        let timedOut;
        do { timedOut = await this._drain(); ok = await loadData(); } while (!timedOut && this._inflight.size);
        this.failed = this.failed.filter(f => f.seq > cut);
        this._toasted = false;
        this._set();
        return ok;
      } finally { this.reverting = false; this._revertP = null; this._emit(); }
    })();
    return this._revertP;
  },
  isDirty() { return this.pending > 0 || this.failed.length > 0; },
};
// key: 쓰는 행 식별자. 업서트 thunk 는 재시도 시점의 DATA 를 다시 읽어 낡은 값으로 덮어쓰지 않는다
function _track(label, key, thunk, waitAll) { return SaveState._run(label, thunk, key, waitAll); }
const _upsertMember  = id => { const m = DATA.members.find(x => x.id === id);  return m ? _sb.from('wfm_members').upsert(_memberToRow(m)) : {}; };
const _upsertProject = id => { const p = DATA.projects.find(x => x.id === id); return p ? _sb.from('wfm_projects').upsert(_projectToRow(p)) : {}; };

window.addEventListener('beforeunload', e => {
  if (!SaveState.isDirty()) return;
  e.preventDefault(); e.returnValue = '';
});

function _deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function _resetToDefaults() {
  DATA.members     = _deepCopy(DEFAULT_MEMBERS);
  DATA.projects    = _deepCopy(DEFAULT_PROJECTS);
  DATA.assignments = _deepCopy(DEFAULT_ASSIGNMENTS);
}

// 조회 상태: 'loading' | 'ok' | 'error'. 실패해도 샘플 데이터로 대체하거나 기본 데이터를 업로드하지 않는다.
const LOAD = { status: 'loading', errors: [] };

async function loadData() {
  LOAD.status = 'loading'; LOAD.errors = [];
  const tables = [['wfm_members', '멤버'], ['wfm_projects', '프로젝트'], ['wfm_assignments', '투입'], ['wfm_allowances', '현장수당']];
  let res = [];
  try {
    res = await Promise.all(tables.map(([t]) => _sb.from(t).select('*')));
    res.forEach((r, i) => { if (r.error) LOAD.errors.push({ table: tables[i][1], message: r.error.message || String(r.error) }); });
  } catch (e) {
    console.error('Supabase load error:', e);
    LOAD.errors.push({ table: '네트워크', message: (e && e.message) || String(e) });
  }
  if (LOAD.errors.length) {
    LOAD.status = 'error';
    DATA.members = []; DATA.projects = []; DATA.assignments = []; DATA.allowances = [];
    return false;
  }
  const [mRes, pRes, aRes, alRes] = res;
  DATA.members     = (mRes.data  || []).map(_rowToMember).sort((a,b) => a.sort_order - b.sort_order);
  DATA.projects    = (pRes.data  || []).map(_rowToProject).sort((a,b) => a.sort_order - b.sort_order);
  DATA.assignments = (aRes.data  || []).map(_rowToAssignment);
  DATA.allowances  = (alRes.data || []).map(_rowToAllowance);
  LOAD.status = 'ok';
  return true;
}

// ─── CRUD API ───
const DataAPI = {
  /* ── 멤버 ── */
  addMember(m) {
    m.id = 'm' + Date.now();
    DATA.members.push(m);
    _track('멤버 추가', 'member:' + m.id, () => _upsertMember(m.id));
    return m;
  },
  updateMember(id, u) {
    const i = DATA.members.findIndex(m => m.id === id);
    if (i >= 0) {
      DATA.members[i] = { ...DATA.members[i], ...u };
      _track('멤버 수정', 'member:' + id, () => _upsertMember(id));
    }
  },
  reorderMembers(ids) {
    const map = new Map(DATA.members.map(m => [m.id, m]));
    DATA.members = ids.map(id => map.get(id)).filter(Boolean);
    DATA.members.forEach((m, i) => { m.sort_order = i; });
    _track('멤버 순서', 'reorder:members', () => DATA.members.length ? _sb.from('wfm_members').upsert(DATA.members.map(_memberToRow)) : {});
  },
  deleteMember(id) {
    DATA.members     = DATA.members.filter(m => m.id !== id);
    DATA.assignments = DATA.assignments.filter(a => a.memberId !== id);
    DATA.allowances  = DATA.allowances.filter(a => a.memberId !== id);
    _track('멤버 삭제', 'member:' + id, () => DATA.members.some(m => m.id === id) ? {} : _sb.from('wfm_members').delete().eq('id', id), true);
    _track('멤버 투입 삭제', 'member-asg:' + id, () => DATA.members.some(m => m.id === id) ? {} : _sb.from('wfm_assignments').delete().eq('member_id', id), true);
    _track('멤버 현장수당 삭제', 'member-allow:' + id, () => DATA.members.some(m => m.id === id) ? {} : _sb.from('wfm_allowances').delete().eq('member_id', id), true);
  },

  reorderProjects(ids) {
    const map = new Map(DATA.projects.map(p => [p.id, p]));
    DATA.projects = ids.map(id => map.get(id)).filter(Boolean);
    DATA.projects.forEach((p, i) => { p.sort_order = i; });
    _track('프로젝트 순서', 'reorder:projects', () => DATA.projects.length ? _sb.from('wfm_projects').upsert(DATA.projects.map(_projectToRow)) : {});
  },

  /* ── 프로젝트 ── */
  addProject(p) {
    p.id = 'p' + Date.now();
    DATA.projects.push(p);
    _track('프로젝트 추가', 'project:' + p.id, () => _upsertProject(p.id));
    return p;
  },
  updateProject(id, u) {
    const i = DATA.projects.findIndex(p => p.id === id);
    if (i >= 0) {
      DATA.projects[i] = { ...DATA.projects[i], ...u };
      _track('프로젝트 수정', 'project:' + id, () => _upsertProject(id));
    }
  },
  deleteProject(id) {
    DATA.projects    = DATA.projects.filter(p => p.id !== id);
    DATA.assignments = DATA.assignments.filter(a => a.projectId !== id);
    _track('프로젝트 삭제', 'project:' + id, () => DATA.projects.some(p => p.id === id) ? {} : _sb.from('wfm_projects').delete().eq('id', id), true);
    _track('프로젝트 투입 삭제', 'project-asg:' + id, () => DATA.projects.some(p => p.id === id) ? {} : _sb.from('wfm_assignments').delete().eq('project_id', id), true);
  },

  /* ── 공수 ── */
  setAssignment(memberId, projectId, year, month, mm_plan, mm_actual, type) {
    const entry = {memberId, projectId, year, month, mm: mm_plan, mm_plan, mm_actual: mm_actual||0, type};
    const i = DATA.assignments.findIndex(a =>
      a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===month
    );
    if (i >= 0) { DATA.assignments[i] = entry; }
    else        { DATA.assignments.push(entry); }
    const asgKey = 'asg:' + [memberId, projectId, year, month].join(':');
    _track('공수 저장', asgKey, () => {
      const a = DATA.assignments.find(x => x.memberId===memberId && x.projectId===projectId && x.year===year && x.month===month);
      return a ? _sb.from('wfm_assignments').upsert(_assignmentToRow(a)) : {};
    });
  },
  deleteAssignment(memberId, projectId, year, month) {
    DATA.assignments = DATA.assignments.filter(a =>
      !(a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===month)
    );
    _track('공수 삭제', 'asg:' + [memberId, projectId, year, month].join(':'), () => DATA.assignments.some(a => a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===month) ? {}
      : _sb.from('wfm_assignments').delete()
        .eq('member_id', memberId).eq('project_id', projectId)
        .eq('year', year).eq('month', month));
  },

  /* ── 현장수당 ── */
  toggleAllowance(memberId, year, month) {
    const i = DATA.allowances.findIndex(a => a.memberId===memberId && a.year===year && a.month===month);
    if (i >= 0) {
      DATA.allowances.splice(i, 1);
      _track('현장수당 해제', 'allow:' + [memberId, year, month].join(':'), () => DataAPI.hasAllowance(memberId, year, month) ? {}
        : _sb.from('wfm_allowances').delete()
          .eq('member_id', memberId).eq('year', year).eq('month', month));
    } else {
      DATA.allowances.push({memberId, year, month});
      // 기본키 구성을 가정하지 않고 멱등하게: 같은 행을 지운 뒤 넣는다(재시도해도 중복되지 않음)
      _track('현장수당 지정', 'allow:' + [memberId, year, month].join(':'), async () => {
        if (!DataAPI.hasAllowance(memberId, year, month)) return {};  // 재시도 시점에 이미 해제됐으면 건너뜀
        const del = await _sb.from('wfm_allowances').delete()
          .eq('member_id', memberId).eq('year', year).eq('month', month);
        if (del.error) return del;
        return _sb.from('wfm_allowances').insert({member_id: memberId, year, month});
      });
    }
  },
  hasAllowance(memberId, year, month) {
    return DATA.allowances.some(a => a.memberId===memberId && a.year===year && a.month===month);
  },

  /* ── 초기화 ── */
  async reset() {
    _resetToDefaults();
    DATA.allowances = [];
    // 전체 삭제 → 재삽입을 한 작업으로 묶는다. 어느 단계든 오류면 실패로 기록, 다시 실행해도 같은 결과(upsert)
    const firstError = rs => (rs.find(r => r && r.error) || {}).error;
    await _track('데이터 초기화', 'reset', async () => {
      let err = firstError(await Promise.all([
        _sb.from('wfm_assignments').delete().neq('member_id', ''),
        _sb.from('wfm_projects').delete().neq('id', ''),
        _sb.from('wfm_members').delete().neq('id', ''),
        _sb.from('wfm_allowances').delete().neq('member_id', ''),
      ]));
      if (err) return { error: err };
      // 재시도 시점의 DATA 를 다시 읽는다(초기화 이후 편집분 보존)
      const ins = (t, rows) => rows.length ? _sb.from(t).upsert(rows) : {};
      err = firstError(await Promise.all([
        ins('wfm_members', DATA.members.map(_memberToRow)),
        ins('wfm_projects', DATA.projects.map(_projectToRow)),
        ins('wfm_assignments', DATA.assignments.map(_assignmentToRow)),
        DATA.allowances.length ? _sb.from('wfm_allowances').insert(DATA.allowances.map(a => ({member_id: a.memberId, year: a.year, month: a.month}))) : {},
      ]));
      return err ? { error: err } : {};
    });
  },
};
