'use strict';
// wisenm.js wnCompute / 정규화 고정 테스트 (현재 동작을 스냅샷으로 하드코딩)
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const { ev } = load(['data.js', 'wisenm.js']);
const plain = v => JSON.parse(JSON.stringify(v));   // vm 컨텍스트 객체 → 호스트 객체(프로토타입 차이 제거)
const basis = () => plain(ev('({ roles: WISENM_ROLES, vars: WISENM_VARS })'));
const defIn = (over = {}) => Object.assign(plain(ev('_wnDefaultInputs()')), over);
const compute = (b, i) => plain(ev('wnCompute')(b, i));
const ROLE_IDS = ['pm', 'pl', 'bm', 'ta', 'infra', 'sec', 'comp', 'aos', 'be', 'fe'];

// 기간 1..24 (index 0 = 1개월). 전체 체크(기본) 총 M/M
const ALL = [13, 16, 22.5, 29, 35.5, 42, 48.5, 55, 61.5, 68, 74.5, 81, 87.5, 94, 100.5, 107, 113.5, 120, 126.5, 133, 139.5, 146, 152.5, 159];
// 기간별 대표 역할 값: linear(PM/PL/사업관리) = 기간, dev 1.0 기준(TA 등), dev 2.0 기준(개발자)
const TA = [1, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12];
const AOS = [2, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13];

test('기본 기준표 구성', () => {
  const b = basis();
  assert.deepEqual(b.roles.map(r => r.id), ROLE_IDS);
  assert.deepEqual(b.vars.map(v => v.id), ['db', 'branch', 'maint', 'si']);
});

for (let d = 1; d <= 24; d++) {
  test(`기간 ${d}개월: 전체 체크 총합·역할별 M/M`, () => {
    const r = compute(basis(), defIn({ dur: d }));
    assert.equal(r.total, ALL[d - 1]);
    assert.equal(r.mms.pm, d);
    assert.equal(r.mms.pl, d);
    assert.equal(r.mms.bm, d);
    for (const id of ['ta', 'infra', 'sec', 'comp']) assert.equal(r.mms[id], TA[d - 1], id);
    for (const id of ['aos', 'be', 'fe']) assert.equal(r.mms[id], AOS[d - 1], id);
    // 0.5 단위
    for (const v of [...Object.values(r.mms), r.total]) assert.equal(v * 2, Math.round(v * 2));
  });
}

test('PM 만 체크: 총합 = 기간 (1~24)', () => {
  for (let d = 1; d <= 24; d++) {
    const roleChecked = {};
    ROLE_IDS.filter(id => id !== 'pm').forEach(id => (roleChecked[id] = false));
    assert.equal(compute(basis(), defIn({ dur: d, roleChecked })).total, d, `dur ${d}`);
  }
});

test('개발만 체크(aos/be/fe): 기간 1·2·3·12·24', () => {
  const roleChecked = {};
  ROLE_IDS.filter(id => !['aos', 'be', 'fe'].includes(id)).forEach(id => (roleChecked[id] = false));
  const exp = { 1: 6, 2: 6, 3: 7.5, 12: 21, 24: 39 };
  for (const [d, t] of Object.entries(exp)) assert.equal(compute(basis(), defIn({ dur: +d, roleChecked })).total, t, `dur ${d}`);
});

test('전부 해제: 총합 0, mms 는 그대로 계산됨', () => {
  const roleChecked = {};
  ROLE_IDS.forEach(id => (roleChecked[id] = false));
  const r = compute(basis(), defIn({ dur: 6, roleChecked }));
  assert.equal(r.total, 0);
  assert.equal(r.mms.pm, 6);
});

test('roleChecked true/undefined 는 포함, false 만 제외', () => {
  const r = compute(basis(), defIn({ dur: 2, roleChecked: { pm: true, pl: false } }));
  assert.equal(r.total, 14);
});

test('직접 입력(custom): 반올림 없이 그대로, 총합만 0.5 반올림', () => {
  const r = compute(basis(), defIn({ dur: 2, custom: { pm: 3.3, ta: 0 } }));
  assert.equal(r.mms.pm, 3.3);
  assert.equal(r.mms.ta, 0);
  assert.equal(r.total, 16.5);   // 16 - 2 + 3.3 - 1 = 16.3 → 16.5
});

test('직접 입력(custom): 기간과 무관하게 고정', () => {
  const r = compute(basis(), defIn({ dur: 12, custom: { aos: 1 } }));
  assert.equal(r.mms.aos, 1);
  assert.equal(r.total, 81 - 7 + 1);
});

test('SI: 체크 안 하면 부가 항목이 있어도 미포함', () => {
  const r = compute(basis(), defIn({ dur: 2 }));
  assert.equal(r.total, 16);
  assert.deepEqual(r.si, { sum: 0, hasChecked: false, value: '', override: false });
});

test('SI: 항목 체크(1.0 + 2.0) + 변수 체크 → 총합 포함', () => {
  const I = defIn({ dur: 2, varChecked: { si: true } });
  I.siItems[0].checked = true; I.siItems[1].checked = true;
  const r = compute(basis(), I);
  assert.equal(r.total, 19);
  assert.deepEqual(r.si, { sum: 3, hasChecked: true, value: 3, override: false });
});

test('SI: 항목 체크해도 varChecked.si 없으면 총합 미포함(sum 은 계산됨)', () => {
  const I = defIn({ dur: 2 });
  I.siItems[3].checked = true;
  const r = compute(basis(), I);
  assert.equal(r.total, 16);
  assert.equal(r.si.sum, 0.5);
});

test('SI: 부가 항목 합은 0.5 단위 반올림', () => {
  const I = defIn({ dur: 2, varChecked: { si: true } });
  I.siItems[2].checked = true; I.siItems[3].checked = true;
  assert.equal(compute(basis(), I).si.sum, 2);
  I.siItems = [{ id: 'si_9', name: 'x', mm: 1.7, checked: true }];
  assert.equal(compute(basis(), I).si.sum, 1.5);
});

test('SI: 새 항목 추가 후 체크', () => {
  const I = defIn({ dur: 2, varChecked: { si: true } });
  I.siItems.push({ id: 'si_6', name: '신규', mm: 4, checked: true });
  const r = compute(basis(), I);
  assert.equal(r.si.sum, 4);
  assert.equal(r.total, 20);
});

test('SI: override 가 항목 합보다 우선', () => {
  const I = defIn({ dur: 2, varChecked: { si: true }, siOverride: '2.2' });
  I.siItems[0].checked = true;
  const r = compute(basis(), I);
  assert.equal(r.si.value, '2.2');
  assert.equal(r.si.override, true);
  assert.equal(r.total, 18);   // 16 + 2.2 = 18.2 → 18
});

test('SI: override 가 숫자가 아니면 0 으로 합산', () => {
  const r = compute(basis(), defIn({ dur: 2, varChecked: { si: true }, siOverride: 'abc' }));
  assert.equal(r.total, 16);
});

test('db(M/M 변수): 체크 시 합산, 미체크 시 제외', () => {
  assert.equal(compute(basis(), defIn({ dur: 2, vars: { db: '1.3' } })).total, 16);
  assert.equal(compute(basis(), defIn({ dur: 2, vars: { db: '1.3' }, varChecked: { db: true } })).total, 17.5);
  assert.equal(compute(basis(), defIn({ dur: 2, vars: { db: '별도' }, varChecked: { db: true } })).total, 16);
});

test('지점 설치/유지보수: 체크해도 total 미포함, excluded 로 반환', () => {
  const I = defIn({ dur: 2, vars: { branch: '0.5', maint: 3 }, varChecked: { branch: true, maint: true } });
  const r = compute(basis(), I);
  assert.equal(r.total, 16);
  assert.deepEqual(r.excluded, [
    { id: 'branch', name: '지점 설치', unit: 'MD/지점', value: '0.5', checked: true },
    { id: 'maint', name: '유지보수', unit: 'MM/월', value: '3', checked: true },
  ]);
});

test('excluded: 미체크·값 없음은 value 빈 문자열 / checked false', () => {
  const r = compute(basis(), defIn({ dur: 2 }));
  assert.deepEqual(r.excluded.map(e => [e.id, e.value, e.checked]), [['branch', '', false], ['maint', '', false]]);
});

test('합산 조합: 역할 + SI + db + 제외 변수', () => {
  const I = defIn({ dur: 3, vars: { db: 2, branch: 1 }, varChecked: { si: true, db: true, branch: true }, siOverride: '1' });
  const r = compute(basis(), I);
  assert.equal(r.total, 22.5 + 1 + 2);
  assert.equal(r.excluded.length, 2);
});

test('null/빈 입력에도 던지지 않음', () => {
  assert.equal(compute(null, null).total, 0);
  assert.deepEqual(compute({}, {}).mms, {});
});

test('사용자 기준표: fixed 역할·사용자 정의 M/M 변수', () => {
  const b = { roles: [{ id: 'x', base: 1.3, scale: 'fixed' }], vars: [{ id: 'z', name: 'Z', unit: 'M/M' }] };
  const r = compute(b, { dur: 10, varChecked: { z: true }, vars: { z: '0.5' } });
  assert.equal(r.mms.x, 1.5);    // 1.3 → 0.5 단위 반올림
  assert.equal(r.total, 2);
});

// ─── 정규화 ───
const normIn = v => plain(ev('_wnNormalizeInputs')(v));

test('_wnNormalizeInputs: dur 이상값', () => {
  const dur = v => normIn({ dur: v }).dur;
  assert.equal(dur(NaN), 2);
  assert.equal(dur('abc'), 2);
  assert.equal(dur(undefined), 2);
  assert.equal(dur('5'), 5);
  assert.equal(dur(-3), 1);
  assert.equal(dur(0), 1);
  assert.equal(dur(99), 24);
  assert.equal(dur(2.5), 3);
  assert.equal(dur(Infinity), 2);
  assert.equal(dur(null), 1);   // 의심: null 은 Number(null)=0 → 1 (undefined 는 2)
});

test('_wnNormalizeInputs: 입력이 객체가 아니면 기본값', () => {
  const d = plain(ev('_wnDefaultInputs()'));
  for (const v of [null, undefined, 'x', 5]) assert.deepEqual(normIn(v), d);
});

test('_wnNormalizeInputs: siItems 정규화', () => {
  const r = normIn({ siItems: [
    { id: 'si_1', name: 'a', mm: '1.5', checked: 1 },
    { id: 'si_2', name: null, mm: 'x', checked: 0 },
    { name: 'noid', mm: 1 },
    null,
    { id: 12, mm: 3 },
  ] });
  assert.deepEqual(r.siItems, [
    { id: 'si_1', name: 'a', mm: 1.5, checked: true },
    { id: 'si_2', name: '', mm: 0, checked: false },
    { id: '12', name: '', mm: 3, checked: false },
  ]);
  assert.equal(r._siNext, 12);
});

test('_wnNormalizeInputs: 체크/값은 기본이 아닌 것만 남김', () => {
  const r = normIn({ roleChecked: { pm: true, pl: false }, varChecked: { si: true, db: false }, vars: { db: '', branch: null, maint: 0, si: '1' }, custom: [1], siOverride: null });
  assert.deepEqual(r.roleChecked, { pl: false });
  assert.deepEqual(r.varChecked, { si: true });
  assert.deepEqual(r.vars, { maint: 0, si: '1' });
  assert.deepEqual(r.custom, {});
  assert.equal(r.siOverride, '');
});

test('_wnNormalizeInputs: 멱등', () => {
  const once = normIn({ dur: '7', roleChecked: { pm: false }, siOverride: 3 });
  assert.deepEqual(normIn(once), once);
  assert.equal(once.siOverride, '3');
});

test('_wnNormalizeInputs: custom 은 0 이상 유한 숫자만 남긴다(음수·문자열·NaN 제거)', () => {
  const r = normIn({ custom: { pm: -2, pl: 'x', bm: NaN, ta: 1.5, fe: 0 } });
  assert.deepEqual(r.custom, { ta: 1.5, fe: 0 });
});

test('_wnNormalizeBasis: 이상값은 기본 기준표', () => {
  const d = basis();
  const nb = v => plain(ev('_wnNormalizeBasis')(v));
  for (const v of [null, undefined, 'x', 3, {}, { roles: [], vars: [] }, { roles: 'a', vars: 5 }]) assert.deepEqual(nb(v), d);
  const custom = { roles: [{ id: 'q', base: 1, scale: 'fixed' }], vars: [] };
  assert.deepEqual(nb(custom), { roles: custom.roles, vars: d.vars });
});

test('wnFmtDelta / wnVersionSummaries', () => {
  const f = ev('wnFmtDelta');
  assert.equal(f(null), '');
  assert.equal(f(NaN), '');
  assert.equal(f(0.04), '±0');
  assert.equal(f(1.5), '+1.5');
  assert.equal(f(-2), '−2.0');
  const s = plain(ev('wnVersionSummaries')([{ version: 2, totalMm: 18 }, { version: 1, totalMm: 16.5 }, { version: 'x' }, null]));
  assert.deepEqual(s.map(v => [v.version, v.total, v.delta]), [[1, 16.5, null], [2, 18, 1.5]]);
});
