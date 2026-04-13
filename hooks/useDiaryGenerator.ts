import { useState, useCallback, useRef } from "react";
import type { LlamaContext } from "llama.rn";
import { buildPhotoPrompt, buildSynthesisPrompt } from "../lib/diary/prompts";
import { saveDiaryEntry } from "../lib/diary/storage";
import { collectTodayPhotos } from "../lib/diary/photo-collector";
import { prepareImageForInference } from "../lib/image";
import { sortPhotosByTime, type PhotoMeta } from "../lib/photo-meta";
import { INFERENCE_PARAMS } from "../lib/inference";
import type { PhotoAnalysis } from "../lib/diary/types";

export type DiaryGenerateStatus =
  | "idle"
  | "fetching_photos"
  | "loading_model"
  | "analyzing"
  | "synthesizing"
  | "saving"
  | "done"
  | "no_photos"
  | "error";

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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

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

  const generate = useCallback(
    async (photos: PhotoMeta[]) => {
      if (photos.length === 0) return;

      setError("");
      setResult("");

      console.log("[Diary] 일기 생성 시작, 사진 수:", photos.length);

      // 즉시 로딩 상태로 전환 — UI가 바로 반응
      setStatus("loading_model");
      setProgress("모델 준비 중...");
      startTimer();

      console.log("[Diary] 컨텍스트 획득 중...");
      const ctx = await acquireContext();
      if (!ctx) {
        stopTimer();
        console.error("[Diary] 컨텍스트 획득 실패");
        setError("모델을 로드할 수 없습니다. 다른 작업이 진행 중일 수 있습니다.");
        setStatus("error");
        return;
      }

      console.log("[Diary] 컨텍스트 획득 완료");

      try {
        // Phase 1: 사진 분석 (촬영 시간순 정렬)
        setStatus("analyzing");
        const analyses: PhotoAnalysis[] = [];
        const now = new Date();
        const fallbackTime = now.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const sorted = sortPhotosByTime(photos);
        console.log("[Diary] 시간순 정렬 완료:", sorted.map((p) => p.time ?? "unknown"));

        for (let i = 0; i < sorted.length; i++) {
          const photo = sorted[i];
          const stepStart = Date.now();
          setProgress(`사진 ${i + 1}/${sorted.length} 준비 중...`);
          console.log(`[Diary] 사진 ${i + 1}/${sorted.length} 전처리 시작:`, photo.uri.slice(-30));
          console.log(`[Diary] 메타:`, {
            time: photo.time,
            date: photo.date,
            place: photo.place,
            hasLocation: !!photo.location,
            hasExif: !!photo.exif,
          });

          const processedUri = await prepareImageForInference(photo.uri);
          console.log(`[Diary] 사진 ${i + 1} 전처리 완료 (JPEG 1024px):`, processedUri.slice(-30));

          setProgress(`사진 ${i + 1}/${sorted.length} 분석 중...`);
          const time = photo.time ?? fallbackTime;
          const place = photo.place ?? null;
          const prompt = buildPhotoPrompt(time, place);
          const description = await runPhotoAnalysis(ctx, processedUri, prompt);

          const stepElapsed = formatElapsed(Date.now() - stepStart);
          console.log(`[Diary] 사진 ${i + 1} 분석 완료 (${stepElapsed}):`, description.slice(0, 80));
          analyses.push({ uri: photo.uri, time, place, description });
        }

        // Phase 2: 일기 합성 (장소 그룹핑 반영)
        const synthStart = Date.now();
        setStatus("synthesizing");
        setProgress("일기를 작성하는 중...");

        const locations = sorted.map((p) => p.location);
        console.log("[Diary] 일기 합성 시작, 장소 데이터:", locations.map((l) => l ? "GPS" : "없음"));

        const diaryContent = await runTextSynthesis(
          ctx,
          buildSynthesisPrompt(analyses, locations),
        );

        const synthElapsed = formatElapsed(Date.now() - synthStart);
        console.log(`[Diary] 일기 합성 완료 (${synthElapsed}):`, diaryContent.slice(0, 100));

        // Phase 3: 저장
        setStatus("saving");
        const dateStr = now.toISOString().split("T")[0];
        await saveDiaryEntry(dateStr, diaryContent, analyses);
        console.log("[Diary] SQLite 저장 완료, 날짜:", dateStr);

        stopTimer();
        const totalElapsed = formatElapsed(Date.now() - startTimeRef.current);
        console.log(`[Diary] 전체 완료 — 총 ${totalElapsed}`);

        setResult(diaryContent);
        setStatus("done");
        setProgress("");
      } catch (e: any) {
        stopTimer();
        console.error("[Diary] 오류 발생:", e?.message || e);
        setError(e?.message || "일기 생성에 실패했습니다");
        setStatus("error");
        setProgress("");
      } finally {
        releaseContext();
      }
    },
    [acquireContext, releaseContext],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress("");
    setResult("");
    setError("");
    setElapsedTime(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const generateFromToday = useCallback(async () => {
    setError("");
    setResult("");
    setStatus("fetching_photos");
    setProgress("오늘 사진을 찾는 중...");
    startTimer();

    try {
      console.log("[Diary] 오늘 사진 자동 수집 시작");
      const photos = await collectTodayPhotos(3);

      if (photos.length === 0) {
        stopTimer();
        console.log("[Diary] 오늘 사진 없음");
        setStatus("no_photos");
        setProgress("");
        return;
      }

      console.log(`[Diary] ${photos.length}장 수집 완료:`, photos.map((p) => p.time ?? "unknown"));

      // 사진 수집 후 기존 generate 로직으로 위임
      // (타이머는 이미 시작됨, status도 이미 전환됨)
      stopTimer(); // generate가 자체 타이머를 시작하므로 중복 방지
      await generate(photos);
    } catch (e: any) {
      stopTimer();
      console.error("[Diary] 자동 수집 오류:", e?.message || e);
      setError(e?.message || "사진 수집에 실패했습니다");
      setStatus("error");
      setProgress("");
    }
  }, [generate]);

  return { generate, generateFromToday, reset, status, progress, result, error, elapsedTime };
}

async function runPhotoAnalysis(
  ctx: LlamaContext,
  imageUri: string,
  prompt: string,
): Promise<string> {
  const result = await ctx.completion(
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUri } },
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
  console.log("[Diary] completion stats:", {
    tokens: result.tokens_predicted,
    speed: result.timings?.predicted_per_second?.toFixed(1) + " t/s",
  });
  return result.text.trim();
}

async function runTextSynthesis(
  ctx: LlamaContext,
  prompt: string,
): Promise<string> {
  const result = await ctx.completion(
    {
      messages: [{ role: "user", content: prompt }],
      n_predict: 256,
      temperature: 0.7,
      stop: INFERENCE_PARAMS.stop,
      enable_thinking: false,
    },
    () => {},
  );
  console.log("[Diary] synthesis stats:", {
    tokens: result.tokens_predicted,
    speed: result.timings?.predicted_per_second?.toFixed(1) + " t/s",
  });
  return result.text.trim();
}
