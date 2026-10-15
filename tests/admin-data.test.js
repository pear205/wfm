'use strict';
// 관리 센터 데이터 층(data.js: 역할·viewer 가드, UserAPI, CODES/CodeAPI 게터, BASIS/BasisAPI) 고정 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const plain = v => JSON.parse(JSON.stringify(v));   // vm 컨텍스트 객체 → 호스트 객체

// 가짜 Supabase 쿼리: from(table) 이 체인 메서드를 기록하고, await 하면 handler(q) 결과를 돌려준다
function fakeDb(handler) {
  const calls = [];
  const from = table => {
    const q = { table, ops: [] };
    calls.push(q);
    const b = new Proxy({}, {
      get(_, k) {
        if (k === 'then') return (ok, ko) => Promise.resolve().then(() => handler(q) || {}).then(ok, ko);
        if (typeof k === 'symbol') return undefined;
        return (...a) => { q.ops.push([k, ...a]); return b; };
      },
    });
    return b;
  };
  return { from, calls };
}
const has = (q, op) => q.ops.some(o => o[0] === op);
const arg = (q, op) => (q.ops.find(o => o[0] === op) || [])[1];
const WRITE_OPS = ['insert', 'update', 'upsert', 'delete'];

function setup(role, handler) {
  const env = load(['data.js', 'wisenm.js']);
  const db = fakeDb(handler || (() => ({ data: [], error: null })));
  env.ev('_sb').from = db.from;
  env.ev('CURRENT_USER').role = role;
  env.ev('CURRENT_USER').id = 'u1';
  env.ev('CURRENT_USER').email = 'me@ex.com';
  return { ...env, db };
}

// ─── 역할 ───
test('hasRole/canWrite/isAdmin: 순위 비교, 빈 값·모르는 값은 false', () => {
  const { ev } = setup('');
  const cu = ev('CURRENT_USER');
  const chk = role => { cu.role = role; return [ev('hasRole')('viewer'), ev('canWrite')(), ev('isAdmin')()]; };
  assert.deepEqual(chk(''), [false, false, false]);
  assert.deepEqual(chk('guest'), [false, false, false]);
  assert.deepEqual(chk('viewer'), [true, false, false]);
  assert.deepEqual(chk('editor'), [true, true, false]);
  assert.deepEqual(chk('admin'), [true, true, true]);
  cu.role = 'admin';
  assert.equal(ev('hasRole')('nonsense'), true);   // 최소 순위 1 (SQL greatest(...,1) 과 같음)
});

test('viewer 가드: 쓰기 thunk 를 실행하지 않고 false, 서버 다시 읽기만 한다', async () => {
  const { ev, db } = setup('viewer');
  let ran = false;
  const ok = await ev('_track')('테스트', 'member:x', () => { ran = true; return {}; });
  assert.equal(ok, false);
  assert.equal(ran, false);
  const SS = ev('SaveState');
  if (SS._roReloadP) await SS._roReloadP;
  assert.equal(SS.failed.length, 0);
  assert.equal(SS.pending, 0);
  assert.ok(db.calls.length > 0, 'loadData 로 다시 읽음');
  assert.ok(db.calls.every(q => !WRITE_OPS.some(op => has(q, op))), '쓰기 쿼리 없음');
});

test('viewer 가드: DataAPI 경로도 서버에 쓰지 않는다', async () => {
  const { ev, db } = setup('viewer');
  ev('DataAPI').addMember({ name: 'x', role: '', color: '#000', skills: [] });
  await new Promise(r => setImmediate(r));
  const SS = ev('SaveState');
  if (SS._roReloadP) await SS._roReloadP;
  assert.ok(db.calls.every(q => !WRITE_OPS.some(op => has(q, op))));
});

test('editor·빈 역할은 가드에 걸리지 않는다', async () => {
  for (const role of ['editor', '']) {
    const { ev } = setup(role);
    let ran = false;
    assert.equal(await ev('_track')('테스트', 'k', () => { ran = true; return {}; }), true, role);
    assert.equal(ran, true, role);
  }
});

test('viewer: EstimateAPI.save 는 로컬을 바꾸지 않고 forbidden', async () => {
  const { ev } = setup('viewer');
  const r = plain(await ev('EstimateAPI').save({ header: { title: 't' }, snapshot: {}, reason: 'x' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'forbidden');
  assert.equal(ev('EST').estimates.length, 0);
});

test('EstimateAPI.canDelete: admin 전부, 만든 사람은 editor 이상(빈 역할은 예전처럼)', () => {
  const { ev } = setup('');
  const cu = ev('CURRENT_USER');
  const cd = est => ev('EstimateAPI').canDelete(est);
  const mine = { createdBy: 'u1' }, other = { createdBy: 'u2' };
  const cases = { admin: [true, true], editor: [true, false], viewer: [false, false], '': [true, false] };
  for (const [role, [m, o]] of Object.entries(cases)) {
    cu.role = role;
    assert.equal(cd(mine), m, role + ' mine');
    assert.equal(cd(other), o, role + ' other');
  }
  assert.equal(cd(null), false);
});

// ─── 산정 버전 ↔ basis 열 ───
test('산정 버전 행: snapshot.basisRef → basis_id/basis_version, 구 행은 undefined 허용', () => {
  const { ev } = setup('editor');
  const toRow = ev('_estimateVersionToRow'), toVer = ev('_rowToEstimateVersion');
  const row = plain(toRow({ estimateId: 'e', version: 1, reason: 'r', snapshot: { basisRef: { id: 'wisentm', version: 3 } }, totalMm: 1 }));
  assert.equal(row.basis_id, 'wisentm'); assert.equal(row.basis_version, 3);
  const builtin = plain(toRow({ estimateId: 'e', version: 1, reason: 'r', snapshot: { basisRef: { id: null, version: 0 } }, totalMm: 1 }));
  assert.equal(builtin.basis_id, null); assert.equal(builtin.basis_version, 0);
  const none = plain(toRow({ estimateId: 'e', version: 1, reason: 'r', snapshot: {}, totalMm: 1 }));
  assert.ok(!('basis_id' in none) && !('basis_version' in none));
  assert.deepEqual(plain(toVer({ estimate_id: 'e', version: 2, basis_id: 'wisentm', basis_version: 4, snapshot: {} })).basisRef, { id: 'wisentm', version: 4 });
  assert.deepEqual(plain(toVer({ estimate_id: 'e', version: 2, snapshot: { basisRef: { id: null, version: 0 } } })).basisRef, { id: null, version: 0 });
  assert.equal(plain(toVer({ estimate_id: 'e', version: 2, snapshot: {} })).basisRef, null);
});

// ─── 사용자 ───
test('UserAPI.add: 이메일 검증·소문자·trim, 중복은 exists', async () => {
  let inserted = null;
  const { ev, db } = setup('admin', q => {
    if (has(q, 'insert')) { inserted = arg(q, 'insert'); return inserted.email === 'dup@ex.com' ? { error: { code: '23505', message: 'dup' } } : {}; }
    return {};
  });
  const U = ev('UserAPI');
  for (const bad of ['', 'abc', 'a@b', 'a b@c.com', null]) {
    assert.equal(plain(await U.add({ email: bad })).code, 'invalid', String(bad));
  }
  assert.equal(db.calls.length, 0, '잘못된 이메일은 서버에 보내지 않음');
  assert.equal(plain(await U.add({ email: 'x@y.com', role: 'owner' })).code, 'invalid');
  assert.equal(await U.add({ email: '  New.User@Ex.COM ', note: '메모' }), true);
  assert.equal(inserted.email, 'new.user@ex.com');
  assert.equal(inserted.role, 'editor');
  assert.equal(inserted.person_id, null);
  assert.equal(plain(await U.add({ email: 'dup@ex.com', role: 'viewer' })).code, 'exists');
});

test('UserAPI.remove: 본인은 self, last_admin 예외는 last-admin', async () => {
  const { ev, db } = setup('admin', q => {
    if (has(q, 'delete') || has(q, 'update')) return { error: { code: 'P0001', message: 'last_admin' } };
    return { data: [] };
  });
  const U = ev('UserAPI');
  const self = plain(await U.remove(' ME@ex.com '));
  assert.equal(self.code, 'self');
  assert.equal(db.calls.length, 0);
  const r = plain(await U.remove('boss@ex.com'));
  assert.equal(r.code, 'last-admin');
  assert.ok(r.message.length > 0);
  assert.equal(plain(await U.update('boss@ex.com', { role: 'editor' })).code, 'last-admin');
});

test('UserAPI: 수정 성공/0행, list 매핑·정렬 요청, 비관리자는 forbidden', async () => {
  const { ev, db } = setup('admin', q => {
    if (has(q, 'update')) return { data: arg(q, 'eq') === undefined ? [] : (q.ops.find(o => o[0] === 'eq')[2] === 'a@ex.com' ? [{ email: 'a@ex.com' }] : []) };
    if (q.table === 'wfm_allowed_users') return { data: [{ email: 'a@ex.com', role: 'admin', person_id: 'm1', note: 'n', created_at: 't' }, { email: 'b@ex.com', role: 'weird' }] };
    return {};
  });
  const U = ev('UserAPI');
  assert.equal(await U.update('a@ex.com', { role: 'viewer', personId: '' }), true);
  const upd = db.calls.find(q => has(q, 'update'));
  assert.deepEqual(plain(arg(upd, 'update')), { role: 'viewer', person_id: null });
  assert.equal(plain(await U.update('z@ex.com', { note: 'x' })).code, 'error');
  const list = plain(await U.list());
  assert.deepEqual(list[0], { email: 'a@ex.com', role: 'admin', personId: 'm1', note: 'n', createdAt: 't' });
  assert.equal(list[1].role, '');
  ev('CURRENT_USER').role = 'editor';
  assert.equal(plain(await U.add({ email: 'q@ex.com' })).code, 'forbidden');
});

// ─── 공통코드 ───
test('코드 게터: 불러오기 전에는 내장 기본값(app.js 와 같은 값)', () => {
  const { ev } = setup('editor');
  assert.deepEqual(plain(ev('skillCategories()')).map(c => c.key), ['lang', 'cloud', 'ai', 'sol', 'etc']);
  assert.deepEqual(plain(ev('skillCategories()')).map(c => c.label), ['언어 / 프레임워크', '클라우드', 'AI / ML', '솔루션', '기타']);
  assert.deepEqual(plain(ev('skillPresets()')).sol, ['WiseN TM', 'Zendesk', 'Salesforce']);
  assert.equal(ev('statusLabel("active")'), '진행중');
  assert.equal(ev('statusLabel("planned")'), '예정');
  assert.equal(ev('statusLabel("zzz")'), 'zzz');
  // app.js 의 PRESET_SKILLS / STATUS_KR 과 같은 값인지(app.js 를 바꾸면 이 테스트가 알려준다)
  const appSrc = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'public', 'app.js'), 'utf8');
  const m = appSrc.match(/const PRESET_SKILLS = (\{[\s\S]*?\});/);
  if (m) assert.deepEqual(plain(ev('skillPresets()')), plain(new Function('return ' + m[1])()));
  const s = appSrc.match(/const STATUS_KR = (\{[^}]*\});/);
  if (s) assert.deepEqual(plain(ev('BUILTIN_STATUS')), plain(new Function('return ' + s[1])()));
});

test('코드 게터: DB 값 우선, 사용 끈 항목 제외, 정렬, 잘못된 색은 기본색', () => {
  const { ev } = setup('editor');
  const C = ev('CODES');
  C.status = 'ok';
  C.groups = [{ id: 'skill', name: '스킬', system: false, sortOrder: 1 }];
  const code = (o) => Object.assign({ groupId: 'skill', parentCode: null, color: null, sortOrder: 0, active: true, meta: {} }, o);
  C.codes = [
    code({ code: 'b', name: '나중', sortOrder: 2, color: 'red;background:url(x)' }),
    code({ code: 'a', name: '먼저', sortOrder: 1, color: '#123456' }),
    code({ code: 'off', name: '꺼짐', sortOrder: 0, active: false }),
    code({ code: 'a.2', parentCode: 'a', name: 'Y', sortOrder: 2 }),
    code({ code: 'a.1', parentCode: 'a', name: 'X', sortOrder: 1 }),
    code({ code: 'a.3', parentCode: 'a', name: 'Z', active: false }),
    code({ code: 'off.1', parentCode: 'off', name: 'W' }),
  ];
  assert.deepEqual(plain(ev('skillCategories()')), [{ key: 'a', label: '먼저', color: '#123456' }, { key: 'b', label: '나중', color: '#8A8D9F' }]);
  assert.deepEqual(plain(ev('skillPresets()')), { a: ['X', 'Y'], b: [] });
  // pj_status 코드가 없으면 상태는 내장값, 있으면 DB 이름(사용 끔도 이름은 돌려줌)
  assert.equal(ev('statusLabel("done")'), '완료');
  C.codes.push(code({ groupId: 'pj_status', code: 'done', name: '종료', active: false }));
  assert.equal(ev('statusLabel("done")'), '종료');
  assert.equal(ev('statusLabel("active")'), '진행중');
  C.status = 'error';
  assert.equal(ev('statusLabel("done")'), '완료');
  assert.equal(plain(ev('skillCategories()')).length, 5);
});

test('CodeAPI.load: 성공 ok / 테이블 없음 missing(throw 없음, 게터는 내장값)', async () => {
  let missing = false;
  const { ev } = setup('editor', q => {
    if (missing) return { error: { code: '42P01', message: 'relation does not exist' } };
    if (q.table === 'wfm_code_groups') return { data: [{ id: 'skill', name: '스킬', system: false, sort_order: 1 }] };
    if (q.table === 'wfm_codes') return { data: [{ group_id: 'skill', code: 'k', parent_code: null, name: '분류K', color: '#abc', sort_order: 1, active: true, meta: {} }] };
    return {};
  });
  const CodeAPI = ev('CodeAPI');
  const [a, b] = [CodeAPI.load(), CodeAPI.load()];
  assert.equal(a, b, '중복 호출은 같은 promise');
  assert.equal(await a, true);
  assert.equal(ev('CODES').status, 'ok');
  assert.deepEqual(plain(ev('skillCategories()')), [{ key: 'k', label: '분류K', color: '#abc' }]);
  missing = true;
  assert.equal(await CodeAPI.load(), false);
  assert.equal(ev('CODES').status, 'missing');
  assert.equal(plain(ev('skillCategories()')).length, 5);
});

test('CodeAPI.save: 검증(중복·빈 이름·색·상위 분류·시스템 그룹 추가 금지), 성공 시 upsert', async () => {
  let upserted = null;
  const { ev } = setup('admin', q => {
    if (has(q, 'upsert')) { upserted = arg(q, 'upsert'); return {}; }
    if (q.table === 'wfm_code_groups') return { data: [{ id: 'skill', name: '스킬', system: false }, { id: 'pj_status', name: '상태', system: true }] };
    if (q.table === 'wfm_codes') return { data: [{ group_id: 'pj_status', code: 'active', name: '진행중' }, { group_id: 'skill', code: 'lang', name: '언어' }] };
    return {};
  });
  const CodeAPI = ev('CodeAPI');
  assert.equal(plain(await CodeAPI.save('skill', [])).code, 'error', '불러오기 전');
  await CodeAPI.load();
  const bad = async rows => plain(await CodeAPI.save('skill', rows)).code;
  assert.equal(await bad([{ code: 'x', name: 'a' }, { code: 'x', name: 'b' }]), 'invalid');
  assert.equal(await bad([{ code: 'x', name: ' ' }]), 'invalid');
  assert.equal(await bad([{ code: 'x', name: 'a', color: 'red' }]), 'invalid');
  assert.equal(await bad([{ code: 'x', name: 'a', parentCode: 'nope' }]), 'invalid');
  assert.equal(await bad([{ code: 'lang', name: 'a', parentCode: 'x' }, { code: 'x', name: 'b' }]), 'invalid', '분류→항목 변경 금지');
  assert.equal(plain(await CodeAPI.save('pj_status', [{ code: 'new', name: '새' }])).code, 'invalid');
  assert.equal(upserted, null);
  assert.equal(await CodeAPI.save('skill', [{ code: 'lang', name: '언어 / FW', color: '#3D6FEB', sortOrder: 1 }, { code: 'lang.go', parentCode: 'lang', name: 'Go' }]), true);
  assert.equal(upserted.length, 2);
  assert.deepEqual(plain(upserted[1]), { group_id: 'skill', code: 'lang.go', parent_code: 'lang', name: 'Go', color: null, sort_order: 0, active: true, meta: {} });
  ev('CURRENT_USER').role = 'editor';
  assert.equal(plain(await CodeAPI.save('skill', [])).code, 'forbidden');
});

test('CodeAPI.importBuiltin: 내장 기본값을 건너뛰기(ignoreDuplicates)로 복사', async () => {
  const ups = [];
  const { ev } = setup('admin', q => { if (has(q, 'upsert')) ups.push(q); return { data: [] }; });
  assert.equal(await ev('CodeAPI').importBuiltin(), true);
  const codes = ups.find(q => q.table === 'wfm_codes');
  assert.equal(codes.ops.find(o => o[0] === 'upsert')[2].ignoreDuplicates, true);
  const rows = plain(arg(codes, 'upsert'));
  assert.equal(rows.filter(r => r.group_id === 'skill' && !r.parent_code).length, 5);
  assert.equal(rows.filter(r => r.group_id === 'skill' && r.parent_code).length, 30);
  assert.deepEqual(rows.filter(r => r.group_id === 'pj_status').map(r => r.code), ['active', 'done', 'planned']);
  assert.equal(new Set(rows.map(r => r.group_id + '/' + r.code)).size, rows.length, '키 중복 없음');
});

// ─── 기준표 ───
const strip = (list, keys) => list.map(o => { const c = { ...o }; keys.forEach(k => delete c[k]); return c; });

test('builtinContent: wisenm.js 내장값과 같고 깊은 복사', () => {
  const { ev } = setup('editor');
  const c = plain(ev('BasisAPI.builtinContent()'));
  assert.deepEqual(strip(c.roles, ['active']), plain(ev('WISENM_ROLES')));
  assert.ok(c.roles.every(r => r.active === true));
  assert.deepEqual(strip(c.vars, ['active', 'inTotal']), plain(ev('WISENM_VARS')));
  assert.deepEqual(c.vars.map(v => v.inTotal), [true, false, false, true]);
  assert.deepEqual(c.categories, Object.entries(plain(ev('WN_CAT_COLORS'))).map(([name, color]) => ({ name, color })));
  assert.deepEqual(c.siPresets, plain(ev('_wnDefaultInputs()')).siItems.map(({ id, name, mm }) => ({ id, name, mm })));
  assert.ok(Array.isArray(c.meta.assumptions) && c.meta.assumptions.length > 0);
  ev('BasisAPI.builtinContent()').roles[0].base = 99;
  assert.equal(ev('WISENM_ROLES[0].base'), 2);
  assert.deepEqual(plain(ev('BasisAPI.validate(BasisAPI.builtinContent())')), []);
});

test('builtinContent 로 계산한 wnCompute 결과가 내장 기준표와 같다', () => {
  const { ev } = setup('editor');
  const c = plain(ev('BasisAPI.builtinContent()'));
  const fromContent = { roles: c.roles, vars: c.vars };
  const builtin = plain(ev('({ roles: WISENM_ROLES, vars: WISENM_VARS })'));
  const compute = (b, i) => plain(ev('wnCompute')(b, i));
  const def = plain(ev('_wnDefaultInputs()'));
  const variants = [
    {}, { roleChecked: { pm: false, ta: false } }, { custom: { be: 3.3 } },
    { varChecked: { si: true, db: true }, vars: { db: '1.5' } },
    { varChecked: { si: true }, siItems: def.siItems.map(i => ({ ...i, checked: true })) },
    { varChecked: { branch: true, maint: true }, vars: { branch: '3', maint: '0.5' } },
  ];
  let n = 0;
  for (let d = 1; d <= 24; d++) for (const v of variants) {
    const inp = Object.assign({}, def, v, { dur: d });
    assert.deepEqual(compute(fromContent, inp), compute(builtin, inp), `dur ${d} ${JSON.stringify(v)}`);
    n++;
  }
  assert.equal(n, 144);
});

test('BasisAPI.validate: 규칙별 오류', () => {
  const { ev } = setup('editor');
  const base = () => plain(ev('BasisAPI.builtinContent()'));
  const v = (c, p) => plain(ev('BasisAPI.validate')(c, p));
  const fails = (mut, label) => { const c = base(); mut(c); assert.ok(v(c).length > 0, label); };
  fails(c => { c.roles[1].id = c.roles[0].id; }, '역할 id 중복');
  fails(c => { c.roles[0].id = 'a b'; }, '역할 id 형식');
  fails(c => { c.roles[0].name = '  '; }, '빈 역할 이름');
  fails(c => { c.roles[0].scale = 'exp'; }, 'scale 값');
  fails(c => { c.roles[0].base = 25; }, 'base 상한');
  fails(c => { c.roles[0].base = -1; }, 'base 하한');
  fails(c => { c.roles[0].base = 'abc'; }, 'base 숫자 아님');
  fails(c => { c.roles[0].cat = '없는분류'; }, '참조 분류 존재');
  fails(c => { c.categories[1].name = c.categories[0].name; }, '분류 중복');
  fails(c => { c.categories[0].color = 'red'; }, '분류 색');
  fails(c => { c.roles = []; }, '역할 없음');
  fails(c => { c.roles.forEach(r => { r.active = false; }); }, '사용 중 역할 없음');
  fails(c => { c.vars.push({ id: 'extra', name: 'x', unit: 'M/M' }); }, '변수 id 고정');
  fails(c => { c.vars = c.vars.filter(x => x.id !== 'si'); }, '변수 누락');
  fails(c => { c.siPresets[1].id = c.siPresets[0].id; }, 'SI id 중복');
  fails(c => { c.siPresets[0].mm = 30; }, 'SI mm 범위');
  assert.ok(v(null).length > 0);
  // 통과: 역할 추가·사용 끄기·base 0
  const ok = base();
  ok.roles.push({ id: 'qa', cat: '개발', name: 'QA', base: 0, scale: 'fixed', note: '', active: true });
  ok.roles[0].active = false;
  assert.deepEqual(v(ok, base()), []);
  // 이전 게시본 역할 id 삭제·변경 금지
  const del = base(); del.roles = del.roles.filter(r => r.id !== 'ta');
  assert.ok(v(del, base()).some(e => e.includes("'ta'")));
  const ren = base(); ren.roles[0].id = 'pm2';
  assert.ok(v(ren, base()).some(e => e.includes("'pm'")));
  assert.deepEqual(v(ren), [], '이전 게시본이 없으면 id 변경 자유');
});

test('BasisAPI.current: 내장 폴백, DB 최신 버전, 규칙 위반 DB 내용은 내장', () => {
  const { ev } = setup('editor');
  const cur = () => plain(ev('BasisAPI.current()'));
  assert.equal(cur().source, 'builtin');
  assert.equal(cur().version, 0);
  assert.equal(cur().id, null);
  const B = ev('BASIS');
  const content = plain(ev('BasisAPI.builtinContent()'));
  content.roles[0].base = 3;
  B.status = 'ok';
  B.basis = { id: 'wisentm', name: 'n', currentVersion: 2 };
  B.versions = [{ basisId: 'wisentm', version: 2, content }, { basisId: 'wisentm', version: 1, content: plain(ev('BasisAPI.builtinContent()')) }];
  assert.equal(cur().source, 'db');
  assert.equal(cur().version, 2);
  assert.equal(cur().content.roles[0].base, 3);
  ev('BasisAPI.current()').content.roles[0].base = 7;   // 깊은 복사
  assert.equal(cur().content.roles[0].base, 3);
  B.versions[0].content = { roles: 'x', vars: [] };
  assert.equal(cur().source, 'builtin');
});

test('BasisAPI.publish: 사유 필수, 첫 게시(헤더 생성)·충돌·재시도 동일 내용 성공', async () => {
  let header = null;          // 서버 헤더 행
  const versions = {};        // version -> {content}
  const log = [];
  const { ev } = setup('admin', q => {
    const t = q.table;
    if (t === 'wfm_estimate_basis') {
      if (has(q, 'insert')) { if (header) return { error: { code: '23505', message: 'dup' } }; header = { id: 'wisentm', current_version: 0 }; log.push('basis:insert'); return {}; }
      if (has(q, 'update')) {
        const cond = q.ops.filter(o => o[0] === 'eq').find(o => o[1] === 'current_version');
        if (header && (!cond || header.current_version === cond[2])) { header.current_version = arg(q, 'update').current_version; log.push('basis:update'); return { data: [{ id: 'wisentm' }] }; }
        return { data: [] };
      }
      return { data: header ? { ...header } : null };
    }
    if (t === 'wfm_estimate_basis_versions') {
      if (has(q, 'insert')) { const row = arg(q, 'insert'); if (versions[row.version]) return { error: { code: '23505', message: 'dup' } }; versions[row.version] = row; log.push('ver:insert:' + row.version); return {}; }
      const vEq = q.ops.filter(o => o[0] === 'eq').find(o => o[1] === 'version');
      if (vEq) return { data: versions[vEq[2]] ? { ...versions[vEq[2]], basis_id: 'wisentm' } : null };
      return { data: Object.values(versions).map(r => ({ ...r, basis_id: 'wisentm' })) };
    }
    return {};
  });
  const API = ev('BasisAPI');
  const content = plain(API.builtinContent());
  assert.equal(plain(await API.publish({ content, reason: '  ', baseVersion: 0 })).code, 'invalid');
  const badC = plain(API.builtinContent()); badC.roles[0].scale = 'zz';
  const inv = plain(await API.publish({ content: badC, reason: 'x', baseVersion: 0 }));
  assert.equal(inv.code, 'invalid'); assert.ok(inv.errors.length > 0);
  assert.equal(log.length, 0);

  const r1 = plain(await API.publish({ content, reason: '내장 기본값에서 가져옴', baseVersion: 0 }));
  assert.deepEqual(r1, { ok: true, version: 1 });
  assert.deepEqual(log, ['basis:insert', 'ver:insert:1', 'basis:update']);
  assert.equal(ev('BASIS').status, 'ok');
  assert.equal(plain(API.current()).source, 'db');
  assert.equal(plain(API.current()).version, 1);

  // 낡은 baseVersion → conflict (아무것도 쓰지 않음)
  log.length = 0;
  assert.equal(plain(await API.publish({ content, reason: 'x', baseVersion: 0 })).code, 'conflict');
  assert.deepEqual(log, []);

  // 게시된 역할 삭제 금지
  const del = plain(API.builtinContent()); del.roles = del.roles.filter(r => r.id !== 'fe');
  assert.equal(plain(await API.publish({ content: del, reason: 'x', baseVersion: 1 })).code, 'invalid');

  // 재시도: 버전 행은 이미 있고(같은 내용) 헤더만 못 올린 경우 → 성공
  const c2 = plain(API.builtinContent()); c2.roles[0].base = 3;
  versions[2] = { version: 2, reason: 'y', content: c2 };
  assert.deepEqual(plain(await API.publish({ content: c2, reason: 'y', baseVersion: 1 })), { ok: true, version: 2 });
  assert.equal(header.current_version, 2);

  // 다른 내용의 버전 행이 먼저 있으면 conflict
  versions[3] = { version: 3, reason: 'z', content: content };
  assert.equal(plain(await API.publish({ content: c2, reason: 'w', baseVersion: 2 })).code, 'conflict');

  ev('CURRENT_USER').role = 'editor';
  assert.equal(plain(await API.publish({ content, reason: 'x', baseVersion: 3 })).code, 'forbidden');
});
