# 폴더 구조 정리 + libSQL 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데모 모드를 걷어내고, 코드를 역할별 폴더로 나눈 뒤, DB를 `node:sqlite`에서 로컬 파일과 Turso를 모두 쓸 수 있는 `@libsql/client`로 바꾼다.

**Architecture:** 동작을 바꾸지 않는 폴더 이동을 먼저 끝내고(Task 1), 데모를 제거한 뒤(Task 2), DB 계층만 비동기 libSQL로 교체한다(Task 3·4). AI 호출 코드(OpenAI Responses API)는 위치만 옮기고 내용은 그대로 둔다.

**Tech Stack:** Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 7 strict, Tailwind v4, `@libsql/client@0.18.0`, `server-only@0.0.1`, Node 24 (`node --test`, 타입 제거 실행).

**Spec:** `.claude/docs/superpowers/specs/2026-11-13-production-architecture-design.md` (섹션 1·2)

## Global Constraints

- 패키지 매니저는 pnpm. 의존성 추가 후 `npm install --package-lock-only --ignore-scripts`로 `package-lock.json`도 맞춘다(README가 `npm ci`를 안내함).
- `server/`의 모든 파일은 첫 줄이 `import "server-only";`다.
- `features/`, `ui/`는 `server/`를 값으로 import하지 않는다. 예외는 `shared/api-types.ts`의 `import type`(빌드 시 지워짐)뿐이다.
- `app/`은 라우트 연결만 한다.
- Node로 직접 실행하는 스크립트와 테스트는 `--conditions=react-server`로 실행한다(`server-only`가 일반 Node 조건에서는 예외를 던진다).
- 소스 import는 지금처럼 `.ts` 확장자를 붙인다. `.tsx` 컴포넌트 import는 확장자 없이 둔다(지금 관례).
- React Compiler는 bail-out 0건을 유지한다. `try/finally`와 구조 분해 props 기본값을 클라이언트 코드에 쓰지 않는다.
- AI 코드(`lib/ai.ts`의 프롬프트·스키마·요청)는 내용 변경 금지. 이동과 import 경로 수정만 한다.
- DB 기본 주소: `file:data/fieldnote.db`. 환경 변수: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`.
- 마이그레이션은 빌드에서 자동 실행하지 않는다.
- 테스트는 `tests/decide.test.ts`만 남긴다.

## Review Focus

1. **마이그레이션을 안 돌린 새 DB:** 처음 클론한 사람이 `npm run dev`만 하면 "no such table" 500이 난다. 기대: 원인을 알려주는 에러 문구. → Task 3에서 `no such table`을 잡아 "npm run db:migrate를 실행하세요"로 바꾸고, 빈 DB로 확인한다.
2. **트랜잭션 중간 실패:** 관리자 답변 처리 중 addendum insert가 실패하면 공지 버전만 올라간 채 남으면 안 된다. 기대: 아무것도 바뀌지 않음. → Task 3 스모크 스크립트에서 이미 해결된 escalation에 다시 답해 409가 나고 `notices.version`이 그대로인지 확인한다.
3. **같은 답변 중복 전송:** 작업자가 보내기를 두 번 누르거나 서버리스 인스턴스 두 곳에 요청이 가면 turn이 두 번 저장되면 안 된다. → Task 3 스모크에서 같은 `recordTurn`을 두 번 호출해 행이 1개인지 확인한다.
4. **요청 제한 경계:** 분당 20회까지는 통과, 21번째는 429. 다음 분에는 다시 통과. → Task 4에서 검증한다.
5. **원격 DB의 정수 타입:** libSQL은 설정에 따라 정수를 `bigint`로 줄 수 있다. `version`, `turn`이 문자열·bigint로 새면 `turns[turn]` 인덱싱과 비교가 깨진다. → Task 3에서 `intMode: "number"`를 명시하고, 스모크에서 `typeof turn.version === "number"`를 확인한다.

---

### Task 1: 역할별 폴더로 이동 (동작 변경 없음)

**Files:**
- Move: `components/AdminWorkspace.tsx`, `components/Dashboard.tsx` → `features/admin/`
- Move: `components/WorkerApp.tsx`, `components/NoticeView.tsx`, `components/speech.ts` → `features/worker/`
- Move: `components/Shell.tsx`, `components/FloatingError.tsx`, `components/tone.ts`, `components/request.ts` → `ui/`
- Move: `lib/types.ts`, `lib/languages.ts` → `shared/`
- Move: `lib/ai.ts` → `server/ai/tasks.ts`
- Move: `lib/store.ts` → `server/db/store.ts`
- Move: `lib/workflow.ts`, `lib/decide.ts`, `lib/input.ts`, `lib/errors.ts`, `lib/demo.ts` → `server/`
- Move: `lib/api.ts` → `server/actions.ts`
- Create: `shared/api-types.ts`
- Modify: `app/**/*.tsx`, `app/api/[action]/route.ts`, `tests/decide.test.ts`, `scripts/check-react-compiler.ts`, `package.json`

**Interfaces:**
- Produces: `shared/api-types.ts`가 `export type { Action, ActionResult, Body } from "../server/actions.ts";`만 담는다(전부 `import type`/`export type`). `ui/request.ts`는 여기서 타입을 가져온다.
- Produces: `server/actions.ts`는 지금 `lib/api.ts`의 `actions`, `isAction`, `Action`, `ActionResult`, `Body`를 그대로 export한다.

- [ ] **Step 1: `git mv`로 위 파일을 모두 옮긴다.** 내용 수정 없이 이동만 한다(히스토리 보존). `lib/demo.ts`도 Task 2에서 지우기 전까지 `server/demo.ts`로 옮겨 빌드를 유지한다.
- [ ] **Step 2: `pnpm add server-only@0.0.1`을 실행하고 `server/` 아래 모든 `.ts` 파일 첫 줄에 `import "server-only";`를 넣는다.**
- [ ] **Step 3: 모든 import 경로를 새 위치로 고친다.** `ui/request.ts`의 `import type { Action, ActionResult } from "../lib/api.ts"`는 `from "../shared/api-types.ts"`로 바꾼다.
- [ ] **Step 4: `scripts/check-react-compiler.ts`가 `components` 대신 `features/admin`, `features/worker`, `ui` 세 폴더의 `.ts`/`.tsx`를 모두 검사하도록 바꾼다.**
- [ ] **Step 5: `package.json` 스크립트를 고친다.**
  - `"test": "node --conditions=react-server --test tests/*.test.ts"`
  - `demo` 스크립트는 Task 2에서 지우므로 이 단계에서는 그대로 둔다.
- [ ] **Step 6: 경계 규칙을 확인한다.**

Run: `grep -rnE "from \"(\.\./)+server/" features ui | grep -v "import type"`
Expected: 출력 없음.

- [ ] **Step 7: 전체 검증**

Run: `npm run verify`
Expected: exit 0. "React Compiler optimized 14 components/hooks with no bail-outs." 테스트는 지금처럼 모두 통과(아직 흐름 테스트를 지우기 전).

- [ ] **Step 8: 커밋** `refactor: 역할별 폴더(features/ui/shared/server)로 이동`

---

### Task 2: 데모 모드 제거

**Files:**
- Delete: `server/demo.ts`, `scripts/demo-env.ts`, `tests/demo-flow.test.ts`, `tests/live-flow.test.ts`, `tests/helpers.ts`, `.claude/docs/demo-mode.md`
- Modify: `server/workflow.ts`, `shared/types.ts`, `app/page.tsx`, `app/notices/[id]/page.tsx`, `features/admin/AdminWorkspace.tsx`, `features/admin/Dashboard.tsx`, `ui/Shell.tsx`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `package.json`, `README.md`

**Interfaces:**
- Produces: `server/workflow.ts`는 `engine()`, `isDemo()`, `engines` 없이 `server/ai/tasks.ts`의 `analyzeNotice`, `translateNotice`, `judge`, `translateAddendum`을 직접 호출한다. export 함수 시그니처는 그대로다.
- Produces: `AdminWorkspace({ recent }: { recent: RecentNotice[] })`, `Dashboard({ id, baseUrl }: { id: string; baseUrl: string })`, `Shell`에서 `demo` prop 삭제.

- [ ] **Step 1: 파일 삭제와 데모 분기 제거.**
  - `shared/types.ts`의 `Engine` 인터페이스와 그 위 주석을 지운다.
  - `AdminWorkspace`: `demoSource` prop, `example` 상수, "예시 불러오기" 버튼을 지운다. 원문 초기값은 `""`. 초안이 있을 때의 "원문 수정" 버튼은 남긴다.
  - `Dashboard`: `demoAnswer` prop과 "데모 답변 넣기" 버튼을 지운다.
  - `Shell`: `demo` prop과 "로컬 데모" 배지를 지운다.
- [ ] **Step 2: 설정 정리.**
  - `next.config.ts`: `distDir`을 지워 기본값 `.next`를 쓴다.
  - `tsconfig.json`: `.next-demo` 관련 include·exclude를 지운다.
  - `.gitignore`: `.next-demo/` 줄을 지운다.
  - `package.json`: `demo` 스크립트를 지운다.
  - `rm -rf .next-demo data/fieldnote-demo.db*` (gitignore 대상이라 커밋에는 안 나타남)
- [ ] **Step 3: `README.md`에서 데모 관련 문장(`npm run demo`, 데모 QA 가이드 링크, "API 키 없이")을 지운다.** 실행 방법은 `cp .env.example .env.local` → 키 입력 → `npm run db:migrate`(Task 3에서 생김) → `npm run dev`로 적는다.
- [ ] **Step 4: 남은 참조가 없는지 확인**

Run: `grep -rnE "\bdemo\b|Demo|EASYTHON|next-demo" --include=*.ts --include=*.tsx --include=*.json --include=*.md . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude`
Expected: 출력 없음. (`demonstrate` 같은 단어가 걸리지 않도록 단어 경계를 쓴다.)

- [ ] **Step 5: 전체 검증**

Run: `npm run verify`
Expected: exit 0, 테스트는 `decide.test.ts`만 돌고 모두 통과.

- [ ] **Step 6: 커밋** `refactor: 데모 모드 제거`

---

### Task 3: `@libsql/client`로 DB 계층 교체

**Files:**
- Create: `server/db/client.ts`, `server/db/migrations/001_init.sql`, `scripts/db-migrate.ts`
- Modify: `server/db/store.ts`, `server/workflow.ts`, `server/actions.ts`, `app/page.tsx`, `app/n/[id]/page.tsx`, `app/notices/[id]/page.tsx`, `app/api/[action]/route.ts`, `package.json`, `.env.example`

**Interfaces:**
- Produces (`server/db/client.ts`):
  - `db(): Client`: 싱글턴. `createClient({ url: process.env.DATABASE_URL || "file:data/fieldnote.db", authToken: process.env.DATABASE_AUTH_TOKEN, intMode: "number" })`. URL이 `file:`로 시작하면 부모 폴더를 `mkdirSync(..., { recursive: true })`로 만든다.
  - `closeDb(): void`
- Produces (`server/db/store.ts`): 지금 export 함수 이름과 인자를 모두 유지하되 반환 타입만 `Promise<…>`로 바뀐다. 단 `workerNotice(notice, lang)`는 DB를 안 쓰므로 동기 유지.
  - `savePreview → Promise<string>`, `getPreview → Promise<{…} | undefined>`, `publishPreview → Promise<string>`, `getNotice → Promise<Notice | null>`, `createSession → Promise<string>`, `getSession → Promise<Session | undefined>`, `getTurns → Promise<Turn[]>`, `recordTurn → Promise<Turn>`, `sessionEscalations → Promise<Escalation[]>`, `getEscalation → Promise<Escalation | undefined>`, `resolveEscalation → Promise<{ addendumId: string; version: number }>`, `recentNotices → Promise<RecentNotice[]>`, `dashboard → Promise<{ sessions; escalations }>`
  - `closeStore`는 삭제하고 `closeDb`로 대체한다.
- Produces (`server/workflow.ts`): `publish`, `noticeFor`, `join`, `sessionView`, `dashboardView`가 `Promise`를 반환한다. 나머지 시그니처는 그대로다.

- [ ] **Step 1: `pnpm add @libsql/client@0.18.0` 후 `npm install --package-lock-only --ignore-scripts`.** Next 16.4의 기본 `serverExternalPackages` 목록에 `@libsql/client`와 `libsql`이 이미 들어 있으므로 `next.config.ts`는 건드리지 않는다.
- [ ] **Step 2: `server/db/migrations/001_init.sql` 작성.** 지금 `lib/store.ts`의 `CREATE TABLE IF NOT EXISTS` 6개를 그대로 옮기고(PRAGMA 세 줄은 제외), 아래 두 테이블을 추가한다.

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);
```

`_migrations`는 마이그레이션 스크립트가 직접 만든다(SQL 파일에 넣지 않는다).

- [ ] **Step 3: `scripts/db-migrate.ts` 작성.** 동작: `db()`로 연결 → `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))` → `server/db/migrations/*.sql`을 이름순으로 읽어, `_migrations`에 없는 파일만 `client.executeMultiple(sql)`로 적용하고 이름을 기록한다. 파일마다 `applied <name>` 또는 `skip <name>`을 출력한다.
  - `package.json`: `"db:migrate": "node --conditions=react-server scripts/db-migrate.ts"`
- [ ] **Step 4: `server/db/store.ts`를 libSQL로 옮긴다.**
  - 헬퍼: `get<T>(sql, args)`, `all<T>(sql, args)`, `run(sql, args)`를 `db().execute({ sql, args })` 위에 비동기로 만든다. 행은 `rows[0] as unknown as T`처럼 지금과 같은 방식으로 이름 붙인 행 타입으로 캐스팅한다. `run`은 `rowsAffected`를 돌려준다.
  - 트랜잭션: `transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>`. `db().transaction("write")`로 시작해 성공하면 `commit`, 예외면 `rollback` 후 다시 던진다. 트랜잭션 안의 쿼리는 `tx.execute`를 쓴다.
  - 트랜잭션 대상은 지금과 같은 세 곳이다: `publishPreview`, `recordTurn`, `resolveEscalation`. `recordTurn`의 "삽입됐을 때만 escalation 생성"은 `inserted.changes` 대신 `rowsAffected`로 판단한다.
  - `no such table` 오류(메시지에 `no such table` 포함)는 `fail(500, "DB 테이블이 없습니다. npm run db:migrate를 실행해 주세요.")`로 바꿔 던진다. 이 변환은 `get`/`all`/`run`/`transaction` 공통 한 곳에서 한다.
- [ ] **Step 5: 호출부에 `await`을 붙인다.**
  - `server/workflow.ts`: 모든 store 호출. `loadNotice`, `ownSession`도 async가 된다.
  - `server/actions.ts`: `publish`, `join`에 `await`.
  - `app/page.tsx`: `export default async function Home()`에서 `await recentNotices()`.
  - `app/n/[id]/page.tsx`, `app/notices/[id]/page.tsx`: `if (!(await getNotice(id))) notFound();`
- [ ] **Step 6: `.env.example`에 추가**

```
# 비우면 로컬 파일 data/fieldnote.db. Turso를 쓰면 libsql://… 주소와 토큰을 넣는다.
DATABASE_URL=
DATABASE_AUTH_TOKEN=
```

- [ ] **Step 7: 마이그레이션 검증**

Run: `rm -f data/fieldnote.db* && npm run db:migrate && npm run db:migrate`
Expected: 첫 실행 `applied 001_init.sql`, 두 번째 실행 `skip 001_init.sql`.

- [ ] **Step 8: 빈 DB 에러 문구 검증 (Review Focus 1)**

Run: `rm -f data/fieldnote.db* && npm run dev` 상태에서 `curl -s localhost:3000/n/x -o /dev/null -w "%{http_code}"`
Expected: 500이고, 서버 로그나 응답에 "npm run db:migrate를 실행해 주세요"가 보인다. 확인 뒤 `npm run db:migrate`.

- [ ] **Step 9: 스모크 스크립트로 저장 흐름 검증 (커밋하지 않음)**

세션 scratchpad에 `smoke-db.ts`를 만들고 `node --conditions=react-server <scratchpad>/smoke-db.ts`로 실행한다. 작업 디렉터리는 프로젝트 루트다. 아래를 순서대로 확인하고 하나라도 틀리면 예외를 던진다.
  - `savePreview`(조건 2개, 번역 en·vi를 손으로 만든 객체) → `publishPreview` 두 번 → 같은 id를 반환
  - `getNotice(id).version === 1`이고 `typeof … === "number"` (Review Focus 5)
  - `createSession` → `recordTurn(session, 0, {state: "manager", …}, { noticeId })` 두 번 → `getTurns` 길이 1, `sessionEscalations` 길이 1 (Review Focus 3)
  - `resolveEscalation` → `{ version: 2 }`, 같은 escalation에 다시 호출 → `HttpError` 409, `getNotice(id).version`은 여전히 2 (Review Focus 2)
  - `dashboard(id).sessions[0].turns.length === 1`
  - 마지막에 공지 id를 출력한다.

Expected: 예외 없이 공지 id 출력.

- [ ] **Step 10: 화면 검증**

`npm run dev` 상태에서 Step 9가 출력한 id로 `curl -s -o /dev/null -w "%{http_code}" localhost:3000/n/<id>`와 `/notices/<id>`.
Expected: 둘 다 200. `curl -s -X POST localhost:3000/api/session -H 'content-type: application/json' -d '{"id":"<id>","sessionId":"<스모크의 session id>"}'`가 turns 1개짜리 JSON을 반환한다.

- [ ] **Step 11: 전체 검증**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 12: 커밋** `feat: DB를 libSQL(로컬 파일·Turso 겸용)로 전환하고 마이그레이션 추가`

---

### Task 4: 요청 제한을 DB로 이동

**Files:**
- Create: `server/rate-limit.ts`
- Modify: `app/api/[action]/route.ts`

**Interfaces:**
- Consumes: `db()` (Task 3), `rate_limits` 테이블 (Task 3 Step 2)
- Produces: `rateLimited(key: string, limit: number, now = Date.now()): Promise<boolean>`. 1분 고정 창(`windowStart = Math.floor(now / 60_000) * 60_000`).

- [ ] **Step 1: `rateLimited` 구현.** 한 문장 upsert로 센다: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`. 반환한 `count > limit`이면 `true`. 같은 호출에서 `DELETE FROM rate_limits WHERE window_start < ?`(1시간 전)를 `db().batch([...], "write")`로 함께 보내 오래된 행을 치운다.
- [ ] **Step 2: route에서 메모리 `Map`(`hits`)과 동기 `rateLimited`를 지우고, `const limited = { join: 20, respond: 20 }`는 유지한 채 `await rateLimited(action + ":" + client, limit)`를 쓴다.** `client` 계산(`x-forwarded-for` 첫 값, 없으면 `"local"`)은 지금 그대로다.
- [ ] **Step 3: 경계 검증 (Review Focus 4, 스크립트는 커밋하지 않음)**

scratchpad `smoke-rate.ts`: 고정 `now`로 `rateLimited("t:x", 20, now)`를 21번 호출 → 1~20번 `false`, 21번 `true`. `now + 60_000`으로 한 번 더 → `false`.
Run: `node --conditions=react-server <scratchpad>/smoke-rate.ts`
Expected: 예외 없이 종료.

- [ ] **Step 4: 전체 검증**

Run: `npm run verify`
Expected: exit 0.

- [ ] **Step 5: 커밋** `feat: 요청 제한을 DB 기반으로 변경`

---

### Task 5: 문서 마무리

**Files:**
- Modify: `README.md`, `.claude/docs/superpowers/specs/2026-11-13-production-architecture-design.md`

- [ ] **Step 1: README의 "구조" 절을 새 폴더 구조(섹션 1 트리)와 `npm run db:migrate` 안내로 바꾼다.** "SQLite(`data/fieldnote.db`)" 설명은 "libSQL: 로컬은 `data/fieldnote.db`, `DATABASE_URL`로 Turso 사용 가능"으로 바꾼다.
- [ ] **Step 2: 스펙 상태 줄을 `섹션 1·2 구현 완료, 섹션 3(AI)·4(배포) 보류`로 바꾼다.**
- [ ] **Step 3: 커밋** `docs: 새 구조와 DB 실행 방법 반영`
