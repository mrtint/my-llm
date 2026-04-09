import { useState, useCallback } from "react";
import type { LlamaContext } from "llama.rn";
import { buildPhotoPrompt, buildSynthesisPrompt } from "../lib/diary/prompts";
import { saveDiaryEntry } from "../lib/diary/storage";
import { INFERENCE_PARAMS } from "../lib/inference";
import type { PhotoAnalysis } from "../lib/diary/types";

export type DiaryGenerateStatus =
  | "idle"
  | "analyzing"
  | "synthesizing"
  | "saving"
  | "done"
  | "error";

export function useDiaryGenerator(
  acquireContext: () => Promise<LlamaContext | null>,
  releaseContext: () => void,
) {
  const [status, setStatus] = useState<DiaryGenerateStatus>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const generate = useCallback(
    async (imageUris: string[]) => {
      if (imageUris.length === 0) return;

      setError("");
      setResult("");

      const ctx = await acquireContext();
      if (!ctx) {
        setError("모델을 로드할 수 없습니다. 다른 작업이 진행 중일 수 있습니다.");
        setStatus("error");
        return;
      }

      try {
        setStatus("analyzing");
        const analyses: PhotoAnalysis[] = [];
        const now = new Date();

        for (let i = 0; i < imageUris.length; i++) {
          setProgress(`사진 ${i + 1}/${imageUris.length} 분석 중...`);
          const time = now.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const prompt = buildPhotoPrompt(time, null);
          const description = await runPhotoAnalysis(ctx, imageUris[i], prompt);
          analyses.push({ uri: imageUris[i], time, place: null, description });
        }

        setStatus("synthesizing");
        setProgress("일기를 작성하는 중...");
        const diaryContent = await runTextSynthesis(
          ctx,
          buildSynthesisPrompt(analyses),
        );

        setStatus("saving");
        const dateStr = now.toISOString().split("T")[0];
        await saveDiaryEntry(dateStr, diaryContent, analyses);

        setResult(diaryContent);
        setStatus("done");
        setProgress("");
      } catch (e: any) {
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
  }, []);

  return { generate, reset, status, progress, result, error };
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
      n_predict: 256,
      temperature: INFERENCE_PARAMS.temperature,
      stop: INFERENCE_PARAMS.stop,
      enable_thinking: false,
    },
    () => {},
  );
  return result.text.trim();
}

async function runTextSynthesis(
  ctx: LlamaContext,
  prompt: string,
): Promise<string> {
  const result = await ctx.completion(
    {
      messages: [{ role: "user", content: prompt }],
      n_predict: 512,
      temperature: 0.7,
      stop: INFERENCE_PARAMS.stop,
      enable_thinking: false,
    },
    () => {},
  );
  return result.text.trim();
}
