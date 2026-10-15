'use strict';
// wisenm.js 기준표(BasisAPI) 소비 고정 테스트: 없으면 내장과 동일, 가짜 BasisAPI 반영, 스냅샷 basisRef
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./load.js');

// data.js 없이 wisenm.js 만 로드(BasisAPI 를 var 로 바꿔 끼울 수 있게)
const { ctx, ev } = load([]);
ev('function _deepCopy(o) { return JSON.parse(JSON.stringify(o)); }');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'wisenm.js'), 'utf8'), ctx, { filename: 'wisenm.js' });
const plain = v => JSON.parse(JSON.stringify(v));
const stable = v => ev('_wnStable')(v);

const builtin = () => plain(ev('({ roles: WISENM_ROLES, vars: WISENM_VARS })'));
const fake = content => ev(`var BasisAPI = { current: () => ({ id:'wisentm', version:3, source:'db', content: ${JSON.stringify(content)} }) }`);
const none = () => ev('var BasisAPI = undefined');

test('BasisAPI 가 없으면 기본 기준표·SI 항목이 내장과 같다', () => {
  none();
  assert.deepEqual(plain(ev('_wnDefaultBasis()')), builtin());
  assert.equal(ev('_wnDefaultInputs().siItems.length'), 5);
  assert.equal(ev('_wnDefaultInputs()._siNext'), 6);
  assert.deepEqual(plain(ev('_wnCurrentRef()')), { id: null, version: 0 });
});

test('내장(source builtin) BasisAPI 도 내장과 같다', () => {
  ev(`var BasisAPI = { current: () => ({ id:null, version:0, source:'builtin', content:{ roles:[{id:'x',cat:'a',name:'X',base:1,scale:'dev',active:true}], vars:[] } }) }`);
  assert.deepEqual(plain(ev('_wnDefaultBasis()')), builtin());
});

test('가짜 BasisAPI: inactive 역할 제외, 새 역할·SI 프리셋·색 반영', () => {
  const b = builtin();
  const roles = b.roles.map(r => ({ ...r, active: r.id !== 'sec' }));
  roles.push({ id: 'qa', cat: '품질', name: 'QA', base: 1, scale: 'dev', note: '검수', active: true });
  const vars = b.vars.map(v => ({ ...v, active: true, inTotal: false }));
  fake({ roles, vars, categories: [{ name: '품질', color: '#112233' }], siPresets: [{ id: 'si_1', name: '연동', mm: 3 }, { id: 'si_7', name: '이관', mm: 0.5 }] });
  const d = plain(ev('_wnDefaultBasis()'));
  assert.ok(!d.roles.some(r => r.id === 'sec'));
  assert.ok(d.roles.some(r => r.id === 'qa' && r.name === 'QA' && r.base === 1));
  assert.ok(!('active' in d.roles[0]));
  assert.deepEqual(d.vars.map(v => v.id), ['db', 'branch', 'maint', 'si']);
  assert.equal(ev("_wnCatColor('품질')"), '#112233');
  assert.equal(ev("_wnCatColor('관리')"), '#3D6FEB');
  const i = plain(ev('_wnDefaultInputs()'));
  assert.deepEqual(i.siItems.map(x => x.id), ['si_1', 'si_7']);
  assert.equal(i._siNext, 8);
  assert.deepEqual(plain(ev('_wnCurrentRef()')), { id: 'wisentm', version: 3 });
  // 저장본 복원(정규화)은 DB 기준이 아니라 내장 기준을 쓴다
  assert.deepEqual(plain(ev('_wnNormalizeBasis(null)')), builtin());
  assert.equal(ev('_wnNormalizeInputs(null).siItems.length'), 5);
  // 계산은 새 역할까지 그대로 동작
  const c = plain(ev('wnCompute')(d, plain(ev('_wnDefaultInputs()'))));
  assert.equal(c.mms.qa, 1);
  none();
});

test('스냅샷에 basisRef 가 들어가고, 과거(basisRef 없는) 스냅샷은 그대로 통과', () => {
  none();
  ev('_wnNewState()');
  assert.deepEqual(plain(ev('_wnSnapshot().basisRef')), { id: null, version: 0 });
  fake({ roles: builtin().roles, vars: builtin().vars });
  ev('_wnNewState()');
  assert.deepEqual(plain(ev('_wnSnapshot().basisRef')), { id: 'wisentm', version: 3 });
  // 과거 스냅샷: basisRef 없음 → 내장 ref, 입력은 정규화 후에도 동일, dirty 아님
  const old = plain(ev('(() => { const s = _wnSnapshot(); delete s.basisRef; return s; })()'));
  none();
  const ins = plain(ev('_wnDefaultInputs()'));
  assert.equal(stable(ev('_wnNormalizeInputs')(ins)), stable(ins));
  assert.deepEqual(plain(ev('_wnNormalizeRef')(old.basisRef)), { id: null, version: 0 });
  ev('_wnNewState()');
  assert.equal(ev('_wn.dirty'), false);
  ev('_wnApply')({ id: 'e1' }, { version: 1, snapshot: old });
  assert.equal(ev('_wn.dirty'), false);
  assert.deepEqual(plain(ev('_wn.basisRef')), { id: null, version: 0 });
});
