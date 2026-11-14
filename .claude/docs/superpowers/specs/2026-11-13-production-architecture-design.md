# 실서비스 아키텍처 설계

작성일: 2026-11-13 · 상태: 섹션 1 구현 완료, 섹션 2(DB)·3(AI)·4(배포) 보류

## 목표와 범위

로컬 데모를 걷어내고, Vercel에 배포할 수 있는 풀스택 Next.js 서비스로 전환한다. 목표 시점은 "해커톤 다음 단계 시연"이므로 안정성보다 속도를 우선하되, 실제 공개 주소에서 여러 작업자가 동시에 써도 데이터가 유지돼야 한다.

### 결정 사항

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 데모 모드 | 제거 | 실서비스만 유지한다. |
| DB | 보류. 지금 `node:sqlite` 로컬 파일을 그대로 쓰고 `server/db/`로 위치만 옮긴다 | 2026-11-13 결정: DB 전환은 이번에 하지 않는다. 섹션 2의 libSQL/Turso 설계는 배포를 다시 논의할 때 쓴다. Vercel 서버리스는 로컬 파일을 유지하지 못하므로 배포 전에는 전환이 필요하다. |
| 관리자 로그인 | 이번 범위에서 제외 | 다음 단계에서 현장(site)과 함께 추가한다. |
| 장기 목표 | 현장 여러 개, 관리자 여러 명 | 로그인 단계에서 `sites`·멤버 테이블을 추가할 수 있게 경계를 남긴다. |
| AI 공급자 | 보류. 지금 OpenAI 호출 코드를 동작 변경 없이 `server/ai/`로 옮기기만 한다 | Grok은 무료로 쓸 수 있는 경우에만 쓰기로 했고, 무료 제공 여부가 공식 자료로 확인되지 않았다. 섹션 3 참고. |
| 배포 | 보류 | 섹션 1을 끝낸 뒤 DB 전환과 함께 다시 논의한다. 섹션 4 참고. |
| 테스트 | 흐름 테스트 제거. 판정 상태 머신 테스트(`decide.test.ts`)만 유지 | 사용자는 테스트가 없어도 된다고 했다. 이 파일은 AI·DB 없이 도는 순수 로직 테스트라 유지 비용이 거의 없고 안전 규칙을 지키므로 남긴다. |

### 범위 밖

관리자 로그인, 현장 구분, 결제, 감사 로그, 실시간 푸시(폴링 유지).

## 섹션 1. 폴더 구조 (승인)

```
app/                          라우트만 (얇게)
  page.tsx                    관리자 · 공지 작성
  notices/[id]/page.tsx       관리자 · 대시보드
  n/[id]/page.tsx             작업자
  api/[action]/route.ts       API 진입점 (액션 디스패처 유지)

features/
  admin/                      AdminWorkspace, Dashboard, QrPanel …
  worker/                     WorkerApp, Conversation, NoticeView, speech …

ui/                           Shell, FloatingError, tone.ts

shared/                       서버·브라우저 공용, 비밀값 없음
  types.ts  languages.ts  api-types.ts

server/                       서버 전용, 모든 파일 첫 줄 import "server-only"
  ai/
    provider.ts               공급자 선택과 요청 (한 곳)
    tasks.ts                  분석 · 번역 · 역번역 · 판정 (프롬프트 + 스키마)
  db/
    store.ts                  쿼리 함수 (지금 node:sqlite 그대로)
  workflow.ts  decide.ts  input.ts  errors.ts  actions.ts
```

DB 전환(섹션 2)을 할 때 `server/db/client.ts`, `server/db/migrations/`, `server/rate-limit.ts`, `scripts/db-migrate.ts`가 추가된다.

### 규칙

1. `server/`의 모든 파일은 `import "server-only"`로 시작한다. 브라우저 코드가 import하면 빌드가 실패한다.
2. `features/`와 `ui/`는 `server/`를 import하지 않는다. 서버와는 `shared/api-types.ts`의 타입으로만 연결된다.
3. `app/`은 라우트 연결만 하고 로직을 두지 않는다.

### 삭제 대상

- `lib/demo.ts`, `scripts/demo-env.ts`, `npm run demo` 스크립트, `data/fieldnote-demo.db*`, `.next-demo/`
- `tests/demo-flow.test.ts`, `tests/live-flow.test.ts`, `tests/helpers.ts`
- 관리자 화면의 "예시 불러오기", "데모 답변 넣기" 버튼과 관련 props(`demoSource`, `demoAnswer`, `demo`)
- `.claude/docs/demo-mode.md`(데모 QA 가이드)와 README의 데모 안내

## 섹션 2. DB (설계 승인, 구현 보류)

2026-11-13 결정: 이번에는 구현하지 않는다. 요청 제한도 지금처럼 서버 메모리에서 센다. 아래 설계는 배포를 준비할 때 그대로 쓴다.

### 연결 (`server/db/client.ts`)

- `@libsql/client` 하나로 로컬과 배포를 처리한다.
- `DATABASE_URL` 기본값은 `file:data/fieldnote.db`. Vercel에서는 `DATABASE_URL=libsql://….turso.io`와 `DATABASE_AUTH_TOKEN`을 설정한다.
- `node:sqlite` 전용 PRAGMA(WAL, busy_timeout)는 제거한다.

### 테이블 (`server/db/migrations/001_init.sql`)

지금 테이블 6개를 구조 그대로 옮긴다: `previews`, `notices`, `addenda`, `sessions`, `turns`, `escalations`.

추가:

| 테이블 | 용도 |
| --- | --- |
| `rate_limits(key, window_start, count)` | 작업자 공개 액션(`join`, `respond`)의 분당 요청 제한. 메모리 `Map`은 서버리스 인스턴스마다 따로 세므로 대체한다. |
| `_migrations(name, applied_at)` | 적용한 마이그레이션 기록 |

현장 구분은 로그인 단계에서 `002_sites.sql`로 추가한다(`sites`, `site_members`, `notices.site_id`). 기존 테이블 구조는 바꾸지 않는다.

### 마이그레이션

- `npm run db:migrate`가 `migrations/*.sql`을 이름 순으로 적용하고, `_migrations`에 있는 것은 건너뛴다.
- 빌드 단계에서 자동 실행하지 않는다. Vercel은 미리보기 배포마다 빌드하므로, 자동 실행하면 미리보기가 운영 DB 구조를 바꿀 수 있다. 배포 전에 수동으로 실행한다.

### 코드 변화

- 모든 store 함수가 비동기가 되고 `workflow.ts` 호출부에 `await`이 붙는다.
- 여러 테이블을 함께 바꾸는 세 곳은 libSQL 트랜잭션으로 묶는다.
  - 발행: 미리보기 → 공지 복사
  - 관리자 답변: addendum 생성 + 공지 버전 증가 + escalation 해결
  - 작업자 답변: turn 저장 + 필요 시 escalation 생성

### 지연 시간

원격 DB는 쿼리마다 네트워크 왕복이 생긴다. Vercel 함수 지역을 서울(`icn1`)로, Turso DB를 가장 가까운 지역으로 맞춘다. Turso 지원 지역은 계정 생성 시 확인한다.

## 섹션 3. AI 공급자 (보류)

2026-11-13 결정: Grok은 무료로 가능한 범위에서만 쓴다. 공식 xAI 페이지에서 무료 크레딧을 확인하지 못했고, 최근 자료들은 가입 크레딧과 월 $150 데이터 공유 프로그램이 종료됐거나 확인되지 않는다고 한다. 데이터 공유 프로그램은 가입 후 철회할 수 없고 작업자 답변이 학습에 쓰이므로, 다시 검토할 때 xAI 콘솔의 Billing 화면과 데이터 정책을 먼저 확인한다. 아래는 검토 기록이다.

### Grok API 검토 결과

- xAI는 `https://api.x.ai/v1`의 OpenAI 호환 API이고, 지금 코드가 쓰는 `/v1/responses` + `text.format: { type: "json_schema", strict: true }` 형태를 그대로 지원한다. ([xAI Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs))
- 우리 스키마는 `object`, `array`, `string`, `boolean`, `required`, `additionalProperties: false`만 쓴다. xAI가 거부하는 기능(정규식 `\p{...}`, 순환 `$ref`, `items` 배열 형식 등)은 쓰지 않는다.
- 후보 모델 ([xAI Models](https://docs.x.ai/developers/models), 100만 토큰당 입력/출력, 2026-11-13 조회):

| 모델 | 가격 | 용도 후보 |
| --- | --- | --- |
| `grok-4.20-0309-non-reasoning` | $1.25 / $2.50 | 조건 추출, 번역, 역번역 |
| `grok-4.20-0309-reasoning` | $1.25 / $2.50 | 작업자 답변 판정 |
| `grok-4.7` | $2.00 / $6.00 | xAI 권장 범용 모델 |

### 확인이 필요한 위험

- **번역 품질:** 한국어 ↔ 베트남어·영어 번역과 역번역 품질은 공식 자료로 확인되지 않는다. 오역이 안전 문제로 이어지는 서비스이므로, 강풍 옥상 작업 공지 같은 실제 문장 세트로 OpenAI 모델과 비교한 뒤 기본값을 확정한다.
- **데이터 보관:** 지금 코드는 OpenAI에 `store: false`를 보낸다. xAI에 같은 옵션이나 보관 정책이 있는지 문서에서 확인하지 못했다. 작업자 이름과 답변이 전송되므로 계정 생성 시 확인한다.

### 설계

- `server/ai/provider.ts`가 `AI_PROVIDER`(`xai` | `openai`, 기본 `xai`)에 따라 기본 주소, API 키(`XAI_API_KEY` / `OPENAI_API_KEY`), 모델을 고른다.
- 작업별 모델은 환경 변수로 덮어쓸 수 있게 한다(예: `AI_MODEL_FAST`, `AI_MODEL_JUDGE`).
- 요청 본문 형태는 두 공급자가 같으므로 `requestObject` 하나를 유지한다. 공급자별 차이(`store` 옵션 등)는 provider 설정에만 둔다.
- 에러 문구에서 "OpenAI"를 공급자 이름으로 바꾼다.

## 섹션 4. 배포와 운영 (보류)

섹션 1·2를 끝낸 뒤 다시 논의한다. 아래는 지금까지의 제안이다.

| 항목 | 방향 |
| --- | --- |
| 함수 실행 시간 | 미리보기(번역 + 역번역 여러 번 호출)가 길다. API 라우트에 `maxDuration`을 지정한다. |
| 함수 지역 | `icn1`(서울) |
| QR 주소 | `PUBLIC_BASE_URL` 대신 요청 주소 또는 Vercel 배포 주소 기준으로 생성하고, localhost 경고는 개발 환경에서만 보인다. |
| 요청 제한 | `rate_limits` 테이블 사용 (섹션 2) |
| 관리자 보호 | 로그인 전까지는 공개 주소에서 누구나 발행할 수 있고 AI 비용이 나간다. 시연 기간에는 Vercel Deployment Protection을 쓰되, 작업자 QR 접속(`/n/*`, 작업자 API)이 막히지 않는 방법을 확정해야 한다. |
| 환경 변수 | `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `AI_PROVIDER`, `XAI_API_KEY` 또는 `OPENAI_API_KEY`, 선택: `AI_MODEL_*` |

## 검증 방법 (섹션 1)

데모를 지우고 API 키가 없으면 "AI로 변경 조건 분석"부터 실패하므로 앱을 화면으로 끝까지 돌릴 수 없다. 대신 다음으로 확인한다.

1. `npm run verify` (타입체크, React Compiler 검사, `decide.test.ts`, 빌드)
2. 기존 `data/fieldnote.db`에 저장된 공지로 작업자 화면(`/n/[id]`)과 대시보드(`/notices/[id]`)가 200으로 뜨는지 확인. 공지가 없으면 커밋하지 않는 임시 스크립트로 store 함수를 호출해 하나 넣는다.

## 다음 단계

1. 섹션 1 구현
2. 섹션 2(DB), 섹션 3(AI), 섹션 4(배포) 재논의
