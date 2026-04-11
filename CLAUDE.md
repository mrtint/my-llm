# 프로젝트 규칙

## 규칙 관리 체계

이 프로젝트는 **Claude Code**와 **Cursor** 두 도구를 병행 사용한다.
각 도구는 자신의 네이티브 포맷으로 규칙을 관리하며, 변경 시 상대측에 동기화한다.

| 도구 | 설정 파일 | 포맷 |
|------|-----------|------|
| Claude Code | `CLAUDE.md` (이 파일) | 순수 마크다운 |
| Cursor | `.cursor/rules/*.mdc` | YAML frontmatter + 마크다운 |

### 동기화 규칙

**이 파일(`CLAUDE.md`)의 규칙을 추가·수정·삭제한 경우**, 반드시 `.cursor/rules/` 의 대응하는 `.mdc` 파일에도 동일한 내용을 반영할 것.

- 새 규칙 추가 → `.cursor/rules/<이름>.mdc` 파일 생성 (frontmatter 포함)
- 기존 규칙 수정 → 대응하는 `.mdc` 파일의 본문도 수정
- 규칙 삭제 → 대응하는 `.mdc` 파일도 삭제

Cursor `.mdc` frontmatter 템플릿:
```
---
description: 규칙 설명 (한 줄)
alwaysApply: true
---
```
파일 패턴에 따라 조건부 적용이 필요하면 `alwaysApply: false` + `globs` 사용.

### 대응 관계

| CLAUDE.md 섹션 | Cursor .mdc 파일 |
|----------------|------------------|
| 커밋 메시지 규칙 | `commit-conventions.mdc` |
| Expo React Native 컨벤션 | `expo-rn-conventions.mdc` |
| 추론 모듈 아키텍처 | `inference-architecture.mdc` |

---

## 커밋 메시지 규칙

[Conventional Commits 1.0.0](https://www.conventionalcommits.org/ko/v1.0.0/) 기반.

### 형식

```
<타입>(<범위>): <설명>

<본문(선택)>

<꼬리말(선택)>
```

### 타입

| 타입 | 용도 |
|------|------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 기능 변경 없는 코드 구조 개선 |
| `docs` | 문서 변경 |
| `style` | 포매팅, 세미콜론 등 코드 의미에 영향 없는 변경 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가/수정 |
| `chore` | 빌드, 설정, 의존성 등 기타 변경 |
| `ci` | CI/CD 설정 변경 |

### 범위 (scope)

- `model` — LLM 모델 로딩/다운로드 관련
- `inference` — 추론 로직 (lib/inference/ 공유 모듈 포함)
- `diary` — 일기 생성/저장 (lib/diary/, hooks/useDiaryGenerator)
- `ui` — UI 컴포넌트
- `cli` — CLI 스크립트 (scripts/*.ts)
- `config` — app.json, 빌드 설정
- `deps` — 의존성 추가/변경

### 규칙

- **설명과 본문은 반드시 한글로 작성**
- 타입과 범위는 영문 유지 (`feat`, `fix` 등)
- 설명 끝에 마침표 없음
- 본문은 "왜" 변경했는지 설명, "무엇을"은 코드가 말함
- 단절적 변경(breaking change)은 `!` 또는 `BREAKING CHANGE:` 꼬리말 사용

### 예시

```
feat(model): Gemma 4 E4B 멀티모달 모델로 전환

chore(deps): tsx devDependency 추가

fix(inference): system role 대신 user 턴에 시스템 프롬프트 병합

refactor(inference): 추론 설정을 lib/inference/ 공유 모듈로 추출

feat(diary): 오늘 사진 기반 AI 일기 자동 생성

fix(model): Context is busy 에러 방지를 위한 컨텍스트 잠금 도입

feat(cli): TypeScript CLI 추론 러너 추가

BREAKING CHANGE: bash 스크립트 제거, npm run infer/analyze로 대체
```

---

## Expo React Native 컨벤션

`.tsx`, `.ts` 파일을 다룰 때 적용.

### SafeAreaView

`react-native` 내장 `SafeAreaView`는 deprecated. 반드시 `react-native-safe-area-context` 사용.

```tsx
// BAD
import { SafeAreaView } from "react-native";

// GOOD
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
// 루트에 <SafeAreaProvider> 필수
```

### expo-file-system

레거시 API(`getInfoAsync`, `makeDirectoryAsync`, `createDownloadResumable`) 사용 금지.
새 `File`, `Directory`, `Paths` 클래스를 사용.

```tsx
// BAD
import * as FileSystem from "expo-file-system/legacy";
await FileSystem.getInfoAsync(path);

// GOOD
import { File, Directory, Paths } from "expo-file-system";
const dir = new Directory(Paths.document, "models");
if (!dir.exists) dir.create();
const file = new File(dir, "model.gguf");
if (file.exists) { /* ... */ }
await File.downloadFileAsync(url, dir);
```

### Image resizeMode

`Image`의 `resizeMode`는 style이 아니라 prop으로 전달.

```tsx
// BAD
<Image style={{ resizeMode: "cover" }} />

// GOOD
<Image resizeMode="cover" style={styles.image} />
```

### llama.rn (on-device LLM)

- 시뮬레이터: `n_gpu_layers: 0`, `use_gpu: false` (Metal 에뮬레이션 크래시 방지)
- 실기기: `n_gpu_layers: 99`
- 멀티모달 모델은 반드시 `ctx_shift: false`
- `useEffect` cleanup에서 `context.release()` 후 ref를 `null`로 리셋
- **`LlamaContext`는 한 번에 하나의 작업만 처리 가능** — 여러 화면에서 공유할 때 반드시 `acquireContext()`로 잠금 획득, `finally`에서 `releaseContext()` 호출

```tsx
// BAD — 동시 접근 시 "Context is busy" 에러
const result = await contextRef.current!.completion({...});

// GOOD — 잠금 획득 후 사용, finally에서 해제
const ctx = await acquireContext();
if (!ctx) return;
try {
  const result = await ctx.completion({...});
} finally {
  releaseContext();
}
```

### 커밋 전 체크리스트

새 expo 패키지를 추가할 때 **반드시** `app.json` `plugins` 배열에도 선언한다.
네이티브 코드가 필요한 패키지(위치·알림·미디어 등)는 plugins 누락 시 런타임에서만 에러가 발생해 발견이 늦다.

```json
// package.json에 추가한 경우
"expo-notifications": "~55.0.17"

// app.json plugins에도 반드시 추가
["expo-notifications", { "icon": "./assets/icon.png", "color": "#4a90d9" }]
```

커밋 전 `npm run check`를 실행하여 타입 오류와 단위 테스트를 0 에러로 확인한다.

```bash
npm run check   # typecheck + jest (pre-commit 훅이 자동 실행)
npm run doctor  # expo-doctor (SDK/플러그인 호환성 수동 확인)
```

---

## 추론 모듈 아키텍처

`lib/inference/`, `lib/diary/`, `scripts/*.ts`, `hooks/useInference.ts`, `hooks/useDiaryGenerator.ts`, `hooks/useModelManager.ts` 관련 파일을 다룰 때 적용.

### 공유 모듈 (`lib/inference/`)

모델 설정, 추론 파라미터, 시스템 프롬프트를 한 곳에서 관리. 앱(llama.rn)과 CLI(llama-mtmd-cli) 양쪽이 동일한 설정을 참조.

- `config.ts` — 모델 파일명/URL, 추론 파라미터 (`n_ctx`, `n_predict`, `temperature`, `stop`)
- `prompt.ts` — 시스템 프롬프트, Gemma 채팅 템플릿 빌더 (`buildGemmaPrompt`)
- `types.ts` — 공유 타입 (`ModelFiles`, `InferenceParams`, `InferenceResult`)

이 모듈은 **플랫폼 의존성 없음** (`expo-file-system` 등 import 금지). Node.js와 React Native 양쪽에서 import 가능해야 함.

### 일기 모듈 (`lib/diary/`)

사진 기반 AI 일기 생성에 필요한 프롬프트와 저장소.

- `prompts.ts` — 사진 분석 프롬프트(`buildPhotoPrompt`), 일기 합성 프롬프트(`buildSynthesisPrompt`)
- `storage.ts` — SQLite CRUD (`saveDiaryEntry`, `getDiaryEntries`, `getDiaryEntry`)
- `types.ts` — `DiaryEntry`, `PhotoAnalysis` 타입

`hooks/useDiaryGenerator.ts`가 이 모듈을 조합하여 사진 → 분석 → 합성 → 저장 흐름을 실행.

### 모델 설정 변경 시

모델을 교체하거나 파라미터를 바꿀 때는 `lib/inference/config.ts`만 수정하면 앱과 CLI 양쪽에 반영됨. `lib/i18n.ts`의 `modelName`도 함께 업데이트할 것.

### Gemma 4 chat template 주의사항

Gemma 4에서 `role: "system"` 메시지를 별도로 보내면 무시될 수 있음. 시스템 지시는 반드시 user 턴 텍스트에 직접 포함.

```tsx
// BAD — Gemma 4에서 system role 무시됨
messages: [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: [...] },
]

// GOOD — user 메시지에 시스템 프롬프트 병합
messages: [
  { role: "user", content: [
    { type: "text", text: SYSTEM_PROMPT + "\n\n" + prompt },
    ...images,
  ]},
]
```

### 컨텍스트 동시 접근 방지

`useModelManager`의 `acquireContext()` / `releaseContext()`를 통해 컨텍스트 사용권을 획득/반납. 일기 탭과 채팅 탭이 동시에 컨텍스트를 사용하면 llama.rn이 "Context is busy" 에러를 던지므로 반드시 이 패턴을 따를 것.

### CLI 테스트

앱 빌드 없이 터미널에서 추론을 빠르게 검증할 수 있음. `llama-mtmd-cli` 필요 (`brew install llama.cpp`).

```bash
npm run infer -- ./photo.jpg -p "이 사진을 설명해줘"
npm run analyze                # scripts/ 내 전체 이미지 일괄 분석
```
