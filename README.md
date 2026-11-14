# 현장노트 · 읽음에서 이해로

> 관리자가 한국어로 쓴 작업 변경 지시를 AI가 **조건 단위**로 나누고, 외국인 작업자는 **QR 하나로 자기 언어**로 공지를 받아 답합니다. AI는 작업자가 **조건별로 이해했는지** 확인합니다.
>
> 공지에 근거가 없는 질문에는 AI가 답하지 않고 관리자에게 넘깁니다. 관리자 답변은 작업자 언어로 번역되고, 공지의 새 버전으로 반영됩니다.

## Architecture

![현장노트 아키텍처](docs/architecture.png)

## Key Features

| | 영역 | 한 줄 요약 |
|---|---|---|
| 📝 | [공지 작성 · 검수](#1-공지-작성--검수) | 한국어 지시 → AI 조건 추출 · 상황 질문, 관리자가 검수 |
| 🌐 | [번역 · 의미 검증](#2-번역--의미-검증) | EN · VI 번역 후 역번역으로 조건별 의미 비교 |
| 📱 | [작업자 확인](#3-작업자-확인) | QR 접속, 모국어로 공지를 읽고 답변 |
| ⚖️ | [조건별 판정](#4-조건별-판정) | 발화 인용 기반 판정, 상태는 규칙이 결정 |
| 💬 | [관리자 답변 반영](#5-관리자-답변-반영) | 근거 없는 질문은 관리자에게, 답변은 공지 새 버전으로 |

### 1. 공지 작성 · 검수

| 기능 | 내용 |
|---|---|
| 조건 추출 | 시점 · 장소 · 행동 · 금지 · 예외 + 원문 근거 |
| 상황 질문 | 확인할 조건별 질문과 모범 답 |
| 관리자 검수 | 조건 · 질문 수정, 작업자 화면 미리보기 |
| 발행 | QR · 링크 생성, 발행 시 AI 호출 없음 |

### 2. 번역 · 의미 검증

| 기능 | 내용 |
|---|---|
| 번역 | English · Tiếng Việt |
| 역번역 검사 | 별도 AI 호출로 조건별 의미 보존 여부 비교 |
| 발행 차단 | 검증 실패 시 관리자 확인 없이는 발행 불가 |

### 3. 작업자 확인

| 기능 | 내용 |
|---|---|
| 접속 | QR 스캔 → 언어 선택 → 이름 입력, 로그인 없음 |
| 답변 | 모국어 공지 · 상황 질문을 읽고 모국어로 답변 입력 |

### 4. 조건별 판정

| 결과 | 동작 |
|---|---|
| 충족 | 이해 확인 |
| 누락 | 한 번 되묻기 |
| 충돌 | 근거와 함께 재설명 |
| 공지 관련 질문 | 공지 근거로 답변 |
| 근거 없는 질문 | 관리자에게 전달 |

### 5. 관리자 답변 반영

| 기능 | 내용 |
|---|---|
| 대시보드 | 작업자별 상태 · 판정 근거, 확인 요청 목록 |
| 답변 전달 | 한국어 답변 → 작업자 언어로 번역해 전달 |
| 공지 버전 | 답변을 addendum으로 기록, 이후 판정 근거에 포함 |

## AI Pipeline

모든 AI 출력은 서버 검증을 거치고, 대화 상태는 AI가 아니라 규칙(`server/decide.ts`)이 정합니다.

```mermaid
flowchart LR
    subgraph A["① 공지 준비"]
        A1[조건 추출] --> A2[상황 질문 생성] --> A3[번역] --> A4[역번역 검사] --> A5([관리자 검수])
    end
    subgraph B["② 답변 판정"]
        B1[조건별 판정] --> B2{{인용 검증}} --> B3{{판정 누적}} --> B4{{상태 결정}}
    end
    subgraph C["③ 관리자 답변"]
        C1([관리자 답변]) --> C2[답변 번역] --> C3{{공지 새 버전}}
    end
    A5 -- 발행 · QR --> B1
    B4 -- 근거 없는 질문 --> C1
    C3 -. 다음 판정의 근거 .-> B1
```

| 단계 | AI가 하는 일 | 서버가 검증하는 것 |
|---|---|---|
| 분석 | 원문 → 조건 · 상황 질문 | 근거가 원문의 정확한 부분 문자열인지 |
| 번역 | EN · VI 번역 + 역번역 비교 | 조건 ID 일치, 한국어 잔존 여부 |
| 판정 | 조건별 met · missing · conflict + 발화 인용 | 인용이 실제 발화에 없으면 누락으로 강등 |
| 관리자 답변 | 한국어 답변 번역 | 공지 새 버전으로 기록 |

## Tech Stack

### Frontend & Backend

| 기술 | 활용 |
|---|---|
| Next.js 16 · React 19 | 관리자 · 작업자 화면, `/api/[action]` 단일 API |
| TypeScript (strict) | 전 영역 타입 검사 |
| React Compiler | 클라이언트 컴포넌트 자동 최적화 |
| Tailwind CSS 4 | 스타일링 |

### AI & Database

| 기술 | 활용 |
|---|---|
| OpenAI Responses API | `gpt-5.4-mini`, strict JSON schema 구조화 출력 |
| SQLite (`node:sqlite`) | 공지 · 버전 · 대화 턴 · 확인 요청 저장 |

### Infrastructure

| 기술 | 활용 |
|---|---|
| AWS EC2 · systemd | Next.js standalone 서버 운영 |
| Caddy | HTTPS · 리버스 프록시 |
| GitHub Actions | PR 검사, `dev` 머지 시 자동 배포 |
| AWS OIDC | 배포 중에만 러너 IP에 SSH 허용 |

## Project Structure

```text
app/         라우트: page.tsx(관리자) · notices/[id](대시보드) · n/[id](작업자) · api/[action]
features/    admin/ 관리자 화면 · worker/ 작업자 화면
ui/          공용 화면 조각
shared/      서버 · 브라우저 공용 타입과 언어 문구
server/      서버 전용 (server-only)
├── ai/      AI 호출 (분석 · 번역 · 역번역 · 판정), 개발용 Mock
├── db/      SQLite 저장소
├── workflow.ts   서비스 로직
├── decide.ts     판정 상태 머신
└── actions.ts    액션 목록과 입력 검증
```

## Getting Started

Node.js 24 이상이 필요합니다.

```bash
npm ci
cp .env.example .env.local   # OPENAI_API_KEY 입력
npm run dev                  # http://127.0.0.1:3000
```

```bash
npm test         # 판정 상태 머신 테스트 (AI · DB 없이 실행)
npm run verify   # 타입체크 → React Compiler 검사 → 테스트 → 빌드
```

> 💡 `OPENAI_API_KEY`가 비어 있으면 개발 모드에서 Mock AI가 대신 응답합니다.
>
> 📱 휴대폰 QR 시연: `cloudflared tunnel --url http://127.0.0.1:3000`으로 받은 주소를 `.env.local`의 `PUBLIC_BASE_URL`에 넣으세요.

## CI/CD

| Workflow | Trigger | Process |
|---|---|---|
| `check.yml` | `dev` 대상 PR | React Compiler 검사 → 테스트 → 빌드 |
| `deploy.yml` | `dev` Push | 검사 · 빌드 → AWS OIDC → SSH 임시 허용 → EC2 배포 → SSH 해제 |
