import { useState, useCallback } from "react";
import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import type { LlamaContext } from "llama.rn";
import { buildPhotoPrompt, buildSynthesisPrompt } from "../lib/diary/prompts";
import { saveDiaryEntry } from "../lib/diary/storage";
import { INFERENCE_PARAMS } from "../lib/inference";
import type { PhotoAnalysis } from "../lib/diary/types";

export type DiaryGenerateStatus =
  | "idle"
  | "fetching_photos"
  | "analyzing"
  | "synthesizing"
  | "saving"
  | "done"
  | "error";

export function useDiaryGenerator(
  contextRef: React.MutableRefObject<LlamaContext | null>
) {
  const [status, setStatus] = useState<DiaryGenerateStatus>("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const generate = useCallback(async () => {
    setError("");
    setResult("");
    try {
      // 1. 사진 권한 요청 + 오늘 사진 가져오기
      setStatus("fetching_photos");
      setProgress("오늘 사진을 불러오는 중...");

      const { status: perm } = await MediaLibrary.requestPermissionsAsync();
      if (perm !== "granted") throw new Error("사진 접근 권한이 필요합니다");

      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      ).getTime();

      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: "photo",
        createdAfter: startOfDay / 1000,
        sortBy: MediaLibrary.SortBy.creationTime,
        first: 200,
      });

      if (assets.length === 0) throw new Error("오늘 찍은 사진이 없습니다");

      // 2. 시간대별 클러스터링 → 대표 사진 최대 3장
      const representative = selectRepresentativePhotos(assets, 3);

      // 3. 각 사진 멀티모달 분석
      setStatus("analyzing");
      const analyses: PhotoAnalysis[] = [];

      for (let i = 0; i < representative.length; i++) {
        const asset = representative[i];
        setProgress(`사진 ${i + 1}/${representative.length} 분석 중...`);

        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        const time = formatTime(asset.creationTime);
        let place: string | null = null;

        if (assetInfo.location) {
          place = await reverseGeocode(
            assetInfo.location.latitude,
            assetInfo.location.longitude
          );
        }

        const prompt = buildPhotoPrompt(time, place);
        const uri = assetInfo.localUri ?? asset.uri;
        const description = await runPhotoAnalysis(
          contextRef.current!,
          uri,
          prompt
        );
        analyses.push({ uri, time, place, description });
      }

      // 4. 일기 합성 (텍스트만)
      setStatus("synthesizing");
      setProgress("일기를 작성하는 중...");
      const diaryContent = await runTextSynthesis(
        contextRef.current!,
        buildSynthesisPrompt(analyses)
      );

      // 5. SQLite 저장
      setStatus("saving");
      const dateStr = today.toISOString().split("T")[0];
      await saveDiaryEntry(dateStr, diaryContent, analyses);

      setResult(diaryContent);
      setStatus("done");
      setProgress("");
    } catch (e: any) {
      setError(e?.message || "일기 생성에 실패했습니다");
      setStatus("error");
      setProgress("");
    }
  }, [contextRef]);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress("");
    setResult("");
    setError("");
  }, []);

  return { generate, reset, status, progress, result, error };
}

// 시간대별 클러스터링: 오전(~12시) / 오후(12~18시) / 저녁(18시~)
// 각 클러스터 중간 사진 1장 선택
function selectRepresentativePhotos(
  assets: MediaLibrary.Asset[],
  max: number
): MediaLibrary.Asset[] {
  const clusters: Record<string, MediaLibrary.Asset[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };

  for (const a of assets) {
    const hour = new Date(a.creationTime * 1000).getHours();
    if (hour < 12) clusters.morning.push(a);
    else if (hour < 18) clusters.afternoon.push(a);
    else clusters.evening.push(a);
  }

  const result: MediaLibrary.Asset[] = [];
  for (const key of ["morning", "afternoon", "evening"]) {
    if (result.length >= max) break;
    const cluster = clusters[key];
    if (cluster.length > 0) {
      result.push(cluster[Math.floor(cluster.length / 2)]);
    }
  }
  return result;
}

function formatTime(creationTime: number): string {
  return new Date(creationTime * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (results.length === 0) return null;
    const r = results[0];
    return (
      [r.district, r.subregion, r.region].filter(Boolean).join(" ") || null
    );
  } catch {
    return null;
  }
}

async function runPhotoAnalysis(
  ctx: LlamaContext,
  imageUri: string,
  prompt: string
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
    () => {} // 스트리밍 불필요
  );
  return result.text.trim();
}

async function runTextSynthesis(
  ctx: LlamaContext,
  prompt: string
): Promise<string> {
  const result = await ctx.completion(
    {
      messages: [{ role: "user", content: prompt }],
      n_predict: 512,
      temperature: 0.7,
      stop: INFERENCE_PARAMS.stop,
      enable_thinking: false,
    },
    () => {}
  );
  return result.text.trim();
}
