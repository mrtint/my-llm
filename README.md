# my-llm

Expo React Native 앱에서 **온디바이스 멀티모달 LLM**을 실행하는 POC 프로젝트.

## 개요

- **llama.rn** (llama.cpp RN 바인딩)으로 iOS/Android 동일 코드베이스, 플랫폼 분기 없음
- **SmolVLM-500M** (Q8_0, ~546MB) 모델을 앱 내 다운로드 후 오프라인 추론
- 이미지 + 텍스트 프롬프트 → 온디바이스 비전 응답 (스트리밍)

## 기술 스택

- Expo SDK 55 + React Native 0.83 (New Architecture)
- llama.rn 0.12 (멀티모달 mmproj 지원)
- expo-file-system (File/Directory API)
- expo-image-picker
- react-native-safe-area-context

## 실행 방법

```bash
npm install
npx expo prebuild --clean

# iOS (Xcode 필요)
npx expo run:ios

# Android (Android Studio 필요)
npx expo run:android
```

> Expo Go는 지원하지 않습니다. 네이티브 빌드(Dev Client)가 필요합니다.

## 참고

- 시뮬레이터/에뮬레이터에서는 GPU 가속이 안 되므로 추론이 매우 느립니다
- 실기기에서 테스트 시 `App.tsx`의 `n_gpu_layers`와 `use_gpu`를 `true`로 변경하세요
