// ██████████████████████████████████████████████████████████
// █  BOARD ADMIN  —  관리 드로어의 게시판·템플릿 탭 / 편집 모달   █
// ██████████████████████████████████████████████████████████
// 계약: docs/board-spec.md "화면 — board-admin.js". 데이터는 data.js 의 BOARD/BLOAD/BoardAPI 사용.
// 의존(app.js): esc, showToast, confirmable, Modal, state, render, renderDrawerContent, _initDragReorder

const BADM_TYPES = [
  ['text', '한 줄 텍스트'], ['longtext', '여러 줄 텍스트'], ['number', '숫자'], ['date', '날짜'],
  ['member', '멤버'], ['project', '프로젝트'], ['select', '선택 목록'], ['checkbox', '체크박스'],
];
const BADM_KEY_RE = /^[a-z][a-z0-9_]*$/;
let _badmCtx = null;   // 열려 있는 편집 모달 상태 { kind:'template'|'board', ... }

// ─── 공통 헬퍼 ───
function _badmTemplateIds() {
  const seen = [];
  BOARD.templates.forEach(t => { if (!seen.includes(t.id)) seen.push(t.id); });
  return seen;
}
const _badmPostCountOfTemplate = id => BOARD.posts.filter(p => p.templateId === id).length;
const _badmPostCountOfBoard = id => BOARD.posts.filter(p => p.boardId === id).length;
const _badmSortedBoards = () => [...BOARD.boards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
function _badmRefresh() {
  renderDrawerContent();
  if (state.viewMode === 'board') render();
}
// 드로어를 열 때 한 번 호출: 아직 안 불러왔으면 게시판 데이터를 조회하고 끝나면 드로어를 다시 그린다
// idle 은 물론 missing/error 도 드로어를 열 때마다 다시 시도한다 (loading/ok 는 건너뜀)
function ensureBoardsLoaded() {
  if (typeof BLOAD === 'undefined' || !['idle', 'missing', 'error'].includes(BLOAD.status)) return;
  _badmReload();
}
function _badmReload() {
  if (typeof BLOAD === 'undefined' || BLOAD.status === 'loading') return;
  const p = Promise.resolve(BoardAPI.loadBoards());
  if (document.getElementById('mgmtDrawer')?.classList.contains('open')) renderDrawerContent();   // 'loading' 표시
  p.then(() => {
    if (document.getElementById('mgmtDrawer')?.classList.contains('open')) renderDrawerContent();
    if (state.viewMode === 'board') render();
  });
}

// 드로어 재렌더 전후로 같은 컨트롤(data-id)에 포커스를 되돌린다
const _BADM_FOCUS_ATTRS = ['data-tpl-active', 'data-tpl-edit', 'data-tpl-del', 'data-brd-active', 'data-brd-edit', 'data-brd-del'];
function _badmCaptureFocus(body) {
  const a = document.activeElement;
  if (!a || !body.contains(a)) return null;
  for (const attr of _BADM_FOCUS_ATTRS) if (a.hasAttribute(attr)) return { attr, id: a.getAttribute(attr) };
  return null;
}
function _badmRestoreFocus(body, prev, addId) {
  if (!prev) return;
  const el = [...body.querySelectorAll(`[${prev.attr}]`)].find(x => x.getAttribute(prev.attr) === prev.id);
  (el || document.getElementById(addId))?.focus({ preventScroll: true });
}

// 라벨 → ascii 슬러그. 한글처럼 만들 수 없으면 '' 반환
function _badmSlug(label) {
  const s = String(label).normalize('NFKD').replace(/[^\x00-\x7F]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return /^[a-z]/.test(s) ? s : '';
}
// 같은 템플릿 안에서 겹치지 않는 키 (idx 필드 자신은 제외하고 비교)
function _badmAutoKey(fields, idx) {
  const label = fields[idx].label.trim();
  if (!label) return '';
  const used = new Set(fields.filter((_, i) => i !== idx).map(f => f.key).filter(Boolean));
  const base = _badmSlug(label);
  if (!base) { let n = 1; while (used.has('f' + n)) n++; return 'f' + n; }
  let k = base, n = 2;
  while (used.has(k)) k = base + '_' + n++;
  return k;
}
const _badmParseOptions = s => [...new Set(String(s).split(',').map(x => x.trim()).filter(Boolean))];

// ─── 편집 모달 (JS 로 만든 오버레이: index.html 을 건드리지 않음) ───
function _badmInitModal() {
  if (!document.getElementById('badmTabTemplates')) {
    const tabs = document.querySelector('.drawer-tabs');
    if (tabs) {
      [['boards', '게시판'], ['templates', '템플릿']].forEach(([key, label]) => {
        if (tabs.querySelector(`[data-tab="${key}"]`)) return;
        const b = document.createElement('button');
        b.className = 'dtab'; b.dataset.tab = key; b.textContent = label;
        if (key === 'templates') b.id = 'badmTabTemplates';
        tabs.appendChild(b);
      });
    }
  }
  if (document.getElementById('badmModal')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay hidden';
  ov.id = 'badmModal';
  ov.dataset.backdrop = 'close';
  ov.setAttribute('aria-labelledby', 'badmTitle');   // role=dialog 은 Modal.open 이 이 오버레이에 부여한다
  ov.innerHTML = `<div class="modal-card badm-card">
    <div class="modal-header">
      <span class="modal-title" id="badmTitle"></span>
      <button class="modal-close-btn" id="badmClose" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body" id="badmBody"></div>
    <div class="modal-footer">
      <div style="flex:1"></div>
      <button class="btn-ghost" id="badmCancel">취소</button>
      <button class="btn-primary" id="badmSave">저장</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  Modal.onClose.badmModal = () => { _badmCtx = null; };
  document.getElementById('badmClose').onclick = () => Modal.requestClose('badmModal');
  document.getElementById('badmCancel').onclick = () => Modal.requestClose('badmModal');
  document.getElementById('badmSave').onclick = () => {
    if (_badmCtx?.kind === 'template') _badmSaveTemplate();
    else if (_badmCtx?.kind === 'board') _badmSaveBoard();
  };
}

// ─── 드로어 탭 렌더 (app.js renderDrawerContent 가 호출) ───
function renderBoardAdminDrawer(tab, body) {
  const st = typeof BLOAD === 'undefined' ? 'idle' : BLOAD.status;
  if (st !== 'ok') {
    let msg = '게시판 데이터를 불러오는 중입니다…', retry = '';
    if (st === 'missing') { msg = '게시판 테이블이 없습니다. sql/boards.sql 을 Supabase SQL Editor 에서 실행한 뒤 [다시 불러오기] 를 누르세요.'; retry = '다시 불러오기'; }
    else if (st === 'error') { msg = '게시판 데이터를 불러오지 못했습니다.'; retry = '다시 시도'; }
    body.innerHTML = `<div class="badm-state" role="status">${esc(msg)}${retry ? `<br><button type="button" class="btn-ghost badm-retry">${retry}</button>` : ''}</div>`;
    body.querySelector('.badm-retry')?.addEventListener('click', _badmReload);
    if (st === 'idle') ensureBoardsLoaded();
    return;
  }
  const prev = _badmCaptureFocus(body);
  if (tab === 'templates') { _badmRenderTemplateList(body); _badmRestoreFocus(body, prev, 'badmAddTpl'); }
  else { _badmRenderBoardList(body); _badmRestoreFocus(body, prev, 'badmAddBrd'); }
}

// 삭제 확인 후 (동기/Promise 모두 가능) 삭제: 진행 중에는 버튼을 잠근다
async function _badmRunDelete(b, fn, okMsg, inUseMsg) {
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  let r = 'check-failed';
  try { r = await fn(); } catch (e) { console.error(e); }
  showToast(r === true ? okMsg : r === 'in-use' ? inUseMsg : '서버 확인에 실패했습니다. 잠시 후 다시 시도하세요');
  _badmRefresh();
}

const _badmSwitch =(attr, id, checked, label) => `<label class="badm-switch" title="${checked ? '활성' : '비활성'}">
  <input type="checkbox" role="switch" ${attr}="${esc(id)}" ${checked ? 'checked' : ''} aria-label="${esc(label)} 활성">
  <span class="badm-switch-ui" aria-hidden="true"></span></label>`;

function _badmRenderTemplateList(body) {
  const items = _badmTemplateIds().map(id => {
    const t = latestTemplate(id); if (!t) return '';
    const used = _badmPostCountOfTemplate(id);
    return `<div class="mgmt-item badm-item${t.active ? '' : ' is-off'}">
      <div class="mgmt-item-info">
        <div class="mgmt-item-name">${esc(t.name)} <span class="badm-ver">v${esc(t.version)}</span>${t.active ? '' : ' <span class="badm-off">비활성</span>'}</div>
        <div class="mgmt-item-sub">필드 ${t.fields.length}개 · 사용 글 ${used}개</div>
      </div>
      ${_badmSwitch('data-tpl-active', id, t.active, t.name)}
      <div class="mgmt-actions">
        <button class="btn-icon-sm" data-tpl-edit="${esc(id)}" title="수정" aria-label="${esc(t.name)} 수정">✏</button>
        <button class="btn-icon-sm danger${used ? ' is-disabled' : ''}" data-tpl-del="${esc(id)}" ${used ? 'aria-disabled="true" title="사용 중인 글이 있어 삭제할 수 없습니다"' : 'title="삭제"'} aria-label="${esc(t.name)} 삭제">✕</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<button class="mgmt-add-btn is-top" id="badmAddTpl">+ 템플릿 추가</button>
    <div class="mgmt-list">${items || '<div class="badm-state">템플릿이 없습니다.</div>'}</div>`;
  document.getElementById('badmAddTpl').onclick = () => openTemplateEditor(null);
  body.querySelectorAll('[data-tpl-edit]').forEach(b => b.onclick = () => openTemplateEditor(b.dataset.tplEdit));
  body.querySelectorAll('[data-tpl-active]').forEach(c => c.onchange = () => {
    BoardAPI.setTemplateActive(c.dataset.tplActive, c.checked); _badmRefresh();
  });
  body.querySelectorAll('[data-tpl-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.tplDel;
    if (_badmPostCountOfTemplate(id)) { showToast('사용 중인 글이 있어 삭제할 수 없습니다'); return; }
    const sole = BOARD.boards.find(bd => bd.templateIds.length === 1 && bd.templateIds[0] === id);
    if (sole) { showToast(`'${sole.name}' 게시판의 유일한 템플릿이라 삭제할 수 없습니다. 게시판 설정을 먼저 바꾸세요.`); return; }
    confirmable(b, () => _badmRunDelete(b, () => BoardAPI.deleteTemplate(id), '템플릿을 삭제했습니다.', '사용 중인 글이 있어 템플릿을 삭제할 수 없습니다.'),
      { label: '삭제', color: '#fff' });
  });
}

function _badmRenderBoardList(body) {
  const items = _badmSortedBoards().map(bd => {
    const names = bd.templateIds.map(id => latestTemplate(id)?.name).filter(Boolean).map(esc).join(', ') || '템플릿 없음';
    const posts = _badmPostCountOfBoard(bd.id);
    return `<div class="mgmt-item badm-item${bd.active ? '' : ' is-off'}" draggable="true" data-drag-id="${esc(bd.id)}">
      <span class="drag-handle" title="끌어서 순서 변경" aria-hidden="true">⠿</span>
      <div class="mgmt-item-info">
        <div class="mgmt-item-name">${esc(bd.name)}${bd.active ? '' : ' <span class="badm-off">비활성</span>'}</div>
        <div class="mgmt-item-sub">${names} · 댓글 ${bd.allowComments ? '사용' : '안 함'} · 글 ${posts}개</div>
      </div>
      ${_badmSwitch('data-brd-active', bd.id, bd.active, bd.name)}
      <div class="mgmt-actions">
        <button class="btn-icon-sm" data-brd-edit="${esc(bd.id)}" title="수정" aria-label="${esc(bd.name)} 수정">✏</button>
        <button class="btn-icon-sm danger${posts ? ' is-disabled' : ''}" data-brd-del="${esc(bd.id)}" ${posts ? 'aria-disabled="true" title="글이 있어 삭제할 수 없습니다"' : 'title="삭제"'} aria-label="${esc(bd.name)} 삭제">✕</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<button class="mgmt-add-btn is-top" id="badmAddBrd">+ 게시판 추가</button>
    <div class="mgmt-list" id="badmBoardList">${items || '<div class="badm-state">게시판이 없습니다.</div>'}</div>`;
  document.getElementById('badmAddBrd').onclick = () => openBoardEditor(null);
  _initDragReorder(document.getElementById('badmBoardList'), 'bid', BoardAPI.reorderBoards.bind(BoardAPI));
  body.querySelectorAll('[data-brd-edit]').forEach(b => b.onclick = () => openBoardEditor(b.dataset.brdEdit));
  body.querySelectorAll('[data-brd-active]').forEach(c => c.onchange = () => {
    BoardAPI.updateBoard(c.dataset.brdActive, { active: c.checked }); _badmRefresh();
  });
  body.querySelectorAll('[data-brd-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.brdDel;
    if (_badmPostCountOfBoard(id)) { showToast('사용 중인 글이 있어 삭제할 수 없습니다'); return; }
    confirmable(b, () => _badmRunDelete(b, () => BoardAPI.deleteBoard(id), '게시판을 삭제했습니다.', '글이 있는 게시판은 삭제할 수 없습니다.'),
      { label: '삭제', color: '#fff' });
  });
}

// ─── 템플릿 편집기 ───
function openTemplateEditor(id) {
  const lt = id ? latestTemplate(id) : null;
  if (id && !lt) return;
  const fields = lt ? lt.fields.map(f => ({
    key: f.key, label: f.label || '', type: f.type || 'text', required: !!f.required, list: !!f.list,
    options: (f.options || []).join(', '), unit: f.unit || '', sum: !!f.sum, saved: true, keyTouched: true,
  })) : [];
  _badmCtx = { kind: 'template', id: id || null, name: lt ? lt.name : '', active: lt ? lt.active : true, fields };
  if (!lt) _badmAddField(false);
  const inUse = lt && templateInUse(lt.id, lt.version);
  document.getElementById('badmTitle').textContent = lt ? '템플릿 수정' : '템플릿 추가';
  document.getElementById('badmBody').innerHTML = `
    ${inUse ? `<div class="badm-notice" role="note">이 템플릿의 v${lt.version} 은(는) 이미 글에서 사용 중입니다. 저장하면 <b>새 버전(v${lt.version + 1})</b>으로 저장되며, 기존 글은 v${lt.version} 양식 그대로 유지됩니다.</div>` : ''}
    ${lt && !inUse ? `<div class="badm-notice is-soft" role="note">v${lt.version} 은(는) 아직 사용하는 글이 없어 같은 버전에 덮어씁니다.</div>` : ''}
    <div class="form-group"><label class="form-label" for="badmTplName">템플릿 이름</label>
      <input class="form-input" id="badmTplName" maxlength="40" value="${esc(_badmCtx.name)}" autocomplete="off"></div>
    <label class="badm-check"><input type="checkbox" id="badmTplActive" ${_badmCtx.active ? 'checked' : ''}> 활성 (글쓰기 양식으로 선택 가능)</label>
    <div class="badm-fields-head"><span class="form-label">필드</span>
      <button type="button" class="btn-ghost badm-addfield" id="badmAddField">+ 필드 추가</button></div>
    <div id="badmFields" class="badm-fields"></div>`;
  _badmRenderFields();
  document.getElementById('badmSave').textContent = '저장';
  const getState = () => JSON.stringify({ n: _badmCtx.name, a: _badmCtx.active, f: _badmCtx.fields });
  const ov = document.getElementById('badmModal');
  ov.oninput = ov.onchange = _badmTplInput;
  document.getElementById('badmAddField').onclick = () => { _badmAddField(true); };
  document.getElementById('badmFields').onclick = _badmFieldClick;
  Modal.open('badmModal');
  Modal.track('badmModal', getState);
}

function _badmAddField(focus) {
  const c = _badmCtx;
  c.fields.push({ key: '', label: '', type: 'text', required: false, list: false, options: '', unit: '', sum: false, saved: false, keyTouched: false });
  if (!focus) return;
  _badmRenderFields();
  const last = document.querySelector('#badmFields .badm-field:last-child');
  last?.scrollIntoView({ block: 'nearest' });
  last?.querySelector('[data-f="label"]')?.focus();
}

function _badmRenderFields() {
  const c = _badmCtx, host = document.getElementById('badmFields');
  if (!host) return;
  const n = c.fields.length;
  host.innerHTML = n ? c.fields.map((f, i) => `
    <div class="badm-field" role="group" aria-label="필드 ${i + 1}${f.label ? ': ' + esc(f.label) : ''}" data-idx="${i}" tabindex="-1">
      <div class="badm-field-top">
        <span class="badm-field-no">${i + 1}</span>
        <div class="badm-field-moves">
          <button type="button" class="btn-icon-sm" data-act="up" ${i === 0 ? 'disabled' : ''} title="위로" aria-label="필드 ${i + 1} 위로 이동">▲</button>
          <button type="button" class="btn-icon-sm" data-act="down" ${i === n - 1 ? 'disabled' : ''} title="아래로" aria-label="필드 ${i + 1} 아래로 이동">▼</button>
          <button type="button" class="btn-icon-sm danger" data-act="del" title="필드 삭제" aria-label="필드 ${i + 1} 삭제">✕</button>
        </div>
      </div>
      <div class="badm-field-grid">
        <label class="badm-lbl">표시 이름<input class="form-input" data-f="label" maxlength="40" value="${esc(f.label)}" autocomplete="off"></label>
        <label class="badm-lbl"><span>유형 ${f.saved ? '<span class="badm-lock" title="저장된 필드의 유형을 바꾸면 기존 글의 값이 깨질 수 있어 고정됩니다">고정</span>' : ''}</span>
          <select class="form-select" data-f="type" ${f.saved ? 'disabled aria-disabled="true"' : ''}>${BADM_TYPES.map(([v, l]) => `<option value="${v}"${f.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
          ${f.saved ? '<small class="badm-hint">저장된 필드는 유형을 바꿀 수 없습니다. 필요하면 새 필드를 추가하세요.</small>' : ''}</label>
        <label class="badm-lbl"><span>키 ${f.saved ? '<span class="badm-lock" title="저장된 필드의 키는 바꿀 수 없습니다">고정</span>' : ''}</span>
          <input class="form-input badm-key" data-f="key" maxlength="32" value="${esc(f.key)}" placeholder="자동 생성" ${f.saved ? 'readonly aria-readonly="true"' : ''} autocomplete="off" spellcheck="false"></label>
        ${f.type === 'select' ? `<label class="badm-lbl badm-span">선택지 (쉼표로 구분)<input class="form-input" data-f="options" value="${esc(f.options)}" placeholder="예: 장애, 문의, 변경" autocomplete="off"></label>` : ''}
        ${f.type === 'number' ? `<label class="badm-lbl">단위<input class="form-input" data-f="unit" maxlength="10" value="${esc(f.unit)}" placeholder="예: M/D" autocomplete="off"></label>` : ''}
      </div>
      <div class="badm-field-checks">
        ${f.type !== 'checkbox' ? `<label class="badm-check"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}> 필수</label>` : ''}
        <label class="badm-check"><input type="checkbox" data-f="list" ${f.list ? 'checked' : ''}> 목록에 표시</label>
        ${f.type === 'number' ? `<label class="badm-check"><input type="checkbox" data-f="sum" ${f.sum ? 'checked' : ''}> 합계 집계</label>` : ''}
      </div>
    </div>`).join('') : '<div class="badm-state">필드가 없습니다. [+ 필드 추가] 로 만드세요.</div>';
}

function _badmTplInput(e) {
  const c = _badmCtx; if (c?.kind !== 'template') return;
  const t = e.target;
  if (t.id === 'badmTplName') { c.name = t.value; return; }
  if (t.id === 'badmTplActive') { c.active = t.checked; return; }
  const row = t.closest('.badm-field'); if (!row || !t.dataset.f) return;
  const f = c.fields[+row.dataset.idx]; if (!f) return;
  const k = t.dataset.f;
  if (k === 'required' || k === 'list' || k === 'sum') f[k] = t.checked;
  else if (k === 'key') {
    if (f.saved) return;
    const v = t.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (v !== t.value) t.value = v;
    f.key = v; f.keyTouched = v !== '';
  } else if (k === 'label') {
    f.label = t.value;
    if (!f.saved && !f.keyTouched) {
      f.key = _badmAutoKey(c.fields, +row.dataset.idx);
      row.querySelector('[data-f="key"]').value = f.key;
    }
    row.setAttribute('aria-label', `필드 ${+row.dataset.idx + 1}${f.label ? ': ' + f.label : ''}`);
  } else if (k === 'type') {
    f[k] = t.value;
    if (t.value !== 'number') f.sum = false;
    _badmRenderFields();
    document.querySelector(`#badmFields [data-idx="${row.dataset.idx}"] [data-f="type"]`)?.focus();
  } else f[k] = t.value;   // options, unit
}

function _badmFieldClick(e) {
  const btn = e.target.closest('[data-act]'); if (!btn || btn.disabled) return;
  const c = _badmCtx, i = +btn.closest('.badm-field').dataset.idx, act = btn.dataset.act;
  let at = i;
  if (act === 'up' && i > 0) { [c.fields[i - 1], c.fields[i]] = [c.fields[i], c.fields[i - 1]]; at = i - 1; }
  else if (act === 'down' && i < c.fields.length - 1) { [c.fields[i + 1], c.fields[i]] = [c.fields[i], c.fields[i + 1]]; at = i + 1; }
  else if (act === 'del') { c.fields.splice(i, 1); at = Math.min(i, c.fields.length - 1); }
  else return;
  _badmRenderFields();
  const card = document.querySelector(`#badmFields [data-idx="${at}"]`);
  const again = act !== 'del' && card?.querySelector(`[data-act="${act}"]:not([disabled])`);
  (again || card)?.focus();
}

async function _badmSaveTemplate() {
  const c = _badmCtx;
  const name = c.name.trim();
  if (!name) { showToast('템플릿 이름을 입력하세요.'); document.getElementById('badmTplName').focus(); return; }
  if (!c.fields.length) { showToast('필드를 하나 이상 추가하세요.'); return; }
  const focusField = (i, k) => document.querySelector(`#badmFields [data-idx="${i}"] [data-f="${k}"]`)?.focus();
  // 키가 비어 있는 새 필드는 라벨에서 자동 생성
  c.fields.forEach((f, i) => { if (!f.key && f.label.trim()) f.key = _badmAutoKey(c.fields, i); });
  const seen = new Set();
  for (let i = 0; i < c.fields.length; i++) {
    const f = c.fields[i], no = i + 1;
    if (!f.label.trim()) { showToast(`필드 ${no}: 표시 이름을 입력하세요.`); focusField(i, 'label'); return; }
    if (!BADM_KEY_RE.test(f.key)) { showToast(`필드 ${no}: 키는 영문 소문자로 시작하고 영문 소문자·숫자·밑줄만 쓸 수 있습니다.`); focusField(i, 'key'); return; }
    if (seen.has(f.key)) { showToast(`필드 ${no}: 키 '${f.key}' 가 중복됩니다.`); focusField(i, 'key'); return; }
    seen.add(f.key);
    if (f.type === 'select' && !_badmParseOptions(f.options).length) { showToast(`필드 ${no}: 선택지를 하나 이상 입력하세요.`); focusField(i, 'options'); return; }
  }
  const fields = c.fields.map(f => {
    const o = { key: f.key, label: f.label.trim(), type: f.type };
    if (f.required && f.type !== 'checkbox') o.required = true;
    if (f.list) o.list = true;
    if (f.type === 'select') o.options = _badmParseOptions(f.options);
    if (f.type === 'number') { if (f.unit.trim()) o.unit = f.unit.trim(); if (f.sum) o.sum = true; }
    return o;
  });
  const lt = c.id ? latestTemplate(c.id) : null;
  const btn = document.getElementById('badmSave'), label = btn.textContent;
  btn.disabled = true; btn.textContent = '저장 중…';
  let t;
  try { t = await BoardAPI.saveTemplate({ id: c.id || undefined, name, fields, active: c.active }); }
  catch (e) { console.error(e); t = null; }
  finally { btn.disabled = false; btn.textContent = label; }
  if (!t) { showToast('템플릿을 저장하지 못했습니다.'); return; }   // 실패: 모달을 유지해 입력을 보존
  if (_badmCtx !== c) { _badmRefresh(); return; }   // 대기 중 모달이 닫혔으면 중복 처리하지 않음(목록만 갱신)
  Modal.close('badmModal');
  const versioned = !!(lt && t.version > lt.version);
  showToast(versioned ? `사용 중인 버전이라 새 버전(v${t.version})으로 저장했습니다.` : '템플릿을 저장했습니다.');
  _badmRefresh();
}

// ─── 게시판 편집기 ───
function openBoardEditor(id) {
  const bd = id ? BOARD.boards.find(b => b.id === id) : null;
  if (id && !bd) return;
  const tplIds = _badmTemplateIds();
  _badmCtx = { kind: 'board', id: id || null };
  document.getElementById('badmTitle').textContent = bd ? '게시판 수정' : '게시판 추가';
  const sel = new Set(bd ? bd.templateIds : []);
  document.getElementById('badmBody').innerHTML = `
    <div class="form-group"><label class="form-label" for="badmBrdName">게시판 이름</label>
      <input class="form-input" id="badmBrdName" maxlength="40" value="${esc(bd ? bd.name : '')}" autocomplete="off"></div>
    <fieldset class="badm-fieldset"><legend class="form-label">허용 템플릿 (1개 이상)</legend>
      ${tplIds.length ? tplIds.map(tid => { const t = latestTemplate(tid);
        return `<label class="badm-check"><input type="checkbox" name="badmBrdTpl" value="${esc(tid)}" ${sel.has(tid) ? 'checked' : ''}> ${esc(t.name)}${t.active ? '' : ' <span class="badm-off">비활성</span>'}</label>`; }).join('')
        : '<div class="badm-state">템플릿이 없습니다. 먼저 [템플릿] 탭에서 만드세요.</div>'}
    </fieldset>
    <label class="badm-check"><input type="checkbox" id="badmBrdComments" ${bd ? (bd.allowComments ? 'checked' : '') : 'checked'}> 댓글 사용</label>`;
  document.getElementById('badmSave').textContent = '저장';
  const ov = document.getElementById('badmModal');
  ov.oninput = ov.onchange = null;
  Modal.open('badmModal');
  Modal.track('badmModal', _badmBoardState);
}
function _badmBoardState() {
  return JSON.stringify({
    n: document.getElementById('badmBrdName')?.value ?? '',
    t: [...document.querySelectorAll('input[name="badmBrdTpl"]:checked')].map(x => x.value),
    c: !!document.getElementById('badmBrdComments')?.checked,
  });
}
function _badmSaveBoard() {
  const name = document.getElementById('badmBrdName').value.trim();
  const templateIds = [...document.querySelectorAll('input[name="badmBrdTpl"]:checked')].map(x => x.value);
  const allowComments = document.getElementById('badmBrdComments').checked;
  if (!name) { showToast('게시판 이름을 입력하세요.'); document.getElementById('badmBrdName').focus(); return; }
  if (!templateIds.length) { showToast('허용 템플릿을 하나 이상 선택하세요.'); return; }
  const id = _badmCtx.id;
  if (id) BoardAPI.updateBoard(id, { name, templateIds, allowComments });
  else BoardAPI.addBoard({ name, templateIds, allowComments });
  Modal.close('badmModal');
  showToast('게시판을 저장했습니다.');
  _badmRefresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _badmInitModal);
else _badmInitModal();
