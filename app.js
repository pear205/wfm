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
function getTotalMM(memberId, year, month) {
  return getAssignments(memberId, year, month).reduce((s,a) => s+a.mm, 0);
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
  const totalMM = as.reduce((s,a) => s+a.mm, 0);
  const projectIds = [...new Set(as.map(a => a.projectId))];
  const monthlyMM = Array.from({length:12}, (_,i) =>
    DATA.assignments.filter(a => a.memberId===memberId && a.year===year && a.month===i+1)
      .reduce((s,a)=>s+a.mm,0)
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
    const mo = DATA.members.reduce((s,mem) => s + getAssignments(mem.id,year,m).reduce((ss,a)=>ss+a.mm,0), 0);
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

  let html = `<div class="kpi-panel"><div class="kpi-cards">
    <div class="kpi-card"><div class="kpi-card__label">연간 팀 M/M</div><div class="kpi-card__value" style="color:${_totalCol}">${_teamTotal.toFixed(1)}</div></div>
    <div class="kpi-card"><div class="kpi-card__label">평균 가동률</div><div class="kpi-card__value">${_utilPct}%</div></div>
    <div class="kpi-card"><div class="kpi-card__label">초과 투입 월</div><div class="kpi-card__value" style="color:${_overMo>0?'var(--over)':'var(--text-s)'}">${_overMo}</div></div>
    <div class="kpi-card"><div class="kpi-card__label">연간 여유 M/M</div><div class="kpi-card__value" style="color:${_availDispCol}">${_teamAvailFmt}</div></div>
  </div></div>
  <table class="year-table"><thead>${sumRow}<tr>
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
        html += `<div class="proj-bar ${a.type==='비상주'?'biju':''}"
          style="background:${pj.color};color:#fff;border-radius:${rl}px ${rr}px ${rr}px ${rl}px"
          data-project="${pj.id}" data-assign='${assignKey}'
          title="${esc(pj.name)} · ${a.mm.toFixed(2)} M/M · ${a.type} — 클릭하여 공수 수정" data-member="${mem.id}">
          ${isFirst ? `<span class="proj-bar-name">${esc(pj.name)}</span>` : ''}
          <span class="proj-bar-mm" style="font-size:10px${!isFirst?';flex:1;text-align:center':''}">${fmtMM(a.mm)}</span>
          <span class="proj-bar-del" data-del-assign='${assignKey}' title="공수 삭제">✕</span>
        </div>`;
      }
      html += `</div></td>`;
    }
    // 연간 가용 컬럼
    const monthlyTotals = Array.from({length:12},(_,i)=>
      Math.round(getAssignments(mem.id,year,i+1).reduce((s,a)=>s+a.mm,0)*100)/100
    );
    const annualAvail = Math.round((12 - monthlyTotals.reduce((s,v)=>s+v,0))*10)/10;
    const spark = monthlyTotals.map(v=>{
      const pct = Math.min(v/1.0, 1.5);
      const h = Math.max(2, Math.round(pct*16));
      const col = v===0?'#F5A623': v>1.0?'#E85C4A': v>=1.0?'#4DB36A':'var(--accent)';
      return `<div class="annual-spark-bar" style="height:${h}px;background:${col}"></div>`;
    }).join('');
    const numCol = annualAvail>0?'var(--text-p)':annualAvail<0?'#c62828':'#2e7d32';
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
  });

  html += `</tbody></table>`;
  document.getElementById('grid-container').innerHTML = html;
}



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

  let html = `<div class="bench-outer">`;

  // 상단 요약 + 가용인력 패널
  const availItems = selData.filter(d=>d.avail>0);
  html += `<div class="kpi-panel">
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

function renderDrawerContent() {
  const tab = state.mgmtTab;
  const body = document.getElementById('drawerBody');

  if (tab === 'members') {
    let items = DATA.members.map(mem => `
      <div class="mgmt-item">
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
    body.innerHTML = `<div class="mgmt-list">${items}</div>
      <button class="mgmt-add-btn" id="addMemberBtn">+ 멤버 추가</button>`;
    document.getElementById('addMemberBtn').onclick = () => openMemberForm(null);

  } else {
    let items = DATA.projects.map(pj => {
      const s = STATUS_KR[pj.status]||esc(pj.status);
      return `<div class="mgmt-item">
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
    body.innerHTML = `<div class="mgmt-list">${items}</div>
      <button class="mgmt-add-btn" id="addProjectBtn">+ 프로젝트 추가</button>`;
    document.getElementById('addProjectBtn').onclick = () => openProjectForm(null);
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
function openMemberAssignForm(projectId, editMemberId) {
  state.formMode = {type:'memberAssign', id: projectId, editMemberId: editMemberId||null};
  const pj = getProject(projectId);
  document.getElementById('formTitle').textContent = `멤버 투입 · ${pj?.name||''}`;
  document.getElementById('formDeleteBtn').classList.add('hidden');

  const memberOpts = DATA.members.map(m =>
    `<option value="${m.id}">${m.name} (${m.role})</option>`).join('');

  // Existing assignments for this member+project+year (for edit mode)
  let existingMMs = {};
  let existingTypes = {};
  let existingType = '상주';
  if (editMemberId) {
    const existAs = DATA.assignments.filter(a =>
      a.memberId === editMemberId && a.projectId === projectId && a.year === state.year);
    existAs.forEach(a => { existingMMs[a.month] = a.mm; existingTypes[a.month] = a.type; });
    if (existAs.length) existingType = existAs[0].type;
  }

  // Parse project start/end to suggest month range
  const [pStartY, pStartM] = (pj?.start||`${state.year}-01`).split('-').map(Number);
  const [pEndY,   pEndM  ] = (pj?.end  ||`${state.year}-12`).split('-').map(Number);
  let defStart = pStartY === state.year ? pStartM : (pEndY === state.year ? 1 : 1);
  let defEnd   = pEndY   === state.year ? pEndM   : (pStartY === state.year ? 12 : 12);
  // In edit mode, use actual assignment range
  if (editMemberId && Object.keys(existingMMs).length) {
    const months = Object.keys(existingMMs).map(Number);
    defStart = Math.min(...months);
    defEnd   = Math.max(...months);
  }

  const monthOpts = Array.from({length:12},(_,i) =>
    `<option value="${i+1}">${i+1}월</option>`).join('');

  document.getElementById('formContent').innerHTML = `
    <div class="form-group">
      <label class="form-label">멤버</label>
      <select class="form-select" id="maFMember">${memberOpts}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">시작 월</label>
        <select class="form-select" id="maFStart">${monthOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">종료 월</label>
        <select class="form-select" id="maFEnd">${monthOpts}</select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:4px">
      <label class="form-label">유형 <span style="color:var(--text-m);font-size:10px;font-weight:400">— 일괄 적용</span></label>
      <div style="display:flex;gap:8px;padding-top:2px;align-items:center">
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
          <input type="radio" name="maFType" value="상주" ${existingType==='상주'?'checked':''}> 상주
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer">
          <input type="radio" name="maFType" value="비상주" ${existingType==='비상주'?'checked':''}> 비상주
        </label>
        <button class="ma-bulk-btn" id="maTypeBulkBtn" style="margin-left:4px">적용</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">월별 M/M</label>
      <div class="ma-bulk-row">
        <span class="ma-bulk-label">일괄:</span>
        <button class="ma-bulk-qbtn" data-bulk="1.0">1</button>
        <button class="ma-bulk-qbtn" data-bulk="0.75">0.75</button>
        <button class="ma-bulk-qbtn" data-bulk="0.5">0.5</button>
        <button class="ma-bulk-qbtn" data-bulk="0.25">0.25</button>
        <input class="ma-bulk-input" id="maBulkVal" type="number" min="0.05" max="2" step="0.05" value="1.0">
        <button class="ma-bulk-btn" id="maBulkBtn">적용</button>
      </div>
      <div class="ma-month-grid" id="maMonthGrid"></div>
    </div>`;

  const startSel = document.getElementById('maFStart');
  const endSel   = document.getElementById('maFEnd');
  startSel.value = defStart;
  endSel.value   = defEnd;
  if (editMemberId) document.getElementById('maFMember').value = editMemberId;

  if (editMemberId) {
    const formDeleteBtn = document.getElementById('formDeleteBtn');
    formDeleteBtn.classList.remove('hidden');
    formDeleteBtn.style.display = '';
  }

  function refreshGrid() {
    const s = parseInt(startSel.value);
    const e = parseInt(endSel.value);
    if (e < s) { endSel.value = s; }
    const start = parseInt(startSel.value);
    const end   = parseInt(endSel.value);
    const grid  = document.getElementById('maMonthGrid');
    if (!grid) return;
    // Preserve existing values
    const existing = {};
    grid.querySelectorAll('.ma-month-input').forEach(inp => {
      existing[inp.dataset.month] = inp.value;
    });
    grid.innerHTML = Array.from({length: end - start + 1}, (_, i) => {
      const m = start + i;
      const val = existing[m] || (existingMMs[m] != null ? existingMMs[m] : '1.0');
      const fv = parseFloat(val);
      const a1 = fv===1.0?'active':'', a15 = fv===0.75?'active':'', a2 = fv===0.5?'active':'', a3 = fv===0.25?'active':'';
      const existT = existingTypes[m] || '상주';
      const tA = existT==='상주'?'active':'', tB = existT==='비상주'?'active':'';
      return `<div class="ma-month-cell">
        <div class="ma-month-label">${m}월</div>
        <div class="ma-mm-btns">
          <button class="ma-mm-btn ${a1}" data-cell="${m}" data-val="1.0">1</button>
          <button class="ma-mm-btn ${a15}" data-cell="${m}" data-val="0.75">0.75</button>
          <button class="ma-mm-btn ${a2}" data-cell="${m}" data-val="0.5">0.5</button>
          <button class="ma-mm-btn ${a3}" data-cell="${m}" data-val="0.25">0.25</button>
        </div>
        <input class="ma-month-input" type="number" min="0.05" max="2" step="0.05" value="${val}" data-month="${m}" data-year="${state.year}"
          oninput="this.closest('.ma-month-cell')?.querySelectorAll('.ma-mm-btn').forEach(b=>b.classList.toggle('active', parseFloat(b.dataset.val)===parseFloat(this.value)))">
        <div class="ma-type-btns">
          <button class="ma-type-btn ${tA}" data-cell="${m}" data-type="상주">상주</button>
          <button class="ma-type-btn ${tB}" data-cell="${m}" data-type="비상주">비상주</button>
        </div>
        <input type="hidden" class="ma-month-type" data-month="${m}" value="${existT}">
      </div>`;
    }).join('');

  }

  startSel.addEventListener('change', refreshGrid);
  endSel.addEventListener('change', refreshGrid);

  // Single delegated listener on grid (grid element persists across refreshGrid calls)
  document.getElementById('maMonthGrid').addEventListener('click', ev => {
    const g = document.getElementById('maMonthGrid');
    const mmBtn = ev.target.closest('.ma-mm-btn[data-cell]');
    if (mmBtn) {
      const m = mmBtn.dataset.cell;
      const inp = g.querySelector(`.ma-month-input[data-month="${m}"]`);
      if (inp) inp.value = mmBtn.dataset.val;
      g.querySelectorAll(`.ma-mm-btn[data-cell="${m}"]`).forEach(b =>
        b.classList.toggle('active', b === mmBtn));
      return;
    }
    const typeBtn = ev.target.closest('.ma-type-btn[data-cell]');
    if (typeBtn) {
      const m = typeBtn.dataset.cell;
      const t = typeBtn.dataset.type;
      const hidden = g.querySelector(`.ma-month-type[data-month="${m}"]`);
      if (hidden) hidden.value = t;
      g.querySelectorAll(`.ma-type-btn[data-cell="${m}"]`).forEach(b =>
        b.classList.toggle('active', b === typeBtn));
    }
  });

  document.getElementById('maBulkBtn').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('maBulkVal').value) || 1.0;
    document.querySelectorAll('.ma-month-input').forEach(inp => { inp.value = v.toFixed(2).replace(/\.?0+$/,'') || v; });
    document.querySelectorAll('.ma-mm-btn[data-cell]').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.val) === v);
    });
  });

  document.getElementById('maTypeBulkBtn').addEventListener('click', () => {
    const t = document.querySelector('input[name="maFType"]:checked')?.value || '상주';
    document.querySelectorAll('.ma-month-type').forEach(inp => { inp.value = t; });
    document.querySelectorAll('.ma-type-btn[data-cell]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === t);
    });
  });

  // Bulk quick buttons
  document.querySelectorAll('.ma-bulk-qbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = parseFloat(btn.dataset.bulk);
      document.getElementById('maBulkVal').value = v;
      document.querySelectorAll('.ma-month-input').forEach(inp => { inp.value = v; });
      document.querySelectorAll('.ma-mm-btn[data-cell]').forEach(b => {
        b.classList.toggle('active', parseFloat(b.dataset.val) === v);
      });
    });
  });

  refreshGrid();
  document.getElementById('formModal').classList.remove('hidden');
}

function saveMemberAssignForm() {
  const memberId  = document.getElementById('maFMember')?.value;
  const startM    = parseInt(document.getElementById('maFStart')?.value);
  const endM      = parseInt(document.getElementById('maFEnd')?.value);
  const projectId = state.formMode?.id;
  if (!memberId || !projectId) return;
  const year = state.year;
  document.querySelectorAll('.ma-month-input').forEach(inp => {
    const month = parseInt(inp.dataset.month);
    const mm    = parseFloat(inp.value);
    if (isNaN(mm) || mm <= 0) return;
    const typeInp = document.querySelector(`.ma-month-type[data-month="${month}"]`);
    const type = typeInp?.value || '상주';
    DataAPI.setAssignment(memberId, projectId, year, month, mm, type);
  });
  closeFormModal();
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
  const total = as.reduce((s,a)=>s+a.mm, 0);

  // Current assignments list
  let listHtml = '';
  if (as.length > 0) {
    listHtml = as.map(a => {
      const pj = getProject(a.projectId);
      if (!pj) return '';
      return `<div class="assign-item">
        <div class="assign-item-dot" style="background:${pj.color}"></div>
        <div style="flex:1">
          <div class="assign-item-name">${esc(pj.name)}</div>
          <div class="assign-item-info">${esc(pj.client)} · ${esc(a.type)} · <b style="font-family:'JetBrains Mono',monospace">${a.mm.toFixed(2)} M/M</b></div>
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
        <label class="form-label">M/M</label>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="ma-mm-btn" data-amm="1.0">1</button>
          <button class="ma-mm-btn" data-amm="0.75">0.75</button>
          <button class="ma-mm-btn" data-amm="0.5">0.5</button>
          <button class="ma-mm-btn" data-amm="0.25">0.25</button>
          <input class="ma-bulk-input" type="number" min="0.05" max="2" step="0.05" value="1.00" id="newAssignMM" style="flex:1;min-width:56px">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">유형</label>
        <div class="form-radio-group" style="height:36px">
          <label class="form-radio-label"><input type="radio" name="assignType" value="상주" checked> 상주</label>
          <label class="form-radio-label"><input type="radio" name="assignType" value="비상주"> 비상주</label>
        </div>
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
    const pid  = document.getElementById('newAssignProject').value;
    const mm   = parseFloat(document.getElementById('newAssignMM').value) || 1.0;
    const type = document.querySelector('input[name="assignType"]:checked').value;
    DataAPI.setAssignment(memberId, pid, year, month, mm, type);
    renderAssignModal();
    render();
  };

  // Edit existing (click edit button → pre-fill form)
  document.getElementById('assignBody').querySelectorAll('[data-assign-edit]').forEach(btn => {
    btn.onclick = () => {
      const pid = btn.dataset.assignEdit;
      const existing = as.find(a=>a.projectId===pid);
      if (!existing) return;
      document.getElementById('newAssignProject').value = pid;
      document.getElementById('newAssignMM').value = existing.mm;
      document.getElementById('assignBody').querySelectorAll('[data-amm]').forEach(b =>
        b.classList.toggle('active', parseFloat(b.dataset.amm) === existing.mm));
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

  const filterBar = document.getElementById('filterBar');
  const benchFilterBar = document.getElementById('benchFilterBar');
  if (state.viewMode === 'year') {
    filterBar.classList.remove('hidden');
    benchFilterBar.classList.add('hidden');
  } else {
    filterBar.classList.add('hidden');
    benchFilterBar.classList.remove('hidden');
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
  if (state.viewMode==='bench') renderBenchView();
  else                         renderYearView();
}

// ═══════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════
// Year nav
document.getElementById('prevYear').onclick = () => { state.year--; render(); };
document.getElementById('nextYear').onclick = () => { state.year++; render(); };

// View toggle
document.getElementById('btnYear').onclick  = () => switchView('year');
document.getElementById('btnBench').onclick = () => switchView('bench');

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

// Checkbox persistence
(function(){
  const tb = document.getElementById('showTotalBar');
  const mb = document.getElementById('showMonthBg');
  try {
    if (localStorage.getItem('wfm_showTotalBar') === 'false') { tb.checked = false; document.getElementById('grid-container').classList.add('hide-total-bar'); }
    if (localStorage.getItem('wfm_showMonthBg') === 'true') { mb.checked = true; document.getElementById('grid-container').classList.add('show-month-bg'); }
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

// Member cell click → member panel
  const memCell = e.target.closest('.member-cell');
  if (memCell) { e.stopPropagation(); renderMemberPanel(memCell.dataset.member); return; }

  // Assign cell click → assignment modal
  const assignCell = e.target.closest('.assign-cell');
  if (assignCell) {
    openAssignModal(assignCell.dataset.member, state.year, parseInt(assignCell.dataset.month));
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
    else if (state.formMode?.type==='memberAssign' && state.formMode.editMemberId) {
      const { editMemberId, id: projectId } = state.formMode;
      document.querySelectorAll('.ma-month-input').forEach(inp => {
        DataAPI.deleteAssignment(editMemberId, projectId, parseInt(inp.dataset.year), parseInt(inp.dataset.month));
      });
      closeFormModal(); render();
    }
  });
};
document.getElementById('formCancelBtn').onclick = closeFormModal;
document.getElementById('formClose').onclick     = closeFormModal;

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
