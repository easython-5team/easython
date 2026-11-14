# 폴더 구조 정리 + 데모 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데모 모드를 걷어내고, 코드를 역할별 폴더(`features/`, `ui/`, `shared/`, `server/`)로 나눈다. 동작은 바꾸지 않는다.

**Architecture:** 동작을 바꾸지 않는 폴더 이동을 먼저 끝내고(Task 1), 데모를 제거한 뒤(Task 2), 문서를 맞춘다(Task 3). DB(`node:sqlite`), 요청 제한(서버 메모리), AI 호출(OpenAI Responses API)은 위치만 옮기고 내용은 그대로 둔다.

**Tech Stack:** Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 7 strict, Tailwind v4, `server-only@0.0.1`, Node 24 (`node:sqlite`, `node --test`, 타입 제거 실행).

**Spec:** `.claude/docs/superpowers/specs/2026-11-13-production-architecture-design.md` (섹션 1). 섹션 2(DB 전환)·3(AI)·4(배포)는 보류.

## Global Constraints

- 패키지 매니저는 pnpm. 의존성 추가 후 `npm install --package-lock-only --ignore-scripts`로 `package-lock.json`도 맞춘다(README가 `npm ci`를 안내함).
- `server/`의 모든 파일은 첫 줄이 `import "server-only";`다.
- `features/`, `ui/`는 `server/`를 값으로 import하지 않는다. 예외는 `shared/api-types.ts`의 `import type`/`export type`(빌드 시 지워짐)뿐이다.
- `app/`은 라우트 연결만 한다.
- Node로 직접 실행하는 테스트와 스크립트는 `--conditions=react-server`로 실행한다(`server-only`가 일반 Node 조건에서는 예외를 던진다).
- 소스 import는 지금처럼 `.ts` 확장자를 붙인다. `.tsx` 컴포넌트 import는 확장자 없이 둔다(지금 관례).
- React Compiler는 bail-out 0건을 유지한다. 클라이언트 코드에 `try/finally`와 구조 분해 props 기본값을 쓰지 않는다.
- AI 코드(`lib/ai.ts`)와 DB 코드(`lib/store.ts`)는 내용 변경 금지. 이동과 import 경로 수정만 한다.
- 테스트는 `tests/decide.test.ts`만 남긴다.

## Review Focus

1. **서버 코드가 브라우저 번들에 섞임:** 클라이언트 컴포넌트가 `server/`의 파일을 값으로 import하면 API 키 코드가 번들에 들어간다. 기대: 빌드 실패. → Task 1 Step 6의 grep과 Step 7의 빌드로 확인한다.
2. **React Compiler 검사가 새 폴더를 안 봄:** 검사 스크립트가 `components/`만 보면 폴더 이동 후 "0 components"로 통과해버린다. → Task 1 Step 7에서 개수가 14인지 확인한다.
3. **기존 로컬 DB 호환:** `data/fieldnote.db`에 이미 저장된 공지가 이동 후에도 그대로 열려야 한다. `SQLITE_PATH` 기본값(`data/fieldnote.db`)을 바꾸지 않는다. → Task 2 Step 6에서 확인한다.
4. **예시 버튼이 사라진 첫 화면:** 원문이 빈 상태에서 "AI로 변경 조건 분석" 버튼은 비활성이어야 하고, 안내 문구(placeholder)는 남아야 한다. → Task 2 Step 6 화면 확인에 포함한다.
5. **데모 흔적이 남은 화면:** "로컬 데모" 배지, "데모 답변 넣기" 버튼이 남아 있으면 실서비스처럼 보이지 않는다. → Task 2 Step 4의 grep으로 확인한다.

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
- Modify: `app/**/*.tsx`, `app/api/[action]/route.ts`, `tests/*.ts`, `scripts/check-react-compiler.ts`, `package.json`

**Interfaces:**
- Produces: `shared/api-types.ts`는 `export type { Action, ActionResult, Body } from "../server/actions.ts";` 한 줄만 담는다. `ui/request.ts`는 여기서 타입을 가져온다.
- Produces: `server/actions.ts`는 지금 `lib/api.ts`의 `actions`, `isAction`, `Action`, `ActionResult`, `Body`를 그대로 export한다.

- [ ] **Step 1: `git mv`로 위 파일을 모두 옮긴다.** 내용 수정 없이 이동만 한다(히스토리 보존). `lib/demo.ts`는 Task 2에서 지우기 전까지 `server/demo.ts`로 옮겨 빌드를 유지한다.
- [ ] **Step 2: `pnpm add server-only@0.0.1`을 실행하고 `server/` 아래 모든 `.ts` 파일 첫 줄에 `import "server-only";`를 넣는다.**
- [ ] **Step 3: 모든 import 경로를 새 위치로 고친다.** 테스트 파일 포함. `ui/request.ts`의 `import type { Action, ActionResult } from "../lib/api.ts"`는 `from "../shared/api-types.ts"`로 바꾼다.
- [ ] **Step 4: `scripts/check-react-compiler.ts`가 `components` 대신 `features/admin`, `features/worker`, `ui` 세 폴더의 `.ts`/`.tsx`를 모두 검사하도록 바꾼다.**
- [ ] **Step 5: `package.json`의 `test`를 `"node --conditions=react-server --test tests/*.test.ts"`로 바꾼다.** `demo` 스크립트는 `node --conditions=react-server --import ./scripts/demo-env.ts …`처럼 조건만 추가해 Task 2 전까지 동작을 유지한다.
- [ ] **Step 6: 경계 규칙 확인 (Review Focus 1)**

Run: `grep -rnE "from \"(\.\./)+server/" features ui | grep -v "import type"`
Expected: 출력 없음.

- [ ] **Step 7: 전체 검증 (Review Focus 2)**

Run: `npm run verify`
Expected: exit 0. "React Compiler optimized 14 components/hooks with no bail-outs." 테스트는 지금처럼 모두 통과(흐름 테스트를 지우기 전).

- [ ] **Step 8: 커밋** `refactor: 역할별 폴더(features/ui/shared/server)로 이동`

---

### Task 2: 데모 모드 제거

**Files:**
- Delete: `server/demo.ts`, `scripts/demo-env.ts`, `tests/demo-flow.test.ts`, `tests/live-flow.test.ts`, `tests/helpers.ts`, `.claude/docs/demo-mode.md`
- Modify: `server/workflow.ts`, `shared/types.ts`, `app/page.tsx`, `app/notices/[id]/page.tsx`, `features/admin/AdminWorkspace.tsx`, `features/admin/Dashboard.tsx`, `ui/Shell.tsx`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `package.json`, `README.md`

**Interfaces:**
- Produces: `server/workflow.ts`는 `engine()`, `isDemo()`, `engines` 없이 `server/ai/tasks.ts`의 `analyzeNotice`, `translateNotice`, `judge`, `translateAddendum`을 직접 호출한다. export 함수 시그니처는 그대로다.
- Produces: `AdminWorkspace({ recent }: { recent: RecentNotice[] })`, `Dashboard({ id, baseUrl }: { id: string; baseUrl: string })`, `Shell`에서 `demo` prop 삭제.

- [ ] **Step 1: 데모 파일 삭제와 분기 제거.**
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
- [ ] **Step 3: `README.md`에서 데모 관련 문장(`npm run demo`, 데모 QA 가이드 링크, "API 키 없이")을 지운다.** 실행 방법은 `cp .env.example .env.local` → `OPENAI_API_KEY` 입력 → `npm run dev`로 적는다.
- [ ] **Step 4: 남은 참조 확인 (Review Focus 5)**

Run: `grep -rnE "\bdemo\b|Demo|EASYTHON|next-demo|데모" --include=*.ts --include=*.tsx --include=*.json --include=*.md . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.claude`
Expected: 출력 없음. (`demonstrate` 같은 단어가 걸리지 않도록 단어 경계를 쓴다.)

- [ ] **Step 5: 전체 검증**

Run: `npm run verify`
Expected: exit 0, 테스트는 `decide.test.ts`만 돌고 모두 통과.

- [ ] **Step 6: 화면 확인 (Review Focus 3·4)**

`npm run dev` 상태에서:
  - `curl -s -o /dev/null -w "%{http_code}" localhost:3000/` → 200. 화면에서 원문 입력창이 비어 있고 "AI로 변경 조건 분석" 버튼이 비활성인지 확인한다.
  - `data/fieldnote.db`에 공지가 있으면 그 id로 `/n/<id>`, `/notices/<id>` → 둘 다 200. 없으면 커밋하지 않는 scratchpad 스크립트(`node --conditions=react-server`)로 `savePreview` → `publishPreview`를 호출해 공지를 하나 만든 뒤 확인한다.

- [ ] **Step 7: 커밋** `refactor: 데모 모드 제거`

---

### Task 3: 문서 마무리

**Files:**
- Modify: `README.md`, `.claude/docs/superpowers/specs/2026-11-13-production-architecture-design.md`

- [ ] **Step 1: README의 "구조" 절을 새 폴더 구조(스펙 섹션 1 트리)로 바꾼다.** DB 설명(`node:sqlite`, `data/fieldnote.db`)은 그대로 둔다.
- [ ] **Step 2: 스펙 상태 줄을 `섹션 1 구현 완료, 섹션 2(DB)·3(AI)·4(배포) 보류`로 바꾼다.**
- [ ] **Step 3: 커밋** `docs: 새 폴더 구조 반영`
