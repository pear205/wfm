// ═══════════════════════════════════════════════════════════
// 운영 도우미 (app.js 다음에 로드)
//  - 삭제 전 영향 안내, 퇴사·입사 월 변경 시 재직 밖 투입 정리
//  - KPI → 점검 목록 (개인 초과 · 팀 초과 월 · 프로젝트 기간 밖 · 곧 끝나는 프로젝트 · 다음 달 여유)
//  - 프로젝트 패널: 연결된 산정 대비 투입 계획
//  - 다른 PC 변경 반영 (탭으로 돌아오면 조용히 다시 읽기)
//  - 내보내기: 투입 CSV, 전체 백업(JSON)
// 계산은 app.js 의 공통 함수(getMemberAnnual, getTotalMM, getDisplayMM, memberActive, yearVisibleMembers)만 쓴다.
// ═══════════════════════════════════════════════════════════

const _opsYmLabel = (y, m) => `${y}.${String(m).padStart(2, '0')}`;
const _opsPjYm = v => _toYM(v);   // 'YYYY-MM' → YYYYMM (없으면 0)
// style 속성에 넣는 색은 #hex 만 허용(esc 는 CSS 구문 ; url( 을 막지 못함)
const _opsColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : 'var(--text-m)';

// ─── 1. 삭제 전 영향 ───
// 게시물에서 이 멤버/프로젝트를 값으로 쓰는 글 수 (게시판을 아직 안 열었으면 null = 모름)
function _opsPostRefs(type, id) {
  if (typeof BLOAD === 'undefined' || BLOAD.status !== 'ok') return null;
  return BOARD.posts.filter(p => (templateOf(p)?.fields || []).some(f => f.type === type && p.data?.[f.key] === id)).length;
}
function deleteImpactText(type, id) {
  const parts = [];
  const asg = DATA.assignments.filter(a => (type === 'member' ? a.memberId : a.projectId) === id).length;
  if (asg) parts.push(`투입 ${asg}건이 함께 삭제됩니다`);
  if (type === 'member') {
    const al = DATA.allowances.filter(a => a.memberId === id).length;
    if (al) parts.push(`현장수당 ${al}건 삭제`);
  } else if (typeof ELOAD !== 'undefined' && ELOAD.status === 'ok') {
    const est = EST.estimates.filter(e => e.projectId === id).length;
    if (est) parts.push(`산정 기록 ${est}건의 프로젝트 연결이 해제됩니다`);
  }
  const posts = _opsPostRefs(type, id);
  if (posts) parts.push(`게시물 ${posts}건은 이름 없이 남습니다`);
  const tip = type === 'member' ? '퇴사자는 삭제 대신 멤버 수정에서 퇴사 월을 지정하세요.' : '끝난 프로젝트는 삭제 대신 상태를 "완료"로 바꾸세요.';
  return (parts.length ? parts.join(' · ') + '. ' : '') + tip;
}
// confirmable 의 첫 클릭(무장)일 때만 안내한다
function opsWarnDelete(btn, type, id) {
  if (btn && btn.dataset.confirming) return;
  if (id) showToast(deleteImpactText(type, id));
}

// ─── 공용 모달 (점검 목록 · 재직 밖 투입) ───
function _opsModal(title, bodyHtml, footHtml) {
  let ov = document.getElementById('opsModal');
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'modal-overlay hidden';
    ov.id = 'opsModal';
    ov.dataset.backdrop = 'close';
    ov.setAttribute('aria-labelledby', 'opsTitle');
    ov.innerHTML = `<div class="modal-card ops-card">
      <div class="modal-header"><span class="modal-title" id="opsTitle"></span>
        <button class="modal-close-btn" id="opsClose" aria-label="닫기">✕</button></div>
      <div class="modal-body" id="opsBody"></div>
      <div class="modal-footer" id="opsFoot"></div>
    </div>`;
    document.body.appendChild(ov);
    document.getElementById('opsClose').onclick = () => Modal.close('opsModal');
  }
  document.getElementById('opsTitle').textContent = title;
  document.getElementById('opsBody').innerHTML = bodyHtml;
  document.getElementById('opsFoot').innerHTML = footHtml || '<div style="flex:1"></div><button class="btn-ghost" data-ops-close>닫기</button>';
  document.getElementById('opsFoot').querySelectorAll('[data-ops-close]').forEach(b => { b.onclick = () => Modal.close('opsModal'); });
  if (!Modal._stack.includes('opsModal')) Modal.open('opsModal');
  return ov;
}

// ─── 2. 입사·퇴사 월 변경 시 재직 밖 투입 ───
function _opsOutOfTenure(mem) {
  return DATA.assignments.filter(a => a.memberId === mem.id && !memberActive(mem, a.year, a.month));
}
// saveMemberForm 이 수정 저장 직후 호출. 재직 기간이 바뀌었고 그 밖에 투입이 남아 있으면 정리 여부를 묻는다
function opsAfterTenureChange(memberId, prevStart, prevEnd) {
  const mem = getMember(memberId);
  if (!mem || (_toYM(mem.start) === _toYM(prevStart) && _toYM(mem.end) === _toYM(prevEnd))) return;
  const out = _opsOutOfTenure(mem);
  if (!out.length) return;
  const byPj = {};
  out.forEach(a => { (byPj[a.projectId] = byPj[a.projectId] || []).push(a); });
  const rows = Object.entries(byPj).map(([pid, as]) => {
    as.sort((x, y) => ymOf(x.year, x.month) - ymOf(y.year, y.month));
    const pj = getProject(pid);
    const mm = as.reduce((s, a) => s + getDisplayMM(a), 0);
    const months = as.map(a => _opsYmLabel(a.year, a.month)).join(', ');
    return `<li class="ops-item"><span class="ops-dot" style="background:${_opsColor(pj?.color)}"></span>
      <span class="ops-main"><b>${esc(pj?.name || '(삭제된 프로젝트)')}</b><span class="ops-sub">${esc(months)}</span></span>
      <span class="ops-num">${fmtMM(mm)} M/M</span></li>`;
  }).join('');
  const range = `${mem.start ? _opsYmLabel(Math.floor(_toYM(mem.start) / 100), _toYM(mem.start) % 100) : '처음'} ~ ${mem.end ? _opsYmLabel(Math.floor(_toYM(mem.end) / 100), _toYM(mem.end) % 100) : '현재'}`;
  _opsModal(`${mem.name} · 재직 기간 밖 투입 ${out.length}건`,
    `<p class="ops-lead">재직 기간(${esc(range)}) 밖에 투입이 남아 있습니다. 재직 밖 투입은 용량 0 으로 계산되어 <b>개인 초과</b>로 집계됩니다.</p>
     <ul class="ops-list">${rows}</ul>`,
    `<div style="flex:1"></div><button class="btn-ghost" data-ops-close>그대로 두기</button>
     <button class="btn-danger" id="opsTenureDel">재직 밖 투입 ${out.length}건 삭제</button>`);
  document.getElementById('opsTenureDel').onclick = function () {
    confirmable(this, () => {
      _opsOutOfTenure(mem).forEach(a => DataAPI.deleteAssignment(a.memberId, a.projectId, a.year, a.month));
      // 재직 밖 달의 현장수당 표시도 의미가 없으므로 함께 해제
      DATA.allowances.filter(a => a.memberId === mem.id && !memberActive(mem, a.year, a.month)).forEach(a => DataAPI.toggleAllowance(a.memberId, a.year, a.month));
      Modal.close('opsModal');
      render();
      _afterMutate();
      showToast(`재직 기간 밖 투입 ${out.length}건을 삭제했습니다.`);
    }, { label: '정말 삭제?', color: '#fff' });
  };
}

// ─── 3. 점검 목록 ───
function _opsCheckData(year) {
  const members = yearVisibleMembers(year);
  const personOver = [];   // {mem, m, total, cap, outside}
  members.forEach(mem => {
    const an = getMemberAnnual(mem, year);
    an.monthlyTotals.forEach((v, i) => {
      const cap = an.active[i] ? 1 : 0;
      if (v > cap + 0.05) personOver.push({ mem, m: i + 1, total: v, cap, outside: !an.active[i] });
    });
  });
  const teamOver = [];
  for (let m = 1; m <= 12; m++) {
    const tot = members.reduce((s, mem) => s + getTotalMM(mem.id, year, m), 0);
    const cap = monthlyMaxCap(year, m, members);
    if (tot > cap + MM_EPS) teamOver.push({ m, tot, cap });
  }
  // 프로젝트 기간 밖 투입 (멤버·프로젝트별로 묶음)
  const ids = new Set(members.map(m => m.id));
  const outPj = {};
  DATA.assignments.forEach(a => {
    if (a.year !== year || !ids.has(a.memberId)) return;
    const pj = getProject(a.projectId);
    if (!pj) return;
    const ym = a.year * 100 + a.month, s = _opsPjYm(pj.start), e = _opsPjYm(pj.end);
    if ((s && ym < s) || (e && ym > e)) {
      const k = a.memberId + '|' + a.projectId;
      (outPj[k] = outPj[k] || { mem: getMember(a.memberId), pj, months: [] }).months.push(a.month);
    }
  });
  // 곧 끝나는 프로젝트: 오늘 기준 이번 달 ~ 2개월 뒤에 종료, 완료 아님
  const nowK = ymOf(CUR_YEAR, CUR_MONTH);
  const ending = DATA.projects.filter(pj => pj.status !== 'done' && pj.end).map(pj => {
    const e = _opsPjYm(pj.end), ey = Math.floor(e / 100), em = e % 100;
    return { pj, ey, em, k: ymOf(ey, em) };
  }).filter(x => x.k >= nowK && x.k <= nowK + 2).sort((a, b) => a.k - b.k).map(x => {
    const people = DATA.assignments.filter(a => a.projectId === x.pj.id && a.year === x.ey && a.month === x.em && ids.has(a.memberId))
      .map(a => ({ mem: getMember(a.memberId), mm: getDisplayMM(a) })).filter(p => p.mem);
    return { ...x, people };
  });
  // 다음 달 여유 (0.5 이상)
  const nx = ymParts(nowK + 1);
  const nextFree = members.filter(mem => memberActive(mem, nx.y, nx.m))
    .map(mem => ({ mem, free: Math.round((1 - getTotalMM(mem.id, nx.y, nx.m)) * 100) / 100 }))
    .filter(x => x.free >= 0.5).sort((a, b) => b.free - a.free);
  return { members, personOver, teamOver, outPj: Object.values(outPj), ending, next: nx, nextFree };
}

function openCheckList() {
  const year = state.year;
  const d = _opsCheckData(year);
  const memLink = (mem, ym) => `<button type="button" class="ops-link" data-ops-member="${esc(mem.id)}"${ym != null ? ` data-ops-ym="${ym}"` : ''}>${esc(mem.name)}</button>`;
  const sec = (title, count, body, note) => `<section class="ops-sec"><h3 class="ops-sec-title">${title}<span class="ops-count${count ? ' is-hot' : ''}">${count}</span></h3>
    ${note ? `<p class="ops-note">${note}</p>` : ''}${count ? `<ul class="ops-list">${body}</ul>` : '<p class="ops-empty">없음</p>'}</section>`;

  const po = d.personOver.map(x => `<li class="ops-item"><span class="ops-main">${memLink(x.mem, ymOf(year, x.m))}<span class="ops-sub">${x.m}월${x.outside ? ' · <span class="ops-tag">재직 밖</span>' : ''}</span></span>
    <span class="ops-num is-over">${fmtMM(x.total)} / ${x.cap.toFixed(1)} (−${fmtMM(Math.round((x.total - x.cap) * 100) / 100)})</span></li>`).join('');
  const to = d.teamOver.map(x => `<li class="ops-item"><span class="ops-main"><b>${x.m}월</b></span><span class="ops-num is-over">${fmtMM(Math.round(x.tot * 100) / 100)} / ${x.cap.toFixed(1)}</span></li>`).join('');
  const op = d.outPj.map(x => `<li class="ops-item"><span class="ops-dot" style="background:${_opsColor(x.pj.color)}"></span><span class="ops-main">${memLink(x.mem, ymOf(year, x.months[0]))}<span class="ops-sub">${esc(x.pj.name)} · ${x.months.sort((a, b) => a - b).join(', ')}월 (기간 ${esc(x.pj.start || '?')} ~ ${esc(x.pj.end || '?')})</span></span></li>`).join('');
  const en = d.ending.map(x => `<li class="ops-item"><span class="ops-dot" style="background:${_opsColor(x.pj.color)}"></span><span class="ops-main"><b>${esc(x.pj.name)}</b><span class="ops-sub">${_opsYmLabel(x.ey, x.em)} 종료 · ${x.people.length ? '종료 후 비는 인원: ' + x.people.map(p => `${esc(p.mem.name)} ${fmtMM(p.mm)}`).join(', ') : '마지막 달 투입 없음'}</span></span></li>`).join('');
  const nf = d.nextFree.map(x => `<li class="ops-item"><span class="ops-main">${memLink(x.mem, ymOf(d.next.y, d.next.m))}<span class="ops-sub">${esc(x.mem.role || '')}</span></span><span class="ops-num is-ok">+${fmtMM(x.free)}</span></li>`).join('');

  const scope = d.members.length !== DATA.members.length ? `필터 적용 ${d.members.length}/${DATA.members.length}명` : `전체 ${DATA.members.length}명`;
  _opsModal(`점검 목록 · ${year}년`,
    `<p class="ops-lead">${scope} 기준. 이름을 누르면 그 달의 투입 팝업이 열립니다.</p>
     ${sec('개인 초과 투입', d.personOver.length, po, '한 달 용량(재직 1.0, 재직 밖 0)을 0.05 넘게 배정된 멤버·월')}
     ${sec('팀 총량 초과 월', d.teamOver.length, to)}
     ${sec('프로젝트 기간 밖 투입', d.outPj.length, op)}
     ${sec('곧 끝나는 프로젝트 (오늘 기준 2개월 안)', d.ending.length, en)}
     ${sec(`${d.next.m}월 여유 인원 (0.5 M/M 이상)`, d.nextFree.length, nf)}`);
  document.getElementById('opsBody').querySelectorAll('[data-ops-member]').forEach(b => {
    b.onclick = () => {
      const mid = b.dataset.opsMember, ym = b.dataset.opsYm != null ? +b.dataset.opsYm : null;
      // 그 달 가장 큰 투입의 프로젝트로 팝업을 연다(없으면 프로젝트 미선택)
      let pid = null;
      if (ym != null) {
        const { y, m } = ymParts(ym);
        const as = getAssignments(mid, y, m).sort((a, c) => getDisplayMM(c) - getDisplayMM(a));
        pid = as[0]?.projectId || null;
      }
      Modal.close('opsModal');
      openMemberAssignForm(pid, mid, ym);
    };
  });
}

// ─── 4. 프로젝트 패널: 연결된 산정 대비 투입 계획 ───
let _opsEstPanelFor = null;
function opsProjectEstimateHtml(pj) {
  if (typeof ELOAD === 'undefined') return '';
  if (ELOAD.status === 'idle' || ELOAD.status === 'loading') {   // 다른 화면이 먼저 로딩 중이어도 같은 promise 에 붙어 끝나면 다시 그린다
    _opsEstPanelFor = pj.id;
    EstimateAPI.load().then(() => {
      const open = document.getElementById('projectPanel')?.classList.contains('open');
      if (open && _opsEstPanelFor === pj.id && ELOAD.status === 'ok') renderProjectPanel(pj.id);
    }).catch(() => {});
  }
  if (ELOAD.status === 'idle' || ELOAD.status === 'loading') return '<div class="ops-est ops-est--muted">연결된 산정 기록 확인 중…</div>';
  if (ELOAD.status !== 'ok') return '';
  const linked = EST.estimates.filter(e => e.projectId === pj.id);
  if (!linked.length) return '';
  const as = DATA.assignments.filter(a => a.projectId === pj.id);
  const plan = Math.round(as.reduce((s, a) => s + (a.mm_plan || 0), 0) * 100) / 100;
  const rows = linked.map(e => {
    const diff = Math.round((plan - (e.totalMm || 0)) * 100) / 100;
    const cls = Math.abs(diff) < 0.05 ? 'is-ok' : diff < 0 ? 'is-warn' : 'is-over';
    const txt = Math.abs(diff) < 0.05 ? '일치' : diff < 0 ? `계획 ${fmtMM(-diff)} 부족` : `계획 ${fmtMM(diff)} 많음`;
    return `<li class="ops-item"><span class="ops-main"><button type="button" class="ops-link" data-ops-est="${esc(e.id)}">${esc(e.title || '(제목 없음)')}</button>
      <span class="ops-sub">v${Number(e.currentVersion) || 0} · ${esc(e.estimatedOn || '')}</span></span>
      <span class="ops-num">${fmtMM(e.totalMm || 0)} M/M</span><span class="ops-num ${cls}">${txt}</span></li>`;
  }).join('');
  return `<div class="ops-est"><div class="pj-team-title">산정 대비 투입 계획</div>
    <ul class="ops-list">${rows}</ul>
    <p class="ops-note">투입 계획 합(전체 기간) <b>${fmtMM(plan)} M/M</b>. 산정 총공수에는 지점 설치·유지보수가 포함되지 않습니다.</p></div>`;
}
document.getElementById('projectPanelContent')?.addEventListener('click', e => {
  const b = e.target.closest('[data-ops-est]');
  if (!b) return;
  const id = b.dataset.opsEst;
  closeBottomPanels();
  switchView('wisenm');
  // 화면 전환이 취소되지 않았으면(미저장 확인 등) 그 기록을 연다
  setTimeout(() => { if (state.viewMode === 'wisenm') wnLeaveGuard(() => _wnSelect(id)); }, 0);   // 공수 산정에 미저장 변경이 있으면 확인 바
});

// ─── 5. 다른 PC 변경 반영 ───
// 탭을 1분 넘게 떠났다가 돌아오면, 저장 중·실패 건·열린 모달/패널/드로어가 없을 때만 조용히 다시 읽는다.
// 읽는 동안 사용자가 편집을 시작했으면(저장 발생) 결과를 버린다.
let _opsHiddenAt = 0;
// 행 순서·sort_order 차이를 변경으로 오인하지 않도록 키로 정렬해 비교한다
const _opsSigOf = d => {
  const strip = o => { const { sort_order, ...r } = o; return r; };
  const sorted = (arr, key) => (arr || []).map(strip).map(o => [key(o), JSON.stringify(o, Object.keys(o).sort())]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1).map(x => x[1]);
  return JSON.stringify([sorted(d.members, o => o.id), sorted(d.projects, o => o.id),
    sorted(d.assignments, o => [o.memberId, o.projectId, o.year, o.month].join('|')), sorted(d.allowances, o => [o.memberId, o.year, o.month].join('|'))]);
};
const _opsSig = () => _opsSigOf(DATA);
function _opsIdle() {
  return LOAD.status === 'ok' && SaveState.pending === 0 && !SaveState.failed.length && !Modal._stack.length
    && !document.getElementById('overlay')?.classList.contains('show')
    && !document.getElementById('mgmtDrawer')?.classList.contains('open');
}
async function opsRefreshData() {
  if (!_opsIdle()) return false;
  const before = _opsSig();
  const { errors, data } = await fetchData();
  if (errors.length || !_opsIdle() || _opsSig() !== before) return false;   // 실패하거나 그사이 편집됨 → 다음 기회에
  if (_opsSigOf(data) === before) return false;                            // 서버와 같으면 다시 그리지 않음
  Object.assign(DATA, data);
  if (state.viewMode === 'year' || state.viewMode === 'bench') render();   // 공수 산정·게시판은 입력 중일 수 있어 다시 그리지 않는다
  showToast('다른 곳에서 바뀐 내용을 불러왔습니다.');
  return true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { _opsHiddenAt = Date.now(); return; }
  const away = _opsHiddenAt ? Date.now() - _opsHiddenAt : 0;
  _opsHiddenAt = 0;
  if (away >= 60000) opsRefreshData();
});

// ─── 6. 내보내기 ───
function _opsDownload(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 투입 CSV: 화면 필터를 따른 멤버 × 기준 연도 12개월, 한 줄 = 한 투입(엑셀 피벗용)
function opsExportCsv() {
  const year = state.year;
  const members = yearVisibleMembers(year);
  const order = new Map(members.map((m, i) => [m.id, i]));
  const rows = DATA.assignments.filter(a => a.year === year && order.has(a.memberId))
    .sort((a, b) => order.get(a.memberId) - order.get(b.memberId) || (getProject(a.projectId)?.name || '').localeCompare(getProject(b.projectId)?.name || '') || a.month - b.month);
  const head = ['멤버', '역할', '프로젝트', '고객사', '연도', '월', '계획 M/M', '실제 M/M', `표시 M/M(${{ plan: '계획', actual: '실제', both: '비교' }[state.assignMode] || ''})`, '유형'];
  const lines = [head].concat(rows.map(a => {
    const m = getMember(a.memberId), p = getProject(a.projectId);
    return [m?.name, m?.role, p?.name || '(삭제된 프로젝트)', p?.client, a.year, a.month, a.mm_plan || 0, a.mm_actual || 0, Math.round(getDisplayMM(a) * 100) / 100, a.type];
  }));
  const csv = '﻿' + lines.map(r => r.map(_bdCsvCell).join(',')).join('\r\n');
  _opsDownload(`WFM_투입_${year}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  showToast(`투입 ${rows.length}건을 CSV 로 내보냈습니다.`);
}
// 전체 백업: 앱이 쓰는 모든 테이블의 원본 행을 JSON 한 파일로(복구용). 허용 목록 테이블은 제외
const OPS_BACKUP_TABLES = ['wfm_members', 'wfm_projects', 'wfm_assignments', 'wfm_allowances',
  'wfm_boards', 'wfm_board_templates', 'wfm_posts', 'wfm_comments',
  'wfm_sales_people', 'wfm_estimates', 'wfm_estimate_versions'];
async function opsBackup(btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await Promise.all(OPS_BACKUP_TABLES.map(t => _sb.from(t).select('*').then(r => r, e => ({ error: e }))));
    const tables = {}, errors = {};
    res.forEach((r, i) => { if (r.error) errors[OPS_BACKUP_TABLES[i]] = r.error.message || String(r.error); else tables[OPS_BACKUP_TABLES[i]] = r.data || []; });
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    const out = { app: 'wfm', exportedAt: d.toISOString(), exportedBy: (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.email) || '', tables, errors };
    _opsDownload(`WFM_backup_${stamp}.json`, new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
    const n = Object.values(tables).reduce((s, r) => s + r.length, 0);
    const fail = Object.keys(errors).length;
    showToast(`백업: ${Object.keys(tables).length}개 표, ${n}행${fail ? ` (읽지 못한 표 ${fail}개)` : ''}. 면담 등 민감한 내용이 들어 있으니 안전하게 보관하세요.`);
  } finally { if (btn) btn.disabled = false; }
}
document.getElementById('exportCsv')?.addEventListener('click', () => { document.getElementById('exportDropdown').classList.add('hidden'); opsExportCsv(); });
document.getElementById('exportBackup')?.addEventListener('click', e => {
  const btn = e.currentTarget;
  if (!btn.dataset.confirming) showToast('전체 백업에는 면담 기록 등 민감한 내용이 들어 있습니다. 받으려면 한 번 더 누르세요.');
  confirmable(btn, () => { document.getElementById('exportDropdown').classList.add('hidden'); opsBackup(btn); }, { label: '한 번 더 눌러 받기', bg: 'var(--warn)', color: '#fff' });
});

// KPI 카드 → 점검 목록 (kpi-wrap 은 다시 그려지므로 위임)
document.getElementById('kpi-wrap')?.addEventListener('click', e => { if (e.target.closest('[data-ops-check]')) openCheckList(); });
document.getElementById('kpi-wrap')?.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-ops-check]')) { e.preventDefault(); openCheckList(); }
});
