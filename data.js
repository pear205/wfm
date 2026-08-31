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
    result.push({ memberId, projectId, year: y, month: m, mm, type });
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
           start: r.start_month || null, end: r.end_month || null, skills: r.skills || [] };
}
function _memberToRow(m) {
  return { id: m.id, name: m.name, role: m.role, color: m.color,
           start_month: m.start || null, end_month: m.end || null, skills: m.skills || [] };
}
function _rowToProject(r) {
  return { id: r.id, name: r.name, client: r.client || '', color: r.color,
           start: r.start_month || '', end: r.end_month || '', status: r.status, desc: r.description || '' };
}
function _projectToRow(p) {
  return { id: p.id, name: p.name, client: p.client, color: p.color,
           start_month: p.start, end_month: p.end, status: p.status, description: p.desc || '' };
}
function _rowToAssignment(r) {
  return { memberId: r.member_id, projectId: r.project_id,
           year: r.year, month: r.month, mm: parseFloat(r.mm), type: r.type };
}
function _assignmentToRow(a) {
  return { member_id: a.memberId, project_id: a.projectId,
           year: a.year, month: a.month, mm: a.mm, type: a.type };
}

// ─── 런타임 데이터 ───
const DATA = { members: [], projects: [], assignments: [] };

function _deepCopy(obj) { return JSON.parse(JSON.stringify(obj)); }

function _resetToDefaults() {
  DATA.members     = _deepCopy(DEFAULT_MEMBERS);
  DATA.projects    = _deepCopy(DEFAULT_PROJECTS);
  DATA.assignments = _deepCopy(DEFAULT_ASSIGNMENTS);
}

async function loadData() {
  try {
    const [mRes, pRes, aRes] = await Promise.all([
      _sb.from('wfm_members').select('*'),
      _sb.from('wfm_projects').select('*'),
      _sb.from('wfm_assignments').select('*'),
    ]);
    if (mRes.error) throw mRes.error;

    if (mRes.data && mRes.data.length > 0) {
      DATA.members     = mRes.data.map(_rowToMember);
      DATA.projects    = (pRes.data || []).map(_rowToProject);
      DATA.assignments = (aRes.data || []).map(_rowToAssignment);
    } else {
      // 최초 실행: 기본 데이터 Supabase에 업로드
      _resetToDefaults();
      await Promise.all([
        _sb.from('wfm_members').insert(DATA.members.map(_memberToRow)),
        _sb.from('wfm_projects').insert(DATA.projects.map(_projectToRow)),
        _sb.from('wfm_assignments').insert(DATA.assignments.map(_assignmentToRow)),
      ]);
    }
  } catch(e) {
    console.error('Supabase load error:', e);
    _resetToDefaults();
  }
}

// ─── CRUD API ───
const DataAPI = {
  /* ── 멤버 ── */
  addMember(m) {
    m.id = 'm' + Date.now();
    DATA.members.push(m);
    _sb.from('wfm_members').insert(_memberToRow(m)).then(({error}) => { if(error) console.error(error); });
    return m;
  },
  updateMember(id, u) {
    const i = DATA.members.findIndex(m => m.id === id);
    if (i >= 0) {
      DATA.members[i] = { ...DATA.members[i], ...u };
      _sb.from('wfm_members').upsert(_memberToRow(DATA.members[i])).then(({error}) => { if(error) console.error(error); });
    }
  },
  deleteMember(id) {
    DATA.members     = DATA.members.filter(m => m.id !== id);
    DATA.assignments = DATA.assignments.filter(a => a.memberId !== id);
    _sb.from('wfm_members').delete().eq('id', id).then(({error}) => { if(error) console.error(error); });
    _sb.from('wfm_assignments').delete().eq('member_id', id).then(({error}) => { if(error) console.error(error); });
  },

  /* ── 프로젝트 ── */
  addProject(p) {
    p.id = 'p' + Date.now();
    DATA.projects.push(p);
    _sb.from('wfm_projects').insert(_projectToRow(p)).then(({error}) => { if(error) console.error(error); });
    return p;
  },
  updateProject(id, u) {
    const i = DATA.projects.findIndex(p => p.id === id);
    if (i >= 0) {
      DATA.projects[i] = { ...DATA.projects[i], ...u };
      _sb.from('wfm_projects').upsert(_projectToRow(DATA.projects[i])).then(({error}) => { if(error) console.error(error); });
    }
  },
  deleteProject(id) {
    DATA.projects    = DATA.projects.filter(p => p.id !== id);
    DATA.assignments = DATA.assignments.filter(a => a.projectId !== id);
    _sb.from('wfm_projects').delete().eq('id', id).then(({error}) => { if(error) console.error(error); });
    _sb.from('wfm_assignments').delete().eq('project_id', id).then(({error}) => { if(error) console.error(error); });
  },

  /* ── 공수 ── */
  setAssignment(memberId, projectId, year, month, mm, type) {
    const i = DATA.assignments.findIndex(a =>
      a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===month
    );
    if (i >= 0) { DATA.assignments[i] = {memberId, projectId, year, month, mm, type}; }
    else        { DATA.assignments.push({memberId, projectId, year, month, mm, type}); }
    _sb.from('wfm_assignments')
      .upsert({ member_id:memberId, project_id:projectId, year, month, mm, type })
      .then(({error}) => { if(error) console.error(error); });
  },
  deleteAssignment(memberId, projectId, year, month) {
    DATA.assignments = DATA.assignments.filter(a =>
      !(a.memberId===memberId && a.projectId===projectId && a.year===year && a.month===month)
    );
    _sb.from('wfm_assignments').delete()
      .eq('member_id', memberId).eq('project_id', projectId)
      .eq('year', year).eq('month', month)
      .then(({error}) => { if(error) console.error(error); });
  },

  /* ── 초기화 ── */
  async reset() {
    _resetToDefaults();
    await Promise.all([
      _sb.from('wfm_assignments').delete().neq('member_id', ''),
      _sb.from('wfm_projects').delete().neq('id', ''),
      _sb.from('wfm_members').delete().neq('id', ''),
    ]);
    await Promise.all([
      _sb.from('wfm_members').insert(DATA.members.map(_memberToRow)),
      _sb.from('wfm_projects').insert(DATA.projects.map(_projectToRow)),
      _sb.from('wfm_assignments').insert(DATA.assignments.map(_assignmentToRow)),
    ]);
  },
};
