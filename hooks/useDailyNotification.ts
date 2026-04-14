import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const DIARY_TRIGGER_TYPE = "diary-trigger";

export async function scheduleDailyDiaryNotification(
  hour = 21,
  minute = 0,
): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "오늘의 일기",
      body: "오늘 하루를 기록할 준비가 됐어요 📔",
      data: { type: DIARY_TRIGGER_TYPE },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

/**
 * 매일 알림 스케줄링 + 알림 탭 콜백 등록.
 * 알림 탭 시 onNotificationTapped가 호출되어 포그라운드에서 자동 생성을 시작한다.
 */
export function useDailyNotification(onNotificationTapped?: () => void) {
  const callbackRef = useRef(onNotificationTapped);
  callbackRef.current = onNotificationTapped;

  useEffect(() => {
    scheduleDailyDiaryNotification(21, 0);

    const subscription = Notifications.addNotificationResponseReceivedListener(
      () => {
        console.log("[Notification] 알림 탭 감지 → 자동 생성 트리거");
        callbackRef.current?.();
      },
    );

    return () => subscription.remove();
  }, []);
}
