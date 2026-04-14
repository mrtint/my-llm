# 백그라운드 자동 일기 생성 설계

## Context

현재 일기 생성은 매일 21시에 알림을 보내고, 사용자가 알림을 탭하면 앱이 열리면서 포그라운드에서 LLM 추론이 시작되는 방식이다. 사용자 경험을 개선하여 **백그라운드에서 자동 생성** 후 "일기가 준비됐어요"라는 알림을 보내는 형태로 전환한다.

핵심 기술 제약: on-device LLM 추론이 3-4분 소요되며, 모바일 OS의 일반 백그라운드 실행 시간(~30초)을 크게 초과한다.

---

## 기술 선택: `react-native-background-actions`

| 플랫폼 | 메커니즘 | 실행 시간 | 타이밍 보장 |
|---------|----------|-----------|-------------|
| Android | Foreground Service | 무제한 | 알림 수신 시 즉시 |
| iOS | BGProcessingTask | ~30분 | 기기 충전/유휴 시 (best-effort) |

대안으로 `expo-task-manager` + 커스텀 네이티브 모듈, HeadlessJS를 검토했으나, `react-native-background-actions`가 단일 라이브러리로 양 플랫폼을 처리하고 Expo 호환성이 좋아 선택했다.

---

## 아키텍처

### 변경 전

```
21:00 알림 → 사용자 탭 → 앱 포그라운드 → useDiaryGenerator (React hook) → LLM → 저장
```

### 변경 후

```
21:00 알림 수신 → BackgroundService.start()
                      ↓
              generator.ts (headless async)
              ├─ collectTodayPhotos()
              ├─ initLlama() (자체 컨텍스트)
              ├─ Photo analysis loop
              ├─ Diary synthesis
              ├─ saveDiaryEntry()
              └─ 완료 알림 발송
                      ↕ DiaryEvents (EventEmitter)
              useDiaryGenerator (포그라운드 UI 반영)
```

### 핵심 설계 결정

1. **생성 로직을 React hook에서 분리**: `useDiaryGenerator`의 핵심 로직을 `lib/diary/generator.ts`로 추출. React 의존성(useState, useCallback) 없는 순수 async 함수로, 백그라운드 서비스와 포그라운드 hook 양쪽에서 호출 가능.

2. **자체 LlamaContext 관리**: 백그라운드 생성기는 `useModelManager`의 `acquireContext()`를 거치지 않고, `initLlama()`를 직접 호출하여 자체 컨텍스트를 생성/해제. React ref 공유 문제를 회피.

3. **파일 기반 락**: 포그라운드/백그라운드 동시 생성을 방지하는 `lib/diary/lock.ts`. `FileSystem`으로 락 파일 생성/삭제.

4. **EventEmitter로 진행 상태 브로드캐스트**: 백그라운드 → 포그라운드 통신에 `DeviceEventEmitter` 사용. 앱이 열려 있으면 실시간 진행 표시, 닫혀 있으면 무시.

---

## 새 모듈 상세

### `lib/diary/generator.ts` — 헤드리스 생성 함수

```typescript
interface GeneratorOptions {
  onProgress?: (status: DiaryGenerateStatus, detail: string) => void;
  maxPhotos?: number;
  signal?: { cancelled: boolean }; // iOS expiration 대응
}

async function generateDiary(options: GeneratorOptions): Promise<{
  content: string;
  date: string;
} | null>
```

내부 흐름:
1. `collectTodayPhotos(maxPhotos)` — 오늘 사진 수집
2. 사진 없으면 `null` 반환
3. 모델 파일 존재 확인 → `initLlama()` 직접 호출
4. 각 사진: `prepareImageForInference()` → `ctx.completion()` (분석)
5. 전체 분석 합성: `buildSynthesisPrompt()` → `ctx.completion()` (합성)
6. `saveDiaryEntry()` — SQLite 저장
7. `ctx.release()` — 컨텍스트 해제
8. 각 단계에서 `onProgress` 콜백 + `signal.cancelled` 체크

재사용하는 기존 함수들:
- `collectTodayPhotos()` from `lib/diary/photo-collector.ts`
- `buildPhotoPrompt()`, `buildSynthesisPrompt()` from `lib/diary/prompts.ts`
- `prepareImageForInference()` from `lib/image.ts`
- `saveDiaryEntry()` from `lib/diary/storage.ts`
- `sortPhotosByTime()` from `lib/photo-meta.ts`
- `INFERENCE_PARAMS` from `lib/inference/config.ts`
- `getDeviceParams()`, model file paths from `lib/inference/config.ts`

### `lib/diary/background-task.ts` — 백그라운드 오케스트레이터

```typescript
async function startBackgroundDiaryGeneration(): Promise<void>
async function stopBackgroundDiaryGeneration(): Promise<void>
function isBackgroundGenerationRunning(): boolean
```

`startBackgroundDiaryGeneration()` 내부:
1. 락 획득 시도 → 실패 시 리턴
2. 오늘 일기 이미 존재하는지 확인 → 존재 시 리턴
3. `BackgroundService.start(taskFunction, options)` 호출

`taskFunction` 내부:
1. `generateDiary({ onProgress })` 호출
2. `onProgress`에서:
   - `BackgroundService.updateNotification({ taskDesc })` — Android 상태바 알림 업데이트
   - `DiaryEvents.emit('progress', { status, detail })` — 포그라운드 UI 업데이트
3. 완료 시:
   - `BackgroundService.stop()` — Foreground Service 종료
   - `Notifications.scheduleNotificationAsync()` — "일기가 준비됐어요" 알림
   - `DiaryEvents.emit('complete', { date, content })`
4. 실패 시:
   - `BackgroundService.stop()`
   - 에러 알림 or 무음 처리
   - `DiaryEvents.emit('error', { message })`
5. finally: 락 해제

BackgroundService options (Android):
```typescript
{
  taskName: 'DiaryGeneration',
  taskTitle: '오늘의 일기',
  taskDesc: '사진을 분석하는 중...',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' },
  color: '#4a90d9',
  linkingURI: 'exp+my-llm://',
  progressBar: { max: 100, value: 0 },
}
```

### `lib/diary/lock.ts` — 동시 실행 방지

```typescript
async function acquireGenerationLock(): Promise<boolean>
async function releaseGenerationLock(): Promise<void>
async function isGenerationLocked(): Promise<boolean>
```

`expo-file-system`의 `File` API로 `Paths.cache` 디렉토리에 `.diary-generation-lock` 파일 생성/삭제.
- 락 파일에 시작 타임스탬프 저장
- 10분 이상 된 락은 stale로 간주하고 강제 해제 (크래시 대비)

### `lib/diary/diary-events.ts` — 백그라운드↔포그라운드 통신

```typescript
// 발행
DiaryEvents.emit('progress', { status: DiaryGenerateStatus, detail: string })
DiaryEvents.emit('complete', { date: string, content: string })
DiaryEvents.emit('error', { message: string })

// 구독
DiaryEvents.on('progress', handler)
DiaryEvents.on('complete', handler)
DiaryEvents.on('error', handler)
```

`react-native`의 `DeviceEventEmitter` 래퍼. 같은 JS 스레드 내에서 동작하므로 Android Foreground Service(같은 프로세스)에서 포그라운드 UI로 직접 전달 가능.

### `lib/diary/debug-trigger.ts` — 개발 테스트 유틸리티

```typescript
// 백그라운드 서비스 즉시 시작 (스케줄 무시)
async function triggerBackgroundDiaryNow(): Promise<void>

// 테스트 알림 즉시 발송 (전체 흐름 검증)
async function triggerDiaryNotificationNow(): Promise<void>

// N분 후로 알림 재스케줄
async function rescheduleDiaryNotification(minutesFromNow: number): Promise<void>
```

---

## 기존 파일 수정

### `hooks/useDailyNotification.ts`

- `addNotificationReceivedListener` 추가: 알림 수신 시 자동으로 백그라운드 생성 시작
- 기존 `addNotificationResponseReceivedListener` (탭 콜백) 유지: 앱이 killed 상태에서 탭 시 포그라운드 생성 fallback
- 알림 채널 분리: 스케줄 알림 vs 진행 알림 vs 완료 알림

```typescript
// 알림 수신 시 (앱 프로세스 살아있을 때) → 백그라운드 자동 생성
const receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
  // diary 알림인지 확인 (data.type === 'diary-trigger')
  if (notification.request.content.data?.type !== 'diary-trigger') return;
  
  const todayDate = new Date().toISOString().split('T')[0];
  const existing = await getDiaryEntry(todayDate);
  if (existing) return; // 이미 존재
  
  await startBackgroundDiaryGeneration();
});
```

### `hooks/useDiaryGenerator.ts`

- 생성 로직을 `lib/diary/generator.ts`로 위임 (코드 중복 제거)
- `DiaryEvents` 구독 추가: 백그라운드 생성 진행 시 UI 상태 동기화
- 포그라운드 직접 생성(수동 모드)도 여전히 지원

### `components/screens/DiaryHomeScreen.tsx`

- 백그라운드 생성 진행 중 상태 표시 (lock 확인)
- `__DEV__` 모드에서 디버그 패널 표시:
  - "BG 즉시 실행" 버튼
  - "테스트 알림" 버튼
  - "1분 후 스케줄" 버튼

### `app.json`

- `react-native-background-actions` 플러그인 추가
- (필요 시) Android foregroundService 타입 선언

### `package.json`

- `react-native-background-actions` 의존성 추가

---

## 엣지 케이스

| 상황 | 처리 |
|------|------|
| 앱 killed 상태에서 알림 수신 | 알림만 표시, 탭하면 앱 열림 → 오늘 일기 없으면 auto-trigger |
| 생성 중 앱 열림 | DiaryEvents로 진행 상태 실시간 표시, 생성 버튼 비활성화 |
| 오늘 사진 없음 | 스킵, 가벼운 알림 ("사진이 없어서 건너뛰었어요") |
| 모델 미다운로드 | "앱을 열어 모델을 다운로드해주세요" 알림 |
| 채팅에서 추론 중 | 파일 락으로 대기, llama.rn 네이티브 뮤텍스가 순차 처리 |
| 생성 중 크래시/강제 종료 | stale 락 타임아웃(10분)으로 자동 해제, 다음 날 정상 동작 |
| iOS BGProcessingTask 만료 | signal.cancelled 체크로 graceful 종료, 컨텍스트 해제 |
| 중복 알림 (알림 수신 + 탭 동시) | 락으로 중복 실행 방지, 이미 실행 중이면 스킵 |

---

## 테스트 전략

### 개발 중 빠른 검증

`__DEV__` 모드 디버그 패널 3가지 버튼:

1. **"BG 즉시 실행"** — `triggerBackgroundDiaryNow()`
   - 테스트: Foreground Service 시작/종료, 알림 업데이트, SQLite 저장, 완료 알림
   - 알림 스케줄링 우회, 직접 파이프라인 실행

2. **"테스트 알림"** — `triggerDiaryNotificationNow()`
   - 테스트: 알림 수신 → 리스너 감지 → 백그라운드 생성 전체 흐름
   - 즉시 로컬 알림 발송으로 전체 파이프라인 E2E 검증

3. **"1분 후 스케줄"** — `rescheduleDiaryNotification(1)`
   - 테스트: 실제 OS 알림 스케줄링 → 시간 도래 → 수신 → 생성
   - 타이밍 관련 이슈 검증에 유용

### 단위 테스트

- `lib/diary/generator.ts` — mock LlamaContext로 파이프라인 로직 검증
- `lib/diary/lock.ts` — 동시 실행 방지 시나리오
- `lib/diary/diary-events.ts` — 이벤트 발행/구독

### 통합 테스트 체크리스트

- [ ] Android: BG 즉시 실행 → Foreground Service 알림 표시 → 진행 업데이트 → 완료 알림
- [ ] Android: 생성 중 앱 열기 → 진행 상태 UI 동기화
- [ ] Android: 사진 없는 날 → 스킵 알림
- [ ] Android: 1분 후 스케줄 → 알림 수신 → 자동 생성
- [ ] Android: 앱 killed → 알림 표시 → 탭 → 앱 열림 → 생성
- [ ] iOS: BGProcessingTask 등록 확인 (충전 중 테스트)

---

## 검증 방법

1. `npm run check` — 타입 에러 없음
2. Android 실기기에서 "BG 즉시 실행" → Foreground Service 알림 확인 → 일기 생성 완료 → 완료 알림 수신
3. 생성 중 앱 열기 → DiaryHomeScreen에서 진행 상태 표시
4. "1분 후 스케줄" → 1분 후 알림 자동 수신 → 백그라운드 생성 자동 시작
5. 생성 완료 후 DiaryDetailScreen에서 일기 내용 확인

---

## 수정 대상 파일 요약

| 파일 | 작업 |
|------|------|
| `lib/diary/generator.ts` | **신규** — 헤드리스 생성 함수 |
| `lib/diary/background-task.ts` | **신규** — BackgroundService 오케스트레이터 |
| `lib/diary/lock.ts` | **신규** — 파일 기반 락 |
| `lib/diary/diary-events.ts` | **신규** — EventEmitter 래퍼 |
| `lib/diary/debug-trigger.ts` | **신규** — 개발 테스트 유틸리티 |
| `hooks/useDailyNotification.ts` | **수정** — 알림 수신 리스너 + 자동 트리거 |
| `hooks/useDiaryGenerator.ts` | **수정** — generator.ts 위임 + DiaryEvents 구독 |
| `components/screens/DiaryHomeScreen.tsx` | **수정** — 백그라운드 상태 표시 + 디버그 패널 |
| `app.json` | **수정** — 플러그인 추가 |
| `package.json` | **수정** — 의존성 추가 |
