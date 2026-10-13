'use strict';
// app.js 계산 고정 테스트 (data.js → wisenm.js → app.js 를 더미 DOM 샌드박스에 로드)
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./load.js');

const { ctx, ev } = load(['data.js', 'wisenm.js', 'app.js']);
const plain = v => JSON.parse(JSON.stringify(v));
const setData = (members, assignments) => {
  ctx.__m = members; ctx.__a = assignments;
  ev('DATA.members = __m; DATA.assignments = __a;');
};
const setMode = m => ev(`state.assignMode = ${JSON.stringify(m)}`);
const A = (memberId, year, month, mm_plan, mm_actual, projectId = 'p1') => ({ memberId, projectId, year, month, mm: mm_plan, mm_plan, mm_actual });

test('app.js 로드: 핵심 함수 존재', () => {
  for (const n of ['memberActive', 'monthlyMaxCap', 'getMemberAnnual', 'getDisplayMM', 'parseMM', 'ymOf', 'ymParts', 'yearWindow'])
    assert.equal(ev(`typeof ${n}`), 'function', n);
});

// ─── memberActive ───
test('memberActive: 입사·퇴사 월 포함 경계', () => {
  const f = ev('memberActive');
  const m = { start: '2026-03', end: '2026-05' };
  assert.equal(f(m, 2026, 2), false);
  assert.equal(f(m, 2026, 3), true);
  assert.equal(f(m, 2026, 4), true);
  assert.equal(f(m, 2026, 5), true);
  assert.equal(f(m, 2026, 6), false);
  assert.equal(f(m, 2025, 12), false);
  assert.equal(f(m, 2027, 4), false);
});

test('memberActive: start/end 비어 있으면 무제한, 한쪽만 있어도 동작', () => {
  const f = ev('memberActive');
  assert.equal(f({ start: null, end: null }, 1999, 1), true);
  assert.equal(f({ start: '', end: '' }, 2100, 12), true);
  assert.equal(f({ start: '2026-03', end: null }, 2026, 2), false);
  assert.equal(f({ start: '2026-03', end: null }, 2099, 1), true);
  assert.equal(f({ start: null, end: '2026-03' }, 2026, 3), true);
  assert.equal(f({ start: null, end: '2026-03' }, 2026, 4), false);
  assert.equal(f({ start: '202603', end: '202603' }, 2026, 3), true);   // 하이픈 없는 형식도 허용
});

test('monthlyMaxCap: 재직 인원 수, members 인자로 범위 한정', () => {
  const ms = [
    { id: 'a', start: '2026-01', end: null },
    { id: 'b', start: '2026-03', end: '2026-05' },
    { id: 'c', start: null, end: '2026-02' },
  ];
  setData(ms, []);
  const f = ev('monthlyMaxCap');
  assert.equal(f(2026, 1), 2);
  assert.equal(f(2026, 3), 2);
  assert.equal(f(2026, 6), 1);
  assert.equal(f(2026, 6, [ms[1]]), 0);
  assert.equal(f(2026, 4, [ms[0], ms[1]]), 2);
  assert.equal(f(2026, 4, []), 0);
});

// ─── getDisplayMM ───
test('getDisplayMM: plan 모드는 항상 계획', () => {
  setMode('plan');
  const f = ev('getDisplayMM');
  assert.equal(f({ mm_plan: 1, mm_actual: 0.5 }), 1);
  assert.equal(f({ mm_plan: 1, mm_actual: 0 }), 1);
  assert.equal(f({ mm_plan: 0, mm_actual: 0.7 }), 0);
});

test('getDisplayMM: actual/both 모드는 실제>0 이면 실제, 아니면 계획', () => {
  const f = ev('getDisplayMM');
  for (const mode of ['actual', 'both']) {
    setMode(mode);
    assert.equal(f({ mm_plan: 1, mm_actual: 0.5 }), 0.5, mode);
    assert.equal(f({ mm_plan: 1, mm_actual: 0 }), 1, mode);
    assert.equal(f({ mm_plan: 0, mm_actual: 0.7 }), 0.7, mode);
    assert.equal(f({ mm_plan: 1 }), 1, mode);
    assert.equal(f({ mm_plan: 0.5, mm_actual: 1.5 }), 1.5, mode);   // 실제가 계획보다 커도 실제
  }
  setMode('actual');
});

test('getDisplayMM: mm_plan 없으면 mm 로 대체, 둘 다 없으면 0', () => {
  setMode('plan');
  const f = ev('getDisplayMM');
  assert.equal(f({ mm: 0.8 }), 0.8);
  assert.equal(f({}), 0);
  assert.equal(f({ mm_plan: 0, mm: 0.8 }), 0);   // mm_plan 이 0 이면 mm 는 무시(null 검사만)
  setMode('actual');
});

// ─── getMemberAnnual ───
test('getMemberAnnual: cap/total/avail (여유 +, 초과 -), 경계 월 포함', () => {
  setMode('actual');
  const m = { id: 'm1', start: '2026-03', end: '2026-05' };
  setData([m], [A('m1', 2026, 3, 1, 0), A('m1', 2026, 4, 1.5, 0), A('m1', 2026, 5, 0.5, 0)]);
  const r = plain(ev('getMemberAnnual')(m, 2026));
  assert.equal(r.cap, 3);
  assert.equal(r.total, 3);
  assert.equal(r.avail, 0);
  assert.deepEqual(r.active, [false, false, true, true, true, false, false, false, false, false, false, false]);
  assert.deepEqual(r.monthlyTotals, [0, 0, 1, 1.5, 0.5, 0, 0, 0, 0, 0, 0, 0]);
});

test('getMemberAnnual: 여유는 양수', () => {
  const m = { id: 'm1', start: null, end: null };
  setData([m], [A('m1', 2026, 1, 1, 0), A('m1', 2026, 2, 0.5, 0)]);
  const r = plain(ev('getMemberAnnual')(m, 2026));
  assert.equal(r.cap, 12);
  assert.equal(r.total, 1.5);
  assert.equal(r.avail, 10.5);
});

test('getMemberAnnual: 초과는 음수', () => {
  const m = { id: 'm1', start: '2026-01', end: '2026-02' };
  setData([m], [A('m1', 2026, 1, 1.5, 0), A('m1', 2026, 1, 1, 0, 'p2'), A('m1', 2026, 2, 1, 0)]);
  const r = plain(ev('getMemberAnnual')(m, 2026));
  assert.equal(r.cap, 2);
  assert.equal(r.total, 3.5);
  assert.equal(r.avail, -1.5);
});

test('getMemberAnnual: 계획/실제 모드에 따라 합계 변경', () => {
  const m = { id: 'm1', start: '2026-01', end: '2026-01' };
  setData([m], [A('m1', 2026, 1, 1, 0.5)]);
  setMode('plan');
  assert.equal(plain(ev('getMemberAnnual')(m, 2026)).total, 1);
  setMode('actual');
  assert.equal(plain(ev('getMemberAnnual')(m, 2026)).total, 0.5);
});

test('getMemberAnnual: 부동소수 합산 오차 제거(0.1 × 3 → 0.3), 월 합계 소수 2자리 반올림', () => {
  const m = { id: 'm1', start: '2026-01', end: '2026-01' };
  setData([m], [A('m1', 2026, 1, 0.1, 0), A('m1', 2026, 1, 0.1, 0, 'p2'), A('m1', 2026, 1, 0.1, 0, 'p3')]);
  const r = plain(ev('getMemberAnnual')(m, 2026));
  assert.equal(r.monthlyTotals[0], 0.3);
  assert.equal(r.avail, 0.7);
});

test('getMemberAnnual: 다른 연도·다른 멤버 투입은 제외', () => {
  const m = { id: 'm1', start: null, end: null };
  setData([m], [A('m1', 2025, 1, 1, 0), A('m2', 2026, 1, 1, 0)]);
  assert.equal(plain(ev('getMemberAnnual')(m, 2026)).total, 0);
});

test('getMemberAnnual: 재직 밖 달의 투입도 total 에 포함됨(현재 동작)', () => {
  const m = { id: 'm1', start: '2026-03', end: '2026-03' };
  setData([m], [A('m1', 2026, 3, 1, 0), A('m1', 2026, 6, 0.5, 0)]);
  const r = plain(ev('getMemberAnnual')(m, 2026));
  assert.equal(r.cap, 1);
  assert.equal(r.total, 1.5);   // 의심 여지: 재직 밖 투입이 초과로 잡힘(의도일 수 있음)
  assert.equal(r.avail, -0.5);
});

// ─── parseMM ───
test('parseMM: 빈 값', () => {
  const f = v => plain(ev('parseMM')(v));
  assert.deepEqual(f(''), { empty: true });
  assert.deepEqual(f('  '), { empty: true });
  assert.deepEqual(f(null), { empty: true });
  assert.deepEqual(f(undefined), { empty: true });
});

test('parseMM: 유효 값(0~2, 0.05 단위)', () => {
  const f = v => plain(ev('parseMM')(v));
  for (const [raw, v] of [['0', 0], ['0.05', 0.05], ['1', 1], ['1.15', 1.15], ['0.35', 0.35], ['2', 2], [' 1.5 ', 1.5], [0.5, 0.5], ['1.95', 1.95]])
    assert.deepEqual(f(raw), { value: v }, String(raw));
});

test('parseMM: 오류(숫자 아님 / 범위 / 단위)', () => {
  const f = v => plain(ev('parseMM')(v));
  assert.deepEqual(f('abc'), { error: '공수는 숫자로 입력하세요.' });
  assert.deepEqual(f('NaN'), { error: '공수는 숫자로 입력하세요.' });
  assert.deepEqual(f('Infinity'), { error: '공수는 숫자로 입력하세요.' });
  assert.deepEqual(f('-0.05'), { error: '공수는 0~2 사이로 입력하세요.' });
  assert.deepEqual(f('2.05'), { error: '공수는 0~2 사이로 입력하세요.' });
  assert.deepEqual(f('0.03'), { error: '공수는 0.05 단위로 입력하세요.' });
  assert.deepEqual(f('1.234'), { error: '공수는 0.05 단위로 입력하세요.' });
});

test('parseMM: keep 과 같은 값은 단위 검증 면제(범위는 유지)', () => {
  const f = (v, k) => plain(ev('parseMM')(v, k));
  assert.deepEqual(f('0.03', 0.03), { value: 0.03 });
  assert.deepEqual(f('0.03', 0.5), { error: '공수는 0.05 단위로 입력하세요.' });
  assert.deepEqual(f('3', 3), { error: '공수는 0~2 사이로 입력하세요.' });
});

// ─── 월 키 / 창 ───
test('ymOf / ymParts: 왕복', () => {
  const o = ev('ymOf'), p = v => plain(ev('ymParts')(v));
  assert.equal(o(2026, 1), 2026 * 12);
  assert.equal(o(2026, 12), 2026 * 12 + 11);
  assert.equal(o(2027, 1) - o(2026, 12), 1);
  assert.deepEqual(p(o(2026, 1)), { y: 2026, m: 1 });
  assert.deepEqual(p(o(2026, 12)), { y: 2026, m: 12 });
  for (let y = 2024; y <= 2027; y++) for (let m = 1; m <= 12; m++) assert.deepEqual(p(o(y, m)), { y, m });
});

test('shiftYM: 연도 경계 이동', () => {
  const s = (y, m, d) => plain(ev('shiftYM')(y, m, d));
  assert.deepEqual(s(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(s(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(s(2026, 6, 24), { y: 2028, m: 6 });
});

test('yearWindow: 기본 24개월(앞뒤 6개월), pad 표시', () => {
  ev('state.showPadMonths = true');
  const w = plain(ev('yearWindow')(2026));
  assert.equal(w.length, 24);
  assert.deepEqual([w[0].y, w[0].m, w[0].pad], [2025, 7, true]);
  assert.deepEqual([w[5].y, w[5].m, w[5].pad], [2025, 12, true]);
  assert.deepEqual([w[6].y, w[6].m, w[6].pad], [2026, 1, false]);
  assert.deepEqual([w[17].y, w[17].m, w[17].pad], [2026, 12, false]);
  assert.deepEqual([w[18].y, w[18].m, w[18].pad], [2027, 1, true]);
  assert.deepEqual([w[23].y, w[23].m, w[23].pad], [2027, 6, true]);
  assert.equal(w.filter(c => !c.pad).length, 12);
});

test('yearWindow: 토글 해제 시 12개월(1~12월)', () => {
  ev('state.showPadMonths = false');
  const w = plain(ev('yearWindow')(2026));
  assert.equal(w.length, 12);
  assert.deepEqual(w.map(c => c.m), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.ok(w.every(c => c.y === 2026 && c.pad === false));
  ev('state.showPadMonths = true');
});

test('isYM / MM_EPS', () => {
  const f = ev('isYM');
  assert.equal(f('2026-01'), true);
  assert.equal(f('2026-12'), true);
  assert.equal(f('2026-13'), false);
  assert.equal(f('2026-00'), false);
  assert.equal(f('202601'), false);
  assert.equal(ev('MM_EPS'), 1e-6);
});
