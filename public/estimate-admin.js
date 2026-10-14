// ██████████████████████████████████████████████████████████
// █  ESTIMATE ADMIN  —  관리 드로어의 "영업 담당" 탭 / 편집 모달   █
// ██████████████████████████████████████████████████████████
// 계약: docs/estimate-spec.md "영업 담당 관리". 데이터는 data.js 의 EST/ELOAD/EstimateAPI 사용.
// 의존(app.js): esc, showToast, confirmable, Modal, state, renderDrawerContent
// 스타일은 JS 가 <style id="estAdminStyle"> 로 주입한다 (접두어 .eadm-, CSS 변수만 사용)

let _eadmCtx = null;   // 열려 있는 편집 모달 상태 { id|null, name, role, dept, active }

// ─── 공통 헬퍼 ───
const _eadmReady = () => typeof EST !== 'undefined' && typeof ELOAD !== 'undefined' && typeof EstimateAPI !== 'undefined';
const _eadmDrawerOpen = () => !!document.getElementById('mgmtDrawer')?.classList.contains('open');
const _eadmUsed = id => EST.estimates.filter(e => e.salesId === id).length;
const _eadmSorted = () => [...EST.sales].sort((a, b) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'ko'));
const _eadmRefresh = () => { if (_eadmDrawerOpen() && state.mgmtTab === 'sales') renderDrawerContent(); };

// 드로어를 열 때 호출: idle 이면 조회. 끝나면 드로어를 다시 그린다
function _eadmReload() {
  if (!_eadmReady() || ELOAD.status === 'loading') return;
  const p = Promise.resolve(EstimateAPI.load());
  _eadmRefresh();   // 'loading' 표시
  p.catch(e => console.error(e)).then(_eadmRefresh);
}

// 재렌더 전후로 같은 컨트롤에 포커스를 되돌린다
const _EADM_FOCUS_ATTRS = ['data-sal-active', 'data-sal-edit', 'data-sal-del'];
function _eadmCaptureFocus(body) {
  const a = document.activeElement;
  if (!a || !body.contains(a)) return null;
  for (const attr of _EADM_FOCUS_ATTRS) if (a.hasAttribute(attr)) return { attr, id: a.getAttribute(attr) };
  return null;
}
function _eadmRestoreFocus(body, prev) {
  if (!prev) return;
  const el = [...body.querySelectorAll(`[${prev.attr}]`)].find(x => x.getAttribute(prev.attr) === prev.id);
  (el || document.getElementById('eadmAdd'))?.focus({ preventScroll: true });
}

// ─── 스타일 / 탭 / 모달 초기화 ───
function _eadmInjectStyle() {
  if (document.getElementById('estAdminStyle')) return;
  const st = document.createElement('style');
  st.id = 'estAdminStyle';
  st.textContent = `
.eadm-item .mgmt-item-name{white-space:normal;word-break:break-word}
.eadm-dept,.eadm-role{color:var(--text-m)}
.eadm-form-hint{margin:4px 0 0;font-size:12px;color:var(--text-m);line-height:1.5}
.eadm-form-hint.is-warn{color:var(--text-s)}
.eadm-check input{width:16px;height:16px;accent-color:var(--accent)}
.eadm-check{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:13px;color:var(--text-p);cursor:pointer}
.eadm-card{max-width:420px;width:calc(100% - 32px)}
`;
  document.head.appendChild(st);
}

function _eadmInitModal() {
  _eadmInjectStyle();
  const tabs = document.querySelector('.drawer-tabs');
  if (tabs && !tabs.querySelector('[data-tab="sales"]')) {
    const b = document.createElement('button');
    b.className = 'dtab'; b.dataset.tab = 'sales'; b.textContent = '영업 담당';
    tabs.appendChild(b);
  }
  if (document.getElementById('eadmModal')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay hidden';
  ov.id = 'eadmModal';
  ov.dataset.backdrop = 'close';
  ov.setAttribute('aria-labelledby', 'eadmTitle');
  ov.innerHTML = `<div class="modal-card eadm-card">
    <div class="modal-header">
      <span class="modal-title" id="eadmTitle"></span>
      <button type="button" class="modal-close-btn" id="eadmClose" aria-label="닫기">✕</button>
    </div>
    <div class="modal-body" id="eadmBody"></div>
    <div class="modal-footer">
      <div style="flex:1"></div>
      <button type="button" class="btn-ghost" id="eadmCancel">취소</button>
      <button type="button" class="btn-primary" id="eadmSave">저장</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  Modal.onClose.eadmModal = () => { _eadmCtx = null; };
  document.getElementById('eadmClose').onclick = () => Modal.requestClose('eadmModal');
  document.getElementById('eadmCancel').onclick = () => Modal.requestClose('eadmModal');
  document.getElementById('eadmSave').onclick = _eadmSave;
}

// ─── 드로어 탭 렌더 (app.js renderDrawerContent 가 tab==='sales' 일 때 호출) ───
function renderSalesAdminDrawer(body) {
  if (!_eadmReady()) {
    body.innerHTML = '<div class="badm-state" role="status">공수 산정 데이터 모듈을 불러오지 못했습니다. 페이지를 새로고침하세요.</div>';
    return;
  }
  const st = ELOAD.status;
  if (st !== 'ok') {
    let msg = '영업 담당 데이터를 불러오는 중입니다…', retry = '';
    if (st === 'missing') { msg = '공수 산정 테이블이 없습니다. sql/estimates.sql 을 Supabase SQL Editor 에서 실행한 뒤 [다시 불러오기] 를 누르세요.'; retry = '다시 불러오기'; }
    else if (st === 'error') { msg = '영업 담당 데이터를 불러오지 못했습니다.'; retry = '다시 시도'; }
    body.innerHTML = `<div class="badm-state" role="status">${esc(msg)}${retry ? `<br><button type="button" class="btn-ghost eadm-retry">${retry}</button>` : ''}</div>`;
    body.querySelector('.eadm-retry')?.addEventListener('click', _eadmReload);
    if (st === 'idle') _eadmReload();
    return;
  }
  const prev = _eadmCaptureFocus(body);
  const items = _eadmSorted().map(s => {
    const used = _eadmUsed(s.id);
    const sub = `${s.role ? `<span class="eadm-role">${esc(s.role)}</span> · ` : ''}${s.dept ? `<span class="eadm-dept">${esc(s.dept)}</span>` : '<span class="eadm-dept">소속 없음</span>'} · 사용 기록 ${used}건`;
    return `<div class="mgmt-item badm-item eadm-item${s.active ? '' : ' is-off'}">
      <div class="mgmt-item-info">
        <div class="mgmt-item-name">${esc(s.name)}${s.active ? '' : ' <span class="badm-off">비활성</span>'}</div>
        <div class="mgmt-item-sub">${sub}</div>
      </div>
      <label class="badm-switch" title="${s.active ? '활성' : '비활성'}">
        <input type="checkbox" role="switch" data-sal-active="${esc(s.id)}" ${s.active ? 'checked' : ''} aria-label="${esc(s.name)} 활성">
        <span class="badm-switch-ui" aria-hidden="true"></span></label>
      <div class="mgmt-actions">
        <button type="button" class="btn-icon-sm" data-sal-edit="${esc(s.id)}" title="수정" aria-label="${esc(s.name)} 수정">✏</button>
        <button type="button" class="btn-icon-sm danger${used ? ' is-disabled' : ''}" data-sal-del="${esc(s.id)}" ${used ? 'aria-disabled="true" title="사용 중이라 삭제할 수 없습니다. 비활성으로 바꾸세요"' : 'title="삭제"'} aria-label="${esc(s.name)} 삭제">✕</button>
      </div>
    </div>`;
  }).join('');
  body.innerHTML = `<button type="button" class="mgmt-add-btn is-top" id="eadmAdd">+ 영업 담당 추가</button>
    <div class="mgmt-list">${items || '<div class="badm-state">등록된 영업 담당이 없습니다.</div>'}</div>`;
  document.getElementById('eadmAdd').onclick = () => openSalesEditor(null);
  body.querySelectorAll('[data-sal-edit]').forEach(b => b.onclick = () => openSalesEditor(b.dataset.salEdit));
  body.querySelectorAll('[data-sal-active]').forEach(c => c.onchange = () => {
    EstimateAPI.setSalesActive(c.dataset.salActive, c.checked);
    _eadmRefresh();
  });
  body.querySelectorAll('[data-sal-del]').forEach(b => b.onclick = () => {
    const id = b.dataset.salDel;
    if (_eadmUsed(id)) { showToast('사용 중이라 삭제할 수 없습니다. 비활성으로 바꾸세요'); return; }
    confirmable(b, () => _eadmRunDelete(b, id), { label: '삭제', color: '#fff' });
  });
  _eadmRestoreFocus(body, prev);
  if (document.activeElement === document.body && body.isConnected) document.getElementById('eadmAdd')?.focus({ preventScroll: true });
}

// 삭제: 진행 중에는 버튼을 잠그고 결과별 안내
async function _eadmRunDelete(b, id) {
  b.disabled = true; b.setAttribute('aria-busy', 'true');
  let r = 'check-failed';
  try { r = await EstimateAPI.removeSales(id); } catch (e) { console.error(e); }
  showToast(r === true ? '영업 담당을 삭제했습니다.'
    : r === 'in-use' ? '사용 중이라 삭제할 수 없습니다. 비활성으로 바꾸세요'
    : '서버 확인에 실패했습니다. 잠시 후 다시 시도하세요');
  _eadmRefresh();
}

// ─── 편집 모달 ───
function openSalesEditor(id) {
  if (!_eadmReady()) return;
  const s = id ? EST.sales.find(x => x.id === id) : null;
  if (id && !s) return;
  _eadmCtx = { id: id || null };
  document.getElementById('eadmTitle').textContent = s ? '영업 담당 수정' : '영업 담당 추가';
  document.getElementById('eadmBody').innerHTML = `
    <div class="form-group"><label class="form-label" for="eadmName">이름 <span aria-hidden="true">*</span></label>
      <input class="form-input" id="eadmName" maxlength="40" required aria-required="true" aria-describedby="eadmNameHint" value="${esc(s ? s.name : '')}" autocomplete="off">
      <p class="eadm-form-hint is-warn" id="eadmNameHint" role="status" aria-live="polite"></p></div>
    <div class="form-group"><label class="form-label" for="eadmRole">직급</label>
      <input class="form-input" id="eadmRole" maxlength="40" value="${esc(s ? s.role || '' : '')}" placeholder="예: 부장" autocomplete="off"></div>
    <div class="form-group"><label class="form-label" for="eadmDept">소속</label>
      <input class="form-input" id="eadmDept" maxlength="40" value="${esc(s ? s.dept || '' : '')}" placeholder="예: 영업1팀" autocomplete="off"></div>
    <label class="eadm-check"><input type="checkbox" id="eadmActive" ${s ? (s.active ? 'checked' : '') : 'checked'}> 활성 (산정 기록에서 선택 가능)</label>`;
  document.getElementById('eadmSave').textContent = '저장';
  document.getElementById('eadmSave').disabled = false;
  const ov = document.getElementById('eadmModal');
  ov.oninput = e => { if (e.target.id === 'eadmName') _eadmNameHint(); };
  ov.onkeydown = e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text' && !e.isComposing) { e.preventDefault(); _eadmSave(); }
  };
  Modal.open('eadmModal');
  Modal.track('eadmModal', _eadmState);
  _eadmNameHint();
}
const _eadmState = () => JSON.stringify({
  n: document.getElementById('eadmName')?.value ?? '',
  d: document.getElementById('eadmDept')?.value ?? '',
  a: !!document.getElementById('eadmActive')?.checked,
});
const _eadmNorm = s => String(s).trim().replace(/\s+/g, ' ');
function _eadmDuplicate(name) {
  const key = _eadmNorm(name).toLowerCase();
  return !!key && EST.sales.some(x => x.id !== _eadmCtx?.id && _eadmNorm(x.name).toLowerCase() === key);
}
function _eadmNameHint() {
  const el = document.getElementById('eadmNameHint'); if (!el) return;
  el.textContent = _eadmDuplicate(document.getElementById('eadmName').value)
    ? '같은 이름의 영업 담당이 이미 있습니다. 동명이인이면 소속으로 구분하세요.' : '';
}

async function _eadmSave() {
  const c = _eadmCtx; if (!c) return;
  const nameEl = document.getElementById('eadmName');
  const name = nameEl.value.trim();
  if (!name) { showToast('이름을 입력하세요.'); nameEl.focus(); return; }
  const role = document.getElementById('eadmRole').value.trim();
  const dept = document.getElementById('eadmDept').value.trim();
  const active = document.getElementById('eadmActive').checked;
  const dup = _eadmDuplicate(name);
  const btn = document.getElementById('eadmSave'), label = btn.textContent;
  btn.disabled = true; btn.textContent = '저장 중…';
  try { await EstimateAPI.saveSales({ id: c.id || undefined, name, role, dept, active }); }
  catch (e) { console.error(e); showToast('영업 담당을 저장하지 못했습니다.'); return; }   // 입력을 보존하려고 모달 유지
  finally { btn.disabled = false; btn.textContent = label; }
  if (_eadmCtx !== c) { _eadmRefresh(); return; }                      // 대기 중 모달이 닫혔으면 목록만 갱신
  Modal.close('eadmModal');
  showToast(dup ? '저장했습니다. (같은 이름의 영업 담당이 이미 있습니다)' : '영업 담당을 저장했습니다.');
  _eadmRefresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _eadmInitModal);
else _eadmInitModal();
