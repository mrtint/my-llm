import { Platform } from "react-native";
import { File } from "expo-file-system";
import * as Device from "expo-device";
import { initLlama, type LlamaContext } from "llama.rn";
import { MODEL_DIR, MODEL_FILES } from "../constants";
import { INFERENCE_PARAMS, getDeviceParams, getFallbackParams } from "../inference";
import type { DeviceParams, DevicePlatform } from "../inference";
import { buildPhotoPrompt, buildSynthesisPrompt } from "./prompts";
import { saveDiaryEntry } from "./storage";
import { collectTodayPhotos } from "./photo-collector";
import { prepareImageForInference } from "../image";
import { sortPhotosByTime } from "../photo-meta";
import { saveCheckpoint, loadCheckpoint, clearCheckpoint } from "./checkpoint";
import type { PhotoAnalysis } from "./types";

const TAG = "[Generator]";

export type DiaryGenerateStatus =
  | "idle"
  | "fetching_photos"
  | "loading_model"
  | "analyzing"
  | "synthesizing"
  | "saving"
  | "done"
  | "no_photos"
  | "paused"
  | "resuming"
  | "error";

export interface GeneratorOptions {
  onProgress?: (status: DiaryGenerateStatus, detail: string) => void;
  maxPhotos?: number;
  signal?: { cancelled: boolean };
}

export interface GeneratorResult {
  content: string;
  date: string;
  analyses: PhotoAnalysis[];
}

function getDevicePlatform(): DevicePlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "unknown";
}

function isGpuMemoryError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /gpu|metal|vulkan|wire.*memory|out of memory|alloc/i.test(msg);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function initModelContext(): Promise<LlamaContext> {
  const textFile = new File(MODEL_DIR, MODEL_FILES.text.name);
  const mmprojFile = new File(MODEL_DIR, MODEL_FILES.mmproj.name);

  if (!textFile.exists || !mmprojFile.exists) {
    throw new Error("모델 파일이 없습니다. 앱을 열어 다운로드해주세요.");
  }

  const platform = getDevicePlatform();
  const totalMem = Device.totalMemory ?? 0;

  let params: DeviceParams | null = Device.isDevice
    ? getDeviceParams(totalMem, platform)
    : { n_gpu_layers: INFERENCE_PARAMS.n_gpu_layers_simulator, n_ctx: INFERENCE_PARAMS.n_ctx_simulator };

  console.log(`${TAG} 디바이스: ${Device.modelName ?? "unknown"}, RAM=${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`);

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES && params; attempt++) {
    try {
      console.log(`${TAG} initLlama 시도: n_gpu_layers=${params.n_gpu_layers}, n_ctx=${params.n_ctx}`);
      const context = await initLlama({
        model: textFile.uri,
        n_ctx: params.n_ctx,
        n_gpu_layers: params.n_gpu_layers,
        ctx_shift: false,
      });

      const mmOk = await context.initMultimodal({
        path: mmprojFile.uri,
        use_gpu: false,
      });
      if (!mmOk) {
        console.warn(`${TAG} 멀티모달 초기화 실패`);
      }

      await delay(300);
      console.log(`${TAG} 모델 초기화 완료`);
      return context;
    } catch (e: unknown) {
      if (isGpuMemoryError(e)) {
        params = getFallbackParams(params);
        console.error(`${TAG} GPU 메모리 부족 (시도 ${attempt + 1}), fallback:`, params);
      } else {
        throw e;
      }
    }
  }

  throw new Error("모델 로딩 실패: GPU fallback 모두 실패");
}

/**
 * Checkpoint 기반 재개 가능한 일기 생성 함수.
 *
 * signal.cancelled가 true가 되면 현재 단계를 checkpoint에 저장하고 중단.
 * 다음 호출 시 checkpoint가 있으면 이어서 진행.
 */
export async function generateDiary(
  options: GeneratorOptions = {},
): Promise<GeneratorResult | null> {
  const { onProgress, maxPhotos = 3, signal } = options;

  const report = (status: DiaryGenerateStatus, detail: string) => {
    console.log(`${TAG} [${status}] ${detail}`);
    onProgress?.(status, detail);
  };

  const todayDate = new Date().toISOString().split("T")[0];

  // Checkpoint에서 재개 시도
  const checkpoint = await loadCheckpoint();
  let sorted = checkpoint?.photos ?? [];
  let analyses: PhotoAnalysis[] = checkpoint?.completedAnalyses ?? [];
  let startIndex = analyses.length;
  const isResuming = checkpoint !== null;

  if (isResuming) {
    report("resuming", `이전 생성을 이어서 진행합니다 (${startIndex}/${sorted.length} 완료)...`);
  } else {
    // Phase 0: 사진 수집
    report("fetching_photos", "오늘 사진을 찾는 중...");
    const photos = await collectTodayPhotos(maxPhotos);

    if (photos.length === 0) {
      report("no_photos", "오늘 사진이 없습니다");
      return null;
    }

    sorted = sortPhotosByTime(photos);
    console.log(`${TAG} ${sorted.length}장 수집 완료`);
  }

  if (signal?.cancelled) {
    await saveCheckpoint({ photos: sorted, completedAnalyses: analyses, phase: "analyzing", startedAt: checkpoint?.startedAt ?? Date.now() });
    report("paused", "중단됨");
    return null;
  }

  // Phase 1: 모델 로딩
  report("loading_model", "모델 준비 중...");
  const ctx = await initModelContext();

  try {
    // Phase 2: 사진 분석 (startIndex부터 이어서)
    const now = new Date();
    const fallbackTime = now.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const startedAt = checkpoint?.startedAt ?? Date.now();

    if (startIndex < sorted.length) {
      report("analyzing", `사진 분석${isResuming ? " 재개" : " 시작"}...`);
    }

    for (let i = startIndex; i < sorted.length; i++) {
      if (signal?.cancelled) {
        await saveCheckpoint({ photos: sorted, completedAnalyses: analyses, phase: "analyzing", startedAt });
        report("paused", `중단됨 (${analyses.length}/${sorted.length} 완료)`);
        return null;
      }

      const photo = sorted[i];
      report("analyzing", `사진 ${i + 1}/${sorted.length} 분석 중...`);

      const processedUri = await prepareImageForInference(photo.uri);

      const time = photo.time ?? fallbackTime;
      const place = photo.place ?? null;
      const prompt = buildPhotoPrompt(time, place);

      const result = await ctx.completion(
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

      const description = result.text.trim();
      console.log(`${TAG} 사진 ${i + 1} 분석 완료:`, description.slice(0, 80));
      analyses.push({ uri: photo.uri, time, place, description });

      // 분석 완료할 때마다 checkpoint 저장
      saveCheckpoint({ photos: sorted, completedAnalyses: analyses, phase: "analyzing", startedAt });
    }

    if (signal?.cancelled) {
      await saveCheckpoint({ photos: sorted, completedAnalyses: analyses, phase: "synthesizing", startedAt });
      report("paused", "합성 전 중단됨");
      return null;
    }

    // Phase 3: 일기 합성
    report("synthesizing", "일기를 작성하는 중...");
    const locations = sorted.map((p) => p.location);
    const synthResult = await ctx.completion(
      {
        messages: [{ role: "user", content: buildSynthesisPrompt(analyses, locations) }],
        n_predict: 256,
        temperature: 0.7,
        stop: INFERENCE_PARAMS.stop,
        enable_thinking: false,
      },
      () => {},
    );

    const diaryContent = synthResult.text.trim();
    console.log(`${TAG} 합성 완료:`, diaryContent.slice(0, 100));

    // Phase 4: 저장
    report("saving", "저장 중...");
    await saveDiaryEntry(todayDate, diaryContent, analyses);
    console.log(`${TAG} SQLite 저장 완료`);

    await clearCheckpoint();
    report("done", "일기 생성 완료");
    return { content: diaryContent, date: todayDate, analyses };
  } finally {
    await ctx.release();
    console.log(`${TAG} 컨텍스트 해제 완료`);
  }
}
