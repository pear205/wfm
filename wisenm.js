// ██████████████████████████████████████████████████████████
// █  WISENM VIEW  —  WiseNTM 공수 산정표                       █
// ██████████████████████████████████████████████████████████

// 기준 역할 정의 (2개월 기준 M/M)
const WISENM_ROLES = [
  { id:'pm',    cat:'관리',   name:'PM',              base:2.0, scale:'linear', note:'전체 기간 상주' },
  { id:'pl',    cat:'관리',   name:'PL',              base:2.0, scale:'linear', note:'전체 기간 상주' },
  { id:'bm',    cat:'관리',   name:'사업관리',         base:2.0, scale:'linear', note:'계약·행정·고객 대응' },
  { id:'ta',    cat:'기술',   name:'TA',              base:1.0, scale:'dev',    note:'아키텍처·기술 검토' },
  { id:'infra', cat:'인프라', name:'인프라 담당',      base:1.0, scale:'dev',    note:'서버 4~5개 구성' },
  { id:'sec',   cat:'보안',   name:'인프라 보안',      base:1.0, scale:'dev',    note:'네트워크·서버 보안' },
  { id:'comp',  cat:'보안',   name:'보안성 심의',      base:1.0, scale:'dev',    note:'문서 및 심의 대응' },
  { id:'aos',   cat:'개발',   name:'Android 개발자',   base:2.0, scale:'dev',    note:'법인폰 앱 개발' },
  { id:'be',    cat:'개발',   name:'백엔드 개발자',    base:2.0, scale:'dev',    note:'서버 4~5개 / API' },
  { id:'fe',    cat:'개발',   name:'프론트엔드 개발자',base:2.0, scale:'dev',    note:'관리콘솔 / 모니터링' },
];

function _wnScaleDesc(r) {
  if (r.scale === 'fixed')  return '고정값';
  if (r.scale === 'linear') return `기간 × ${r.base/2} M/M`;
  if (r.scale === 'dev')    return `${r.base}M/M + 추가월×0.5`;
  return '';
}

const WISENM_VARS = [
  { id:'si',    name:'SI 커스터마이징',   unit:'M/M', placeholder:'별도 산정', note:'CRM 연동, 업무 특화 기능' },
  { id:'maint', name:'유지보수',         unit:'MM/월', placeholder:'0.5', note:'운영 안정화 후 적용' },
  { id:'branch',name:'지점 설치',        unit:'MD/지점', placeholder:'0.5', note:'현장 설치·테스트·교육' },
  { id:'db',    name:'DB 설치 및 이중화', unit:'M/M', placeholder:'별도 산정', note:'HA 구성 규모에 따라 상이' },
];

// 공수 산정표 상태
const _wn = {
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

function _wnSiSum() {
  return Math.round(_wn.siItems.filter(i=>i.checked).reduce((s,i)=>s+i.mm,0)*2)/2;
}

function _wnCalcMM(r) {
  if (_wn.custom[r.id] !== undefined) return _wn.custom[r.id];
  let mm;
  if (r.scale === 'dev')    mm = r.base + Math.max(0, _wn.dur - 2) * 0.5;
  else if (r.scale === 'linear') mm = r.base * (_wn.dur / 2);
  else                      mm = r.base;
  return Math.round(mm * 2) / 2;
}

function _wnRefreshTotal() {
  let total = 0;
  document.querySelectorAll('.wn-row-chk[data-type="role"]').forEach(chk => {
    if (chk.checked) {
      const inp = document.querySelector(`.wn-mm-input[data-role="${chk.dataset.id}"]`);
      total += parseFloat(inp?.value || 0);
    }
  });
  const siChk = document.querySelector('.wn-row-chk[data-type="var"][data-id="si"]');
  if (siChk?.checked) total += parseFloat(document.getElementById('wnSiInput')?.value || 0);
  const dbChk = document.querySelector('.wn-row-chk[data-type="var"][data-id="db"]');
  if (dbChk?.checked) total += parseFloat(document.querySelector('.wn-var-input[data-var="db"]')?.value || 0);
  const str = (Math.round(total * 2) / 2).toFixed(1);
  const tmm = document.getElementById('wnTotalMM');
  const tft = document.getElementById('wnTotalFt');
  if (tmm) tmm.textContent = str;
  if (tft) tft.textContent = str;
}

function renderWisenmView() {
  const dur = _wn.dur;
  const catColors = { '관리':'#3D6FEB', '기술':'#9259D1', '인프라':'#16BFAD', '보안':'#E85C4A', '개발':'#00A878' };
  const varColor = '#8A8D9F';

  const mms = WISENM_ROLES.map(r => _wnCalcMM(r));

  // 그랜드 합계 (체크된 역할 + 체크된 M/M var)
  let grandTotal = 0;
  WISENM_ROLES.forEach((r, i) => {
    if (_wn.roleChecked[r.id] !== false) grandTotal += mms[i];
  });
  const siCheckedSum = _wnSiSum();
  const siHasChecked = _wn.siItems.some(i=>i.checked);
  const siVal = _wn.siOverride !== '' ? _wn.siOverride : (siHasChecked ? siCheckedSum : '');
  if (_wn.varChecked['si'] === true) grandTotal += parseFloat(siVal) || 0;
  if (_wn.varChecked['db'] === true) grandTotal += parseFloat(_wn.vars['db']) || 0;
  grandTotal = Math.round(grandTotal * 2) / 2;

  // 카테고리별 rowspan 계산
  const catSpan = {};
  WISENM_ROLES.forEach(r => { catSpan[r.cat] = (catSpan[r.cat]||0) + 1; });
  const catSeen = {};

  // 역할 행
  let rolesHtml = '';
  WISENM_ROLES.forEach((r, i) => {
    const mm = mms[i];
    const isCustom = _wn.custom[r.id] !== undefined;
    const isChecked = _wn.roleChecked[r.id] !== false;
    const col = catColors[r.cat];
    let catCell = '';
    if (!catSeen[r.cat]) {
      catSeen[r.cat] = true;
      catCell = `<td class="wn-cat-cell" rowspan="${catSpan[r.cat]}" style="background:${col}15">
        <span class="wn-cat-chip" style="background:${col};color:#fff">${r.cat}</span>
      </td>`;
    }
    rolesHtml += `<tr class="wn-role-row${!isChecked?' wn-row-dimmed':''}">
      ${catCell}
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="role" data-id="${r.id}" ${isChecked?'checked':''}></td>
      <td class="wn-td-name">${r.name}</td>
      <td class="wn-td-scale"><span class="wn-scale-badge${r.scale!=='fixed'?' scale-var':' scale-fix'}">${r.scale==='dev'?'비례':r.scale==='linear'?'기간 비례':'고정'}</span><span class="wn-scale-desc">${_wnScaleDesc(r)}</span></td>
      <td class="wn-td-mm">
        <input class="wn-mm-input${isCustom?' is-custom':''}" type="number" step="0.5" min="0" value="${mm}" data-role="${r.id}">
      </td>
      <td class="wn-td-note">${r.note}</td>
    </tr>`;
  });

  // SI 섹션
  const siCustom = _wn.siOverride !== '';
  const siVarChecked = _wn.varChecked['si'] === true;
  const siItemsHtml = _wn.siItems.map(it=>`
    <tr class="wn-si-item${!siVarChecked?' wn-row-dimmed':''}">
      <td colspan="6">
        <div class="wn-si-item-row">
          <input type="checkbox" class="wn-si-chk" data-si="${it.id}" ${it.checked?'checked':''}>
          <input type="text" class="wn-si-name" data-si="${it.id}" value="${it.name.replace(/"/g,'&quot;')}">
          <input type="number" class="wn-si-mm" step="0.5" min="0" data-si="${it.id}" value="${it.mm}">
          <span class="wn-td-unit">M/M</span>
          <button class="wn-si-del" data-si="${it.id}">✕</button>
        </div>
      </td>
    </tr>`).join('');
  const siHtml = `
    <tr class="wn-var-row wn-si-main-row${!siVarChecked?' wn-row-dimmed':''}">
      <td class="wn-cat-cell" style="background:${varColor}15">
        <span class="wn-cat-chip" style="background:${varColor};color:#fff">별도</span>
      </td>
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="var" data-id="si" ${siVarChecked?'checked':''}></td>
      <td class="wn-td-name">SI 커스터마이징</td>
      <td></td>
      <td class="wn-td-mm">
        <input class="wn-var-input${siCustom?' is-custom':''}" id="wnSiInput" type="number" step="0.5" min="0"
          value="${siVal}" placeholder="별도 산정" data-var="si">
        ${siHasChecked&&!siCustom?`<span class="wn-si-badge">${siCheckedSum} M/M</span>`:''}
      </td>
      <td class="wn-td-note">CRM 연동, 업무 특화 기능</td>
    </tr>
    <tr class="wn-si-subhd${!siVarChecked?' wn-row-dimmed':''}">
      <td colspan="6">
        <div class="wn-si-subhd-bar">
          <span>부가 항목</span>
          <button class="wn-si-add" id="wnSiAdd">+ 추가</button>
        </div>
      </td>
    </tr>
    ${siItemsHtml}`;

  // 나머지 var 행
  const otherVarsHtml = WISENM_VARS.filter(v=>v.id!=='si').map(v => {
    const val = _wn.vars[v.id] !== undefined ? _wn.vars[v.id] : '';
    const isVarChecked = _wn.varChecked[v.id] === true;
    const unitSpan = v.unit !== 'M/M' ? `<span class="wn-td-unit">${v.unit}</span>` : '';
    return `<tr class="wn-var-row${!isVarChecked?' wn-row-dimmed':''}">
      <td class="wn-cat-cell" style="background:${varColor}15">
        <span class="wn-cat-chip" style="background:${varColor};color:#fff">별도</span>
      </td>
      <td class="wn-chk-cell"><input type="checkbox" class="wn-row-chk" data-type="var" data-id="${v.id}" ${isVarChecked?'checked':''}></td>
      <td class="wn-td-name">${v.name}</td>
      <td></td>
      <td class="wn-td-mm">
        <input class="wn-var-input" type="number" step="0.5" min="0" placeholder="${v.placeholder}" value="${val}" data-var="${v.id}">
        ${unitSpan}
      </td>
      <td class="wn-td-note">${v.note}</td>
    </tr>`;
  }).join('');

  const html = `
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
            <span class="wn-total-val" id="wnTotalMM">${grandTotal.toFixed(1)}</span>
            <span class="wn-total-unit">M/M</span>
          </div>
          <div class="wn-dur-block">
            <span class="wn-dur-label">기간</span>
            <div class="wn-dur-controls">
              <button class="wn-dur-btn" id="wnDurMinus">−</button>
              <span class="wn-dur-val" id="wnDurVal">${dur}<em>개월</em></span>
              <button class="wn-dur-btn" id="wnDurPlus">+</button>
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
              <col style="width:150px">
              <col>
            </colgroup>
            <thead><tr>
              <th>구분</th><th></th><th>역할</th><th>산정방식</th><th>M/M</th><th>비고</th>
            </tr></thead>
            <tbody>${rolesHtml}${siHtml}${otherVarsHtml}</tbody>
            <tfoot><tr class="wn-total-row">
              <td colspan="4">합계</td>
              <td><span class="wn-total-ft" id="wnTotalFt">${grandTotal.toFixed(1)}</span> <span class="wn-td-unit">M/M</span></td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>

        <div class="wn-footnote">
          <span class="wn-fn-title">기준 가정</span>
          서버 4~5개 단일 컨테이너 구성 · 하드웨어(법인폰 포함) 고객사 직납 · CRM/콜센터 연동 없음 ·
          <strong>기간 비례:</strong> PM·PL·AOS·BE·FE &nbsp;<strong>고정:</strong> TA·인프라·보안
        </div>
      </div>
    </div>`;

  document.getElementById('grid-container').innerHTML = html;

  document.getElementById('wnDurMinus').onclick = () => {
    if (_wn.dur > 1) { _wn.dur--; _wn.custom = {}; renderWisenmView(); }
  };
  document.getElementById('wnDurPlus').onclick = () => {
    if (_wn.dur < 24) { _wn.dur++; _wn.custom = {}; renderWisenmView(); }
  };

  // 역할 M/M 입력
  document.querySelectorAll('.wn-mm-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v >= 0) {
        _wn.custom[inp.dataset.role] = Math.round(v * 10) / 10;
        inp.classList.add('is-custom');
        _wnRefreshTotal();
      }
    });
  });

  // 행 체크박스 (역할 / var)
  document.querySelectorAll('.wn-row-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const tr = chk.closest('tr');
      if (chk.dataset.type === 'role') {
        _wn.roleChecked[chk.dataset.id] = chk.checked;
      } else {
        _wn.varChecked[chk.dataset.id] = chk.checked;
      }
      if (tr) tr.classList.toggle('wn-row-dimmed', !chk.checked);
      // SI 체크박스면 부가항목 행도 함께 dim
      if (chk.dataset.type === 'var' && chk.dataset.id === 'si') {
        document.querySelectorAll('.wn-si-subhd, .wn-si-item').forEach(row => {
          row.classList.toggle('wn-row-dimmed', !chk.checked);
        });
      }
      _wnRefreshTotal();
    });
  });

  // var 입력 저장
  document.querySelectorAll('.wn-var-input:not(#wnSiInput)').forEach(inp => {
    inp.addEventListener('change', () => {
      _wn.vars[inp.dataset.var] = inp.value;
      _wnRefreshTotal();
    });
  });

  // SI 수동 입력
  const siInp = document.getElementById('wnSiInput');
  if (siInp) {
    siInp.addEventListener('change', () => {
      _wn.siOverride = siInp.value.trim();
      _wnRefreshTotal();
      renderWisenmView();
    });
    siInp.addEventListener('input', () => {
      if (siInp.value === '') { _wn.siOverride = ''; }
    });
  }

  // SI 서브아이템 체크박스
  document.querySelectorAll('.wn-si-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const it = _wn.siItems.find(i=>i.id===chk.dataset.si);
      if (it) it.checked = chk.checked;
      if (_wn.siOverride === '') {
        const s = document.getElementById('wnSiInput');
        const hasAny = _wn.siItems.some(i=>i.checked);
        const sum = _wnSiSum();
        if (s) s.value = hasAny ? sum : '';
        const mainRow = document.querySelector('.wn-si-main-row td:nth-child(5) .wn-td-mm');
        if (mainRow) {
          let badge = mainRow.querySelector('.wn-si-badge');
          if (hasAny && _wn.siOverride === '') {
            if (!badge) { badge = document.createElement('span'); badge.className='wn-si-badge'; mainRow.appendChild(badge); }
            badge.textContent = sum+' M/M';
          } else if (badge) badge.remove();
        }
        _wnRefreshTotal();
      }
    });
  });

  // SI 항목 이름 편집
  document.querySelectorAll('.wn-si-name').forEach(inp => {
    inp.addEventListener('change', () => {
      const it = _wn.siItems.find(i=>i.id===inp.dataset.si);
      if (it) it.name = inp.value;
    });
  });

  // SI 항목 M/M 편집
  document.querySelectorAll('.wn-si-mm').forEach(inp => {
    inp.addEventListener('change', () => {
      const it = _wn.siItems.find(i=>i.id===inp.dataset.si);
      if (it) {
        it.mm = Math.round(parseFloat(inp.value||0)*2)/2;
        if (it.checked && _wn.siOverride === '') {
          const s = document.getElementById('wnSiInput');
          if (s) s.value = _wnSiSum();
          _wnRefreshTotal();
        }
      }
    });
  });

  // SI 항목 추가
  const siAddBtn = document.getElementById('wnSiAdd');
  if (siAddBtn) siAddBtn.addEventListener('click', () => {
    _wn._siNext = (_wn._siNext||6) + 1;
    _wn.siItems.push({ id:'si_'+_wn._siNext, name:'새 항목', mm:0.5, checked:false });
    renderWisenmView();
  });

  // SI 항목 삭제
  document.querySelectorAll('.wn-si-del').forEach(btn => {
    btn.addEventListener('click', () => {
      _wn.siItems = _wn.siItems.filter(i=>i.id!==btn.dataset.si);
      renderWisenmView();
    });
  });
}
