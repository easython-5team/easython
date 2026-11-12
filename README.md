# 현장노트 · 읽음에서 이해로

EasyThon 5팀 레포지토리. 관리자가 한국어로 쓴 작업 변경 지시를 AI가 조건 단위로 나누고, 작업자가 QR로 접속해 자기 언어로 듣고·말하고, AI가 **조건별로 이해했는지** 확인한다. 공지에 근거가 없는 질문은 AI가 답하지 않고 관리자에게 넘기며, 관리자 답변은 작업자 언어로 전달되고 공지의 새 버전으로 반영된다.

## 유저 플로우

| 관리자 | 작업자 (휴대폰) |
| --- | --- |
| ① 한국어 변경 지시 작성 → **AI 조건 추출**(시점·장소·행동·금지·예외 + 원문 근거) | ① QR 스캔 → **언어 선택**(English / Tiếng Việt) → 이름 입력 |
| ② 조건·확인 대상·상황 질문 검수 | ② 모국어 공지와 상황 질문 읽기, **TTS로 듣기** |
| ③ **작업자 화면 미리보기** + 역번역 기반 **번역 의미 검증** | ③ **말하기(STT) → 인식 문장 확인·수정** 또는 텍스트 입력 |
| ④ 발행 → **QR·링크** 공유 | ④ 조건별 판정: 충족 → 이해 확인 / 누락 → 한 번 되묻기 / 충돌 → 근거와 함께 재설명 |
| ⑤ 대시보드: 작업자별 상태·판정 근거, **확인 요청에 답변** | ⑤ 공지에 근거 없는 질문 → 관리자에게 전달 → 답변을 모국어로 수신 |

## AI 사용 위치와 안전장치

| 단계 | AI가 하는 일 | 서버가 검증하는 것 |
| --- | --- | --- |
| 분석 | 원문 → 조건 목록, 확인할 조건, 상황 질문과 출제 이유 | 각 조건의 근거가 원문의 **정확한 부분 문자열**인지 |
| 번역 | EN·VI 번역 후 **별도 호출로 역번역·조건별 의미 비교** | 조건 ID 일치, 한국어 잔존 여부. 검증 실패 시 관리자 확인 없이는 발행 불가 |
| 판정 | 답변에서 조건별 met/missing/conflict와 **작업자 발화 인용** | 인용이 실제 발화에 없으면 met/conflict를 **누락으로 강등**. 상태 전이(되묻기 1회, 충돌은 확인 불가, 근거 없는 질문은 관리자 전달)는 `lib/decide.js`가 결정 |
| 관리자 답변 | 한국어 답변을 모든 작업자 언어로 번역 | 번역 결과를 공지 새 버전(addendum)으로 기록, 이후 판정 근거에 포함 |

발행 시에는 AI를 호출하지 않는다. 관리자가 검수한 번역이 그대로 작업자에게 전달된다. 구조화 출력은 OpenAI Responses API의 strict JSON schema(`gpt-5.4-mini`)를 쓴다. STT/TTS는 브라우저 Web Speech API를 쓰며, 지원되지 않는 기기에서는 읽기·텍스트 입력으로 대체된다.

## 실행

Node.js 24 이상.

```sh
npm ci
npm run demo        # API 키 없이 스크립트 시나리오로 전체 플로우 (http://127.0.0.1:3102)
cp .env.example .env.local   # OPENAI_API_KEY 입력
npm run dev         # 실제 AI (http://127.0.0.1:3000)
npm test            # API 요금 없이 전체 흐름 테스트
npm run verify      # 타입체크 → React Compiler 검사 → 테스트 → 프로덕션 빌드
```

TypeScript(strict, `noUncheckedIndexedAccess`)와 React Compiler(`reactCompiler: true`)를 사용한다. 소스는 `.ts` 확장자로 import하며, 테스트와 스크립트는 Node 24의 타입 제거 기능으로 빌드 없이 실행된다. `npm run check:compiler`는 모든 클라이언트 컴포넌트·훅이 컴파일러로 최적화되는지 확인하고, bail-out이 하나라도 있으면 실패한다. React Compiler 1.0은 `try/finally`와 구조 분해 props 기본값에서 bail-out하므로 두 문법을 쓰지 않는다.

데모 시나리오와 화면별 기대 결과는 [로컬 데모 모드 QA 가이드](docs/demo-mode.md)를 참고한다.

### 휴대폰 QR 시연

휴대폰에서 열고 음성 인식을 쓰려면 HTTPS 주소가 필요하다. 예: `cloudflared tunnel --url http://127.0.0.1:3102` 로 받은 주소를 `.env.local`(데모는 셸 환경 변수)의 `PUBLIC_BASE_URL`에 넣고 서버를 다시 시작하면 대시보드 QR이 그 주소로 생성된다. `next.config.mjs`에 trycloudflare·ngrok 개발 출처가 허용되어 있다.

## 구조

- `app/page.tsx` 관리자 작성·검수 · `app/notices/[id]` 대시보드 · `app/n/[id]` 작업자 화면 · `app/api/[action]` API
- `lib/types.ts` 도메인·API 타입 · `lib/api.ts` 액션 목록과 응답 타입(클라이언트 `post()`가 이 타입을 그대로 사용)
- `lib/ai.ts` 실제 AI 호출 · `lib/demo.ts` 키 없는 데모 엔진(같은 `Engine` 인터페이스) · `lib/decide.ts` 판정 상태 머신 · `lib/workflow.ts` 서비스 로직 · `lib/store.ts` SQLite(`data/fieldnote.db`)
- `lib/languages.ts` 작업자 언어와 UI 문구. 베트남어 문구는 영어 문구 타입에 맞춰 검사되므로 빠진 문구가 있으면 타입체크가 실패한다.

로컬에서는 관리자 화면에 로그인이 없다. 공개 배포 전에 관리자 인증을 추가해야 한다. 작업자 응답 API에는 주소별 분당 요청 제한이 있다.
