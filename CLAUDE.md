# Claude Code 프로젝트 규칙

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
feat(model): Gemma 3 4B 멀티모달 모델로 전환

chore(deps): tsx devDependency 추가

fix(inference): system role 대신 user 턴에 시스템 프롬프트 병합

refactor(inference): 추론 설정을 lib/inference/ 공유 모듈로 추출

feat(cli): TypeScript CLI 추론 러너 추가

BREAKING CHANGE: bash 스크립트 제거, npm run infer/analyze로 대체
```

---

## 추론 모듈 아키텍처

### 공유 모듈 (`lib/inference/`)

모델 설정, 추론 파라미터, 시스템 프롬프트를 한 곳에서 관리. 앱(llama.rn)과 CLI(llama-mtmd-cli) 양쪽이 동일한 설정을 참조.

- `config.ts` — 모델 파일명/URL, 추론 파라미터 (`n_ctx`, `n_predict`, `temperature`, `stop`)
- `prompt.ts` — 시스템 프롬프트, Gemma 채팅 템플릿 빌더 (`buildGemmaPrompt`)
- `types.ts` — 공유 타입 (`ModelFiles`, `InferenceParams`, `InferenceResult`)

이 모듈은 **플랫폼 의존성 없음** (`expo-file-system` 등 import 금지). Node.js와 React Native 양쪽에서 import 가능해야 함.

### 모델 설정 변경 시

모델을 교체하거나 파라미터를 바꿀 때는 `lib/inference/config.ts`만 수정하면 앱과 CLI 양쪽에 반영됨.

### Gemma 3 chat template 주의사항

Gemma 3에서 `role: "system"` 메시지를 별도로 보내면 무시될 수 있음. 시스템 지시는 반드시 user 턴 텍스트에 직접 포함.

```tsx
// BAD — Gemma 3에서 system role 무시됨
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

### CLI 테스트

앱 빌드 없이 터미널에서 추론을 빠르게 검증할 수 있음. `llama-mtmd-cli` 필요 (`brew install llama.cpp`).

```bash
npm run infer -- ./photo.jpg -p "이 사진을 설명해줘"
npm run analyze                # scripts/ 내 전체 이미지 일괄 분석
```

---

## Expo React Native 코드 규칙

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
- 실기기: `n_gpu_layers: 99`, `use_gpu: true`
- 멀티모달 모델은 반드시 `ctx_shift: false`
- `useEffect` cleanup에서 `context.release()` 후 ref를 `null`로 리셋
