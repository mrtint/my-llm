# my-llm

Expo React Native 앱에서 **온디바이스 멀티모달 LLM**을 실행하는 POC 프로젝트.

스마트폰에서 인터넷 없이도 이미지를 보고 질문에 답하는 AI를 실행할 수 있습니다.

## 개요

- **llama.rn** (llama.cpp RN 바인딩)으로 iOS/Android 동일 코드베이스, 플랫폼 분기 없음
- **SmolVLM-500M** (Q8_0, ~546MB) 모델을 앱 내 다운로드 후 오프라인 추론
- 이미지 + 텍스트 프롬프트 → 온디바이스 비전 응답 (스트리밍)

## 시스템 요구사항

| 항목 | 최소 사양 |
|------|----------|
| macOS | Ventura 13.0 이상 |
| Node.js | 18 이상 ([다운로드](https://nodejs.org/)) |
| iOS 빌드 | Xcode 15 이상 + iOS 16.0 이상 기기 또는 시뮬레이터 |
| Android 빌드 | Android Studio + SDK 26 이상 기기 또는 에뮬레이터 |
| 디스크 여유 공간 | 약 1GB (모델 파일 ~546MB + 앱 빌드) |
| 기기 RAM | 2GB 이상 권장 |

> Windows/Linux에서는 Android 빌드만 가능합니다. iOS 빌드는 macOS가 필요합니다.

## 사전 준비

### 1. Node.js 설치

[nodejs.org](https://nodejs.org/)에서 LTS 버전을 다운로드하여 설치합니다.

설치 확인:

```bash
node --version   # v18 이상이면 OK
npm --version
```

### 2. iOS 빌드 환경 (macOS만 해당)

1. App Store에서 **Xcode**를 설치합니다.
2. Xcode를 한 번 실행하여 추가 컴포넌트 설치를 완료합니다.
3. iOS 시뮬레이터 런타임이 없다면 설치합니다:

```bash
xcodebuild -downloadPlatform iOS
```

### 3. Android 빌드 환경

1. [Android Studio](https://developer.android.com/studio)를 설치합니다.
2. 설치 시 **Android SDK**, **Android SDK Platform-Tools**, **Android Emulator**를 함께 설치합니다.
3. Android Studio에서 에뮬레이터를 하나 생성하거나, USB로 실제 기기를 연결합니다.

## 설치 및 실행

### 1. 프로젝트 클론

```bash
git clone https://github.com/mrtint/my-llm.git
cd my-llm
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 네이티브 프로젝트 생성

```bash
npx expo prebuild --clean
```

### 4. 앱 빌드 및 실행

iOS의 경우:

```bash
npx expo run:ios
```

Android의 경우:

```bash
npx expo run:android
```

첫 빌드는 5~10분 정도 소요됩니다. 빌드가 완료되면 시뮬레이터/에뮬레이터 또는 연결된 기기에서 앱이 자동으로 실행됩니다.

> Expo Go 앱은 지원하지 않습니다. 반드시 위 명령어로 네이티브 빌드해야 합니다.

## 앱 사용법

### 1단계: 모델 다운로드

앱을 처음 실행하면 모델 다운로드 화면이 나타납니다.

- **Download Model** 버튼을 누르면 AI 모델 파일(~546MB)을 다운로드합니다.
- Wi-Fi 환경에서 다운로드하는 것을 권장합니다.
- 다운로드는 한 번만 하면 되며, 이후에는 오프라인에서도 사용 가능합니다.

### 2단계: 이미지 선택

다운로드가 완료되면 채팅 화면으로 전환됩니다.

- 화면 상단의 회색 영역을 탭하여 갤러리에서 이미지를 선택합니다.
- 처음 사용 시 사진 접근 권한을 요청할 수 있습니다 — **허용**을 눌러주세요.

### 3단계: 질문하기

- 텍스트 입력란에 이미지에 대한 질문을 입력합니다 (기본값: "What do you see in this image?").
- **Ask AI** 버튼을 누르면 AI가 이미지를 분석하고 답변을 생성합니다.
- 첫 질문 시 모델 로딩에 수 초가 걸릴 수 있습니다.
- 답변은 실시간으로 한 글자씩 표시됩니다.

## 기술 스택

- Expo SDK 55 + React Native 0.83 (New Architecture)
- llama.rn 0.12 (멀티모달 mmproj 지원)
- expo-file-system (File/Directory API)
- expo-image-picker
- react-native-safe-area-context

## 트러블슈팅

### 앱이 시뮬레이터에서 크래시됨

iOS 시뮬레이터의 Metal GPU 에뮬레이션 문제일 수 있습니다. `App.tsx`에서 `n_gpu_layers: 0`, `use_gpu: false`로 설정되어 있는지 확인하세요 (기본값이 이미 이렇게 설정되어 있습니다).

### "Context not found" 에러

Hot Reload 후 네이티브 컨텍스트가 해제된 경우 발생합니다. 앱을 완전히 종료하고 `npx expo run:ios` 또는 `npx expo run:android`로 다시 빌드해주세요.

### 모델 다운로드가 실패함

- 네트워크 연결을 확인하세요.
- HuggingFace 서버가 일시적으로 불안정할 수 있으니 잠시 후 다시 시도하세요.
- 기기의 저장 공간이 1GB 이상 남아있는지 확인하세요.

### 추론 속도가 너무 느림

시뮬레이터/에뮬레이터에서는 CPU만 사용하므로 매우 느립니다. 실제 기기에서 테스트하면 훨씬 빠릅니다.

실기기 테스트 시 `App.tsx`에서 아래 값을 변경하면 GPU 가속을 사용할 수 있습니다:

- `n_gpu_layers: 0` → `n_gpu_layers: 99`
- `use_gpu: false` → `use_gpu: true`

## 라이선스

MIT
