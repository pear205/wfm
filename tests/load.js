'use strict';
// 브라우저 전역 스크립트(data.js, wisenm.js, app.js)를 vm 샌드박스에 로드하는 헬퍼. 의존성 0.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', 'public');   // 앱 파일(배포 폴더)

// 어떤 속성 접근/호출/대입도 흡수하는 더미 DOM 요소
function dummy() {
  const store = Object.create(null);
  const fn = function () {};
  const p = new Proxy(fn, {
    get(_, k) {
      if (k === 'then') return undefined;                       // await 해도 멈추지 않게
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {};
      if (typeof k === 'symbol') return undefined;
      if (k in store) return store[k];
      if (k === 'length') return 0;
      if (k === 'dataset' || k === 'style') return (store[k] = {});
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'matches' || k === 'closest' || k === 'getAttribute') return () => null;
      if (k === 'querySelectorAll' || k === 'getElementsByClassName') return () => [];
      return (store[k] = dummy());
    },
    set(_, k, v) { store[k] = v; return true; },
    apply() { return dummy(); },
    construct() { return dummy(); },
  });
  return p;
}

function makeContext() {
  const doc = dummy();
  const mem = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document: doc,
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) },
    location: { search: '', hash: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' },
    history: { replaceState() {} },
    navigator: { userAgent: 'node-test' },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => dummy(),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    CSS: { escape: s => String(s) },
    // supabase: createClient 만 있으면 로드 가능. getSession 은 영원히 대기시켜 app.js 초기화(IIFE)를 멈춘다.
    supabase: {
      createClient: () => ({
        auth: {
          getSession: () => new Promise(() => {}),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({}), signInWithOAuth: async () => ({}),
        },
        from: () => dummy(),
      }),
    },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    innerHeight: 800, innerWidth: 1200,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

// files: 로드 순서. 같은 컨텍스트에 순서대로 실행(최상위 const/let 은 컨텍스트 렉시컬 스코프를 공유)
function load(files) {
  const ctx = makeContext();
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  // 테스트에서 샌드박스 안의 식별자(const 포함)를 읽고/실행하는 도구
  const ev = code => vm.runInContext(code, ctx);
  return { ctx, ev };
}

module.exports = { load, dummy };
