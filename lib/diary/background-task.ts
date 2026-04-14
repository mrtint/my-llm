import BackgroundService from "react-native-background-actions";
import * as Notifications from "expo-notifications";
import { generateDiary, type DiaryGenerateStatus } from "./generator";
import { acquireGenerationLock, releaseGenerationLock, isGenerationLocked } from "./lock";
import { getDiaryEntry } from "./storage";
import { DiaryEvents } from "./diary-events";

const TAG = "[BackgroundTask]";

const TASK_OPTIONS = {
  taskName: "DiaryGeneration",
  taskTitle: "오늘의 일기",
  taskDesc: "사진을 분석하는 중...",
  taskIcon: { name: "ic_launcher", type: "mipmap" },
  color: "#4a90d9",
  foregroundServiceType: ["dataSync"] as ("dataSync")[],
};

// 진행 상태 → 알림 텍스트 + 진행률 매핑
function progressToNotification(status: DiaryGenerateStatus, detail: string) {
  const map: Partial<Record<DiaryGenerateStatus, number>> = {
    fetching_photos: 10,
    loading_model: 20,
    analyzing: 50,
    synthesizing: 75,
    saving: 90,
    done: 100,
  };
  return {
    taskDesc: detail,
    progressBar: { max: 100, value: map[status] ?? 0, indeterminate: false },
  };
}

async function diaryBackgroundTask(): Promise<void> {
  const signal = { cancelled: false };

  // iOS expiration 핸들링
  BackgroundService.on("expiration", () => {
    console.log(`${TAG} iOS BGProcessingTask 만료, 생성 중단`);
    signal.cancelled = true;
  });

  try {
    const result = await generateDiary({
      onProgress: (status, detail) => {
        // Android Foreground Service 알림 업데이트
        BackgroundService.updateNotification(progressToNotification(status, detail));
        // 포그라운드 UI로 브로드캐스트
        DiaryEvents.emit("progress", { status, detail });
      },
      signal,
    });

    if (result) {
      DiaryEvents.emit("complete", { date: result.date, content: result.content });
      await sendCompletionNotification();
    } else if (!signal.cancelled) {
      // 사진 없음 또는 이미 존재
      console.log(`${TAG} 생성 스킵 (사진 없음 또는 이미 존재)`);
    }
  } catch (e: any) {
    const message = e?.message || "일기 생성 중 오류가 발생했습니다";
    console.error(`${TAG} 생성 실패:`, message);
    DiaryEvents.emit("error", { message });
  } finally {
    await releaseGenerationLock();
  }
}

async function sendCompletionNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "오늘의 일기",
      body: "일기가 준비됐어요! 확인해보세요 ✨",
      data: { type: "diary-complete" },
    },
    trigger: null, // 즉시 발송
  });
}

export async function startBackgroundDiaryGeneration(): Promise<boolean> {
  if (BackgroundService.isRunning()) {
    console.log(`${TAG} 이미 실행 중, 스킵`);
    return false;
  }

  // 오늘 일기 이미 존재 확인
  const todayDate = new Date().toISOString().split("T")[0];
  const existing = await getDiaryEntry(todayDate);
  if (existing) {
    console.log(`${TAG} 오늘 일기 이미 존재, 스킵`);
    return false;
  }

  // 락 획득
  const locked = await acquireGenerationLock();
  if (!locked) {
    console.log(`${TAG} 락 획득 실패, 스킵`);
    return false;
  }

  console.log(`${TAG} 백그라운드 일기 생성 시작`);

  try {
    await BackgroundService.start(diaryBackgroundTask, TASK_OPTIONS);
    return true;
  } catch (e: any) {
    console.error(`${TAG} BackgroundService 시작 실패:`, e?.message);
    await releaseGenerationLock();
    return false;
  }
}

export async function stopBackgroundDiaryGeneration(): Promise<void> {
  if (BackgroundService.isRunning()) {
    await BackgroundService.stop();
    await releaseGenerationLock();
    console.log(`${TAG} 백그라운드 생성 중지됨`);
  }
}

export function isBackgroundGenerationRunning(): boolean {
  return BackgroundService.isRunning();
}
