// ██████████████████████████████████████████████████████████
// █  BOARD VIEW  —  게시판 (목록·상세·댓글·글쓰기/수정)        █
// █  데이터/쓰기는 data.js 의 BOARD·BLOAD·BoardAPI 사용        █
// ██████████████████████████████████████████████████████████

const _bd = {
  boardId: null,
  q: '',
  group: '',        // '' | 'month' | 'project' | 'member'
  detailId: null,   // 상세 모달에 열린 게시물 id
  formPostId: null, // 수정 중인 게시물 id (null = 새 글)
  loading: false,
  limit: 30,        // 목록에 보이는 행 수 (더 보기로 30개씩 늘림)
};
const BD_PAGE = 30;

// ─── 헬퍼 ───
const _bdMemberName = id => (id && getMember(id)?.name) || (id ? '(삭제된 멤버)' : '');
const _bdProjectName = id => { const p = id && getProject(id); return p ? p.name : (id ? '(삭제된 프로젝트)' : ''); };
const _bdPad = n => String(n).padStart(2, '0');
function _bdDate(iso, withTime) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const s = `${d.getFullYear()}-${_bdPad(d.getMonth() + 1)}-${_bdPad(d.getDate())}`;
  return withTime ? `${s} ${_bdPad(d.getHours())}:${_bdPad(d.getMinutes())}` : s;
}
const _bdNum = v => String(Math.round(v * 100) / 100);
const _bdLastAuthor = () => { try { const v = localStorage.getItem('wfm_lastAuthor'); return v && getMember(v) ? v : ''; } catch (e) { return ''; } };
const _bdSaveAuthor = id => { try { if (id) localStorage.setItem('wfm_lastAuthor', id); } catch (e) {} };

function _bdBoards() {
  return BOARD.boards.filter(b => b.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
function _bdCurrentBoard() {
  const list = _bdBoards();
  let b = list.find(x => x.id === _bd.boardId);
  if (!b) { b = list[0] || null; _bd.boardId = b ? b.id : null; }
  return b;
}
// 게시판이 허용하는 템플릿의 최신 버전들 (활성만)
function _bdBoardTemplates(board) {
  return (board.templateIds || []).map(id => latestTemplate(id)).filter(t => t && t.active !== false);
}
// 열·묶음·합계 계산용: 게시판이 허용하는 모든 버전(비활성 포함) + 게시물이 쓴 버전. 같은 key 는 먼저 나온(최신) 정의를 쓴다
function _bdAllTemplates(board, posts) {
  const out = [], seen = new Set();
  const add = t => { if (t && !seen.has(t.id + '@' + t.version)) { seen.add(t.id + '@' + t.version); out.push(t); } };
  (board.templateIds || []).forEach(id => BOARD.templates.filter(t => t.id === id).sort((a, b) => b.version - a.version).forEach(add));
  posts.forEach(p => add(templateOf(p)));
  return out;
}
const _bdFieldOf = (tpl, key) => (tpl?.fields || []).find(f => f.key === key);

// 값 → 표시용 HTML (이미 esc 처리됨). 빈 값은 '—'
function _bdValueHtml(field, val) {
  if (field.type === 'checkbox') return val ? '예' : '아니오';
  if (val === undefined || val === null || val === '') return '<span class="board-empty">—</span>';
  switch (field.type) {
    case 'number': { const n = Number(val); if (!Number.isFinite(n)) return esc(val); return esc(_bdNum(n)) + (field.unit ? ` <span class="board-unit">${esc(field.unit)}</span>` : ''); }
    case 'member': return esc(_bdMemberName(val));
    case 'project': return esc(_bdProjectName(val));
    default: return esc(val);
  }
}

// 값 → 표시용 일반 텍스트 (CSV 용)
function _bdValueText(field, val) {
  if (field.type === 'checkbox') return val ? '예' : '아니오';
  if (val === undefined || val === null || val === '') return '';
  switch (field.type) {
    case 'number': { const n = Number(val); return Number.isFinite(n) ? _bdNum(n) : String(val); }
    case 'member': return _bdMemberName(val);
    case 'project': return _bdProjectName(val);
    default: return String(val);
  }
}

// 검색 대상 텍스트: 제목 + 텍스트성 값 + 멤버/프로젝트 이름
function _bdSearchText(post) {
  const tpl = templateOf(post);
  const parts = [post.title];
  for (const f of tpl?.fields || []) {
    const v = post.data?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (f.type === 'member') parts.push(_bdMemberName(v));
    else if (f.type === 'project') parts.push(_bdProjectName(v));
    else if (f.type === 'text' || f.type === 'longtext' || f.type === 'select') parts.push(String(v));
  }
  return parts.join(' ').toLowerCase();
}

// ─── 화면 ───
function renderBoardView() {
  const host = document.getElementById('grid-container');
  const wrap = document.getElementById('kpi-wrap'); if (wrap) wrap.innerHTML = '';
  // 불러오기: 이미 진행 중인 로드(다른 곳에서 시작)도 같은 promise 를 기다렸다가 다시 그린다
  const load = () => {
    if (_bd.loading) return;
    _bd.loading = true;
    Promise.resolve(BoardAPI.loadBoards()).catch(() => {}).then(() => {
      _bd.loading = false;
      if (state.viewMode === 'board') renderBoardView();
    });
  };
  const gate = (cls, title, body, btn) => {
    host.innerHTML = `<div class="data-gate board-root ${cls}" role="${cls ? 'alert' : 'status'}"><h3>${title}</h3>${body}${btn ? `<button type="button" class="btn-primary" id="boardRetry">${btn}</button>` : ''}</div>`;
    const r = document.getElementById('boardRetry');
    if (r) r.onclick = () => { r.disabled = true; r.textContent = '불러오는 중…'; load(); };
  };

  if (typeof BLOAD === 'undefined' || typeof BoardAPI === 'undefined') {
    gate('is-error', '게시판을 사용할 수 없습니다', '<p>게시판 데이터 모듈이 로드되지 않았습니다.</p>');
    return;
  }
  if (BLOAD.status === 'idle' || BLOAD.status === 'loading') {
    gate('', '불러오는 중…', '<p>게시판 데이터를 불러오고 있습니다.</p>');
    load();   // loadBoards() 는 진행 중이면 그 promise 를 돌려준다
    return;
  }
  if (BLOAD.status === 'missing') {
    gate('is-error', '게시판 테이블이 없습니다', '<p><b>sql/boards.sql</b> 을 Supabase SQL Editor 에서 실행한 뒤 다시 시도하세요.</p>', '다시 시도');
    return;
  }
  if (BLOAD.status === 'error') {
    gate('is-error', '게시판을 불러오지 못했습니다',
      `<ul>${(BLOAD.errors || []).map(e => `<li><b>${esc(e.table)}</b> — ${esc(e.message)}</li>`).join('')}</ul>`, '다시 시도');
    return;
  }

  const boards = _bdBoards();
  const board = _bdCurrentBoard();
  if (!board) {
    gate('', '표시할 게시판이 없습니다', '<p>⚙ 관리 → 게시판 탭에서 게시판을 추가하세요.</p>');
    return;
  }

  host.innerHTML = `<div class="board-root">
    <div class="board-toolbar">
      <div class="board-tabs" role="tablist" aria-label="게시판 선택">
        ${boards.map(b => `<button type="button" class="board-tab${b.id === board.id ? ' active' : ''}" role="tab" aria-selected="${b.id === board.id}" tabindex="${b.id === board.id ? 0 : -1}" data-board="${esc(b.id)}">${esc(b.name)}</button>`).join('')}
      </div>
      <div class="board-actions">
        <input type="search" id="boardSearch" class="board-search" placeholder="제목·내용 검색" aria-label="게시물 검색" autocomplete="off" value="${esc(_bd.q)}">
        <button type="button" class="btn-ghost" id="boardCsv">CSV 내보내기</button>
        <button type="button" class="btn-primary" id="boardWrite">글쓰기</button>
      </div>
    </div>
    <div id="boardListArea"></div>
  </div>`;

  const tabs = host.querySelector('.board-tabs');
  tabs.onclick = e => {
    const t = e.target.closest('.board-tab'); if (!t || t.dataset.board === _bd.boardId) return;
    _bd.boardId = t.dataset.board; _bd.q = ''; _bd.group = ''; _bd.limit = BD_PAGE;
    renderBoardView();
    host.querySelector('.board-tab.active')?.focus();
  };
  tabs.onkeydown = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const all = [...tabs.querySelectorAll('.board-tab')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].click();
  };
  const search = document.getElementById('boardSearch');
  search.oninput = () => { _bd.q = search.value; _bd.limit = BD_PAGE; _bdRenderList(); };
  search.onkeydown = e => { if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; _bd.q = ''; _bd.limit = BD_PAGE; _bdRenderList(); } };
  document.getElementById('boardCsv').onclick = _bdExportCsv;
  document.getElementById('boardWrite').onclick = () => _bdOpenForm(null);
  _bdRenderList();
}

// 검색어 적용
function _bdFiltered(board, all) {
  const q = _bd.q.trim().toLowerCase();
  return q ? all.filter(p => _bdSearchText(p).includes(q)) : all;
}
function _bdListCols(tpls) {
  const cols = [];
  for (const t of tpls) for (const f of t.fields || []) if (f.list && !cols.some(c => c.key === f.key)) cols.push(f);
  return cols;
}

// CSV 내보내기: 현재 검색 결과 전체(페이지 제한 무관). UTF-8 BOM, 수식 주입 방지
function _bdCsvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function _bdExportCsv() {
  const board = _bdCurrentBoard(); if (!board) return;
  const all = boardPosts(board.id), posts = _bdFiltered(board, all);
  if (!posts.length) { showToast('내보낼 게시물이 없습니다.'); return; }
  const cols = _bdListCols(_bdAllTemplates(board, all));
  const multi = (board.templateIds || []).length > 1;
  const head = ['제목', ...(multi ? ['양식'] : []), ...cols.map(c => c.type === 'number' && c.unit ? `${c.label} (${c.unit})` : c.label), '작성자', '작성일', ...(board.allowComments ? ['댓글'] : [])];
  const rows = posts.map(p => {
    const tpl = templateOf(p);
    return [p.title, ...(multi ? [tpl?.name || ''] : []),
      ...cols.map(c => { const f = _bdFieldOf(tpl, c.key); return f ? _bdValueText(f, p.data?.[c.key]) : ''; }),
      _bdMemberName(p.authorId), _bdDate(p.createdAt), ...(board.allowComments ? [postComments(p.id).length] : [])];
  });
  const csv = '\uFEFF' + [head, ...rows].map(r => r.map(_bdCsvCell).join(',')).join('\r\n') + '\r\n';
  const t = new Date(), ymd = `${t.getFullYear()}${_bdPad(t.getMonth() + 1)}${_bdPad(t.getDate())}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${board.name.replace(/[\\/:*?"<>|]/g, '_')}_${ymd}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 목록 영역 (합계 줄 + 표). 검색 입력 포커스를 잃지 않도록 이 영역만 다시 그린다
function _bdRenderList() {
  const area = document.getElementById('boardListArea'); if (!area) return;
  const board = _bdCurrentBoard(); if (!board) return;
  const all = boardPosts(board.id);
  const posts = _bdFiltered(board, all);

  // 목록 열: 허용 템플릿의 모든 버전(비활성 포함)과 게시물이 쓴 버전의 list 필드 (key 기준 합집합)
  const tpls = _bdAllTemplates(board, all);
  const cols = _bdListCols(tpls);
  const q = _bd.q.trim();
  const multi = (board.templateIds || []).length > 1;

  let html = _bdSumBarHtml(board, posts, tpls);
  if (!posts.length) {
    html += `<div class="board-none">${q ? '검색 결과가 없습니다.' : '아직 게시물이 없습니다. [글쓰기]로 첫 글을 남겨 보세요.'}</div>`;
  } else {
    html += `<div class="board-table-wrap"><table class="board-table board-list-table">
      <thead><tr><th scope="col" class="bt-title">제목</th>${multi ? '<th scope="col">양식</th>' : ''}${cols.map(c => `<th scope="col">${esc(c.label)}</th>`).join('')}<th scope="col">작성자</th><th scope="col">작성일</th>${board.allowComments ? '<th scope="col" class="bt-num">댓글</th>' : ''}</tr></thead>
      <tbody>${posts.slice(0, _bd.limit).map(p => {
        const tpl = templateOf(p), n = postComments(p.id).length;
        return `<tr class="board-row" data-id="${esc(p.id)}">
          <td class="bt-title"><button type="button" class="board-title-btn" data-id="${esc(p.id)}">${esc(p.title)}</button></td>
          ${multi ? `<td>${esc(tpl?.name || '')}</td>` : ''}
          ${cols.map(c => { const f = _bdFieldOf(tpl, c.key); return `<td class="bt-f-${esc(f?.type || '')}">${f ? _bdValueHtml(f, p.data?.[c.key]) : '<span class="board-empty">—</span>'}</td>`; }).join('')}
          <td>${esc(_bdMemberName(p.authorId))}</td>
          <td class="bt-date">${esc(_bdDate(p.createdAt))}</td>
          ${board.allowComments ? `<td class="bt-num">${n ? n : '<span class="board-empty">0</span>'}</td>` : ''}
        </tr>`;
      }).join('')}</tbody></table></div>`;
    if (posts.length > _bd.limit) html += `<div class="board-more"><button type="button" class="btn-ghost" id="boardMore">더 보기 (${posts.length - _bd.limit}개 남음)</button></div>`;
  }
  area.innerHTML = html;
  document.getElementById('boardMore')?.addEventListener('click', () => {
    const prev = _bd.limit; _bd.limit += BD_PAGE; _bdRenderList();
    area.querySelectorAll('.board-row .board-title-btn')[prev]?.focus();
  });

  area.querySelector('.board-list-table')?.addEventListener('click', e => {
    const tr = e.target.closest('.board-row'); if (tr) _bdOpenDetail(tr.dataset.id, e.target.closest('.board-title-btn') || tr.querySelector('.board-title-btn'));
  });
  area.querySelector('.board-group')?.addEventListener('click', e => {
    const b = e.target.closest('[data-group]'); if (!b) return;
    const k = b.dataset.group;
    _bd.group = k === _bd.group ? '' : k;
    _bdRenderList();
    area.querySelector(`.board-group [data-group="${k}"]`)?.focus();
  });
}

// 합계 줄: sum 필드 총합 + (월별/프로젝트별/멤버별) 묶음 표
function _bdSumBarHtml(board, posts, tpls) {
  // 합계 대상 필드 (key 기준, tpls = 허용 템플릿 모든 버전 + 게시물이 쓴 버전)
  const sumFields = [];
  tpls.forEach(t => (t.fields || []).forEach(f => { if (f.type === 'number' && f.sum && !sumFields.some(s => s.key === f.key)) sumFields.push(f); }));
  if (!sumFields.length) { _bd.group = ''; return ''; }

  const modes = [];
  const has = type => tpls.some(t => (t.fields || []).some(f => f.type === type));
  modes.push(['month', '월별']);   // date 필드가 없어도 작성일 기준으로 묶을 수 있다
  if (has('project')) modes.push(['project', '프로젝트별']);
  if (has('member')) modes.push(['member', '멤버별']);
  if (!modes.some(m => m[0] === _bd.group)) _bd.group = '';

  const totals = {};
  sumFields.forEach(f => { totals[f.key] = 0; });
  // 게시물 자신의 양식에서 그 key 가 number 일 때만 더한다 (다른 버전에서 text 였던 값 제외)
  const addTo = (p, sums) => {
    const tpl = templateOf(p);
    sumFields.forEach(f => {
      if (_bdFieldOf(tpl, f.key)?.type !== 'number') return;
      const raw = p.data?.[f.key];
      if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') return;
      const v = Number(raw); if (Number.isFinite(v)) sums[f.key] += v;
    });
  };
  posts.forEach(p => addTo(p, totals));
  const unitOf = f => f.unit ? ` <span class="board-unit">${esc(f.unit)}</span>` : '';

  let html = `<div class="board-sum" role="group" aria-label="합계">
    <div class="board-sum-totals">
      <span class="board-sum-lbl">합계</span>
      ${sumFields.map(f => `<span class="board-sum-item"><span class="board-sum-k">${esc(f.label)}</span><b>${esc(_bdNum(totals[f.key]))}</b>${unitOf(f)}</span>`).join('')}
      <span class="board-sum-item"><span class="board-sum-k">글</span><b>${posts.length}</b></span>
    </div>
    <div class="board-group" role="group" aria-label="묶음 보기">
      <span class="board-sum-k">묶어서 보기</span>
      ${modes.map(([k, l]) => `<button type="button" class="board-group-btn${_bd.group === k ? ' active' : ''}" data-group="${k}" aria-pressed="${_bd.group === k}">${l}</button>`).join('')}
    </div>`;

  if (_bd.group && posts.length) {
    const groups = new Map();
    for (const p of posts) {
      const tpl = templateOf(p);
      let key, label;
      if (_bd.group === 'month') {
        const f = (tpl?.fields || []).find(x => x.type === 'date');
        const v = f && p.data?.[f.key];
        key = v && /^\d{4}-\d{2}/.test(v) ? String(v).slice(0, 7) : _bdDate(p.createdAt).slice(0, 7);
        label = key;
      } else {
        const f = (tpl?.fields || []).find(x => x.type === _bd.group);
        const v = f && p.data?.[f.key];
        key = !f ? '\u0000none' : (v || '');   // 필드 없음 / 값 없음은 서로 다른 묶음
        label = !f ? '(해당 없음)' : !v ? '(미지정)' : _bd.group === 'member' ? _bdMemberName(v) : _bdProjectName(v);
      }
      if (!groups.has(key)) { groups.set(key, { label, n: 0, sums: Object.fromEntries(sumFields.map(f => [f.key, 0])) }); }
      const g = groups.get(key); g.n++;
      addTo(p, g.sums);
    }
    const rows = [...groups.entries()];
    rows.sort((a, b) => _bd.group === 'month' ? (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0) : a[1].label.localeCompare(b[1].label, 'ko'));
    html += `<div class="board-table-wrap board-group-wrap"><table class="board-table board-group-table">
      <thead><tr><th scope="col">${esc(modes.find(m => m[0] === _bd.group)[1].replace('별', ''))}</th><th scope="col" class="bt-num">글</th>${sumFields.map(f => `<th scope="col" class="bt-num">${esc(f.label)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([, g]) => `<tr><td>${esc(g.label)}</td><td class="bt-num">${g.n}</td>${sumFields.map(f => `<td class="bt-num">${esc(_bdNum(g.sums[f.key]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return html + '</div>';
}

// ─── 상세 모달 ───
function _bdOpenDetail(postId, opener) {
  const post = BOARD.posts.find(p => p.id === postId); if (!post) return;
  _bd.detailId = postId;
  _bdRenderDetail();
  Modal.open('boardDetailModal');
  document.querySelector('#boardDetailModal .modal-card')?.focus({ preventScroll: true });
}

function _bdAuthorOptions(selected) {
  let opts = '<option value="">작성자 선택</option>';
  const ids = new Set();
  DATA.members.forEach(m => { ids.add(m.id); opts += `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name)}</option>`; });
  if (selected && !ids.has(selected)) opts += `<option value="${esc(selected)}" selected>${esc(_bdMemberName(selected))}</option>`;
  return opts;
}

function _bdRenderDetail() {
  const post = BOARD.posts.find(p => p.id === _bd.detailId);
  const body = document.getElementById('boardDetailBody');
  if (!post) { Modal.close('boardDetailModal'); return; }
  const board = BOARD.boards.find(b => b.id === post.boardId);
  const tpl = templateOf(post);
  const edited = post.updatedAt && post.createdAt && Math.abs(new Date(post.updatedAt) - new Date(post.createdAt)) > 1000;
  document.getElementById('boardDetailTitle').textContent = post.title;
  body.innerHTML = `<div class="board-meta">
      <span>${esc(board?.name || '')}</span>${tpl ? `<span>양식 ${esc(tpl.name)}${tpl.version > 1 ? ' v' + esc(tpl.version) : ''}</span>` : ''}
      <span>작성자 ${esc(_bdMemberName(post.authorId) || '—')}</span>
      <span>${esc(_bdDate(post.createdAt, true))}${edited ? ` (수정 ${esc(_bdDate(post.updatedAt, true))})` : ''}</span>
    </div>
    <dl class="board-fields">${(tpl?.fields || []).map(f => `<div class="board-field board-field-${esc(f.type)}">
        <dt>${esc(f.label)}</dt>
        <dd>${_bdValueHtml(f, post.data?.[f.key])}</dd></div>`).join('') || '<p class="board-empty">양식 정보를 찾을 수 없습니다.</p>'}</dl>
    ${board?.allowComments ? `<section class="board-comments" aria-labelledby="boardCmtHd">
      <h4 id="boardCmtHd">댓글 <span id="boardCmtCount"></span></h4>
      <ul class="board-cmt-list" id="boardCmtList"></ul>
      <div class="board-cmt-form">
        <select id="boardCmtAuthor" class="form-select" aria-label="댓글 작성자">${_bdAuthorOptions(_bdLastAuthor())}</select>
        <textarea id="boardCmtBody" class="form-textarea" rows="2" placeholder="댓글 내용" aria-label="댓글 내용" maxlength="2000"></textarea>
        <button type="button" class="btn-primary" id="boardCmtAdd">등록</button>
      </div>
      <div class="board-err" id="boardCmtErr" role="alert"></div>
    </section>` : ''}`;
  if (board?.allowComments) {
    _bdRenderComments();
    document.getElementById('boardCmtAdd').onclick = _bdAddComment;
    document.getElementById('boardCmtBody').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _bdAddComment(); } });
  }
}

function _bdRenderComments() {
  const list = document.getElementById('boardCmtList'); if (!list) return;
  const cs = postComments(_bd.detailId);
  document.getElementById('boardCmtCount').textContent = cs.length ? `(${cs.length})` : '';
  list.innerHTML = cs.length ? cs.map(c => `<li class="board-cmt" data-id="${esc(c.id)}">
      <div class="board-cmt-head"><b>${esc(_bdMemberName(c.authorId) || '—')}</b><span>${esc(_bdDate(c.createdAt, true))}</span>
        <button type="button" class="btn-icon-sm danger board-cmt-del" aria-label="댓글 삭제" title="댓글 삭제">삭제</button></div>
      <div class="board-cmt-body">${esc(c.body)}</div></li>`).join('')
    : '<li class="board-empty board-cmt-none">아직 댓글이 없습니다.</li>';
  list.querySelectorAll('.board-cmt-del').forEach(btn => {
    btn.onclick = () => confirmable(btn, async () => {
      const id = btn.closest('.board-cmt').dataset.id;
      await BoardAPI.deleteComment(id);
      _bdRenderComments(); _bdRenderList();
      document.getElementById('boardCmtBody')?.focus();
    }, { label: '정말?' });
  });
}

async function _bdAddComment() {
  const sel = document.getElementById('boardCmtAuthor'), ta = document.getElementById('boardCmtBody'), err = document.getElementById('boardCmtErr');
  const body = ta.value.trim();
  err.textContent = '';
  if (!sel.value) { err.textContent = '작성자를 선택하세요.'; sel.focus(); return; }
  if (!body) { err.textContent = '댓글 내용을 입력하세요.'; ta.focus(); return; }
  const btn = document.getElementById('boardCmtAdd'); btn.disabled = true;
  try {
    await BoardAPI.addComment({ postId: _bd.detailId, authorId: sel.value, body });
    _bdSaveAuthor(sel.value);
    ta.value = '';
    _bdRenderComments(); _bdRenderList();
  } catch (e) { err.textContent = '댓글을 저장하지 못했습니다.'; }
  btn.disabled = false;
  ta.focus();
}

document.getElementById('boardDetailClose').onclick = () => Modal.requestClose('boardDetailModal');
document.getElementById('boardDetailCloseBtn').onclick = () => Modal.requestClose('boardDetailModal');
document.getElementById('boardDetailEdit').onclick = () => { const p = BOARD.posts.find(x => x.id === _bd.detailId); if (p) _bdOpenForm(p); };
document.getElementById('boardDetailDel').onclick = function () {
  confirmable(this, async () => {
    const id = _bd.detailId;
    const ok = await BoardAPI.deletePost(id);
    if (ok === false) { showToast('게시물을 삭제하지 못했습니다.'); return; }
    _bdRenderList();
    Modal.close('boardDetailModal');
    showToast('삭제했습니다.');
  });
};
// 닫을 때 포커스: 목록이 다시 그려져 여는 데 쓴 버튼이 사라졌으면 같은 글의 제목 버튼(없으면 검색창)으로 돌린다
// (Modal 은 app.js 에서 정의되므로 모든 스크립트가 로드된 뒤에 등록)
window.addEventListener('DOMContentLoaded', () => {
  Modal.onClose.boardDetailModal = () => {
    const id = _bd.detailId; _bd.detailId = null;
    const prev = Modal._focus.boardDetailModal;
    if (prev && document.contains(prev)) return;
    Modal._focus.boardDetailModal = [...document.querySelectorAll('.board-title-btn')].find(b => b.dataset.id === id) || document.getElementById('boardSearch');
  };
  Modal.onClose.boardModal = () => { _bd.formPostId = null; };
});

// ─── 글쓰기 / 수정 폼 ───
// 필드별 입력 컨트롤 HTML. 모든 사용자 값은 esc 처리, id 는 인덱스 기반
function _bdFieldInput(f, i, val) {
  const id = `bfld_${i}`;
  const req = f.required ? ' required aria-required="true"' : '';
  switch (f.type) {
    case 'longtext': return `<textarea id="${id}" class="form-textarea board-longtext" rows="4"${req} maxlength="5000">${esc(val ?? '')}</textarea>`;
    case 'number': return `<input id="${id}" class="form-input" type="number" step="0.5" min="0" inputmode="decimal"${req} value="${esc(val ?? '')}">`;
    case 'date': return `<input id="${id}" class="form-input" type="date"${req} value="${esc(val ?? '')}">`;
    case 'member': return `<select id="${id}" class="form-select"${req}><option value="">선택</option>${DATA.members.map(m => `<option value="${esc(m.id)}"${m.id === val ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}${val && !getMember(val) ? `<option value="${esc(val)}" selected>${esc(_bdMemberName(val))}</option>` : ''}</select>`;
    case 'select': {
      const opts = [...(f.options || [])]; if (val && !opts.includes(val)) opts.push(val);
      return `<select id="${id}" class="form-select"${req}><option value="">선택</option>${opts.map(o => `<option value="${esc(o)}"${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    }
    case 'checkbox': return `<label class="board-check"><input id="${id}" type="checkbox"${val ? ' checked' : ''}> ${esc(f.label)}</label>`;
    case 'project': return `<div id="${id}_host"></div>`;
    default: return `<input id="${id}" class="form-input" type="text"${req} maxlength="500" value="${esc(val ?? '')}">`;
  }
}

// 현재 폼 DOM 에서 값을 읽는다 (검증 전의 원시 값)
function _bdReadForm() {
  const fm = document.getElementById('boardForm'); if (!fm) return null;
  const tplSel = document.getElementById('bfTemplate');
  const vals = {};
  (_bdForm.fields || []).forEach((f, i) => {
    const el = document.getElementById(`bfld_${i}`); if (!el) return;
    vals[f.key] = f.type === 'checkbox' ? el.checked : el.value;
  });
  return { tpl: tplSel ? tplSel.value : (_bdForm.tpl?.id || ''), title: document.getElementById('bfTitle').value, author: document.getElementById('bfAuthor').value, vals };
}

const _bdForm = { tpl: null, fields: [], board: null, post: null, pickers: [], linked: false };

// 새 글 기본값: 첫 date 필드 = 오늘, 첫 member 필드 = 선택한 작성자 (사용자가 직접 바꾸기 전까지)
const _bdFirstIdx = type => _bdForm.fields.findIndex(f => f.type === type);
function _bdToday() { const t = new Date(); return `${t.getFullYear()}-${_bdPad(t.getMonth() + 1)}-${_bdPad(t.getDate())}`; }

function _bdBuildFields(tpl, vals) {
  _bdForm.tpl = tpl; _bdForm.fields = tpl.fields || [];
  if (!_bdForm.post) {
    vals = { ...(vals || {}) };
    const di = _bdFirstIdx('date'), mi = _bdFirstIdx('member');
    if (di >= 0 && vals[_bdForm.fields[di].key] === undefined) vals[_bdForm.fields[di].key] = _bdToday();
    if (mi >= 0 && _bdForm.linked) vals[_bdForm.fields[mi].key] = document.getElementById('bfAuthor')?.value || '';
  }
  const box = document.getElementById('bfFields');
  box.innerHTML = _bdForm.fields.map((f, i) => `<div class="form-group" data-fi="${i}">
      ${f.type === 'checkbox' ? '' : `<label class="form-label" for="bfld_${i}${f.type === 'project' ? '_btn' : ''}">${esc(f.label)}${f.required ? ' <span class="board-req" aria-hidden="true">*</span>' : ''}${f.type === 'number' && f.unit ? ` <span class="board-unit">(${esc(f.unit)})</span>` : ''}</label>`}
      ${_bdFieldInput(f, i, vals?.[f.key])}
      <div class="board-err" id="bfErr_${i}" role="alert"></div></div>`).join('');
  const mi2 = _bdFirstIdx('member');
  if (mi2 >= 0) document.getElementById(`bfld_${mi2}`).addEventListener('change', () => { _bdForm.linked = false; });
  _bdForm.fields.forEach((f, i) => {
    if (f.type !== 'project') return;
    const host = document.getElementById(`bfld_${i}_host`);
    mountProjectPicker(host, { id: `bfld_${i}`, value: vals?.[f.key] || '', getRange: () => ({ lo: ymOf(2000, 1), hi: ymOf(2100, 12) }), opts: { includeDone: true, periodOnly: false } });
    host.querySelector('.pp-btn').id = `bfld_${i}_btn`;
    host.querySelector('.pp-btn').setAttribute('aria-label', f.label + ' 선택');
  });
}

function _bdOpenForm(post) {
  const board = post ? BOARD.boards.find(b => b.id === post.boardId) : _bdCurrentBoard();
  if (!board) return;
  let tpl, tpls = [];
  if (post) tpl = templateOf(post);
  else {
    tpls = _bdBoardTemplates(board);
    if (!tpls.length) { showToast('이 게시판에서 쓸 수 있는 양식이 없습니다. 관리에서 템플릿을 확인하세요.'); return; }
    tpl = tpls[0];
  }
  if (!tpl) { showToast('이 글의 양식을 찾을 수 없습니다.'); return; }
  _bdForm.board = board; _bdForm.post = post || null; _bd.formPostId = post ? post.id : null;
  document.getElementById('boardFormTitle').textContent = post ? '글 수정' : `글쓰기 · ${board.name}`;
  document.getElementById('boardFormBody').innerHTML = `<form id="boardForm" novalidate>
      ${!post && tpls.length > 1 ? `<div class="form-group"><label class="form-label" for="bfTemplate">양식</label>
        <select id="bfTemplate" class="form-select">${tpls.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>` : ''}
      ${post ? `<div class="board-form-note">${esc(tpl.name)}${tpl.version > 1 ? ' v' + esc(tpl.version) : ''} 양식으로 작성된 글입니다.</div>` : ''}
      <div class="form-group"><label class="form-label" for="bfTitle">제목 <span class="board-req" aria-hidden="true">*</span></label>
        <input id="bfTitle" class="form-input" type="text" required aria-required="true" maxlength="200" value="${esc(post?.title || '')}">
        <div class="board-err" id="bfErrTitle" role="alert"></div></div>
      <div class="form-group"><label class="form-label" for="bfAuthor">작성자 <span class="board-req" aria-hidden="true">*</span></label>
        <select id="bfAuthor" class="form-select" required aria-required="true">${_bdAuthorOptions(post ? post.authorId : _bdLastAuthor())}</select>
        <div class="board-err" id="bfErrAuthor" role="alert"></div></div>
      <div id="bfFields"></div>
    </form>`;
  _bdForm.linked = !post;   // 새 글: 첫 멤버 필드는 작성자를 따라감
  _bdBuildFields(tpl, post?.data);
  document.getElementById('bfAuthor').onchange = () => {
    if (!_bdForm.linked) return;
    const mi = _bdFirstIdx('member'), el = mi >= 0 && document.getElementById(`bfld_${mi}`);
    if (el) el.value = document.getElementById('bfAuthor').value;
  };
  const tplSel = document.getElementById('bfTemplate');
  if (tplSel) tplSel.onchange = () => {
    const cur = _bdReadForm();
    const next = tpls.find(t => t.id === tplSel.value);
    if (next) _bdBuildFields(next, cur.vals);
  };
  document.getElementById('boardForm').onsubmit = e => { e.preventDefault(); _bdSaveForm(); };
  document.getElementById('boardForm').onkeydown = e => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) { e.preventDefault(); _bdSaveForm(); } };
  Modal.open('boardModal');
  Modal.track('boardModal', () => JSON.stringify(_bdReadForm()));
}

async function _bdSaveForm() {
  const cur = _bdReadForm(); if (!cur) return;
  let firstBad = null;
  const fail = (errId, ctlId, msg) => {
    const e = document.getElementById(errId); if (e) e.textContent = msg;
    const c = document.getElementById(ctlId); if (c) c.setAttribute('aria-invalid', 'true');
    if (!firstBad) firstBad = c;
  };
  document.querySelectorAll('#boardForm .board-err').forEach(e => { e.textContent = ''; });
  document.querySelectorAll('#boardForm [aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));

  const title = cur.title.trim();
  if (!title) fail('bfErrTitle', 'bfTitle', '제목을 입력하세요.');
  if (!cur.author) fail('bfErrAuthor', 'bfAuthor', '작성자를 선택하세요.');
  // 폼에 없는 키(이전/다른 버전 양식의 값)는 보존하고, 폼에 있는 키만 폼 값으로 바꾼다
  const data = {};
  if (_bdForm.post) {
    const known = new Set(_bdForm.fields.map(f => f.key));
    Object.entries(_bdForm.post.data || {}).forEach(([k, v]) => { if (!known.has(k)) data[k] = v; });
  }
  _bdForm.fields.forEach((f, i) => {
    const raw = cur.vals[f.key];
    const ctl = f.type === 'project' ? `bfld_${i}_btn` : `bfld_${i}`;
    const err = `bfErr_${i}`;
    if (f.type === 'checkbox') {
      if (f.required && !raw) fail(err, ctl, `${f.label}: 체크해야 합니다.`);
      data[f.key] = !!raw; return;
    }
    const s = String(raw ?? '').trim();
    if (s === '') { if (f.required) fail(err, ctl, `${f.label}: 필수 항목입니다.`); return; }
    if (f.type === 'number') {
      const n = Number(s);
      if (!Number.isFinite(n)) { fail(err, ctl, `${f.label}: 숫자로 입력하세요.`); return; }
      if (n < 0) { fail(err, ctl, `${f.label}: 0 이상으로 입력하세요.`); return; }
      if (Math.abs(n * 2 - Math.round(n * 2)) > 1e-9) { fail(err, ctl, `${f.label}: 0.5 단위로 입력하세요.`); return; }
      data[f.key] = n;
    } else if (f.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s))) { fail(err, ctl, `${f.label}: 날짜 형식이 올바르지 않습니다.`); return; }
      data[f.key] = s;
    } else data[f.key] = f.type === 'longtext' ? String(raw).replace(/\s+$/, '') : s;
  });
  if (firstBad) { firstBad.focus(); showToast('입력값을 확인하세요.'); return; }

  const saveBtn = document.getElementById('boardFormSave'); saveBtn.disabled = true;
  try {
    let newId = null;
    if (_bdForm.post) {
      await BoardAPI.updatePost(_bdForm.post.id, { title, authorId: cur.author, data });
    } else {
      const p = await BoardAPI.addPost({ boardId: _bdForm.board.id, templateId: _bdForm.tpl.id, templateVersion: _bdForm.tpl.version, title, authorId: cur.author, data });
      newId = p?.id || null;
    }
    if (newId) _bdSaveAuthor(cur.author);
    _bdRenderList();
    if (_bd.detailId) _bdRenderDetail();
    Modal.close('boardModal');
    showToast(newId ? '글을 등록했습니다.' : '수정했습니다.');
    if (newId) {
      const btn = [...document.querySelectorAll('.board-title-btn')].find(b => b.dataset.id === newId);
      if (btn) btn.focus({ preventScroll: false });
    }
  } catch (e) {
    showToast('저장하지 못했습니다. 다시 시도하세요.');
  }
  saveBtn.disabled = false;
}

document.getElementById('boardFormClose').onclick = () => Modal.requestClose('boardModal');
document.getElementById('boardFormCancel').onclick = () => Modal.requestClose('boardModal');
document.getElementById('boardFormSave').onclick = () => _bdSaveForm();
