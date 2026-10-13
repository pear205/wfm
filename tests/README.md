# tests

계산 로직 고정 테스트 (Node 22 내장 러너, 의존성 0). 실행: `node --test` (프로젝트 루트에서 *.test.js 자동 탐색; Node 22 는 `node --test tests/` 처럼 디렉터리를 인자로 받으면 실패하므로 `node --test tests/*.test.js` 사용)
- `load.js`: `data.js`/`wisenm.js`/`app.js` 를 `vm` 샌드박스에 로드 (더미 DOM Proxy, 가짜 supabase 로 앱 초기화는 대기 상태로 멈춤)
- `wncompute.test.js`: `wnCompute` 와 입력 정규화 스냅샷 / `calc.test.js`: 재직·용량·표시 공수·월 키 계산
- 현재 동작을 고정하는 테스트이므로 계산 규칙을 의도적으로 바꾸면 기대값도 함께 갱신한다.
