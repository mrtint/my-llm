import { useState, useCallback, useRef, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { LlamaContext } from "llama.rn";
import { generateDiary } from "../lib/diary/generator";
import { hasCheckpoint, clearCheckpoint } from "../lib/diary/checkpoint";
import { collectTodayPhotos } from "../lib/diary/photo-collector";
import { sortPhotosByTime, type PhotoMeta } from "../lib/photo-meta";
import { buildPhotoPrompt, buildSynthesisPrompt } from "../lib/diary/prompts";
import { saveDiaryEntry } from "../lib/diary/storage";
import { prepareImageForInference } from "../lib/image";
import { INFERENCE_PARAMS } from "../lib/inference";
import type { PhotoAnalysis } from "../lib/diary/types";
import type { DiaryGenerateStatus } from "../lib/diary/generator";

export type { DiaryGenerateStatus } from "../lib/diary/generator";

const KEEP_AWAKE_TAG = "diary-generation";
const DEBOUNCE_MS = 10_000; // 백그라운드 진입 후 10초 디바운스

function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function useDiaryGenerator(
  acquireContext: () => Promise<LlamaContext | null>,
  releaseContext: () => void,
) {
  const [status, setStatus] = useState<DiaryGenerateStatus>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [elapsedTime, setElapsedTime] = useState<string | null>(null);
  const [checkpointExists, setCheckpointExists] = useState(false);

  // 앱 시작 시 checkpoint 존재 여부 확인
  useEffect(() => {
    hasCheckpoint().then((exists) => {
      if (exists) {
        setCheckpointExists(true);
        setStatus("paused");
        setProgress("이전에 중단된 생성이 있습니다");
      }
    });
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const signalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const generatingRef = useRef(false);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedTime("0s");
    timerRef.current = setInterval(() => {
      setElapsedTime(formatElapsed(Date.now() - startTimeRef.current));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsedTime(formatElapsed(Date.now() - startTimeRef.current));
  };

  // AppState 변화 감지 — 백그라운드 진입 시 중단 신호
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleAppState = (nextState: AppStateStatus) => {
      if (!generatingRef.current) return;

      if (nextState === "background" || nextState === "inactive") {
        // 디바운스: 10초 후에도 여전히 백그라운드이면 중단
        debounceTimer = setTimeout(() => {
          if (AppState.currentState !== "active" && generatingRef.current) {
            console.log("[Diary] 백그라운드 감지 → 중단 신호 발송");
            signalRef.current.cancelled = true;
          }
        }, DEBOUNCE_MS);
      } else if (nextState === "active") {
        // 디바운스 내에 돌아오면 중단 취소
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => {
      subscription.remove();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  // 자동 생성 실행 (checkpoint 재개 포함)
  const runGeneration = useCallback(async () => {
    generatingRef.current = true;
    signalRef.current = { cancelled: false };

    try {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } catch {
      // keep-awake 실패해도 계속 진행
    }

    const result = await generateDiary({
      onProgress: (s, detail) => {
        setStatus(s);
        setProgress(detail);
      },
      signal: signalRef.current,
    });

    generatingRef.current = false;
    try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}

    return result;
  }, []);

  // 포그라운드 수동 생성 (선택된 사진)
  const generate = useCallback(
    async (photos: PhotoMeta[]) => {
      if (photos.length === 0) return;

      setError("");
      setResult("");
      setStatus("loading_model");
      setProgress("모델 준비 중...");
      startTimer();

      generatingRef.current = true;
      signalRef.current = { cancelled: false };
      try { await activateKeepAwakeAsync(KEEP_AWAKE_TAG); } catch {}

      const ctx = await acquireContext();
      if (!ctx) {
        stopTimer();
        generatingRef.current = false;
        try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
        setError("모델을 로드할 수 없습니다. 다른 작업이 진행 중일 수 있습니다.");
        setStatus("error");
        return;
      }

      try {
        setStatus("analyzing");
        const analyses: PhotoAnalysis[] = [];
        const now = new Date();
        const fallbackTime = now.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const sorted = sortPhotosByTime(photos);

        for (let i = 0; i < sorted.length; i++) {
          if (signalRef.current.cancelled) {
            setStatus("paused");
            setProgress("중단됨");
            return;
          }

          const photo = sorted[i];
          setProgress(`사진 ${i + 1}/${sorted.length} 분석 중...`);

          const processedUri = await prepareImageForInference(photo.uri);
          const time = photo.time ?? fallbackTime;
          const place = photo.place ?? null;
          const prompt = buildPhotoPrompt(time, place);

          const res = await ctx.completion(
            {
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: processedUri } },
                  ],
                },
              ],
              n_predict: 128,
              temperature: INFERENCE_PARAMS.temperature,
              stop: INFERENCE_PARAMS.stop,
              enable_thinking: false,
            },
            () => {},
          );
          analyses.push({ uri: photo.uri, time, place, description: res.text.trim() });
        }

        setStatus("synthesizing");
        setProgress("일기를 작성하는 중...");
        const locations = sorted.map((p) => p.location);
        const synthRes = await ctx.completion(
          {
            messages: [{ role: "user", content: buildSynthesisPrompt(analyses, locations) }],
            n_predict: 256,
            temperature: 0.7,
            stop: INFERENCE_PARAMS.stop,
            enable_thinking: false,
          },
          () => {},
        );

        const diaryContent = synthRes.text.trim();

        setStatus("saving");
        const dateStr = now.toISOString().split("T")[0];
        await saveDiaryEntry(dateStr, diaryContent, analyses);

        stopTimer();
        setResult(diaryContent);
        setStatus("done");
        setProgress("");
      } catch (e: any) {
        stopTimer();
        setError(e?.message || "일기 생성에 실패했습니다");
        setStatus("error");
        setProgress("");
      } finally {
        releaseContext();
        generatingRef.current = false;
        try { deactivateKeepAwake(KEEP_AWAKE_TAG); } catch {}
      }
    },
    [acquireContext, releaseContext],
  );

  // 자동 생성 (오늘 사진 수집 → 헤드리스 generator)
  const generateFromToday = useCallback(async () => {
    setError("");
    setResult("");
    setCheckpointExists(false);
    startTimer();

    const genResult = await runGeneration();

    stopTimer();
    if (genResult) {
      setResult(genResult.content);
      setCheckpointExists(false);
    } else {
      const stillExists = await hasCheckpoint();
      setCheckpointExists(stillExists);
    }
  }, [runGeneration]);

  // checkpoint에서 재개
  const resumeFromCheckpoint = useCallback(async () => {
    const exists = await hasCheckpoint();
    if (!exists) return;
    setError("");
    setResult("");
    setCheckpointExists(false);
    startTimer();

    const genResult = await runGeneration();

    stopTimer();
    if (genResult) {
      setResult(genResult.content);
      setCheckpointExists(false);
    } else {
      // paused 상태로 다시 중단됐을 수 있음
      const stillExists = await hasCheckpoint();
      setCheckpointExists(stillExists);
    }
  }, [runGeneration]);

  const reset = useCallback(async () => {
    setStatus("idle");
    setProgress("");
    setResult("");
    setError("");
    setElapsedTime(null);
    setCheckpointExists(false);
    await clearCheckpoint();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    generate,
    generateFromToday,
    resumeFromCheckpoint,
    reset,
    status,
    progress,
    result,
    error,
    elapsedTime,
    hasCheckpoint: checkpointExists,
  };
}
