// ██████████████████████████████████████████████████████████
// █  COMMON  —  상수·상태·헬퍼·패널·드로어·폼·이벤트            █
// ██████████████████████████████████████████████████████████

// ─── XSS escape helper ───
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════
const MONTH_KR  = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const STATUS_KR = {active:'진행중', done:'완료', planned:'예정'};

const TODAY     = new Date();
const CUR_YEAR  = TODAY.getFullYear();
const CUR_MONTH = TODAY.getMonth() + 1;

const state = {
  year: CUR_YEAR,
  viewMode: 'year',
  theme: 'system',
  mgmtTab: 'members',
  formMode: null,   // {type:'member'|'project', id:null|string}
  assignCtx: null,  // {memberId, year, month}
  memberFilter: '',
  projectFilter: '',
  benchMonth: null,
  benchMemberFilter: '',
  benchShowAvailOnly: false,
  benchSkillFilter: [],   // 선택된 스킬 이름 배열
  _tmpSkills: [],
  assignMode: 'actual',  // 'actual' | 'plan' | 'both'
  showAllowance: false,
};

// ─── Auth (Supabase Auth) ───
async function _checkAuth() {
  const overlay = document.getElementById('authOverlay');
  const { data: { session } } = await _sb.auth.getSession();
  if (session) {
    overlay.classList.add('hidden');
    return;
  }
  return new Promise(resolve => {
    const input = document.getElementById('authInput');
    const btn   = document.getElementById('authBtn');
    const err   = document.getElementById('authError');
    overlay.classList.remove('hidden');
    input.focus();
    async function attempt() {
      btn.disabled = true;
      err.textContent = '';
      const { error } = await _sb.auth.signInWithPassword({
        email: 'pear205@gmail.com',
        password: input.value,
      });
      if (error) {
        err.textContent = '비밀번호가 올바르지 않습니다.';
        input.value = '';
        input.focus();
        btn.disabled = false;
      } else {
        overlay.classList.add('hidden');
        resolve();
      }
    }
    btn.onclick = attempt;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
  });
}

// ─── 스킬 프리셋 (카테고리별 추천 스킬) ───
const PRESET_SKILLS = {
  lang:  ['Java', 'Spring', 'Kotlin', 'Python', 'JavaScript', 'TypeScript', 'React', 'Vue', 'Flutter', 'CSS'],
  cloud: ['AWS', 'GCP', 'Azure', 'Firebase', 'Kubernetes', 'Docker'],
  ai:    ['GPT API', 'LangChain', 'MLflow', 'PyTorch', 'HuggingFace'],
  sol:   ['WiseN TM', 'Zendesk', 'Salesforce'],
  etc:   ['Figma', 'Adobe XD', 'Jira', 'Confluence', 'Git', 'Notion'],
};

// ═══════════════════════════════════════════════════════════
// DATA HELPERS
// ═══════════════════════════════════════════════════════════
const getProject = id => DATA.projects.find(p => p.id === id);
const getMember  = id => DATA.members.find(m => m.id === id);
const initials   = name => name.slice(0,1) + (name.length > 1 ? name.slice(-1) : '');
const fmtMM      = mm => mm%1===0 ? String(Math.round(mm)) : (mm*10%1===0 ? mm.toFixed(1) : mm.toFixed(2));

function getAssignments(memberId, year, month) {
  return DATA.assignments.filter(a =>
    a.memberId === memberId && a.year === year && a.month === month
  );
}
function getDisplayMM(a) {
  const mp = a.mm_plan != null ? a.mm_plan : (a.mm || 0);
  const ma = a.mm_actual || 0;
  if (state.assignMode === 'plan') return mp;
  return ma > 0 ? ma : mp;
}
function _hexRgba(hex, a) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function getTotalMM(memberId, year, month) {
  return getAssignments(memberId, year, month).reduce((s,a) => s + getDisplayMM(a), 0);
}
function mmClass(mm) {
  if (mm <= 0)    return 'empty';
  if (mm <= 1.05) return 'ok';
  if (mm <= 1.5)  return 'warn';
  return 'over';
}
// 해당 월의 실제 재직 인원수 (start/end 기준, null이면 항상 재직)
function monthlyMaxCap(year, month) {
  const ym = year * 100 + month;
  return DATA.members.filter(m => ym >= (m.start || 0) && ym <= (m.end || 999999)).length;
}

function getMemberYearStats(memberId, year) {
  const as = DATA.assignments.filter(a => a.memberId === memberId && a.year === year);
  const totalMM = as.reduce((s,a) => s+getDisplayMM(a), 0);
  const projectIds = [...new Set(as.map(a => a.projectId))];
  const monthlyMM = Array.from({length:12}, (_,i) =>
    DATA.assignments.filter(a => a.memberId===memberId && a.year===year && a.month===i+1)
      .reduce((s,a)=>s+getDisplayMM(a),0)
  );
  return { totalMM, projectCount: projectIds.length, projectIds, monthlyMM };
}

// 확인버튼: 첫 클릭 시 텍스트 변경+3초 타이머, 재클릭 시 콜백 실행
function confirmable(btn, onConfirm, { label='정말 삭제?', bg='#c62828', color='' } = {}) {
  if (btn.dataset.confirming) {
    clearTimeout(btn._confirmTimer);
    delete btn.dataset.confirming;
    btn.textContent = '삭제';
    btn.style.background = '';
    btn.style.color = '';
    onConfirm();
    return;
  }
  btn.dataset.confirming = '1';
  const origText = btn.textContent;
  btn.textContent = label;
  btn.style.background = bg;
  btn.style.color = color;
  btn._confirmTimer = setTimeout(() => {
    delete btn.dataset.confirming;
    btn.textContent = origText;
    btn.style.background = '';
    btn.style.color = '';
  }, 3000);
}

function _afterMutate() {
  if (document.getElementById('mgmtDrawer').classList.contains('open')) renderDrawerContent();
}

// ██████████████████████████████████████████████████████████
// █  YEAR VIEW  —  연도별 뷰 전용                             █
// ██████████████████████████████████████████████████████████

// ═══════════════════════════════════════════════════════════
// RENDER: YEAR VIEW
// ═══════════════════════════════════════════════════════════
function renderYearView() {
  const { year } = state;
  // 팀 합계 행 (thead 첫 번째)
  let sumRow = `<tr class="grid-total-row"><th class="col-member grid-total-row"><div class="grid-total-label"><span>팀</span><span>합계</span></div></th>`;
  const _moArr = [], _capArr = [];
  for (let m=1; m<=12; m++) {
    const mo = DATA.members.reduce((s,mem) => s + getTotalMM(mem.id,year,m), 0);
    const mCap = monthlyMaxCap(year, m);
    _moArr.push(mo);
    _capArr.push(mCap);
    const pct = mCap > 0 ? Math.min(100, (mo/mCap)*100) : 0;
    const col = mo > mCap ? 'var(--over)' : Math.abs(mo - mCap) < 0.05 ? 'var(--ok)' : mo > 0 ? 'var(--warn)' : 'var(--border)';
    sumRow += `<th class="col-month grid-total-cell">${mo > 0
      ? `<div class="grid-total-mm" style="color:${col}">${mo.toFixed(1)}</div><div class="grid-total-bar"><div class="grid-total-bar__fill" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>`
      : ''}</th>`;
  }
  const _teamTotal = _moArr.reduce((s,v)=>s+v,0);
  const _totalCap  = _capArr.reduce((s,v)=>s+v,0);
  const _teamAvail = Math.round((_totalCap-_teamTotal)*10)/10;
  const _teamCol = _teamAvail<0?'var(--over)':_teamAvail===0?'var(--ok)':'var(--warn)';
  const _teamLbl = _teamAvail===0?'FULL':`${_teamAvail>0?'+':''}${_teamAvail.toFixed(1)}`;
  const _teamSpark = _moArr.map((v,i)=>{ const cap=_capArr[i]||1; const pct=Math.min(v/cap,1.5); const h=Math.max(2,Math.round(pct*16)); const c=v===0?'var(--warn)':v>cap?'var(--over)':v>=cap*0.9?'var(--ok)':'var(--accent)'; return `<div class="annual-spark-bar" style="height:${h}px;background:${c}"></div>`; }).join('');
  sumRow += `<th class="col-annual grid-total-cell"><div class="annual-cell"><div class="annual-spark">${_teamSpark}</div><div class="annual-avail-num" style="color:${_teamCol}">${_teamLbl}</div></div></th></tr>`;

  const _utilPct = _totalCap > 0 ? Math.round(_teamTotal/_totalCap*100) : 0;
  const _overMo = _moArr.filter((v,i)=>v>_capArr[i]).length;
  const _teamAvailFmt = _teamAvail===0?'FULL':`${_teamAvail>0?'+':''}${_teamAvail.toFixed(1)}`;
  const _availDispCol = _teamAvail<0?'var(--over)':_teamAvail===0?'var(--ok)':'var(--warn)';
  const _totalCol = _teamAvail<0?'var(--over)':_teamAvail===0?'var(--ok)':'var(--warn)';

  document.getElementById('kpi-wrap').innerHTML = `<div class="kpi-panel"><div class="kpi-cards">
    <div class="kpi-card"><div class="kpi-card__label">연간 팀 M/M</div><div class="kpi-card__value" style="color:${_totalCol}">${_teamTotal.toFixed(1)}</div></div>
    <div class="kpi-card"><div class="kpi-card__label">평균 가동률</div><div class="kpi-card__value">${_utilPct}%</div></div>
    <div class="kpi-card"><div class="kpi-card__label">초과 투입 월</div><div class="kpi-card__value" style="color:${_overMo>0?'var(--over)':'var(--text-s)'}">${_overMo}</div></div>
    <div class="kpi-card"><div class="kpi-card__label">연간 여유 M/M</div><div class="kpi-card__value" style="color:${_availDispCol}">${_teamAvailFmt}</div></div>
  </div></div>`;

  let html = `<table class="year-table"><thead>${sumRow}<tr>
    <th class="col-member th-corner">멤버</th>`;

  for (let m=1; m<=12; m++) {
    const isCur = year===CUR_YEAR && m===CUR_MONTH;
    html += `<th class="col-month th-month ${isCur?'is-current':''} ${isCur?'today-col':''}" data-month="${m}">
      <span class="mo-label">${MONTH_KR[m-1]}</span>
      <span class="mo-sub">${year}.${String(m).padStart(2,'0')}</span>
    </th>`;
  }
  html += `<th class="col-annual th-corner" style="font-size:10px;text-align:center;padding:6px 4px;line-height:1.3">연간<br>가용</th>`;
  html += `</tr></thead><tbody>`;

  const visibleMembers = DATA.members.filter(mem => {
    if (state.projectFilter) {
      const hasProj = DATA.assignments.some(a => a.memberId === mem.id && a.projectId === state.projectFilter && a.year === year);
      if (!hasProj) return false;
    }
    if (!state.memberFilter) return true;
    const q = state.memberFilter;
    if (mem.name.toLowerCase().includes(q)) return true;
    const memberProjects = DATA.assignments
      .filter(a => a.memberId === mem.id && a.year === year)
      .map(a => getProject(a.projectId))
      .filter(Boolean);
    return memberProjects.some(pj => pj.name.toLowerCase().includes(q) || (pj.client||'').toLowerCase().includes(q));
  });

  if (visibleMembers.length === 0) {
    html += `<tr><td colspan="13" style="padding:40px;text-align:center;color:var(--text-m);font-size:13px">검색 결과가 없습니다.</td></tr>`;
  }

  visibleMembers.forEach(mem => {
    html += `<tr><td class="col-member">
      <div class="member-cell" data-member="${mem.id}">
        <div class="member-avatar" style="background:${mem.color}">${esc(initials(mem.name))}</div>
        <div class="member-info">
          <div class="member-name">${esc(mem.name)}</div>
          <div class="member-role">${esc(mem.role)}</div>
        </div>
        <button class="bulk-open-btn" data-bulk="${mem.id}" title="일괄 공수 입력">+ 일괄</button>
      </div></td>`;

    // Greedy lane assignment: 겹치는 프로젝트만 다른 lane, 순차적인건 같은 lane
    const { projLane, numLanes } = (() => {
      const spans = {};
      for (let m2=1; m2<=12; m2++) getAssignments(mem.id,year,m2).forEach(a=>{ if(!spans[a.projectId]) spans[a.projectId]=new Set(); spans[a.projectId].add(m2); });
      const pids = Object.keys(spans).sort((a,b)=>Math.min(...spans[a])-Math.min(...spans[b]));
      const laneMs = []; const pLane = {};
      pids.forEach(pid=>{ let li=0; while(li<laneMs.length && [...spans[pid]].some(m=>laneMs[li].has(m))) li++; if(li===laneMs.length) laneMs.push(new Set()); spans[pid].forEach(m=>laneMs[li].add(m)); pLane[pid]=li; });
      return { projLane:pLane, numLanes:laneMs.length };
    })();

    const seenProjects = new Set();
    for (let m=1; m<=12; m++) {
      const isCur = year===CUR_YEAR && m===CUR_MONTH;
      const as = getAssignments(mem.id, year, m);
      const sortedAs = [...as].sort((a,b)=>(projLane[a.projectId]??99)-(projLane[b.projectId]??99));
      const total = sortedAs.reduce((s,a)=>s+a.mm,0);
        const cellCls = total>1.05?'is-over':total<0.98&&total>0?'is-warn':'';
      const nextIds = m<12 ? new Set(getAssignments(mem.id,year,m+1).map(a=>a.projectId)) : new Set();
      const prevIds = m>1  ? new Set(getAssignments(mem.id,year,m-1).map(a=>a.projectId)) : new Set();
      const tCol = total>1.05?'#E85C4A':total>=1.0?'#4DB36A':total>0?'var(--accent)':'';
      const utilAttr = total>1.05?'over':total<0.98&&total>0?'under':total>=0.98?'ok':'empty';
      html += `<td class="assign-cell ${cellCls} ${isCur?'today-col':''}" data-member="${mem.id}" data-month="${m}" data-util="${utilAttr}">`;
      html += `<div class="assign-bars">`;
      { const tRL=m===1?4:0, tRR=m===12?4:0;
        const tBg = total>1.05 ? 'rgba(198,40,40,.75)' : total===0 ? 'rgba(100,116,139,.13)' : 'rgba(100,116,139,.55)';
        const tColor = total===0 ? 'rgba(100,116,139,.5)' : 'rgba(255,255,255,.9)';
        html += `<div class="cell-total-bar" style="border-radius:${tRL}px ${tRR}px ${tRR}px ${tRL}px;background:${tBg};color:${tColor}">${fmtMM(total)}</div>`; }
      for (let li=0; li<numLanes; li++) {
        const a = sortedAs.find(a2=>projLane[a2.projectId]===li);
        if (!a) {
          html += `<div class="proj-bar" style="visibility:hidden;background:transparent;border:none;pointer-events:none"></div>`;
          continue;
        }
        const pj = getProject(a.projectId);
        if (!pj) continue;
        const isFirst = !seenProjects.has(pj.id);
        if (isFirst) seenProjects.add(pj.id);
        const cL = prevIds.has(a.projectId);
        const cR = nextIds.has(a.projectId);
        const rl = cL?0:4, rr = cR?0:4;
        const assignKey = JSON.stringify({mid:mem.id,pid:pj.id,y:year,mo:m});
        // 모드별 바 스타일
        const _mp = a.mm_plan != null ? a.mm_plan : (a.mm || 0);
        const _ma = a.mm_actual || 0;
        const _titleMM = state.assignMode==='both'
          ? `계획 ${_mp.toFixed(2)} / 실제 ${_ma.toFixed(2)} M/M`
          : `${(state.assignMode==='plan'?_mp:(_ma||_mp)).toFixed(2)} M/M`;
        const _barAttrs = `data-project="${pj.id}" data-assign='${assignKey}' title="${esc(pj.name)} · ${_titleMM} · ${a.type} — 클릭하여 공수 수정" data-member="${mem.id}"`;
        const _biju = a.type==='비상주'?'biju':'';

        if (state.assignMode === 'both') {
          // 비교 모드: 단일 바, 배경=계획(연한), fill=실제(진한)
          const actOver = _ma > _mp + 0.05;
          const actUnder = _ma > 0 && _ma < _mp - 0.05;
          const actFillColor = actOver ? _hexRgba('#c62828', 0.92) : _hexRgba(pj.color, 0.95);
          const planBg = _hexRgba(pj.color, 0.9);
          const fillPct = _mp > 0 ? Math.min(100, (_ma / _mp) * 100) : (_ma > 0 ? 100 : 0);
          const actBgFull = actOver ? _hexRgba('#c62828', 0.65) : _hexRgba(pj.color, 0.45);
          html += `<div class="proj-bar proj-bar-both ${_biju}"
            style="border-radius:${rl}px ${rr}px ${rr}px ${rl}px"
            ${_barAttrs}>
            <div class="pb-plan-strip" style="background:${planBg};border-radius:${rl}px ${rr}px 0 0">
              ${isFirst ? `<span class="proj-bar-name" style="font-size:9px">${esc(pj.name)}</span>` : '<span></span>'}
              <span class="pb-strip-val">${fmtMM(_mp)}</span>
            </div>
            <div class="pb-act-strip" style="background:${actBgFull};border-radius:0 0 ${rr}px ${rl}px">
              ${isFirst ? '<span></span>' : ''}
              <span class="pb-strip-val">${_ma > 0 ? fmtMM(_ma) : '—'}</span>
            </div>
            <span class="proj-bar-del" data-del-assign='${assignKey}' title="공수 삭제" style="position:absolute;right:4px;top:50%;transform:translateY(-50%)">✕</span>
          </div>`;
        } else {
          let _barBg, _mmDisp;
          if (state.assignMode === 'plan') {
            _barBg = _hexRgba(pj.color, 0.82); _mmDisp = fmtMM(_mp);
          } else {
            _barBg = _hexRgba(pj.color, _ma > 0 ? 1 : 0.35); _mmDisp = fmtMM(_ma > 0 ? _ma : _mp);
          }
          html += `<div class="proj-bar ${_biju}"
            style="background:${_barBg};color:#fff;border-radius:${rl}px ${rr}px ${rr}px ${rl}px"
            ${_barAttrs}>
            ${isFirst ? `<span class="proj-bar-name">${esc(pj.name)}</span>` : ''}
            <span class="proj-bar-mm" style="font-size:10px${!isFirst?';flex:1;text-align:center':''}">${_mmDisp}</span>
            <span class="proj-bar-del" data-del-assign='${assignKey}' title="공수 삭제">✕</span>
          </div>`;
        }
      }
      html += `</div></td>`;
    }
    // 연간 가용 컬럼
    const monthlyTotals = Array.from({length:12},(_,i)=>
      Math.round(getTotalMM(mem.id,year,i+1)*100)/100
    );
    const annualAvail = Math.round((monthlyTotals.reduce((s,v)=>s+v,0) - 12)*10)/10;
    const spark = monthlyTotals.map(v=>{
      const pct = Math.min(v/1.0, 1.5);
      const h = Math.max(2, Math.round(pct*16));
      const col = v===0?'#F5A623': v>1.0?'#E85C4A': v>=1.0?'#4DB36A':'var(--accent)';
      return `<div class="annual-spark-bar" style="height:${h}px;background:${col}"></div>`;
    }).join('');
    const numCol = annualAvail>0?'#c62828':annualAvail<0?'var(--text-p)':'#2e7d32';
    const numLabel = annualAvail===0 ? 'FULL' : `${annualAvail>0?'+':''}${annualAvail.toFixed(1)}`;
    const overM = monthlyTotals.filter(v=>v>1.05).length;
    const underM = monthlyTotals.filter(v=>v>0&&v<0.98).length;
    const okM = monthlyTotals.filter(v=>v>=0.98&&v<=1.05).length;
    const totalMM = Math.round(monthlyTotals.reduce((s,v)=>s+v,0)*10)/10;
    html += `<td class="col-annual"><div class="annual-cell" data-spark-name="${mem.name}" data-spark-avail="${numLabel}" data-spark-over="${overM}" data-spark-under="${underM}" data-spark-ok="${okM}" data-spark-total="${totalMM}">
      <div class="annual-spark">${spark}</div>
      <div class="annual-avail-num" style="color:${numCol}">${numLabel}</div>
    </div></td>`;
    html += `</tr>`;
    // 현장수당 서브 행
    if (state.showAllowance) {
      html += `<tr class="allow-row">`;
      html += `<td class="col-member allow-label-cell">₩ 현장수당</td>`;
      for (let m=1; m<=12; m++) {
        const isCur = year===CUR_YEAR && m===CUR_MONTH;
        const hasAl = DataAPI.hasAllowance(mem.id, year, m);
        html += `<td class="col-month allow-cell ${hasAl?'allow-on':''} ${isCur?'today-col':''}" data-allow-member="${mem.id}" data-allow-month="${m}">${hasAl?'<span class="allow-dot"></span>':''}</td>`;
      }
      html += `<td class="col-annual"></td></tr>`;
    }
  });

  html += `</tbody></table>`;
  document.getElementById('grid-container').innerHTML = html;
}



// WISENM VIEW → wisenm.js

// ██████████████████████████████████████████████████████████
// █  BENCH VIEW  —  가용인력 뷰 전용                           █
// ██████████████████████████████████████████████████████████

// ═══════════════════════════════════════════════════════════
// RENDER: BENCH VIEW
// ═══════════════════════════════════════════════════════════
function renderBenchView() {
  const year = state.year;
  const CUR_Y = new Date().getFullYear();
  const CUR_M = new Date().getMonth() + 1;
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const maxMM = DATA.members.length;
  const selMo = state.benchMonth || (year === CUR_Y ? CUR_M : 1);

  // 멤버별 월별 투입 집계
  const memberRows = DATA.members.map(mem => {
    const monthly = months.map(mo => {
      const total = Math.round(getTotalMM(mem.id, year, mo)*100)/100;
      return { total, avail: Math.max(0, Math.round((1-total)*100)/100) };
    });
    return { mem, monthly };
  });

  // 팀 월별 가용 공수 합계 (1 - 투입, 하한 0, 초과는 음수로 포함)
  const teamMonthly = months.map((mo, idx) =>
    Math.round(memberRows.reduce((s, {monthly}) => {
      const d = monthly[idx];
      return s + (d.total > 1.05 ? -(Math.round((d.total-1)*100)/100) : d.avail);
    }, 0)*10)/10
  );

  // 선택 월 통계
  const selIdx = selMo - 1;
  const selData = memberRows.map(r => ({mem:r.mem, ...r.monthly[selIdx]}))
    .sort((a,b) => b.avail - a.avail);
  const sumTotal = teamMonthly[selIdx];
  const availCount = selData.filter(d=>d.avail>0).length;
  const fullCount = selData.filter(d=>d.total>=0.98&&d.total<=1.05).length;
  const overCount = selData.filter(d=>d.total>1.05).length;

  // bench thead grid-total-row용 스케일
  const _benchAbsMax = Math.max(1, Math.max(...teamMonthly.map(v=>Math.abs(v))));

  // 필터 적용
  const _bMF = (state.benchMemberFilter||'').toLowerCase();
  const filteredMemberRows = memberRows.filter(({mem, monthly}) => {
    if (_bMF && !mem.name.toLowerCase().includes(_bMF)) return false;
    if (state.benchShowAvailOnly && !monthly.some(d=>d.avail>0.05)) return false;
    if (state.benchSkillFilter.length > 0) {
      const has = mem.skills?.some(s => state.benchSkillFilter.includes(s.name));
      if (!has) return false;
    }
    return true;
  });

  // 상단 요약 + 가용인력 패널 → 스크롤 밖 kpi-wrap으로
  const availItems = selData.filter(d=>d.avail>0);
  document.getElementById('kpi-wrap').innerHTML = `<div class="kpi-panel">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:stretch">
      <div class="kpi-cards">
        <div class="kpi-card"><div class="kpi-card__label">${selMo}월 팀 M/M</div><div class="kpi-card__value">${fmtMM(sumTotal)}</div></div>
        <div class="kpi-card"><div class="kpi-card__label">가용 인력</div><div class="kpi-card__value" style="color:var(--ok)">${availCount}</div></div>
        <div class="kpi-card"><div class="kpi-card__label">풀 투입</div><div class="kpi-card__value">${fullCount}</div></div>
        <div class="kpi-card"><div class="kpi-card__label">초과 투입</div><div class="kpi-card__value" style="color:var(--over)">${overCount}</div></div>
      </div>
      <div class="bench-avail-panel">
        <div class="bench-avail-title">${selMo}월 가용 인력 <span style="font-weight:400;font-size:10px;text-transform:none;letter-spacing:0">— 여유 큰 순</span></div>
        <div class="bench-avail-list">
          ${availItems.length ? availItems.map(d => {
            const pct = Math.min(100, d.avail*100);
            return `<div class="bench-avail-item">
              <div class="member-avatar" style="background:${d.mem.color};width:22px;height:22px;min-width:22px;font-size:8px;border-radius:6px">${esc(initials(d.mem.name))}</div>
              <div class="bench-avail-name">${esc(d.mem.name)}</div>
              <div class="bench-avail-bar-wrap"><div class="bench-avail-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
              <div class="bench-avail-mm">+${fmtMM(d.avail)}</div>
            </div>`;
          }).join('') : `<div style="color:var(--text-m);font-size:12px">이 달에 가용 인력이 없습니다.</div>`}
        </div>
      </div>
    </div>
  </div>`;

  let html = `<div class="bench-outer">`;

  // 테이블 — thead에 grid-total-row(팀 가용) 먼저, 그 다음 멤버 헤더
  const benchSumRow = `<tr class="grid-total-row"><th class="col-member grid-total-row"><div class="grid-total-label"><span>가용 인력</span><span>공수</span></div></th>${
    teamMonthly.map((avail, i) => {
      const mo = months[i];
      const isToday = year===CUR_Y && mo===CUR_M;
      const isSel = mo===selMo;
      const isNeg = avail < -0.05;
      const isEmpty = Math.abs(avail) < 0.05;
      const fillPct = Math.min(100, Math.abs(avail) / _benchAbsMax * 100);
      const col = isNeg ? 'var(--over)' : isEmpty ? 'var(--border)' : avail < maxMM*0.5 ? 'var(--warn)' : 'var(--ok)';
      const label = isNeg ? `−${fmtMM(-avail)}` : isEmpty ? '' : `+${fmtMM(avail)}`;
      return `<th class="col-month grid-total-cell${isToday?' today-col':''}${isSel?' bench-sel-col':''}" data-bench-mo="${mo}">${
        isEmpty ? '' : `<div class="grid-total-mm" style="color:${col}">${label}</div><div class="grid-total-bar"><div class="grid-total-bar__fill" style="width:${fillPct}%;background:${col}"></div></div>`
      }</th>`;
    }).join('')
  }</tr>`;

  html += `<div class="bench-wrap"><table class="year-table"><thead>${benchSumRow}<tr>
    <th class="col-member th-corner">멤버</th>
    ${months.map(mo => {
      const isToday = year===CUR_Y && mo===CUR_M;
      const isSel = mo===selMo;
      return `<th class="col-month th-month${isToday?' today-col is-current':''}${isSel?' bench-sel-col':''}" style="${isSel?'color:var(--accent)':''}" data-bench-mo="${mo}"><span class="mo-label">${mo}월</span><span class="mo-sub">${year}.${String(mo).padStart(2,'0')}</span></th>`;
    }).join('')}
  </tr></thead><tbody>`;

  if (filteredMemberRows.length === 0) {
    html += `<tr><td colspan="13" style="padding:40px;text-align:center;color:var(--text-m);font-size:13px">검색 결과가 없습니다.</td></tr>`;
  }
  filteredMemberRows.forEach(({mem, monthly}) => {
    html += `<tr><td class="col-member"><div class="member-cell" data-member="${mem.id}">
      <div class="member-avatar" style="background:${mem.color}">${esc(initials(mem.name))}</div>
      <div class="member-info"><div class="member-name">${esc(mem.name)}</div><div class="member-role">${esc(mem.role)}</div></div>
    </div></td>`;
    monthly.forEach((d,i) => {
      const mo = months[i];
      const isToday = year===CUR_Y && mo===CUR_M;
      const isSel = mo===selMo;
      const isOver = d.total > 1.05;
      const hasAvail = d.avail > 0;
      const inner = isOver
        ? `<div class="bench-bar-track" style="width:60%;margin:0 auto"><div class="bench-bar-fill" style="width:100%;background:#E85C4A"></div></div><div class="bench-bar-label" style="color:#c62828">−${fmtMM(Math.round((d.total-1)*100)/100)}</div>`
        : hasAvail
          ? `<div class="bench-bar-track" style="width:60%;margin:0 auto"><div class="bench-bar-fill" style="width:${Math.min(100,d.avail*100)}%;background:var(--accent)"></div></div><div class="bench-bar-label" style="color:var(--accent)">+${fmtMM(d.avail)}</div>`
          : '';
      html += `<td class="bench-td${isToday?' today-col':''}${isSel?' bench-sel-col':''}" data-bench-mo="${mo}" style="text-align:center;vertical-align:middle" title="${mo}월 투입 ${fmtMM(d.total)} M/M · 가용 ${fmtMM(d.avail)} M/M">${inner}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table></div>`;

  html += `</div>`;

  document.getElementById('grid-container').innerHTML = html;

}


// ██████████████████████████████████████████████████████████
// █  COMMON (계속)  —  패널·드로어·폼·이벤트·초기화             █
// ██████████████████████████████████████████████████████████

// ═══════════════════════════════════════════════════════════
// RENDER: BOTTOM PANELS
// ═══════════════════════════════════════════════════════════
function renderProjectPanel(projectId) {
  const pj = getProject(projectId);
  if (!pj) return;

  const allAs = DATA.assignments.filter(a => a.projectId === projectId);
  const byMember = {};
  allAs.forEach(a => {
    if (!byMember[a.memberId]) byMember[a.memberId] = 0;
    byMember[a.memberId] += a.mm;
  });
  const yearAs = allAs.filter(a => a.year === state.year);
  const yearMM = yearAs.reduce((s,a)=>s+a.mm,0);

  let chips = '';
  const yearMembers = [...new Set(yearAs.map(a=>a.memberId))];
  yearMembers.forEach(mid => {
    const mem = getMember(mid);
    if (!mem) return;
    const mm = yearAs.filter(a=>a.memberId===mid).reduce((s,a)=>s+a.mm,0);
    chips += `<div class="pj-chip" style="cursor:pointer" data-edit-assign="${mid}" data-assign-project="${projectId}" title="공수 수정">
      <div class="chip-av" style="background:${mem.color}">${esc(initials(mem.name))}</div>
      <span>${esc(mem.name)}</span>
      <span class="chip-mm">${mm.toFixed(1)}M</span>
      <span style="font-size:10px;opacity:.5;margin-left:1px">✏</span>
    </div>`;
  });

  document.getElementById('projectPanelContent').innerHTML = `
    <div class="pj-header">
      <div class="pj-dot" style="background:${pj.color}"></div>
      <div style="flex:1">
        <div class="pj-name">${esc(pj.name)}</div>
        <div class="pj-client">${esc(pj.client)}</div>
      </div>
      <span class="pj-status ${pj.status}">${STATUS_KR[pj.status]||esc(pj.status)}</span>
      <button class="panel-edit-btn" data-edit-project="${pj.id}">✏ 수정</button>
      <button class="panel-assign-btn" data-assign-project="${pj.id}">+ 멤버 투입</button>
    </div>
    <div class="pj-meta">
      <div class="pj-meta-item"><span class="pj-meta-label">기간</span><span class="pj-meta-value">${esc(pj.start)} ~ ${esc(pj.end)}</span></div>
      <div class="pj-meta-item"><span class="pj-meta-label">${state.year}년 M/M</span><span class="pj-meta-value" style="font-family:'JetBrains Mono',monospace">${yearMM.toFixed(1)} M/M</span></div>
    </div>
    <div style="font-size:13px;color:var(--text-s);line-height:1.6;margin-bottom:14px">${esc(pj.desc||'')}</div>
    ${chips ? `<div class="pj-team-title">투입 인원 (${state.year}년)</div><div class="pj-team-list">${chips}</div>` : ''}`;

  openBottomPanel('project');
}

function renderMemberPanel(memberId) {
  const mem = getMember(memberId);
  if (!mem) return;
  const stats = getMemberYearStats(memberId, state.year);
  const activeMo = stats.monthlyMM.filter(m=>m>0).length;
  const avg = activeMo > 0 ? stats.totalMM / activeMo : 0;

  let monthCells = '';
  stats.monthlyMM.forEach((mm, i) => {
    const cls = mm>0 ? mmClass(mm) : 'empty';
    monthCells += `<div class="mp-month-cell"><div class="mc-label">${MONTH_KR[i]}</div><div class="mc-mm ${cls}">${mm>0?mm.toFixed(1):'—'}</div></div>`;
  });

  let projList = '';
  stats.projectIds.forEach(pid => {
    const pj = getProject(pid);
    if (!pj) return;
    const mm = DATA.assignments.filter(a=>a.memberId===memberId&&a.projectId===pid&&a.year===state.year).reduce((s,a)=>s+a.mm,0);
    projList += `<div class="proj-row-sm" data-project="${pid}">
      <div class="mmc-proj-dot" style="width:8px;height:8px;border-radius:50%;background:${pj.color}"></div>
      <span style="font-size:13px;font-weight:500;flex:1">${esc(pj.name)}</span>
      <span style="font-size:11px;color:var(--text-m)">${esc(pj.client)}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600">${mm.toFixed(1)}M</span>
    </div>`;
  });

  document.getElementById('memberPanelContent').innerHTML = `
    <div class="mp-header">
      <div class="mp-avatar-lg" style="background:${mem.color}">${esc(initials(mem.name))}</div>
      <div style="flex:1"><div class="mp-name">${esc(mem.name)}</div><div class="mp-role">${esc(mem.role)}</div></div>
      <button class="panel-edit-btn" data-edit-member="${mem.id}">✏ 수정</button>
    </div>
    <div class="mp-stats">
      <div class="stat-card"><div class="stat-label">${state.year}년 총 M/M</div>
        <div class="stat-value" style="color:${stats.totalMM>12.5?'var(--over)':stats.totalMM>10?'var(--warn)':'var(--ok)'}">${stats.totalMM.toFixed(1)}</div></div>
      <div class="stat-card"><div class="stat-label">참여 프로젝트</div>
        <div class="stat-value">${stats.projectCount}<span style="font-size:13px;color:var(--text-m)"> 개</span></div></div>
      <div class="stat-card"><div class="stat-label">월평균 M/M</div>
        <div class="stat-value" style="font-size:18px">${avg.toFixed(1)}</div></div>
    </div>
    <div class="pj-team-title" style="margin-bottom:8px">월별 공수</div>
    <div class="mp-month-grid" style="margin-bottom:14px">${monthCells}</div>
    ${projList ? `<div class="pj-team-title" style="margin-bottom:8px">참여 프로젝트</div>
    <div style="background:var(--bg-app);border-radius:8px;border:1px solid var(--border)">${projList}</div>` : ''}
    ${(() => {
      const skills = mem.skills || [];
      if (skills.length === 0) return '';
      const cats = [
        {key:'lang',  label:'언어 / 프레임워크'},
        {key:'cloud', label:'클라우드'},
        {key:'ai',    label:'AI / ML'},
        {key:'etc',   label:'기타'},
      ];
      let html = '<div class="sk-section"><div class="sk-section-title">스킬</div><div class="sk-cats">';
      cats.forEach(cat => {
        const items = skills.filter(s => s.c === cat.key);
        if (!items.length) return;
        html += `<div class="sk-cat"><div class="sk-cat-label">${cat.label}</div><div class="sk-tags">`;
        items.forEach(s => {
          const lvLabel = ['하','중','상'][s.lv-1] || '';
          html += `<span class="sk-tag ${cat.key}">${esc(s.name)}<span class="sk-lv-label">${lvLabel}</span></span>`;
        });
        html += '</div></div>';
      });
      html += '</div></div>';
      return html;
    })()}`;

  openBottomPanel('member');
}

function openBottomPanel(which) {
  document.getElementById('projectPanel').classList.toggle('open', which==='project');
  document.getElementById('memberPanel').classList.toggle('open',  which==='member');
  document.getElementById('overlay').classList.add('show');
}
function closeBottomPanels() {
  document.getElementById('projectPanel').classList.remove('open');
  document.getElementById('memberPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// RENDER: MANAGEMENT DRAWER
// ═══════════════════════════════════════════════════════════
function openDrawer() {
  document.getElementById('mgmtDrawer').classList.add('open');
  document.getElementById('drawerOverlay').style.opacity = '1';
  document.getElementById('drawerOverlay').style.pointerEvents = 'all';
  renderDrawerContent();
}
function closeDrawer() {
  document.getElementById('mgmtDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').style.opacity = '0';
  document.getElementById('drawerOverlay').style.pointerEvents = 'none';
}

function _initDragReorder(container, dataKey, reorderFn) {
  let dragId = null;
  container.addEventListener('dragstart', e => {
    const item = e.target.closest('[data-drag-id]');
    if (!item) return;
    dragId = item.dataset.dragId;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  container.addEventListener('dragend', () => {
    container.querySelectorAll('.dragging,.drag-over').forEach(el => el.classList.remove('dragging','drag-over'));
  });
  container.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.target.closest('[data-drag-id]');
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    if (item && item.dataset.dragId !== dragId) item.classList.add('drag-over');
  });
  container.addEventListener('dragleave', e => {
    if (!container.contains(e.relatedTarget)) container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  container.addEventListener('drop', e => {
    e.preventDefault();
    const targetItem = e.target.closest('[data-drag-id]');
    if (!targetItem || targetItem.dataset.dragId === dragId) return;
    const items = [...container.querySelectorAll('[data-drag-id]')];
    const ids = items.map(el => el.dataset.dragId);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetItem.dataset.dragId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    reorderFn(ids);
    renderDrawerContent();
    render();
  });
}

function renderDrawerContent() {
  const tab = state.mgmtTab;
  const body = document.getElementById('drawerBody');

  if (tab === 'members') {
    let items = DATA.members.map(mem => `
      <div class="mgmt-item" draggable="true" data-drag-id="${mem.id}">
        <span class="drag-handle" title="순서 변경">⠿</span>
        <div class="member-avatar" style="background:${mem.color};width:32px;height:32px;font-size:10px;flex-shrink:0">${esc(initials(mem.name))}</div>
        <div class="mgmt-item-info">
          <div class="mgmt-item-name">${esc(mem.name)}</div>
          <div class="mgmt-item-sub">${esc(mem.role)}</div>
        </div>
        <div class="mgmt-actions">
          <button class="btn-icon-sm" data-edit-member="${mem.id}" title="수정">✏</button>
          <button class="btn-icon-sm danger" data-del-member="${mem.id}" title="삭제">✕</button>
        </div>
      </div>`).join('');
    body.innerHTML = `<div class="mgmt-list" id="memberDragList">${items}</div>
      <button class="mgmt-add-btn" id="addMemberBtn">+ 멤버 추가</button>`;
    document.getElementById('addMemberBtn').onclick = () => openMemberForm(null);
    _initDragReorder(document.getElementById('memberDragList'), 'mid', DataAPI.reorderMembers.bind(DataAPI));

  } else {
    let items = DATA.projects.map(pj => {
      const s = STATUS_KR[pj.status]||esc(pj.status);
      return `<div class="mgmt-item" draggable="true" data-drag-id="${pj.id}">
        <span class="drag-handle" title="순서 변경">⠿</span>
        <div style="width:10px;height:10px;border-radius:50%;background:${pj.color};flex-shrink:0;margin-top:2px"></div>
        <div class="mgmt-item-info">
          <div class="mgmt-item-name">${esc(pj.name)}</div>
          <div class="mgmt-item-sub">${esc(pj.client)} · ${s} · ${esc(pj.start)}~${esc(pj.end)}</div>
        </div>
        <div class="mgmt-actions">
          <button class="btn-icon-sm" data-edit-project="${pj.id}" title="수정">✏</button>
          <button class="btn-icon-sm danger" data-del-project="${pj.id}" title="삭제">✕</button>
        </div>
      </div>`;}).join('');
    body.innerHTML = `<div class="mgmt-list" id="projDragList">${items}</div>
      <button class="mgmt-add-btn" id="addProjectBtn">+ 프로젝트 추가</button>`;
    document.getElementById('addProjectBtn').onclick = () => openProjectForm(null);
    _initDragReorder(document.getElementById('projDragList'), 'pid', DataAPI.reorderProjects.bind(DataAPI));
  }
}

// ═══════════════════════════════════════════════════════════
// FORMS: MEMBER
// ═══════════════════════════════════════════════════════════
function openMemberForm(memberId) {
  const mem = memberId ? getMember(memberId) : null;
  state.formMode = {type:'member', id: memberId||null};
  document.getElementById('formTitle').textContent = mem ? '멤버 수정' : '멤버 추가';
  document.getElementById('formDeleteBtn').classList.toggle('hidden', !mem);

  const selectedColor = mem?.color || PRESET_COLORS[0];
  const swatches = PRESET_COLORS.map(c =>
    `<div class="color-swatch ${c===selectedColor?'selected':''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  document.getElementById('formContent').innerHTML = `
    <div class="form-group">
      <label class="form-label">이름</label>
      <input class="form-input" id="fMemberName" value="${mem?.name||''}" placeholder="홍길동">
    </div>
    <div class="form-group">
      <label class="form-label">직책</label>
      <input class="form-input" id="fMemberRole" value="${mem?.role||''}" placeholder="선임 개발자">
    </div>
    <div class="form-group">
      <label class="form-label">색상</label>
      <div class="color-grid" id="colorGridMember">${swatches}</div>
      <input type="hidden" id="fMemberColor" value="${selectedColor}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">입사 월 <span style="color:var(--text-m);font-weight:400;font-size:10px">— 빈칸=항상 재직</span></label>
        <input type="month" class="form-input" id="fMemberStart" value="${mem?.start ? String(mem.start).slice(0,4)+'-'+String(mem.start).slice(4) : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">퇴사 월 <span style="color:var(--text-m);font-weight:400;font-size:10px">— 빈칸=재직 중</span></label>
        <input type="month" class="form-input" id="fMemberEnd" value="${mem?.end ? String(mem.end).slice(0,4)+'-'+String(mem.end).slice(4) : ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">스킬</label>
      <div id="skExisting" class="sk-existing-tags"></div>
      <div class="sk-form-area">
        <div class="sk-form-row">
          <select class="sk-form-sel" id="skCat">
            <option value="lang">언어</option>
            <option value="cloud">클라우드</option>
            <option value="ai">AI</option>
            <option value="sol">솔루션</option>
            <option value="etc">기타</option>
          </select>
          <select class="sk-form-sel" id="skName" style="flex:1"></select>
          <input class="sk-form-inp" id="skNameCustom" placeholder="직접 입력" style="display:none;flex:1">
          <div class="sk-lv-group" id="skLvGroup">
            <button type="button" class="sk-lv-btn active" data-lv="1">하</button>
            <button type="button" class="sk-lv-btn" data-lv="2">중</button>
            <button type="button" class="sk-lv-btn" data-lv="3">상</button>
          </div>
        </div>
        <button type="button" class="btn-ghost-xs" id="skAddBtn">+ 스킬 추가</button>
      </div>
    </div>`;

  // 스킬 임시 저장 (state에 보관)
  state._tmpSkills = mem ? _deepCopy(mem.skills || []) : [];

  function _renderSkExisting() {
    document.getElementById('skExisting').innerHTML = state._tmpSkills.map((s,i) => {
      const lvLabel = ['하','중','상'][s.lv-1] || '';
      return `<span class="sk-tag ${s.c}" style="cursor:default">
        ${s.name}<span class="sk-lv-label">${lvLabel}</span>
        <span class="sk-rm-btn" data-sk-idx="${i}" style="margin-left:2px;opacity:.6;cursor:pointer">✕</span>
      </span>`;
    }).join('');
    document.getElementById('skExisting').querySelectorAll('[data-sk-idx]').forEach(btn => {
      btn.onclick = () => { state._tmpSkills.splice(parseInt(btn.dataset.skIdx),1); _renderSkExisting(); };
    });
  }
  _renderSkExisting();

  // 스킬 이름 select 초기화
  function _populateSkillSelect(cat) {
    const sel = document.getElementById('skName');
    const custom = document.getElementById('skNameCustom');
    const presets = (PRESET_SKILLS[cat] || []);
    sel.innerHTML = presets.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
      + `<option value="__custom__">직접 입력…</option>`;
    sel.style.display = '';
    custom.style.display = 'none';
    custom.value = '';
  }
  _populateSkillSelect(document.getElementById('skCat').value);

  document.getElementById('skCat').addEventListener('change', e => {
    _populateSkillSelect(e.target.value);
  });
  document.getElementById('skName').addEventListener('change', e => {
    const custom = document.getElementById('skNameCustom');
    if (e.target.value === '__custom__') {
      e.target.style.display = 'none';
      custom.style.display = '';
      custom.focus();
    }
  });
  document.getElementById('skNameCustom').addEventListener('blur', e => {
    if (!e.target.value.trim()) {
      e.target.style.display = 'none';
      document.getElementById('skName').style.display = '';
    }
  });

  // 레벨 버튼
  let _skLv = 1;
  document.getElementById('skLvGroup').addEventListener('click', e => {
    const btn = e.target.closest('[data-lv]');
    if (!btn) return;
    _skLv = parseInt(btn.dataset.lv);
    document.querySelectorAll('#skLvGroup .sk-lv-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.lv)===_skLv));
  });

  // 추가 버튼
  document.getElementById('skAddBtn').onclick = () => {
    const cat    = document.getElementById('skCat').value;
    const sel    = document.getElementById('skName');
    const custom = document.getElementById('skNameCustom');
    const name   = sel.value === '__custom__' || sel.style.display === 'none'
      ? custom.value.trim()
      : sel.value.trim();
    if (!name) return;
    state._tmpSkills.push({c: cat, name, lv: _skLv});
    _populateSkillSelect(cat);
    _renderSkExisting();
  };

  bindColorGrid('colorGridMember', 'fMemberColor');
  document.getElementById('formModal').classList.remove('hidden');
}

function saveMemberForm() {
  const name  = document.getElementById('fMemberName')?.value.trim();
  const role  = document.getElementById('fMemberRole')?.value.trim();
  const color = document.getElementById('fMemberColor')?.value;
  if (!name) { alert('이름을 입력하세요.'); return; }
  const { id } = state.formMode;
  const skills = state._tmpSkills || [];
  const startRaw = document.getElementById('fMemberStart')?.value;
  const endRaw   = document.getElementById('fMemberEnd')?.value;
  const start = startRaw ? parseInt(startRaw.replace('-', '')) : null;
  const end   = endRaw   ? parseInt(endRaw.replace('-', ''))   : null;
  if (id) { DataAPI.updateMember(id, {name, role, color, skills, start, end}); }
  else    { DataAPI.addMember({name, role, color, skills, start, end}); }
  closeFormModal();
  render();
  _afterMutate();
}

function deleteMemberConfirm() {
  const { id } = state.formMode;
  if (!id) return;
  DataAPI.deleteMember(id);
  closeFormModal();
  render();
  _afterMutate();
}

// ═══════════════════════════════════════════════════════════
// FORMS: PROJECT
// ═══════════════════════════════════════════════════════════
function openProjectForm(projectId) {
  const pj = projectId ? getProject(projectId) : null;
  state.formMode = {type:'project', id: projectId||null};
  document.getElementById('formTitle').textContent = pj ? '프로젝트 수정' : '프로젝트 추가';
  document.getElementById('formDeleteBtn').classList.toggle('hidden', !pj);

  const selectedColor = pj?.color || PRESET_COLORS[0];
  const swatches = PRESET_COLORS.map(c =>
    `<div class="color-swatch ${c===selectedColor?'selected':''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');
  const status = pj?.status || 'active';
  const statusOptions = [
    {v:'active',  cls:'sel-active',  label:'진행중'},
    {v:'done',    cls:'sel-done',    label:'완료'},
    {v:'planned', cls:'sel-planned', label:'예정'},
  ];
  const statusBtns = statusOptions.map(s =>
    `<button type="button" class="status-opt ${s.v===status?s.cls:''}" data-status="${s.v}" data-cls="${s.cls}">${s.label}</button>`
  ).join('');

  document.getElementById('formContent').innerHTML = `
    <div class="form-group">
      <label class="form-label">프로젝트명</label>
      <input class="form-input" id="fPjName" value="${pj?.name||''}" placeholder="스마트팩토리 구축">
    </div>
    <div class="form-group">
      <label class="form-label">고객사</label>
      <input class="form-input" id="fPjClient" value="${pj?.client||''}" placeholder="삼성전자">
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">시작</label>
        <input class="form-input" id="fPjStart" value="${pj?.start||''}" placeholder="2026-01">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">종료</label>
        <input class="form-input" id="fPjEnd" value="${pj?.end||''}" placeholder="2026-12">
      </div>
    </div>
    <div class="form-group" style="margin-top:14px">
      <label class="form-label">상태</label>
      <div class="status-select" id="statusBtns">${statusBtns}</div>
      <input type="hidden" id="fPjStatus" value="${status}">
    </div>
    <div class="form-group">
      <label class="form-label">설명</label>
      <textarea class="form-textarea" id="fPjDesc" placeholder="프로젝트 설명...">${pj?.desc||''}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">색상</label>
      <div class="color-grid" id="colorGridProject">${swatches}</div>
      <input type="hidden" id="fPjColor" value="${selectedColor}">
    </div>`;

  // Status button group
  document.getElementById('statusBtns').addEventListener('click', e => {
    const btn = e.target.closest('[data-status]');
    if (!btn) return;
    document.getElementById('fPjStatus').value = btn.dataset.status;
    document.querySelectorAll('#statusBtns [data-status]').forEach(b => {
      b.className = `status-opt ${b.dataset.status === btn.dataset.status ? b.dataset.cls : ''}`;
    });
  });

  bindColorGrid('colorGridProject', 'fPjColor');
  document.getElementById('formModal').classList.remove('hidden');
}

function saveProjectForm() {
  const name   = document.getElementById('fPjName')?.value.trim();
  const client = document.getElementById('fPjClient')?.value.trim();
  const start  = document.getElementById('fPjStart')?.value.trim();
  const end    = document.getElementById('fPjEnd')?.value.trim();
  const status = document.getElementById('fPjStatus')?.value;
  const desc   = document.getElementById('fPjDesc')?.value.trim();
  const color  = document.getElementById('fPjColor')?.value;
  if (!name || !client) { alert('프로젝트명과 고객사를 입력하세요.'); return; }
  const { id } = state.formMode;
  if (id) { DataAPI.updateProject(id, {name, client, start, end, status, desc, color}); }
  else    { DataAPI.addProject({name, client, start, end, status, desc, color}); }
  closeFormModal();
  render();
  _afterMutate();
}

function deleteProjectConfirm() {
  const { id } = state.formMode;
  if (!id) return;
  DataAPI.deleteProject(id);
  closeFormModal();
  render();
  _afterMutate();
}

function closeFormModal() {
  document.getElementById('formModal').classList.add('hidden');
  state.formMode = null;
}

// ═══════════════════════════════════════════════════════════
// MEMBER-ASSIGN FORM (투입 공수 설정)
// ═══════════════════════════════════════════════════════════
const _maForm = { start: null, end: null, mmVals: {}, actualVals: {}, dragging: false, dragMoved: false, actStart: null, actEnd: null, actDragging: false, actDragMoved: false };

function renderMAFormTrack() {
  const projectId = document.getElementById('maFProject')?.value || state.formMode?.id;
  const pj = getProject(projectId);
  const year = state.year;

  const enabledSet = new Set();
  if (pj?.start && pj?.end) {
    const [sy, sm] = pj.start.split('-').map(Number);
    const [ey, em] = pj.end.split('-').map(Number);
    for (let m = 1; m <= 12; m++) {
      if (year*12+m >= sy*12+sm && year*12+m <= ey*12+em) enabledSet.add(m);
    }
  } else {
    for (let m = 1; m <= 12; m++) enabledSet.add(m);
  }

  const ps = _maForm.start === null ? 99 : Math.min(_maForm.start, _maForm.end ?? _maForm.start);
  const pe = _maForm.end   === null ? -1 : Math.max(_maForm.start ?? 0, _maForm.end);
  const as = _maForm.actStart === null ? 99 : Math.min(_maForm.actStart, _maForm.actEnd ?? _maForm.actStart);
  const ae = _maForm.actEnd   === null ? -1 : Math.max(_maForm.actStart ?? 0, _maForm.actEnd);

  // Header row: empty label + 12 month headers
  let hdrHtml = '<div class="ma-row-lbl"></div>';
  for (let m = 1; m <= 12; m++) {
    hdrHtml += `<div class="ma-month-hdr">${MONTH_KR[m-1]}</div>`;
  }

  // Plan row
  let planHtml = '<div class="ma-row-lbl plan-lbl">계획</div>';
  for (let m = 1; m <= 12; m++) {
    const enabled = enabledSet.has(m);
    const inRange = enabled && m >= ps && m <= pe;
    const mv = _maForm.mmVals[m] ?? 1.0;
    let barStyle = '', valHtml = '';
    if (inRange && pj) {
      if (mv > 0) {
        barStyle = ` style="background:${_bulkBarColor(pj.color, mv)}"`;
        const tc = mv <= 0.25 ? 'rgba(0,0,0,.5)' : '#fff';
        valHtml = `<span class="bulk-val" style="color:${tc}">${mv === 1 ? '1.0' : mv}</span>`;
      } else {
        barStyle = ` style="background:transparent;border:1px dashed var(--border)"`;
        valHtml = `<span style="font-size:9px;color:var(--text-m)">—</span>`;
      }
    }
    planHtml += `<div class="bulk-mcell ma-plan-cell${inRange?' selected':''}${!enabled?' plan-off':''}" data-row="plan" data-m="${m}" data-en="${enabled?1:0}">
      <div class="bulk-bar"${barStyle}>${valHtml}</div>
    </div>`;
  }

  // Actual row
  let actHtml = '<div class="ma-row-lbl act-lbl">실제</div>';
  for (let m = 1; m <= 12; m++) {
    const inActRange = m >= as && m <= ae;
    const av = _maForm.actualVals[m] || 0;
    let barStyle = '', valHtml = '';
    if (av > 0 && pj) {
      barStyle = ` style="background:${_hexRgba(pj.color, 0.7)}"`;
      const tc = av <= 0.25 ? 'rgba(0,0,0,.5)' : '#fff';
      valHtml = `<span class="bulk-val" style="color:${tc}">${av === 1 ? '1.0' : av}</span>`;
    } else if (inActRange && pj) {
      barStyle = ` style="background:transparent;border:1px dashed var(--border)"`;
      valHtml = `<span style="font-size:9px;color:var(--text-m)">—</span>`;
    }
    actHtml += `<div class="bulk-mcell ma-act-cell${inActRange?' act-selected':''}" data-row="act" data-m="${m}">
      <div class="bulk-bar"${barStyle}>${valHtml}</div>
    </div>`;
  }

  const trackEl = document.getElementById('maFTrack');
  if (!trackEl) return;
  trackEl.innerHTML = `<div class="ma-track-grid" style="width:100%;box-sizing:border-box">${hdrHtml}${planHtml}${actHtml}</div>`;

  // Hint
  const fmt = v => (Math.round(v*100)/100).toString().replace(/\.?0+$/,'')||'0';
  let hint = pj ? '계획: 드래그로 기간 선택 · 스크롤로 값 조정 | 실제: 드래그 후 스크롤' : '프로젝트를 먼저 선택하세요';
  if (pj && _maForm.start !== null) {
    let planTotal = 0, actTotal = 0;
    for (let m = ps; m <= pe; m++) if (enabledSet.has(m)) planTotal += _maForm.mmVals[m] ?? 1;
    for (let m = 1; m <= 12; m++) actTotal += _maForm.actualVals[m] || 0;
    hint = `계획 ${ps}월~${pe}월 · ${fmt(planTotal)} M/M` + (actTotal > 0 ? ` · 실제 합계 ${fmt(actTotal)} M/M` : '');
  }
  const hintEl = document.getElementById('maFHint');
  if (hintEl) hintEl.textContent = hint;
}

function _loadMAFormExisting() {
  const memberId  = document.getElementById('maFMember')?.value;
  const projectId = document.getElementById('maFProject')?.value;
  _maForm.start = null; _maForm.end = null; _maForm.mmVals = {}; _maForm.actualVals = {};
  _maForm.actStart = null; _maForm.actEnd = null;
  state.formMode.id = projectId || null;
  if (!memberId || !projectId) return;
  const existAs = DATA.assignments.filter(a =>
    a.memberId === memberId && a.projectId === projectId && a.year === state.year);
  existAs.forEach(a => {
    _maForm.mmVals[a.month]     = a.mm_plan != null ? a.mm_plan : (a.mm || 0);
    _maForm.actualVals[a.month] = a.mm_actual || 0;
  });
  if (existAs.length) {
    const months = existAs.map(a => a.month);
    _maForm.start = Math.min(...months);
    _maForm.end   = Math.max(...months);
    const actMonths = existAs.filter(a => (a.mm_actual||0) > 0).map(a => a.month);
    if (actMonths.length) {
      _maForm.actStart = Math.min(...actMonths);
      _maForm.actEnd   = Math.max(...actMonths);
    }
  }
  // show/hide delete button
  const formDeleteBtn = document.getElementById('formDeleteBtn');
  if (existAs.length > 0) { formDeleteBtn.classList.remove('hidden'); formDeleteBtn.style.display = ''; }
  else { formDeleteBtn.classList.add('hidden'); }
}

function openMemberAssignForm(projectId, memberId) {
  state.formMode = {type:'memberAssign', id: projectId||null, editMemberId: memberId||null};
  document.getElementById('formTitle').textContent = '멤버 투입';
  document.getElementById('formDeleteBtn').classList.add('hidden');

  _maForm.start = null; _maForm.end = null; _maForm.mmVals = {}; _maForm.actualVals = {};
  _maForm.actStart = null; _maForm.actEnd = null;

  const memberOpts = DATA.members.map(m =>
    `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');
  const projOpts = `<option value="">프로젝트 선택</option>` +
    DATA.projects.map(p =>
      `<option value="${p.id}"${p.id===projectId?' selected':''}>${esc(p.name)} (${esc(p.client)})</option>`
    ).join('');

  document.getElementById('formContent').innerHTML = `
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label">멤버</label>
        <select class="form-select" id="maFMember">${memberOpts}</select>
      </div>
      <div class="form-group" style="flex:1.6">
        <label class="form-label">프로젝트</label>
        <select class="form-select" id="maFProject">${projOpts}</select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:8px">
      <label class="form-label">유형</label>
      <div style="display:flex;gap:12px;align-items:center;padding-top:2px">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
          <input type="radio" name="maFType" value="상주" checked> 상주
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
          <input type="radio" name="maFType" value="비상주"> 비상주
        </label>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:4px">
      <label class="form-label">적용 기간 — 드래그로 범위 선택 · 클릭으로 공수 조정 (0.25/0.5/0.75/1.0)</label>
      <div id="maFTrack" style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:6px;padding:4px"></div>
      <div class="bulk-hint" id="maFHint">프로젝트를 먼저 선택하세요</div>
    </div>`;

  if (memberId) document.getElementById('maFMember').value = memberId;

  // Member / Project change → reload existing data
  document.getElementById('maFMember').addEventListener('change', () => { _loadMAFormExisting(); renderMAFormTrack(); });
  document.getElementById('maFProject').addEventListener('change', () => { _loadMAFormExisting(); renderMAFormTrack(); });

  // If both member + project already known, load now
  if (memberId && projectId) { _loadMAFormExisting(); }

  // Wire drag events on track
  const trackEl = document.getElementById('maFTrack');
  trackEl.addEventListener('mousedown', ev => {
    const c = ev.target.closest('.bulk-mcell');
    if (!c) return;
    const row = c.dataset.row;
    if (row === 'plan') {
      if (c.dataset.en !== '1') return;
      _maForm.dragging = true; _maForm.dragMoved = false;
      _maForm.start = +c.dataset.m; _maForm.end = +c.dataset.m;
    } else if (row === 'act') {
      _maForm.actDragging = true; _maForm.actDragMoved = false;
      _maForm.actStart = +c.dataset.m; _maForm.actEnd = +c.dataset.m;
    }
  });
  trackEl.addEventListener('mouseover', ev => {
    const c = ev.target.closest('.bulk-mcell');
    if (!c) return;
    const m = +c.dataset.m;
    if (_maForm.dragging && c.dataset.row === 'plan' && c.dataset.en === '1') {
      if (m !== _maForm.end) { _maForm.dragMoved = true; _maForm.end = m; renderMAFormTrack(); }
    }
    if (_maForm.actDragging && c.dataset.row === 'act') {
      if (m !== _maForm.actEnd) {
        _maForm.actDragMoved = true; _maForm.actEnd = m;
        // fill newly-entered cells with default
        const as2 = Math.min(_maForm.actStart, m), ae2 = Math.max(_maForm.actStart, m);
        for (let mi = as2; mi <= ae2; mi++) {
          if (!(_maForm.actualVals[mi] > 0)) _maForm.actualVals[mi] = 1.0;
        }
        renderMAFormTrack();
      }
    }
  });
  trackEl.addEventListener('wheel', ev => {
    ev.preventDefault();
    const c = ev.target.closest('.bulk-mcell');
    if (!c) return;
    const m = +c.dataset.m;
    const dir = ev.deltaY < 0 ? 1 : -1;
    if (c.dataset.row === 'plan' && c.classList.contains('selected')) {
      const cur = _maForm.mmVals[m] ?? 1.0;
      const idx = MM_CYCLE_BULK.indexOf(cur);
      _maForm.mmVals[m] = MM_CYCLE_BULK[(idx + dir + MM_CYCLE_BULK.length) % MM_CYCLE_BULK.length];
    } else if (c.dataset.row === 'act') {
      const cur = _maForm.actualVals[m] || 0;
      const idx = MM_CYCLE_BULK.indexOf(cur);
      _maForm.actualVals[m] = MM_CYCLE_BULK[Math.max(0, (idx + dir + MM_CYCLE_BULK.length) % MM_CYCLE_BULK.length)];
    }
    renderMAFormTrack();
  }, {passive: false});

  renderMAFormTrack();
  document.getElementById('formModal').classList.remove('hidden');
}

function saveMemberAssignForm() {
  const memberId  = document.getElementById('maFMember')?.value;
  const projectId = document.getElementById('maFProject')?.value || state.formMode?.id;
  if (!memberId || !projectId || _maForm.start === null) return;

  const year = state.year;
  const type = document.querySelector('input[name="maFType"]:checked')?.value || '상주';
  const pj   = getProject(projectId);

  const enabledSet = new Set();
  if (pj?.start && pj?.end) {
    const [sy, sm] = pj.start.split('-').map(Number);
    const [ey, em] = pj.end.split('-').map(Number);
    for (let m = 1; m <= 12; m++) {
      if (year*12+m >= sy*12+sm && year*12+m <= ey*12+em) enabledSet.add(m);
    }
  } else {
    for (let m = 1; m <= 12; m++) enabledSet.add(m);
  }

  const s = _maForm.start === null ? null : Math.min(_maForm.start, _maForm.end ?? _maForm.start);
  const e = _maForm.end   === null ? null : Math.max(_maForm.start ?? 0, _maForm.end);

  // Save plan range months
  if (s !== null) {
    for (let m = s; m <= e; m++) {
      if (!enabledSet.has(m)) continue;
      const mm_plan = _maForm.mmVals[m] ?? 1.0;
      // 실제값이 별도 입력된 경우 우선, 없으면 계획과 동일하게 자동 등록 (계획 0은 예외)
      const mm_actual = _maForm.actualVals[m] > 0 ? _maForm.actualVals[m] : (mm_plan > 0 ? mm_plan : 0);
      DataAPI.setAssignment(memberId, projectId, year, m, mm_plan, mm_actual, type);
    }
  }
  // Save actual-only months outside plan range
  for (let m = 1; m <= 12; m++) {
    const inPlan = s !== null && enabledSet.has(m) && m >= s && m <= e;
    if (inPlan) continue;
    const mm_actual = _maForm.actualVals[m] || 0;
    if (mm_actual > 0) {
      const ex = DATA.assignments.find(a => a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===m);
      DataAPI.setAssignment(memberId, projectId, year, m, ex ? (ex.mm_plan ?? ex.mm ?? 0) : 0, mm_actual, type);
    }
  }
  closeFormModal();
  render();
}

// ═══════════════════════════════════════════════════════════
// BULK ASSIGN MODAL
// ═══════════════════════════════════════════════════════════
const MM_CYCLE_BULK = [0, 0.25, 0.5, 0.75, 1.0];
const MM_ALPHA_BULK = {0: 0, 0.25: 0.38, 0.5: 0.58, 0.75: 0.78, 1.0: 1.0};

function _bulkBarColor(hex, mv) {
  const a = MM_ALPHA_BULK[mv] ?? 1;
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const mix = v => Math.round(v*a + 255*(1-a));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const _bulk = { memberId:null, projId:null, start:null, end:null, mmVals:{}, dragging:false, dragMoved:false };

function openBulkModal(memberId) {
  _bulk.memberId = memberId; _bulk.projId = null; _bulk.start = null; _bulk.end = null; _bulk.mmVals = {};
  const mem = getMember(memberId);
  document.getElementById('bulkTitle').textContent = `${mem?.name} · ${state.year}년 일괄 공수 입력`;
  renderBulkModal();
  document.getElementById('bulkModal').classList.remove('hidden');
}

function renderBulkModal() {
  const year = state.year;
  const activeProjs = DATA.projects.filter(p => {
    if (!p.start || !p.end) return false;
    const [sy, sm] = p.start.split('-').map(Number);
    const [ey, em] = p.end.split('-').map(Number);
    return (sy < year || (sy === year)) && (ey > year || ey === year);
  });
  let projOpts = `<option value="">프로젝트 선택</option>`;
  activeProjs.forEach(p => { projOpts += `<option value="${p.id}"${_bulk.projId===p.id?' selected':''}>${esc(p.name)}</option>`; });

  const proj = _bulk.projId ? DATA.projects.find(p => p.id === _bulk.projId) : null;
  const MONTHS_KR = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  const s = _bulk.start === null ? 99 : Math.min(_bulk.start, _bulk.end ?? _bulk.start);
  const e = _bulk.end === null ? -1 : Math.max(_bulk.start ?? 0, _bulk.end);

  let monthTrack = '';
  for (let m = 1; m <= 12; m++) {
    let enabled = false;
    if (proj && proj.start && proj.end) {
      const [sy, sm] = proj.start.split('-').map(Number);
      const [ey, em] = proj.end.split('-').map(Number);
      const mAbs = year*12+m;
      enabled = mAbs >= sy*12+sm && mAbs <= ey*12+em;
    }
    const inRange = enabled && m >= s && m <= e;
    const mv = _bulk.mmVals[m] ?? 1.0;
    let barStyle = '', valHtml = '';
    if (inRange && proj) {
      barStyle = ` style="background:${_bulkBarColor(proj.color, mv)}"`;
      const tc = mv <= 0.25 ? 'rgba(0,0,0,.5)' : '#fff';
      valHtml = `<span class="bulk-val" style="color:${tc}">${mv === 1 ? '1.0' : mv}</span>`;
    }
    monthTrack += `<div class="bulk-mcell${inRange?' selected':''}${proj&&!enabled?' disabled':''}" data-m="${m}" data-en="${enabled?1:0}">
      <div class="bulk-label">${MONTHS_KR[m-1]}</div>
      <div class="bulk-bar"${barStyle}>${valHtml}</div>
    </div>`;
  }

  let hint = '시작 월을 클릭하세요';
  if (_bulk.start !== null) {
    const mn = Math.min(_bulk.start, _bulk.end??_bulk.start), mx = Math.max(_bulk.start, _bulk.end??_bulk.start);
    let total = 0; for (let m=mn; m<=mx; m++) total += _bulk.mmVals[m]??1;
    hint = `${mn}월~${mx}월 · 총 ${(Math.round(total*100)/100).toString().replace(/\.?0+$/,'')||'0'} M/M`;
  }

  document.getElementById('bulkBody').innerHTML = `
    <div class="bulk-field">
      <label class="bulk-lbl">프로젝트</label>
      <select id="bulkProjSel" style="width:100%">${projOpts}</select>
      ${proj ? `<div class="bulk-range-hint">기간: ${proj.start.replace('-','년 ')}월 ~ ${proj.end.replace('-','년 ')}월</div>` : ''}
    </div>
    <div class="bulk-field">
      <label class="bulk-lbl">적용 기간 — 드래그로 범위 선택 · 클릭 또는 휠로 공수 조정 (0.25/0.5/0.75/1.0)</label>
      <div class="bulk-track" id="bulkTrack">${monthTrack}</div>
      <div class="bulk-hint">${hint}</div>
    </div>`;

  document.getElementById('bulkProjSel').onchange = e => {
    _bulk.projId = e.target.value || null; _bulk.start = null; _bulk.end = null; _bulk.mmVals = {};
    renderBulkModal();
  };

  const track = document.getElementById('bulkTrack');
  if (!track) return;
  track.addEventListener('mousedown', e => {
    const c = e.target.closest('.bulk-mcell');
    if (!c || c.dataset.en !== '1') return;
    _bulk.dragging = true; _bulk.dragMoved = false;
    _bulk.start = +c.dataset.m; _bulk.end = +c.dataset.m; renderBulkModal();
  });
  track.addEventListener('mouseover', e => {
    if (!_bulk.dragging) return;
    const c = e.target.closest('.bulk-mcell');
    if (!c || c.dataset.en !== '1') return;
    const m = +c.dataset.m; if (m !== _bulk.end) { _bulk.dragMoved = true; _bulk.end = m; renderBulkModal(); }
  });
  track.addEventListener('wheel', e => {
    e.preventDefault();
    const c = e.target.closest('.bulk-mcell');
    if (!c || !c.classList.contains('selected')) return;
    const m = +c.dataset.m, cur = _bulk.mmVals[m]??1.0;
    const idx = MM_CYCLE_BULK.indexOf(cur);
    _bulk.mmVals[m] = MM_CYCLE_BULK[(idx+(e.deltaY<0?1:-1)+MM_CYCLE_BULK.length)%MM_CYCLE_BULK.length];
    renderBulkModal();
  }, {passive:false});
}

function saveBulkModal() {
  if (!_bulk.projId || _bulk.start === null) return;
  const mn = Math.min(_bulk.start, _bulk.end??_bulk.start), mx = Math.max(_bulk.start, _bulk.end??_bulk.start);
  for (let m = mn; m <= mx; m++) {
    const existing = DATA.assignments.find(a => a.memberId===_bulk.memberId && a.projectId===_bulk.projId && a.year===state.year && a.month===m);
    DataAPI.setAssignment(_bulk.memberId, _bulk.projId, state.year, m, _bulk.mmVals[m]??1.0, existing?.mm_actual||0, '상주');
  }
  document.getElementById('bulkModal').classList.add('hidden');
  render();
}

// ═══════════════════════════════════════════════════════════
// ASSIGN MODAL
// ═══════════════════════════════════════════════════════════
function openAssignModal(memberId, year, month) {
  state.assignCtx = {memberId, year, month};
  const mem = getMember(memberId);
  document.getElementById('assignTitle').textContent =
    `${mem?.name} · ${year}년 ${MONTH_KR[month-1]}`;
  renderAssignModal();
  document.getElementById('assignModal').classList.remove('hidden');
}

function renderAssignModal() {
  const { memberId, year, month } = state.assignCtx;
  const as = getAssignments(memberId, year, month);
  const total = as.reduce((s,a)=>s+getDisplayMM(a), 0);

  // Current assignments list
  let listHtml = '';
  if (as.length > 0) {
    listHtml = as.map(a => {
      const pj = getProject(a.projectId);
      if (!pj) return '';
      const _mp = a.mm_plan != null ? a.mm_plan : (a.mm || 0);
      const _ma = a.mm_actual || 0;
      const mmInfo = state.assignMode === 'plan'
        ? `<b style="font-family:'JetBrains Mono',monospace">${_mp.toFixed(2)} M/M</b> <span style="font-size:10px;color:var(--text-m)">(계획)</span>`
        : state.assignMode === 'actual'
          ? `<b style="font-family:'JetBrains Mono',monospace">${_ma > 0 ? _ma.toFixed(2) : _mp.toFixed(2)} M/M</b>${_ma > 0 ? '' : ' <span style="font-size:10px;color:var(--text-m)">(계획)</span>'}`
          : `<span style="font-size:10px;color:var(--text-m)">계획</span> <b style="font-family:'JetBrains Mono',monospace">${_mp.toFixed(2)}</b> <span style="font-size:10px">→</span> <span style="font-size:10px;color:var(--text-m)">실제</span> <b style="font-family:'JetBrains Mono',monospace;color:${_ma>_mp+0.05?'#c62828':_ma>0?'var(--ok)':'var(--text-s)'}">${_ma > 0 ? _ma.toFixed(2) : '—'}</b>`;
      return `<div class="assign-item">
        <div class="assign-item-dot" style="background:${pj.color}"></div>
        <div style="flex:1">
          <div class="assign-item-name">${esc(pj.name)}</div>
          <div class="assign-item-info">${esc(pj.client)} · ${esc(a.type)} · ${mmInfo}</div>
        </div>
        <button class="btn-icon-sm" data-assign-edit="${a.projectId}" title="수정">✏</button>
        <button class="btn-icon-sm danger" data-assign-del="${a.projectId}" title="삭제">✕</button>
      </div>`;
    }).join('');
    if (total > 0) {
      const cls = mmClass(total);
      listHtml += `<div style="text-align:right;font-size:12px;color:var(--text-m);margin:4px 2px 10px">
        합계: <b style="font-family:'JetBrains Mono',monospace;color:${cls==='ok'?'var(--ok)':cls==='warn'?'var(--warn)':'var(--over)'}">${total.toFixed(2)} M/M</b>
      </div>`;
    }
  } else {
    listHtml = `<div style="font-size:13px;color:var(--text-m);margin-bottom:12px;text-align:center;padding:8px">이 달 투입 없음</div>`;
  }

  // Add new assignment form
  const projOptions = DATA.projects.map(pj =>
    `<option value="${pj.id}">${esc(pj.name)} (${esc(pj.client)})</option>`
  ).join('');

  listHtml += `<div class="assign-add-form">
    <div class="assign-add-title">+ 공수 추가</div>
    <div class="form-group">
      <label class="form-label">프로젝트</label>
      <select class="form-select" id="newAssignProject">${projOptions}</select>
    </div>
    <div class="form-row">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">계획 M/M</label>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="ma-mm-btn" data-amm="1.0">1</button>
          <button class="ma-mm-btn" data-amm="0.75">0.75</button>
          <button class="ma-mm-btn" data-amm="0.5">0.5</button>
          <button class="ma-mm-btn" data-amm="0.25">0.25</button>
          <input class="ma-bulk-input" type="number" min="0.05" max="2" step="0.05" value="1.00" id="newAssignMM" style="flex:1;min-width:56px">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">실제 M/M <span style="color:var(--text-m);font-size:10px">(선택)</span></label>
        <input class="ma-bulk-input" type="number" min="0" max="2" step="0.05" value="" placeholder="0.00" id="newAssignMMActual" style="width:100%">
      </div>
    </div>
    <div class="form-group" style="margin-bottom:0;margin-top:6px">
      <label class="form-label">유형</label>
      <div class="form-radio-group" style="height:36px">
        <label class="form-radio-label"><input type="radio" name="assignType" value="상주" checked> 상주</label>
        <label class="form-radio-label"><input type="radio" name="assignType" value="비상주"> 비상주</label>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px">
      <button class="btn-primary" id="saveNewAssign">추가</button>
    </div>
  </div>`;

  document.getElementById('assignBody').innerHTML = listHtml;

  // Quick MM buttons in assign modal
  document.getElementById('assignBody').querySelectorAll('[data-amm]').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('newAssignMM').value = btn.dataset.amm;
      document.getElementById('assignBody').querySelectorAll('[data-amm]').forEach(b =>
        b.classList.toggle('active', b === btn));
    };
  });

  // Save new
  document.getElementById('saveNewAssign').onclick = () => {
    const pid      = document.getElementById('newAssignProject').value;
    const mm_plan  = parseFloat(document.getElementById('newAssignMM').value) || 1.0;
    const mm_actual = parseFloat(document.getElementById('newAssignMMActual').value) || 0;
    const type     = document.querySelector('input[name="assignType"]:checked').value;
    DataAPI.setAssignment(memberId, pid, year, month, mm_plan, mm_actual, type);
    renderAssignModal();
    render();
  };

  // Edit existing (click edit button → pre-fill form)
  document.getElementById('assignBody').querySelectorAll('[data-assign-edit]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.assignEdit;
      const existing = as.find(a=>a.projectId===pid);
      if (!existing) return;
      const _mp = existing.mm_plan != null ? existing.mm_plan : (existing.mm || 0);
      const _ma = existing.mm_actual || 0;
      document.getElementById('newAssignProject').value = pid;
      document.getElementById('newAssignMM').value = _mp;
      document.getElementById('newAssignMMActual').value = _ma > 0 ? _ma : '';
      document.getElementById('assignBody').querySelectorAll('[data-amm]').forEach(b =>
        b.classList.toggle('active', parseFloat(b.dataset.amm) === _mp));
      document.querySelector(`input[name="assignType"][value="${existing.type}"]`).checked = true;
    };
  });

  // Delete
  document.getElementById('assignBody').querySelectorAll('[data-assign-del]').forEach(btn => {
    btn.onclick = () => {
      confirmable(btn, () => {
        const pid = btn.dataset.assignDel;
        DataAPI.deleteAssignment(memberId, pid, year, month);
        renderAssignModal();
        render();
      }, { label: '삭제?', bg: '', color: '#DC2626' });
    };
  });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
function bindColorGrid(gridId, hiddenId) {
  document.getElementById(gridId).addEventListener('click', e => {
    const sw = e.target.closest('[data-color]');
    if (!sw) return;
    document.getElementById(gridId).querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected'));
    sw.classList.add('selected');
    document.getElementById(hiddenId).value = sw.dataset.color;
  });
}

// ═══════════════════════════════════════════════════════════
// HEADER & MAIN RENDER
// ═══════════════════════════════════════════════════════════
function renderHeaderControls() {
  document.getElementById('yearDisplay').textContent = state.year;

  document.getElementById('btnYear').classList.toggle('active', state.viewMode==='year');
  document.getElementById('btnBench').classList.toggle('active', state.viewMode==='bench');
  document.getElementById('btnWisenm').classList.toggle('active', state.viewMode==='wisenm');

  const filterBar = document.getElementById('filterBar');
  const benchFilterBar = document.getElementById('benchFilterBar');
  const isGrid = state.viewMode === 'year' || state.viewMode === 'bench';
  const yearNav = document.getElementById('prevYear').parentElement || document.querySelector('.hd-nav');
  if (state.viewMode === 'year') {
    filterBar.classList.remove('hidden');
    benchFilterBar.classList.add('hidden');
  } else if (state.viewMode === 'bench') {
    filterBar.classList.add('hidden');
    benchFilterBar.classList.remove('hidden');
  } else {
    filterBar.classList.add('hidden');
    benchFilterBar.classList.add('hidden');
  }
}

function switchView(mode) {
  state.viewMode = mode;
  state.memberFilter = '';
  state.projectFilter = '';
  state.benchMemberFilter = '';
  state.benchShowAvailOnly = false;
  state.benchSkillFilter = [];
  if (document.getElementById('benchSkillBtn')) _updateSkillBtn();
  const fi = document.getElementById('filterInput');
  fi.value = '';
  fi.classList.remove('active');
  document.getElementById('filterClear').style.display = 'none';
  document.getElementById('projFilter').value = '';
  const bfi = document.getElementById('benchFilterInput');
  bfi.value = '';
  bfi.classList.remove('active');
  bfi.style.borderColor = '';
  document.getElementById('benchShowAvailOnly').checked = false;
  render();
}

function render() {
  renderHeaderControls();
  if (state.viewMode==='bench')   renderBenchView();
  else if (state.viewMode==='wisenm') {
    document.getElementById('kpi-wrap').innerHTML = '';
    renderWisenmView();
  }
  else                            renderYearView();
}

// ═══════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════
// Year nav
document.getElementById('prevYear').onclick = () => { state.year--; render(); };
document.getElementById('nextYear').onclick = () => { state.year++; render(); };

// View toggle
document.getElementById('btnYear').onclick   = () => switchView('year');
document.getElementById('btnBench').onclick  = () => switchView('bench');
document.getElementById('btnWisenm').onclick = () => switchView('wisenm');

// Filter bar
function _updateFilterClear() {
  const active = !!(state.memberFilter || state.projectFilter);
  document.getElementById('filterClear').style.display = active ? 'inline-block' : 'none';
}
document.getElementById('filterInput').addEventListener('input', function() {
  state.memberFilter = this.value.trim().toLowerCase();
  this.classList.toggle('active', !!state.memberFilter);
  _updateFilterClear();
  render();
});
document.getElementById('filterClear').addEventListener('click', function() {
  state.memberFilter = '';
  state.projectFilter = '';
  const inp = document.getElementById('filterInput');
  inp.value = '';
  inp.classList.remove('active');
  document.getElementById('projFilter').value = '';
  this.style.display = 'none';
  render();
});
document.getElementById('filterInput').addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && this.value) {
    document.getElementById('filterClear').click();
    this.blur();
  }
});

// Bench filter bar
document.getElementById('benchFilterInput').addEventListener('input', function() {
  state.benchMemberFilter = this.value.trim().toLowerCase();
  this.classList.toggle('active', !!state.benchMemberFilter);
  renderBenchView();
});
document.getElementById('benchFilterInput').addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && this.value) {
    this.value = '';
    state.benchMemberFilter = '';
    this.classList.remove('active');
    this.blur();
    renderBenchView();
  }
});
document.getElementById('benchShowAvailOnly').addEventListener('change', function() {
  state.benchShowAvailOnly = this.checked;
  renderBenchView();
});

// 스킬 필터 드롭다운 채우기
function _buildSkillDropdown() {
  const allSkills = {};  // cat → Set of skill names
  DATA.members.forEach(m => (m.skills||[]).forEach(s => {
    if (!allSkills[s.c]) allSkills[s.c] = new Set();
    allSkills[s.c].add(s.name);
  }));
  const catLabel = {lang:'언어', cloud:'클라우드', ai:'AI', sol:'솔루션', etc:'기타'};
  const dd = document.getElementById('benchSkillDropdown');
  dd.innerHTML = Object.entries(allSkills).map(([cat, names]) =>
    `<div class="skill-filter-group">${catLabel[cat]||cat}</div>` +
    [...names].map(name =>
      `<label class="skill-filter-item">
        <input type="checkbox" data-skill="${esc(name)}" ${state.benchSkillFilter.includes(name)?'checked':''}>
        ${esc(name)}
      </label>`
    ).join('')
  ).join('');
  dd.querySelectorAll('input[data-skill]').forEach(cb => {
    cb.addEventListener('change', () => {
      const skill = cb.dataset.skill;
      if (cb.checked) { if (!state.benchSkillFilter.includes(skill)) state.benchSkillFilter.push(skill); }
      else { state.benchSkillFilter = state.benchSkillFilter.filter(s => s !== skill); }
      _updateSkillBtn();
      renderBenchView();
      // 렌더 후 드롭다운 재구성 및 유지
      const dd2 = document.getElementById('benchSkillDropdown');
      if (dd2) { _buildSkillDropdown(); dd2.classList.remove('hidden'); }
    });
  });
}

function _updateSkillBtn() {
  const btn = document.getElementById('benchSkillBtn');
  if (!btn) return;
  const n = state.benchSkillFilter.length;
  btn.textContent = n > 0 ? `스킬 ${n} ▾` : '스킬 ▾';
  btn.classList.toggle('active', n > 0);
}

document.getElementById('benchSkillBtn').addEventListener('click', e => {
  e.stopPropagation();
  const dd = document.getElementById('benchSkillDropdown');
  const isOpen = !dd.classList.contains('hidden');
  if (!isOpen) _buildSkillDropdown();
  dd.classList.toggle('hidden');
});

document.addEventListener('click', e => {
  const dd = document.getElementById('benchSkillDropdown');
  if (dd && !dd.classList.contains('hidden') && !document.getElementById('benchSkillBtn').contains(e.target)) {
    dd.classList.add('hidden');
  }
});

// Assign mode segment
document.getElementById('assignModeSeg').addEventListener('click', e => {
  const btn = e.target.closest('.amseg-btn[data-amode]');
  if (!btn) return;
  state.assignMode = btn.dataset.amode;
  document.querySelectorAll('.amseg-btn').forEach(b => b.classList.toggle('active', b === btn));
  try { localStorage.setItem('wfm_assignMode', state.assignMode); } catch(e){}
  render();
});

// Allowance checkbox
document.getElementById('showAllowanceCheck').addEventListener('change', function() {
  state.showAllowance = this.checked;
  try { localStorage.setItem('wfm_showAllowance', this.checked); } catch(e){}
  render();
});

// Checkbox persistence
(function(){
  const tb = document.getElementById('showTotalBar');
  const mb = document.getElementById('showMonthBg');
  try {
    if (localStorage.getItem('wfm_showTotalBar') === 'false') { tb.checked = false; document.getElementById('grid-container').classList.add('hide-total-bar'); }
    if (localStorage.getItem('wfm_showMonthBg') === 'true') { mb.checked = true; document.getElementById('grid-container').classList.add('show-month-bg'); }
    // Restore assign mode
    const savedMode = localStorage.getItem('wfm_assignMode');
    if (savedMode && ['actual','plan','both'].includes(savedMode)) {
      state.assignMode = savedMode;
      document.querySelectorAll('.amseg-btn').forEach(b => b.classList.toggle('active', b.dataset.amode === savedMode));
    }
    // Restore allowance toggle
    if (localStorage.getItem('wfm_showAllowance') === 'true') {
      state.showAllowance = true;
      document.getElementById('showAllowanceCheck').checked = true;
    }
  } catch(e){}
})();
document.getElementById('showTotalBar').addEventListener('change', function() {
  document.getElementById('grid-container').classList.toggle('hide-total-bar', !this.checked);
  try { localStorage.setItem('wfm_showTotalBar', this.checked); } catch(e){}
});
document.getElementById('showMonthBg').addEventListener('change', function() {
  document.getElementById('grid-container').classList.toggle('show-month-bg', this.checked);
  try { localStorage.setItem('wfm_showMonthBg', this.checked); } catch(e){}
});

// Project filter
function _initProjFilter() {
  const sel = document.getElementById('projFilter');
  while (sel.options.length > 1) sel.remove(1);
  DATA.projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
}
document.getElementById('projFilter').addEventListener('change', function() {
  state.projectFilter = this.value;
  _updateFilterClear();
  render();
});

// Annual sparkline tooltip
(function(){
  const tt = document.getElementById('spark-tooltip');
  document.getElementById('grid-container').addEventListener('mouseover', e => {
    const cell = e.target.closest('[data-spark-name]');
    if (!cell) return;
    tt.innerHTML = `<div class="tt-name">${cell.dataset.sparkName}</div>
      <div class="tt-row"><span>투입 합계</span><span class="tt-val">${cell.dataset.sparkTotal} MM</span></div>
      <div class="tt-row"><span>가용</span><span class="tt-val">${cell.dataset.sparkAvail}</span></div>
      <div class="tt-row"><span style="color:#4DB36A">정상 월</span><span class="tt-val">${cell.dataset.sparkOk}개월</span></div>
      <div class="tt-row"><span style="color:#E85C4A">초과 월</span><span class="tt-val">${cell.dataset.sparkOver}개월</span></div>
      <div class="tt-row"><span style="color:#F5A623">여유 월</span><span class="tt-val">${cell.dataset.sparkUnder}개월</span></div>`;
    tt.style.display = 'block';
  });
  document.getElementById('grid-container').addEventListener('mousemove', e => {
    if (!document.querySelector('[data-spark-name]:hover')) return;
    const tw = tt.offsetWidth || 180, th = tt.offsetHeight || 120;
    const left = e.clientX + 14 + tw > window.innerWidth  ? e.clientX - tw - 8 : e.clientX + 14;
    const top  = e.clientY - 10 + th > window.innerHeight ? e.clientY - th + 10 : e.clientY - 10;
    tt.style.left = left + 'px';
    tt.style.top  = Math.max(4, top) + 'px';
  });
  document.getElementById('grid-container').addEventListener('mouseout', e => {
    if (!e.target.closest('[data-spark-name]')) return;
    tt.style.display = 'none';
  });
})();

// Grid delegation
document.getElementById('grid-container').addEventListener('click', e => {
  // Delete assignment button on bar hover
  const delBtn = e.target.closest('[data-del-assign]');
  if (delBtn) {
    e.stopPropagation();
    const {mid, pid, y, mo} = JSON.parse(delBtn.dataset.delAssign);
    const mem = getMember(mid); const pj = getProject(pid);
    // Inline confirm: replace bar content temporarily
    const bar = delBtn.closest('.proj-bar');
    if (!bar) return;
    if (bar.dataset.confirming) {
      DataAPI.deleteAssignment(mid, pid, y, mo);
      render();
    } else {
      bar.dataset.confirming = '1';
      const prev = bar.innerHTML;
      bar.innerHTML = `<span style="font-size:9px;flex:1;white-space:nowrap">${mo}월 삭제?</span>
        <span data-confirm-ok style="font-size:9px;font-weight:700;cursor:pointer;padding:0 3px;background:rgba(255,255,255,.3);border-radius:3px">✓</span>
        <span data-confirm-cancel style="font-size:9px;cursor:pointer;padding:0 3px;opacity:.7">✕</span>`;
      bar.querySelector('[data-confirm-ok]').onclick = e2 => {
        e2.stopPropagation();
        clearTimeout(bar._delTimer);
        DataAPI.deleteAssignment(mid, pid, y, mo);
        render();
      };
      bar.querySelector('[data-confirm-cancel]').onclick = e2 => {
        e2.stopPropagation();
        clearTimeout(bar._delTimer);
        delete bar.dataset.confirming;
        bar.innerHTML = prev;
      };
      bar._delTimer = setTimeout(() => {
        if (bar.dataset.confirming) { delete bar.dataset.confirming; bar.innerHTML = prev; }
      }, 3000);
    }
    return;
  }

  // Project bar → open member assign form for editing
  const bar = e.target.closest('.proj-bar[data-member]');
  if (bar) { e.stopPropagation(); openMemberAssignForm(bar.dataset.project, bar.dataset.member); return; }

  // Month header click → switch to month view
  const benchMo = e.target.closest('[data-bench-mo]');
  if (benchMo && state.viewMode==='bench') { state.benchMonth = parseInt(benchMo.dataset.benchMo); renderBenchView(); return; }

// Bulk assign button
  const bulkBtn = e.target.closest('[data-bulk]');
  if (bulkBtn) { e.stopPropagation(); openBulkModal(bulkBtn.dataset.bulk); return; }

// Member cell click → member panel
  const memCell = e.target.closest('.member-cell');
  if (memCell) { e.stopPropagation(); renderMemberPanel(memCell.dataset.member); return; }

  // Allowance cell click → toggle
  const allowCell = e.target.closest('.allow-cell[data-allow-member]');
  if (allowCell) {
    e.stopPropagation();
    DataAPI.toggleAllowance(allowCell.dataset.allowMember, state.year, parseInt(allowCell.dataset.allowMonth));
    render();
    return;
  }

  // Assign cell click → unified member assign form
  const assignCell = e.target.closest('.assign-cell');
  if (assignCell) {
    const mid = assignCell.dataset.member;
    const mo  = parseInt(assignCell.dataset.month);
    const existAs = getAssignments(mid, state.year, mo);
    const firstProjId = existAs.length > 0 ? existAs[0].projectId : null;
    openMemberAssignForm(firstProjId, mid);
  }
});

// Bottom panels
document.getElementById('overlay').onclick = closeBottomPanels;
document.getElementById('projClose').onclick  = closeBottomPanels;
document.getElementById('memClose').onclick   = closeBottomPanels;
document.getElementById('projHandle').onclick = closeBottomPanels;
document.getElementById('memHandle').onclick  = closeBottomPanels;

// Panel edit buttons (delegated)
['projectPanel','memberPanel'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    const ea = e.target.closest('[data-edit-assign]');
    if (ea) { openMemberAssignForm(ea.dataset.assignProject, ea.dataset.editAssign); return; }
    const ap = e.target.closest('[data-assign-project]');
    if (ap && !ap.dataset.editAssign) { openMemberAssignForm(ap.dataset.assignProject); return; }
    const ep = e.target.closest('[data-edit-project]');
    if (ep) { closeBottomPanels(); openProjectForm(ep.dataset.editProject); return; }
    const em = e.target.closest('[data-edit-member]');
    if (em) { closeBottomPanels(); openMemberForm(em.dataset.editMember); return; }
    const pr = e.target.closest('[data-project]');
    if (pr) { renderProjectPanel(pr.dataset.project); }
  });
});

// Drawer
document.getElementById('btnMgmt').onclick     = openDrawer;
document.getElementById('mgmtClose').onclick   = closeDrawer;
document.getElementById('drawerOverlay').onclick = closeDrawer;

document.querySelector('.drawer-tabs').addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (!tab) return;
  state.mgmtTab = tab.dataset.tab;
  document.querySelectorAll('.dtab').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.mgmtTab));
  renderDrawerContent();
});

document.getElementById('drawerBody').addEventListener('click', e => {
  const editM = e.target.closest('[data-edit-member]');
  if (editM) { openMemberForm(editM.dataset.editMember); return; }
  const delM = e.target.closest('[data-del-member]');
  if (delM) {
    confirmable(delM, () => {
      state.formMode = {type:'member', id: delM.dataset.delMember};
      deleteMemberConfirm();
    }, { label: '삭제', color: '#fff' });
    return;
  }
  const editP = e.target.closest('[data-edit-project]');
  if (editP) { openProjectForm(editP.dataset.editProject); return; }
  const delP = e.target.closest('[data-del-project]');
  if (delP) {
    confirmable(delP, () => {
      state.formMode = {type:'project', id: delP.dataset.delProject};
      deleteProjectConfirm();
    }, { label: '삭제', color: '#fff' });
  }
});

document.getElementById('btnReset').onclick = async () => {
  if (!confirm('샘플 데이터로 초기화하시겠습니까? 현재 변경 내용이 모두 삭제됩니다.')) return;
  await DataAPI.reset();
  _initProjFilter();
  closeDrawer();
  render();
};

// Form modal
document.getElementById('formSaveBtn').onclick = () => {
  if (state.formMode?.type==='member')  saveMemberForm();
  else if (state.formMode?.type==='project') saveProjectForm();
  else if (state.formMode?.type==='memberAssign') saveMemberAssignForm();
};
document.getElementById('formDeleteBtn').onclick = function() {
  const btn = this;
  confirmable(btn, () => {
    if (state.formMode?.type==='member')  deleteMemberConfirm();
    else if (state.formMode?.type==='project') deleteProjectConfirm();
    else if (state.formMode?.type==='memberAssign') {
      const editMemberId = document.getElementById('maFMember')?.value;
      const projectId    = document.getElementById('maFProject')?.value || state.formMode?.id;
      if (editMemberId && projectId) {
        const s = _maForm.start === null ? 1 : Math.min(_maForm.start, _maForm.end ?? _maForm.start);
        const e = _maForm.end   === null ? 12 : Math.max(_maForm.start ?? 1, _maForm.end);
        for (let m = s; m <= e; m++) DataAPI.deleteAssignment(editMemberId, projectId, state.year, m);
      }
      closeFormModal(); render();
    }
  });
};
document.getElementById('formCancelBtn').onclick = closeFormModal;
document.getElementById('formClose').onclick     = closeFormModal;

// Bulk assign modal
document.getElementById('bulkClose').onclick = () => document.getElementById('bulkModal').classList.add('hidden');
document.getElementById('bulkCancelBtn').onclick = () => document.getElementById('bulkModal').classList.add('hidden');
document.getElementById('bulkSaveBtn').onclick = saveBulkModal;
document.addEventListener('mouseup', e => {
  if (_bulk.dragging) {
    if (!_bulk.dragMoved) {
      const c = e.target.closest?.('.bulk-mcell');
      if (c && c.classList.contains('selected') && c.closest('#bulkTrack')) {
        const m = +c.dataset.m, cur = _bulk.mmVals[m]??1.0;
        const idx = MM_CYCLE_BULK.indexOf(cur);
        _bulk.mmVals[m] = MM_CYCLE_BULK[(idx+1)%MM_CYCLE_BULK.length];
        renderBulkModal();
      }
    }
    _bulk.dragging = false; _bulk.dragMoved = false;
  }
  if (_maForm.dragging) {
    if (!_maForm.dragMoved) {
      const c = e.target.closest?.('.bulk-mcell');
      if (c && c.classList.contains('selected') && c.dataset.row === 'plan' && c.closest('#maFTrack')) {
        const m = +c.dataset.m, cur = _maForm.mmVals[m]??1.0;
        const idx = MM_CYCLE_BULK.indexOf(cur);
        _maForm.mmVals[m] = MM_CYCLE_BULK[(idx+1)%MM_CYCLE_BULK.length];
        renderMAFormTrack();
      }
    }
    _maForm.dragging = false; _maForm.dragMoved = false;
  }
  if (_maForm.actDragging) {
    if (!_maForm.actDragMoved) {
      const c = e.target.closest?.('.bulk-mcell');
      if (c && c.dataset.row === 'act' && c.closest('#maFTrack')) {
        const m = +c.dataset.m, cur = _maForm.actualVals[m] || 0;
        const idx = MM_CYCLE_BULK.indexOf(cur);
        _maForm.actualVals[m] = MM_CYCLE_BULK[(idx+1)%MM_CYCLE_BULK.length];
        renderMAFormTrack();
      }
    }
    _maForm.actDragging = false; _maForm.actDragMoved = false;
  }
});

// Assign modal
document.getElementById('assignClose').onclick = () => {
  document.getElementById('assignModal').classList.add('hidden');
  state.assignCtx = null;
};

// Escape key
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeBottomPanels();
  closeFormModal();
  closeDrawer();
  document.getElementById('assignModal').classList.add('hidden');
});

// Theme toggle
function _applyTheme(theme) {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    btn.textContent = '☾';
    btn.title = '라이트모드';
  } else {
    root.setAttribute('data-theme', 'light');
    btn.textContent = '☀';
    btn.title = '다크모드';
  }
  state.theme = theme;
  try { localStorage.setItem('wfm_theme', theme); } catch(e) {}
}
document.getElementById('themeToggle').onclick = () => {
  _applyTheme(state.theme === 'dark' ? 'light' : 'dark');
};

// ─── Export ───
function _exportPng() {
  const isDark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const C = isDark
    ? { bg:'#1a1d21', bgAlt:'#22262c', bgSurf:'#2a2f38', border:'#2e3138', text:'#e8eaf0', textM:'#8b90a0', accent:'#5b8ef5' }
    : { bg:'#f4f6fc', bgAlt:'#ffffff', bgSurf:'#ffffff', border:'#e0e3ec', text:'#1a1d21', textM:'#6b7280', accent:'#3d6feb' };

  const year = state.year;
  const members = DATA.members.filter(m => {
    const ys = (typeof m.start === 'string' && m.start) ? parseInt(m.start.slice(0,4)) : null;
    const ye = (typeof m.end   === 'string' && m.end)   ? parseInt(m.end.slice(0,4))   : null;
    if (ys && year < ys) return false;
    if (ye && year > ye) return false;
    return true;
  });

  const SC = 2; // scale
  const MH = 20, RH = 36, HH = 28; // month header, row height, header height
  const CW = 170, MW = 54, AW = 52;  // member col, month col, avail col
  const W = CW + MW*12 + AW;
  const H = HH + members.length * RH + 1;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SC;
  canvas.height = H * SC;
  const ctx = canvas.getContext('2d');
  ctx.scale(SC, SC);

  // background
  ctx.fillStyle = C.bgAlt;
  ctx.fillRect(0, 0, W, H);

  // header row
  ctx.fillStyle = C.bgSurf;
  ctx.fillRect(0, 0, W, HH);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(0, HH); ctx.lineTo(W, HH); ctx.stroke();

  ctx.fillStyle = C.textM;
  ctx.font = `600 10px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const MONTHS_KR = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  for (let m=0; m<12; m++) {
    const x = CW + m*MW + MW/2;
    ctx.fillText(MONTHS_KR[m], x, HH/2);
  }
  ctx.fillText('연간가용', CW + 12*MW + AW/2, HH/2);
  ctx.fillStyle = C.text;
  ctx.textAlign = 'left';
  ctx.fillText('멤버', 12, HH/2);

  // rows
  members.forEach((mem, ri) => {
    const ry = HH + ri * RH;
    // row bg
    ctx.fillStyle = ri%2===0 ? C.bgAlt : C.bg;
    ctx.fillRect(0, ry, W, RH);
    // bottom border
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, ry+RH); ctx.lineTo(W, ry+RH); ctx.stroke();

    // member avatar
    ctx.fillStyle = mem.color;
    ctx.beginPath();
    ctx.arc(18, ry+RH/2, 11, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 8px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText((mem.name||'').slice(0,2), 18, ry+RH/2+1);

    // member name
    ctx.fillStyle = C.text;
    ctx.font = `600 12px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(mem.name, 34, ry+RH/2-4);
    ctx.fillStyle = C.textM;
    ctx.font = `400 10px "Noto Sans KR", sans-serif`;
    ctx.fillText(mem.role, 34, ry+RH/2+7);

    // month col vertical borders
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(CW, ry); ctx.lineTo(CW, ry+RH); ctx.stroke();

    // month cells
    let monthlyTotals = [];
    for (let m=1; m<=12; m++) {
      const cx = CW + (m-1)*MW;
      // vertical separator
      if (m>1) { ctx.beginPath(); ctx.moveTo(cx, ry); ctx.lineTo(cx, ry+RH); ctx.stroke(); }

      const assigns = getAssignments(mem.id, year, m);
      const total = Math.round(assigns.reduce((s,a)=>s+a.mm,0)*100)/100;
      monthlyTotals.push(total);

      if (assigns.length > 0) {
        const barH = Math.max(4, Math.min(RH-6, Math.round((RH-6) / assigns.length)));
        let by = ry+3;
        assigns.forEach(a => {
          const proj = DATA.projects.find(p=>p.id===a.projectId);
          if (!proj) return;
          const alpha = a.mm >= 1.0 ? 1.0 : a.mm >= 0.75 ? 0.78 : a.mm >= 0.5 ? 0.58 : 0.38;
          const r=parseInt(proj.color.slice(1,3),16), g=parseInt(proj.color.slice(3,5),16), b=parseInt(proj.color.slice(5,7),16);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath();
          ctx.roundRect(cx+2, by, MW-4, barH-1, 2);
          ctx.fill();
          // mm label
          if (barH >= 10) {
            ctx.fillStyle = alpha > 0.6 ? '#fff' : C.text;
            ctx.font = `700 9px "Noto Sans KR", sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(a.mm, cx+MW/2, by+barH/2);
          }
          by += barH;
        });
      }
    }

    // annual avail col
    const ax = CW + 12*MW;
    ctx.beginPath(); ctx.moveTo(ax, ry); ctx.lineTo(ax, ry+RH); ctx.stroke();
    const annualAvail = Math.round((monthlyTotals.reduce((s,v)=>s+v,0)-12)*10)/10;
    const numLabel = annualAvail===0 ? 'FULL' : `${annualAvail>0?'+':''}${annualAvail.toFixed(1)}`;
    ctx.fillStyle = annualAvail>0 ? '#c62828' : annualAvail<0 ? C.accent : '#2e7d32';
    ctx.font = `700 10px "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(numLabel, ax+AW/2, ry+RH/2);
  });

  // outer border
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, W, H);

  const a = document.createElement('a');
  a.download = `WFM_${year}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function _exportPdf() {
  const table = document.querySelector('.year-table');
  if (!table) return;
  const isDark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const bg = isDark ? '#1a1d21' : '#ffffff';
  const fg = isDark ? '#e8eaf0' : '#1a1d21';
  const border = isDark ? '#2e3138' : '#e0e3ec';
  const html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<title>WFM ' + state.year + '년 투입 현황</title>',
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600&display=swap" rel="stylesheet">',
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"Noto Sans KR",sans-serif;background:' + bg + ';color:' + fg + ';padding:16px}',
    'h2{font-size:14px;font-weight:600;margin-bottom:10px}',
    'table{border-collapse:collapse;width:100%;font-size:11px}',
    'th,td{border:1px solid ' + border + ';padding:4px 6px;text-align:center;white-space:nowrap}',
    'th{font-weight:600;background:' + (isDark ? '#22262c' : '#f4f6fc') + '}',
    '.annual-spark,.annual-spark-bar{display:none}',
    '.member-cell{text-align:left}',
    '.assign-cell,.assign-bars,.proj-bar{display:block}',
    '.proj-bar{padding:2px 4px;border-radius:3px;font-size:10px;margin-bottom:1px}',
    '@page{size:A3 landscape;margin:12mm}',
    '@media print{body{padding:0}}',
    '</style></head><body>',
    '<h2>WFM ' + state.year + '년 투입 현황</h2>',
    table.outerHTML,
    '<script>window.onload=function(){window.print();}<' + '/script>',
    '</body></html>'
  ].join('');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const _exportDropdown = document.getElementById('exportDropdown');
document.getElementById('exportBtn').onclick = e => {
  e.stopPropagation();
  _exportDropdown.classList.toggle('hidden');
};
document.getElementById('exportPng').onclick = () => { _exportDropdown.classList.add('hidden'); _exportPng(); };
document.getElementById('exportPdf').onclick = () => { _exportDropdown.classList.add('hidden'); _exportPdf(); };
document.addEventListener('click', e => {
  if (!e.target.closest('#exportWrap')) _exportDropdown.classList.add('hidden');
});

// ─── Init ───
(async function() {
  try {
    const saved = localStorage.getItem('wfm_theme');
    if (saved === 'dark' || saved === 'light') _applyTheme(saved);
  } catch(e) {}
  await _checkAuth();
  await loadData();
  _initProjFilter();
  render();
})();
