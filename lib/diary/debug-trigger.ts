import * as Notifications from "expo-notifications";
import { startBackgroundDiaryGeneration } from "./background-task";
import { deleteDiaryEntry } from "./storage";
import { DIARY_TRIGGER_TYPE, scheduleDailyDiaryNotification } from "../../hooks/useDailyNotification";

const TAG = "[DebugTrigger]";

/**
 * 백그라운드 일기 생성을 즉시 시작한다.
 * 오늘 일기가 이미 존재하면 삭제 후 재생성한다 (테스트용).
 */
export async function triggerBackgroundDiaryNow(): Promise<void> {
  const todayDate = new Date().toISOString().split("T")[0];
  console.log(`${TAG} BG 즉시 실행 (오늘 일기 삭제 후 재생성)`);
  await deleteDiaryEntry(todayDate);
  const started = await startBackgroundDiaryGeneration();
  console.log(`${TAG} 시작 결과:`, started);
}

/**
 * 테스트용 알림을 즉시 발송한다.
 * 전체 흐름 검증: 알림 수신 → addNotificationReceivedListener → 백그라운드 생성.
 */
export async function triggerDiaryNotificationNow(): Promise<void> {
  console.log(`${TAG} 테스트 알림 발송`);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "오늘의 일기 (테스트)",
      body: "테스트 알림입니다 📔",
      data: { type: DIARY_TRIGGER_TYPE },
    },
    trigger: null, // 즉시 발송
  });
}

/**
 * 일기 알림을 N분 후로 재스케줄한다.
 * 실제 OS 스케줄링 → 시간 도래 → 알림 수신 → 자동 생성 통합 테스트용.
 */
export async function rescheduleDiaryNotification(
  minutesFromNow: number,
): Promise<void> {
  const future = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const hour = future.getHours();
  const minute = future.getMinutes();
  console.log(`${TAG} ${minutesFromNow}분 후 (${hour}:${String(minute).padStart(2, "0")}) 로 재스케줄`);
  await scheduleDailyDiaryNotification(hour, minute);
}
