import { DeviceEventEmitter } from "react-native";
import type { DiaryGenerateStatus } from "./generator";

const PREFIX = "diary:";

export interface DiaryProgressEvent {
  status: DiaryGenerateStatus;
  detail: string;
}

export interface DiaryCompleteEvent {
  date: string;
  content: string;
}

export interface DiaryErrorEvent {
  message: string;
}

type EventMap = {
  progress: DiaryProgressEvent;
  complete: DiaryCompleteEvent;
  error: DiaryErrorEvent;
};

type EventName = keyof EventMap;

export const DiaryEvents = {
  emit<T extends EventName>(event: T, data: EventMap[T]) {
    DeviceEventEmitter.emit(`${PREFIX}${event}`, data);
  },

  on<T extends EventName>(event: T, handler: (data: EventMap[T]) => void) {
    return DeviceEventEmitter.addListener(`${PREFIX}${event}`, handler);
  },
};
