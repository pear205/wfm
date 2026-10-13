// ═══════════════════════════════════════════════════════════
// WFM Data Layer — Supabase 버전
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://juqlposwwqbkbpfndmnh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1cWxwb3N3d3Fia2JwZm5kbW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMzE1MDUsImV4cCI6MjEwMzcwNzUwNX0.8iLDVhnVO1DN9n8opvq6Qo09Mj8ftQytRkgeIqkWyfs';

const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

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

// 현재 로그인한 사용자 (app.js _checkAuth 가 채움). 산정 기록의 "내가 만든 기록" 판단에 사용
const CURRENT_USER = { id: null, email: "" };

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
  async _run(label, thunk, key, waitAll, deps) {
    const seq = ++this._seq;
    // 같은 key 의 새 쓰기는 이전에 실패한 쓰기를 대체한다. 'reset' 은 실패한 모든 쓰기를 대체
    if (key) this.failed = this.failed.filter(f => key === 'reset' ? false : f.key !== key);
    const gen = key ? (this._gen[key] = (this._gen[key] || 0) + 1) : 0;
    this.pending++;
    // waitAll(삭제 등): 등록 시점에 진행/대기 중인 모든 쓰기가 끝난 뒤 실행(고아 행·되살림 방지). 이후 등록분은 기다리지 않아 교착 없음
    // deps(키 목록): 등록 시점에 해당 key 로 진행/대기 중인 쓰기가 끝난 뒤 실행(FK 순서: 게시물은 템플릿·게시판 업서트 뒤에). 이후 등록분은 기다리지 않음
    const before = waitAll ? [...Object.values(this._chains), ...this._inflight]
      : deps ? deps.map(k => this._chains[k]).filter(Boolean) : null;
    const exec = async () => {
      if (before && before.length) await Promise.all(before);
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
        this.failed.push({ label, thunk, key, waitAll, deps, seq, message: (err && err.message) || String(err) });
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
    for (const f of list) await this._run(f.label, f.thunk, f.key, f.waitAll, f.deps);
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
        do {
          timedOut = await this._drain();
          ok = await loadData();
          // 게시판을 이미 불러왔다면 함께 되돌린다. 불러오는 중이면 끝나길 기다린 뒤(낡은 읽기) 다시 읽는다. idle/missing 은 건너뜀(실패로 보지 않음)
          if (_loadBoardsP) { try { await _loadBoardsP; } catch (e) { /* 아래에서 다시 읽는다 */ } }
          if (BLOAD.status !== 'idle' && BLOAD.status !== 'missing') { const okB = await loadBoards(); ok = ok && okB; }
          // 산정 기록도 같은 규칙(이미 불러왔다면 함께 되돌린다)
          if (_loadEstP) { try { await _loadEstP; } catch (e) { /* 아래에서 다시 읽는다 */ } }
          if (ELOAD.status !== 'idle' && ELOAD.status !== 'missing') { const okE = await loadEstimates(); ok = ok && okE; }
        } while (!timedOut && this._inflight.size);
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
function _track(label, key, thunk, waitAll, deps) { return SaveState._run(label, thunk, key, waitAll, deps); }
const _upsertMember  = id => { const m = DATA.members.find(x => x.id === id);  return m ? _sb.from('wfm_members').upsert(_memberToRow(m)) : {}; };
const _upsertProject = id => { const p = DATA.projects.find(x => x.id === id); return p ? _sb.from('wfm_projects').upsert(_projectToRow(p)) : {}; };

window.addEventListener('beforeunload', e => {
  if (!SaveState.isDirty()) return;
  e.preventDefault(); e.returnValue = '';
});

function _deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

// 조회 상태: 'loading' | 'ok' | 'error'. 실패해도 샘플 데이터로 대체하거나 기본 데이터를 업로드하지 않는다.
const LOAD = { status: 'loading', errors: [] };

// 네 테이블을 읽어 { errors, data } 로 돌려준다. DATA 는 건드리지 않는다(백그라운드 새로 고침이 실패해도 화면을 지우지 않도록).
async function fetchData() {
  const tables = [['wfm_members', '멤버'], ['wfm_projects', '프로젝트'], ['wfm_assignments', '투입'], ['wfm_allowances', '현장수당']];
  const errors = [];
  let res = [];
  try {
    res = await Promise.all(tables.map(([t]) => _sb.from(t).select('*')));
    res.forEach((r, i) => { if (r.error) errors.push({ table: tables[i][1], message: r.error.message || String(r.error) }); });
  } catch (e) {
    console.error('Supabase load error:', e);
    errors.push({ table: '네트워크', message: (e && e.message) || String(e) });
  }
  if (errors.length) return { errors, data: null };
  const [mRes, pRes, aRes, alRes] = res;
  return { errors, data: {
    members:     (mRes.data  || []).map(_rowToMember).sort((a,b) => a.sort_order - b.sort_order),
    projects:    (pRes.data  || []).map(_rowToProject).sort((a,b) => a.sort_order - b.sort_order),
    assignments: (aRes.data  || []).map(_rowToAssignment),
    allowances:  (alRes.data || []).map(_rowToAllowance),
  } };
}
async function loadData() {
  LOAD.status = 'loading'; LOAD.errors = [];
  const { errors, data } = await fetchData();
  LOAD.errors = errors;
  if (errors.length) {
    LOAD.status = 'error';
    DATA.members = []; DATA.projects = []; DATA.assignments = []; DATA.allowances = [];
    return false;
  }
  Object.assign(DATA, data);
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
};

// ═══════════════════════════════════════════════════════════
// 게시판 (docs/board-spec.md) — 템플릿(버전) · 게시판 · 게시물 · 댓글
// ═══════════════════════════════════════════════════════════
const BOARD = { templates: [], boards: [], posts: [], comments: [] };
// status: 'idle' | 'loading' | 'ok' | 'error' | 'missing'(테이블 없음 = sql/boards.sql 미실행)
const BLOAD = { status: 'idle', errors: [] };

const _iso = v => v ? new Date(v).toISOString() : new Date().toISOString();
function _rowToTemplate(r) {
  return { id: r.id, version: r.version, name: r.name, fields: Array.isArray(r.fields) ? r.fields : [],
           active: r.active !== false, createdAt: _iso(r.created_at) };
}
function _templateToRow(t) {
  return { id: t.id, version: t.version, name: t.name, fields: t.fields || [], active: t.active !== false, created_at: t.createdAt };
}
function _rowToBoard(r) {
  return { id: r.id, name: r.name, templateIds: Array.isArray(r.template_ids) ? r.template_ids : [],
           allowComments: !!r.allow_comments, sortOrder: r.sort_order ?? 0, active: r.active !== false, createdAt: _iso(r.created_at) };
}
function _boardToRow(b) {
  return { id: b.id, name: b.name, template_ids: b.templateIds || [], allow_comments: !!b.allowComments,
           sort_order: b.sortOrder ?? 0, active: b.active !== false, created_at: b.createdAt };
}
function _rowToPost(r) {
  return { id: r.id, boardId: r.board_id, templateId: r.template_id, templateVersion: r.template_version,
           title: r.title || '', authorId: r.author_id || '', data: r.data || {},
           createdAt: _iso(r.created_at), updatedAt: _iso(r.updated_at || r.created_at) };
}
function _postToRow(p) {
  return { id: p.id, board_id: p.boardId, template_id: p.templateId, template_version: p.templateVersion,
           title: p.title, author_id: p.authorId, data: p.data || {}, created_at: p.createdAt, updated_at: p.updatedAt };
}
function _rowToComment(r) {
  return { id: r.id, postId: r.post_id, authorId: r.author_id || '', body: r.body || '', createdAt: _iso(r.created_at) };
}
function _commentToRow(c) {
  return { id: c.id, post_id: c.postId, author_id: c.authorId, body: c.body, created_at: c.createdAt };
}

// ─── 헬퍼 ───
function latestTemplate(id) {
  let best = null;
  for (const t of BOARD.templates) if (t.id === id && (!best || t.version > best.version)) best = t;
  return best;
}
function templateOf(post) {
  return BOARD.templates.find(t => t.id === post.templateId && t.version === post.templateVersion) || latestTemplate(post.templateId);
}
function boardPosts(boardId) {
  return BOARD.posts.filter(p => p.boardId === boardId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
function postComments(postId) {
  return BOARD.comments.filter(c => c.postId === postId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}
function templateInUse(id, version) {
  return BOARD.posts.some(p => p.templateId === id && p.templateVersion === version);
}

function _isMissingTable(err) {
  const msg = String((err && err.message) || '');
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(msg));
}
function _bid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0'); }

let _loadBoardsP = null;
function loadBoards() {
  if (_loadBoardsP) return _loadBoardsP;
  _loadBoardsP = (async () => {
    BLOAD.status = 'loading'; BLOAD.errors = [];
    const tables = [['wfm_board_templates', '템플릿'], ['wfm_boards', '게시판'], ['wfm_posts', '게시물'], ['wfm_comments', '댓글']];
    let res = [];
    let missing = false;
    try {
      res = await Promise.all(tables.map(([t]) => _sb.from(t).select('*')));
      res.forEach((r, i) => {
        if (!r.error) return;
        if (_isMissingTable(r.error)) missing = true;
        BLOAD.errors.push({ table: tables[i][1], message: r.error.message || String(r.error) });
      });
    } catch (e) {
      console.error('Supabase board load error:', e);
      BLOAD.errors.push({ table: '네트워크', message: (e && e.message) || String(e) });
    }
    if (BLOAD.errors.length) {
      BLOAD.status = missing ? 'missing' : 'error';
      BOARD.templates = []; BOARD.boards = []; BOARD.posts = []; BOARD.comments = [];
      return false;
    }
    const [tRes, bRes, pRes, cRes] = res;
    BOARD.templates = (tRes.data || []).map(_rowToTemplate).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : a.version - b.version);
    BOARD.boards    = (bRes.data || []).map(_rowToBoard).sort((a, b) => a.sortOrder - b.sortOrder);
    BOARD.posts     = (pRes.data || []).map(_rowToPost);
    BOARD.comments  = (cRes.data || []).map(_rowToComment);
    BLOAD.status = 'ok';
    return true;
  })().finally(() => { _loadBoardsP = null; });
  return _loadBoardsP;
}

// 업서트 thunk: 실행(재시도) 시점의 BOARD 를 다시 읽고, 객체가 사라졌으면 건너뛴다
const _upsertTemplate = (id, ver) => { const t = BOARD.templates.find(x => x.id === id && x.version === ver); return t ? _sb.from('wfm_board_templates').upsert(_templateToRow(t)) : {}; };
const _upsertBoard    = id => { const b = BOARD.boards.find(x => x.id === id);   return b ? _sb.from('wfm_boards').upsert(_boardToRow(b)) : {}; };
const _upsertPost     = id => { const p = BOARD.posts.find(x => x.id === id);    return p ? _sb.from('wfm_posts').upsert(_postToRow(p)) : {}; };
// 댓글은 글이 로컬에서 사라졌으면(삭제됨) 보내지 않는다(FK 오류 방지)
const _upsertComment  = id => { const c = BOARD.comments.find(x => x.id === id); return c && BOARD.posts.some(p => p.id === c.postId) ? _sb.from('wfm_comments').upsert(_commentToRow(c)) : {}; };

// 게시물 업서트는 FK(게시판·템플릿 버전) 때문에 해당 행의 업서트가 끝난 뒤에 실행한다
const _postDeps = p => ['tpl:' + p.templateId + ':' + p.templateVersion, 'brd:' + p.boardId];

// 서버에 있는 게시물 수(필터는 apply 로 지정). 조회 실패 시 -1 — 호출한 쪽은 '있을 수 있음'으로 취급한다
async function _serverPostCount(apply) {
  try {
    const r = await apply(_sb.from('wfm_posts').select('id', { count: 'exact', head: true }));
    return r && !r.error && typeof r.count === 'number' ? r.count : -1;
  } catch (e) { return -1; }
}

const BoardAPI = {
  loadBoards,

  /* ── 게시물 ── */
  addPost({ boardId, templateId, templateVersion, title, authorId, data }) {
    const now = new Date().toISOString();
    const post = { id: _bid('post_'), boardId, templateId, templateVersion, title, authorId, data: data || {}, createdAt: now, updatedAt: now };
    BOARD.posts.push(post);
    _track('게시물 추가', 'post:' + post.id, () => _upsertPost(post.id), false, _postDeps(post));
    return post;
  },
  updatePost(id, { title, authorId, data }) {
    const i = BOARD.posts.findIndex(p => p.id === id);
    if (i < 0) return null;
    const u = {};
    if (title !== undefined) u.title = title;
    if (authorId !== undefined) u.authorId = authorId;
    if (data !== undefined) u.data = data;
    BOARD.posts[i] = { ...BOARD.posts[i], ...u, updatedAt: new Date().toISOString() };
    _track('게시물 수정', 'post:' + id, () => _upsertPost(id), false, _postDeps(BOARD.posts[i]));
    return BOARD.posts[i];
  },
  deletePost(id) {
    BOARD.posts = BOARD.posts.filter(p => p.id !== id);
    BOARD.comments = BOARD.comments.filter(c => c.postId !== id);   // 서버는 FK cascade
    _track('게시물 삭제', 'post:' + id, () => BOARD.posts.some(p => p.id === id) ? {} : _sb.from('wfm_posts').delete().eq('id', id), true);
  },

  /* ── 댓글 ── */
  addComment({ postId, authorId, body }) {
    const c = { id: _bid('cmt_'), postId, authorId, body, createdAt: new Date().toISOString() };
    BOARD.comments.push(c);
    _track('댓글 추가', 'cmt:' + c.id, () => _upsertComment(c.id), false, ['post:' + postId]);
    return c;
  },
  deleteComment(id) {
    BOARD.comments = BOARD.comments.filter(c => c.id !== id);
    _track('댓글 삭제', 'cmt:' + id, () => BOARD.comments.some(c => c.id === id) ? {} : _sb.from('wfm_comments').delete().eq('id', id), true);
  },

  /* ── 템플릿 (버전 관리) ── */
  // Promise<template>. 덮어쓰기(같은 버전 갱신) 전에 서버에 그 버전을 쓰는 글(다른 클라이언트 포함)이 있는지 확인하고,
  // 있거나 확인에 실패하면 새 버전을 만든다.
  async saveTemplate({ id, name, fields, active }) {
    let probe = id ? latestTemplate(id) : null;
    let overwritable = false;
    if (probe && !templateInUse(probe.id, probe.version)) {
      const n = await _serverPostCount(q => q.eq('template_id', probe.id).eq('template_version', probe.version));
      overwritable = n === 0;
    }
    // await 이후 로컬 상태를 다시 읽어 판단한다(그 사이 글/버전이 바뀌었을 수 있음)
    const now = new Date().toISOString();
    const latest = id ? latestTemplate(id) : null;
    let t;
    if (!latest) {
      t = { id: id || _bid('tpl_'), version: 1, name, fields: _deepCopy(fields || []), active: active !== false, createdAt: now };
      BOARD.templates.push(t);
    } else if (!overwritable || !probe || latest.version !== probe.version || templateInUse(latest.id, latest.version)) {
      t = { id: latest.id, version: latest.version + 1, name, fields: _deepCopy(fields || []), active: active !== false, createdAt: now };
      BOARD.templates.push(t);
    } else {
      const i = BOARD.templates.indexOf(latest);
      t = BOARD.templates[i] = { ...latest, name, fields: _deepCopy(fields || []), active: active !== false };
    }
    const tid = t.id, ver = t.version;
    _track('템플릿 저장', 'tpl:' + tid + ':' + ver, () => _upsertTemplate(tid, ver));
    return t;
  },
  setTemplateActive(id, active) {
    BOARD.templates.forEach((t, i) => { if (t.id === id) BOARD.templates[i] = { ...t, active: !!active }; });
    BOARD.templates.filter(t => t.id === id).forEach(t => {
      const ver = t.version;
      _track('템플릿 활성', 'tpl:' + id + ':' + ver, () => _upsertTemplate(id, ver));
    });
  },
  // Promise<true|'in-use'|'check-failed'>. 로컬·서버(다른 클라이언트 포함)에 글이 있으면 'in-use', 서버 확인에 실패하면 'check-failed'(아무것도 바꾸지 않음).
  // 서버 확인을 먼저 하고 그 뒤에 동기적으로 로컬을 바꾼다. FK(restrict)가 최종 방어선.
  async deleteTemplate(id) {
    if (BOARD.posts.some(p => p.templateId === id)) return 'in-use';
    const n = await _serverPostCount(q => q.eq('template_id', id));
    if (n !== 0) return n < 0 ? 'check-failed' : 'in-use';
    if (BOARD.posts.some(p => p.templateId === id)) return 'in-use';   // await 중에 글이 생겼는지 재확인
    const versions = BOARD.templates.filter(t => t.id === id).map(t => t.version);
    BOARD.templates = BOARD.templates.filter(t => t.id !== id);
    BOARD.boards.forEach((b, i) => {
      if (b.templateIds.includes(id)) {
        BOARD.boards[i] = { ...b, templateIds: b.templateIds.filter(x => x !== id) };
        const bid = b.id;
        _track('게시판 수정', 'brd:' + bid, () => _upsertBoard(bid));
      }
    });
    versions.forEach(ver => {
      _track('템플릿 삭제', 'tpl:' + id + ':' + ver,
        () => BOARD.templates.some(t => t.id === id && t.version === ver) ? {} : _sb.from('wfm_board_templates').delete().eq('id', id).eq('version', ver), true);
    });
    return true;
  },

  /* ── 게시판 ── */
  addBoard({ name, templateIds, allowComments }) {
    const b = { id: _bid('brd_'), name, templateIds: [...(templateIds || [])], allowComments: !!allowComments,
                sortOrder: BOARD.boards.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1, active: true, createdAt: new Date().toISOString() };
    BOARD.boards.push(b);
    _track('게시판 추가', 'brd:' + b.id, () => _upsertBoard(b.id));
    return b;
  },
  updateBoard(id, patch) {
    const i = BOARD.boards.findIndex(b => b.id === id);
    if (i < 0) return null;
    BOARD.boards[i] = { ...BOARD.boards[i], ...patch, id };
    _track('게시판 수정', 'brd:' + id, () => _upsertBoard(id));
    return BOARD.boards[i];
  },
  // Promise<true|'in-use'|'check-failed'>. deleteTemplate 와 같은 규칙(로컬·서버 글 확인 후에만 삭제)
  async deleteBoard(id) {
    if (BOARD.posts.some(p => p.boardId === id)) return 'in-use';
    const n = await _serverPostCount(q => q.eq('board_id', id));
    if (n !== 0) return n < 0 ? 'check-failed' : 'in-use';
    if (BOARD.posts.some(p => p.boardId === id)) return 'in-use';
    BOARD.boards = BOARD.boards.filter(b => b.id !== id);
    _track('게시판 삭제', 'brd:' + id, () => BOARD.boards.some(b => b.id === id) ? {} : _sb.from('wfm_boards').delete().eq('id', id), true);
    return true;
  },
  reorderBoards(ids) {
    const map = new Map(BOARD.boards.map(b => [b.id, b]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean);
    BOARD.boards.forEach(b => { if (!ids.includes(b.id)) ordered.push(b); });
    BOARD.boards = ordered;
    BOARD.boards.forEach((b, i) => { b.sortOrder = i; });
    _track('게시판 순서', 'reorder:boards', () => BOARD.boards.length ? _sb.from('wfm_boards').upsert(BOARD.boards.map(_boardToRow)) : {});
  },
};

// ═══════════════════════════════════════════════════════════
// 공수 산정 기록 (docs/estimate-spec.md) — DATA/BOARD 와 독립. revert() 만 함께 되돌린다
// ═══════════════════════════════════════════════════════════
const EST   = { sales: [], estimates: [], versions: {} };
const ELOAD = { status: 'idle', errors: [] };

function _rowToSales(r) {
  return { id: r.id, name: r.name, dept: r.dept || '', active: r.active !== false, sortOrder: r.sort_order ?? 0, createdAt: r.created_at || '' };
}
function _salesToRow(s) {
  return { id: s.id, name: s.name, dept: s.dept || '', active: s.active !== false, sort_order: s.sortOrder ?? 0 };
}
function _rowToEstimate(r) {
  return { id: r.id, title: r.title || '', client: r.client || '', salesId: r.sales_id || null, projectId: r.project_id || null,
           estimatedOn: r.estimated_on || '', participants: Array.isArray(r.participants) ? r.participants : [], memo: r.memo || '',
           currentVersion: Number(r.current_version) || 1, totalMm: Number(r.total_mm) || 0,
           createdAt: r.created_at || '', updatedAt: r.updated_at || '', createdBy: r.created_by || null, createdByEmail: r.created_by_email || '' };
}
// created_by / created_by_email 은 서버 기본값이 채우므로 보내지 않는다(update 가 덮어쓰지 않도록)
function _estimateToRow(e) {
  return { id: e.id, title: e.title || '', client: e.client || '', sales_id: e.salesId || null, project_id: e.projectId || null,
           estimated_on: e.estimatedOn, participants: e.participants || [], memo: e.memo || '',
           current_version: e.currentVersion, total_mm: e.totalMm || 0, updated_at: e.updatedAt };
}
function _rowToEstimateVersion(r) {
  return { estimateId: r.estimate_id, version: Number(r.version) || 0, reason: r.reason || '', snapshot: r.snapshot || {},
           totalMm: Number(r.total_mm) || 0, savedAt: r.saved_at || '', savedByEmail: r.saved_by_email || '' };
}
// 버전 행은 insert 전용. saved_at / saved_by_email 은 서버 기본값
function _estimateVersionToRow(v) {
  return { estimate_id: v.estimateId, version: v.version, reason: v.reason, snapshot: v.snapshot, total_mm: v.totalMm };
}

function salesName(id) { const s = EST.sales.find(x => x.id === id); return s ? s.name : ''; }
function estimateById(id) { return EST.estimates.find(e => e.id === id) || null; }
function latestEstimateVersion(id) {
  const list = EST.versions[id];
  return list && list.length ? list.reduce((a, b) => (b.version > a.version ? b : a)) : null;
}

const _estOnServer = new Set();   // 서버에 머리말 행이 있는 id (신규=insert / 기존=update 구분)
const _estOutbox = {};            // id -> 아직 서버에 확정되지 않은 저장 항목(버전 행 + 머리말). 같은 키의 새 저장이 실패 항목을 대체해도 사라지지 않게 한다

let _loadEstP = null;
function loadEstimates() {
  if (_loadEstP) return _loadEstP;
  _loadEstP = (async () => {
    ELOAD.status = 'loading'; ELOAD.errors = [];
    await SaveState._drain();   // 진행 중인 저장이 서버에 반영된 뒤 읽는다(낙관적 로컬 상태를 낡은 스냅샷으로 덮지 않도록)
    const tables = [['wfm_sales_people', '영업 담당'], ['wfm_estimates', '산정 기록']];
    let res = [];
    let missing = false;
    try {
      res = await Promise.all(tables.map(([t]) => _sb.from(t).select('*')));
      res.forEach((r, i) => {
        if (!r.error) return;
        if (_isMissingTable(r.error)) missing = true;
        ELOAD.errors.push({ table: tables[i][1], message: r.error.message || String(r.error) });
      });
    } catch (e) {
      console.error('Supabase estimate load error:', e);
      ELOAD.errors.push({ table: '네트워크', message: (e && e.message) || String(e) });
    }
    if (ELOAD.errors.length) {
      ELOAD.status = missing ? 'missing' : 'error';
      EST.sales = []; EST.versions = {};
      EST.estimates = EST.estimates.filter(e => (_estOutbox[e.id] || []).length);   // 아직 서버에 못 보낸 기록은 잃지 않도록 유지
      return false;
    }
    const [sRes, eRes] = res;
    EST.sales = (sRes.data || []).map(_rowToSales).sort((a, b) => a.sortOrder - b.sortOrder || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const unsent = EST.estimates.filter(e => (_estOutbox[e.id] || []).length);   // 실패해 재시도 대기 중인 기록은 로컬 값을 유지
    EST.estimates = (eRes.data || []).map(_rowToEstimate).filter(e => !unsent.some(u => u.id === e.id)).concat(unsent)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    EST.versions = {};
    _estOnServer.clear(); (eRes.data || []).forEach(r => _estOnServer.add(r.id));
    ELOAD.status = 'ok';
    return true;
  })().finally(() => { _loadEstP = null; });
  return _loadEstP;
}

const _upsertSales = id => { const s = EST.sales.find(x => x.id === id); return s ? _sb.from('wfm_sales_people').upsert(_salesToRow(s)) : {}; };

// 같은 (estimate_id, version) 행이 이미 있으면: 내용(snapshot)이 같을 때만 재시도 중복으로 보고 성공, 다르면 다른 PC 가 먼저 저장한 것(conflict)
function _jsonEq(a, b) {
  const norm = v => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));   // jsonb 는 키 순서를 보존하지 않는다
}
async function _insertEstimateVersion(row) {
  const q = await _sb.from('wfm_estimate_versions').insert(row);
  if (!q.error) return {};
  if (q.error.code !== '23505') return q;
  const s = await _sb.from('wfm_estimate_versions').select('snapshot').eq('estimate_id', row.estimate_id).eq('version', row.version).maybeSingle();
  if (s.error) return s;
  return s.data && _jsonEq(s.data.snapshot, row.snapshot) ? {} : { conflict: true };
}
// 낙관적으로 반영했던 로컬 변경을 되돌리고(이 항목과 그 뒤 항목), 이미 호출자에게 성공을 돌려줬다면 토스트로 알린다
const EST_CONFLICT_MSG = '다른 곳에서 먼저 저장되었습니다. 새로고침 후 다시 저장하세요';
function _estConflict(id, en) {
  const list = _estOutbox[id] || [];
  const i = list.indexOf(en);
  const dropped = i >= 0 ? list.slice(i) : [en];
  if (i >= 0) _estOutbox[id] = list.slice(0, i);
  const local = estimateById(id);
  if (local && dropped.some(x => x.est === local)) {
    const idx = EST.estimates.indexOf(local);
    if (en.prev) EST.estimates[idx] = en.prev; else EST.estimates.splice(idx, 1);
  }
  if (EST.versions[id]) EST.versions[id] = EST.versions[id].filter(v => !dropped.some(x => x.ver === v));
  dropped.forEach(x => { x.conflict = true; });
  if (dropped.some(x => x.detached)) showToast(EST_CONFLICT_MSG);
}
// 버전 행만 들어가고 머리말 갱신 전에 끊긴 '고아 버전'이 있으면(버전 행은 수정·삭제 불가) 그 버전을 현재로 채택해 머리말을 맞춘다.
// 그래야 이후 "최신 버전 기준으로 계속"이 같은 충돌을 되풀이하지 않는다. 실패해도 저장 결과에는 영향 없음(best-effort)
async function _adoptOrphanVersion(id) {
  try {
    const h = await _sb.from('wfm_estimates').select('current_version').eq('id', id).maybeSingle();
    if (h.error || !h.data) return;
    const cv = Number(h.data.current_version);
    const m = await _sb.from('wfm_estimate_versions').select('version,total_mm').eq('estimate_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
    if (m.error || !m.data || Number(m.data.version) <= cv) return;
    await _sb.from('wfm_estimates').update({ current_version: Number(m.data.version), total_mm: Number(m.data.total_mm) || 0 }).eq('id', id).eq('current_version', cv);
  } catch (e) { console.warn('orphan version adopt failed', e); }
}
// 항목 하나를 서버에 반영: 신규는 머리말 insert → 버전 행, 기존은 버전 행 → 머리말 update(current_version 조건).
// 버전 행(PK)이 먼저 자리를 잡으므로 동시 저장 중 한쪽만 통과하고, 실패해도 이력 없는 머리말이 남지 않는다.
async function _syncEstimateEntry(id, en, last) {
  const cur = estimateById(id);
  const row = { ...(last && cur ? _estimateToRow(cur) : en.header), current_version: en.version };
  if (en.version === 1) {
    if (!_estOnServer.has(id)) {
      const r = await _sb.from('wfm_estimates').insert(row);
      if (r.error && r.error.code !== '23505') return r;
      _estOnServer.add(id);
    } else {   // 재시도: 머리말이 이미 있으면 최신 로컬 값으로 갱신
      const { id: _id, ...rest } = row;
      const r = await _sb.from('wfm_estimates').update(rest).eq('id', id);
      if (r.error) return r;
    }
    return _insertEstimateVersion(en.row);
  }
  const v = await _insertEstimateVersion(en.row);
  if (v.conflict) await _adoptOrphanVersion(id);
  if (v.error || v.conflict) return v;
  const { id: _id, ...rest } = row;
  const u = await _sb.from('wfm_estimates').update(rest).eq('id', id).eq('current_version', en.version - 1).select('id');
  if (u.error) return u;
  if (u.data && u.data.length) return {};
  // 0행: 이미 반영된 재시도이거나, 서버 버전이 달라진 것(conflict)
  const c = await _sb.from('wfm_estimates').select('current_version').eq('id', id).maybeSingle();
  if (c.error) return c;
  if (!c.data) return { error: { message: '서버에 산정 기록이 없습니다(삭제되었을 수 있습니다)' } };
  return Number(c.data.current_version) === en.version ? {} : { conflict: true };
}
// 실행 시점의 outbox 를 순서대로 처리한다. 기록이 로컬에서 사라졌으면 건너뛴다. 재시도해도 안전
async function _syncEstimate(id) {
  if (!estimateById(id)) { delete _estOutbox[id]; return {}; }
  for (const en of (_estOutbox[id] || []).slice()) {
    if (!(_estOutbox[id] || []).includes(en)) continue;
    const list = _estOutbox[id];
    const r = await _syncEstimateEntry(id, en, en === list[list.length - 1]);
    if (r.conflict) { _estConflict(id, en); return {}; }
    if (r.error) return r;
    _estOutbox[id] = (_estOutbox[id] || []).filter(x => x !== en);
  }
  return {};
}

async function _serverEstimateCount(apply) {
  try {
    const r = await apply(_sb.from('wfm_estimates').select('id', { count: 'exact', head: true }));
    return r && !r.error && typeof r.count === 'number' ? r.count : -1;
  } catch (e) { return -1; }
}

const EstimateAPI = {
  load: loadEstimates,

  // Promise<EstimateVersion[]>. 서버 이력 + 아직 못 보낸 로컬 버전. 실패 시 reject
  async loadVersions(id) {
    const r = await _sb.from('wfm_estimate_versions').select('*').eq('estimate_id', id).order('version', { ascending: true });
    if (r.error) throw r.error;
    const list = (r.data || []).map(_rowToEstimateVersion);
    (_estOutbox[id] || []).forEach(en => { if (!list.some(v => v.version === en.version)) list.push(en.ver); });
    list.sort((a, b) => a.version - b.version);
    if (estimateById(id)) EST.versions[id] = list;
    return list;
  },

  // {id?, header:{title,client,salesId,projectId,estimatedOn,participants,memo,totalMm}, snapshot, reason, baseVersion}
  async save({ id, header, snapshot, reason, baseVersion }) {
    const h = header || {};
    const isNew = !id;
    const eid = id || _bid('est_');
    const key = 'est:' + eid;
    let why = String(reason || '').trim();
    const base = Number(baseVersion) || 0;
    if (isNew) { if (!why) why = '최초 작성'; }
    else if (!why) return { ok: false, code: 'invalid', message: '변경 사유를 입력하세요' };
    if (!isNew) {
      if (!estimateById(eid)) return { ok: false, code: 'error', message: '산정 기록을 찾을 수 없습니다' };
      if (SaveState.failed.some(f => f.key === key)) return { ok: false, code: 'error', message: '이전 저장이 아직 반영되지 않았습니다. 다시 시도한 뒤 저장하세요' };
      if (SaveState._chains[key]) await SaveState._chains[key];   // 앞선 저장이 서버에 반영된 뒤 버전을 비교한다
      let cur;
      try {
        const r = await _sb.from('wfm_estimates').select('current_version').eq('id', eid).maybeSingle();
        if (r.error) throw r.error;
        cur = r.data ? Number(r.data.current_version) : null;
      } catch (e) { return { ok: false, code: 'error', message: (e && e.message) || '버전을 확인하지 못했습니다' }; }
      if (cur === null) return { ok: false, code: 'error', message: '서버에 산정 기록이 없습니다(삭제되었을 수 있습니다)' };
      if (cur < base) return { ok: false, code: 'error', message: '서버에 아직 반영되지 않은 이전 저장이 있습니다. 잠시 후 다시 시도하세요' };
      if (cur > base) return { ok: false, code: 'conflict', message: EST_CONFLICT_MSG };
    }
    // await 이후 로컬 상태를 다시 읽어 판단한다(그 사이 다른 저장이 끼었을 수 있음)
    const prev = isNew ? null : estimateById(eid);
    if (!isNew && !prev) return { ok: false, code: 'error', message: '산정 기록을 찾을 수 없습니다' };
    if (prev && prev.currentVersion !== base) return { ok: false, code: 'conflict', message: EST_CONFLICT_MSG };
    const now = new Date().toISOString();
    const version = isNew ? 1 : base + 1;
    const est = {
      id: eid, title: h.title || '', client: h.client || '', salesId: h.salesId || null, projectId: h.projectId || null,
      estimatedOn: h.estimatedOn || now.slice(0, 10), participants: _deepCopy(h.participants || []), memo: h.memo || '',
      currentVersion: version, totalMm: Number(h.totalMm) || 0,
      createdAt: prev ? prev.createdAt : now, updatedAt: now,
      createdBy: prev ? prev.createdBy : CURRENT_USER.id, createdByEmail: prev ? prev.createdByEmail : CURRENT_USER.email,
    };
    const ver = { estimateId: eid, version, reason: why, snapshot: _deepCopy(snapshot || {}), totalMm: est.totalMm, savedAt: now, savedByEmail: CURRENT_USER.email };
    const en = { version, base, row: _estimateVersionToRow(ver), header: _estimateToRow(est), est, prev, ver, salesId: est.salesId, projectId: est.projectId, conflict: false, detached: false };
    if (prev) EST.estimates[EST.estimates.indexOf(prev)] = est; else EST.estimates.unshift(est);
    if (EST.versions[eid]) EST.versions[eid] = EST.versions[eid].filter(v => v.version !== version).concat(ver);
    (_estOutbox[eid] = _estOutbox[eid] || []).push(en);
    // FK: 방금 추가한 영업 담당·프로젝트가 서버에 올라간 뒤에 저장한다
    const deps = [];
    _estOutbox[eid].forEach(x => { if (x.salesId) deps.push('sales:' + x.salesId); if (x.projectId) deps.push('project:' + x.projectId); });
    await _track('산정 저장', key, () => _syncEstimate(eid), false, [...new Set(deps)]);
    if (en.conflict) return { ok: false, code: 'conflict', message: EST_CONFLICT_MSG };
    en.detached = true;   // 이후의 conflict 는 토스트로 알린다
    return { ok: true, estimate: est, version: ver };
  },

  // Promise<Estimate>. 최신 버전 snapshot 으로 새 기록(v1). 실패 시 throw
  async copy(id) {
    const src = estimateById(id);
    if (!src) throw new Error('원본 산정 기록을 찾을 수 없습니다');
    let v = latestEstimateVersion(id);
    if (!v || v.version < src.currentVersion) { await EstimateAPI.loadVersions(id); v = latestEstimateVersion(id); }
    if (!v) throw new Error('원본 산정 이력을 읽지 못했습니다');
    const title = src.title + ' (복사)';
    const snapshot = _deepCopy(v.snapshot);
    snapshot.header = { ...(snapshot.header || {}), title };
    const r = await EstimateAPI.save({
      header: { title, client: src.client, salesId: src.salesId, projectId: src.projectId, estimatedOn: src.estimatedOn,
                participants: src.participants, memo: src.memo, totalMm: v.totalMm },
      snapshot, reason: '복제: ' + src.title, baseVersion: 0,
    });
    if (!r.ok) throw new Error(r.message);
    return r.estimate;
  },

  canDelete(est) { return !!(est && est.createdBy && est.createdBy === CURRENT_USER.id); },

  // Promise<true|'not-owner'|'error'>. 낙관적으로 지우고, 서버가 실제로 지우지 못하면(RLS 포함) 로컬을 복구한다
  async remove(id) {
    const est = estimateById(id);
    if (!est || !EstimateAPI.canDelete(est)) return 'not-owner';
    const key = 'est:' + id;
    const idx = EST.estimates.indexOf(est);
    const cachedVersions = EST.versions[id];
    const outbox = _estOutbox[id];
    EST.estimates.splice(idx, 1);
    delete EST.versions[id]; delete _estOutbox[id];
    const ok = await _track('산정 삭제', key, async () => {
      if (estimateById(id)) return {};   // 그 사이 복구됨
      if (!_estOnServer.has(id)) return {};   // 서버에 올라간 적 없음
      const r = await _sb.from('wfm_estimates').delete().eq('id', id).select('id');
      if (r.error) return r;
      if (!(r.data && r.data.length)) {   // 0행: 다른 PC 가 이미 지웠으면 성공, 아직 있으면 RLS 가 막은 것
        const c = await _sb.from('wfm_estimates').select('id').eq('id', id).maybeSingle();
        if (c.error) return c;
        if (c.data) return { error: { message: '산정 기록을 삭제하지 못했습니다(권한 없음)' } };
      }
      return r;
    }, true);
    if (ok) { _estOnServer.delete(id); return true; }
    if (!estimateById(id)) {
      EST.estimates.splice(Math.min(idx, EST.estimates.length), 0, est);
      if (cachedVersions) EST.versions[id] = cachedVersions;
      if (outbox) _estOutbox[id] = outbox;
    }
    SaveState.failed = SaveState.failed.filter(f => !(f.key === key && f.label === '산정 삭제'));   // 복구했으므로 재시도 대상이 아니다
    SaveState._set();
    return 'error';
  },

  /* ── 영업 담당 ── */
  saveSales({ id, name, dept, active }) {
    const i = id ? EST.sales.findIndex(s => s.id === id) : -1;
    let s;
    if (i >= 0) s = EST.sales[i] = { ...EST.sales[i], name, dept: dept || '', active: active !== false };
    else {
      s = { id: id || _bid('sal_'), name, dept: dept || '', active: active !== false,
            sortOrder: EST.sales.reduce((m, x) => Math.max(m, x.sortOrder), -1) + 1, createdAt: new Date().toISOString() };
      EST.sales.push(s);
    }
    const sid = s.id;
    _track('영업 담당 저장', 'sales:' + sid, () => _upsertSales(sid));
    return s;
  },
  setSalesActive(id, active) {
    const i = EST.sales.findIndex(s => s.id === id);
    if (i < 0) return;
    EST.sales[i] = { ...EST.sales[i], active: !!active };
    _track('영업 담당 활성', 'sales:' + id, () => _upsertSales(id));
  },
  // Promise<true|'in-use'|'check-failed'>. 서버 확인 먼저, 그 뒤 동기적으로 로컬 변경. FK(restrict)가 최종 방어선
  async removeSales(id) {
    if (EST.estimates.some(e => e.salesId === id)) return 'in-use';
    const n = await _serverEstimateCount(q => q.eq('sales_id', id));
    if (n !== 0) return n < 0 ? 'check-failed' : 'in-use';
    if (EST.estimates.some(e => e.salesId === id)) return 'in-use';
    // 서버 삭제가 성공한 뒤에 로컬을 지운다(그 사이 FK 가 막으면 로컬은 그대로)
    const key = 'sales:' + id;
    let err = null;
    const ok = await _track('영업 담당 삭제', key, async () => { const r = await _sb.from('wfm_sales_people').delete().eq('id', id); if (r.error) err = r.error; return r; }, true);
    if (!ok) {
      SaveState.failed = SaveState.failed.filter(f => !(f.key === key && f.label === '영업 담당 삭제'));
      SaveState._set();
      return err && err.code === '23503' ? 'in-use' : 'check-failed';
    }
    EST.sales = EST.sales.filter(s => s.id !== id);
    return true;
  },
};
