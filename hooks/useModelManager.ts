import { useEffect, useRef, useState, useCallback } from "react";
import { Alert, AppState, Platform } from "react-native";
import { File, Directory } from "expo-file-system";
import * as Device from "expo-device";
import { initLlama, type LlamaContext } from "llama.rn";
import { MODEL_DIR, MODEL_FILES, type ModelState } from "../lib/constants";
import { INFERENCE_PARAMS, getDeviceParams, getFallbackParams } from "../lib/inference";
import type { DeviceParams, DevicePlatform } from "../lib/inference";
import { t } from "../lib/i18n";

const TAG = "[ModelManager]";

export interface DownloadProgress {
  fileIndex: number;   // 1-based
  totalFiles: number;
  fileName: string;
  receivedMB: number;
  totalMB: number;
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

function cleanupOldModels() {
  if (!MODEL_DIR.exists) return;
  const currentNames = new Set([MODEL_FILES.text.name, MODEL_FILES.mmproj.name]);
  for (const entry of MODEL_DIR.list()) {
    if (entry instanceof File && entry.name.endsWith(".gguf") && !currentNames.has(entry.name)) {
      console.log("Removing old model:", entry.name);
      entry.delete();
    }
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useModelManager() {
  const [modelState, setModelState] = useState<ModelState>("checking");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);

  const contextRef = useRef<LlamaContext | null>(null);
  const busyRef = useRef(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const activeParamsRef = useRef<DeviceParams | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    checkModels();

    // iOS memoryWarning, Android onTrimMemory 시 로그
    const memSub = AppState.addEventListener("memoryWarning", () => {
      const params = activeParamsRef.current;
      console.warn(
        `${TAG} ⚠️ OS 메모리 경고 수신`,
        params
          ? `(현재 n_gpu_layers: ${params.n_gpu_layers}, n_ctx: ${params.n_ctx})`
          : "(모델 미로딩)",
      );
    });

    return () => {
      memSub.remove();
      contextRef.current?.release();
      contextRef.current = null;
    };
  }, []);

  const checkModels = () => {
    setModelState("checking");
    try {
      if (!MODEL_DIR.exists) {
        setModelState("not_downloaded");
        return;
      }
      cleanupOldModels();
      const textFile = new File(MODEL_DIR, MODEL_FILES.text.name);
      const mmprojFile = new File(MODEL_DIR, MODEL_FILES.mmproj.name);
      if (textFile.exists && mmprojFile.exists) {
        setModelState("ready");
      } else {
        setModelState("not_downloaded");
      }
    } catch {
      setModelState("not_downloaded");
    }
  };

  /** 다운로드 진행률 폴링 — 500ms마다 파일 크기를 읽어 progress 상태를 갱신 */
  const startProgressPolling = (
    fileName: string,
    totalMB: number,
    fileIndex: number,
    totalFiles: number,
  ): (() => void) => {
    const interval = setInterval(() => {
      try {
        const f = new File(MODEL_DIR, fileName);
        const receivedMB = f.exists ? Math.round((f.size ?? 0) / (1024 * 1024)) : 0;
        setDownloadProgress({ fileIndex, totalFiles, fileName, receivedMB, totalMB });
      } catch {
        // 파일이 아직 없으면 무시
      }
    }, 500);
    return () => clearInterval(interval);
  };

  /** cancelRef를 감시하다가 true가 되면 Promise를 reject */
  const cancelSignal = (): Promise<never> =>
    new Promise((_, reject) => {
      const check = setInterval(() => {
        if (cancelRef.current) {
          clearInterval(check);
          reject(new Error("CANCELLED"));
        }
      }, 200);
    });

  const downloadModels = async () => {
    cancelRef.current = false;
    setModelState("downloading");
    setDownloadStatus("");
    setDownloadProgress(null);

    try {
      if (!MODEL_DIR.exists) {
        MODEL_DIR.create();
        console.log(`${TAG} 모델 디렉토리 생성: ${MODEL_DIR.uri}`);
      }

      cleanupOldModels();

      const files = [MODEL_FILES.mmproj, MODEL_FILES.text];
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;

        const file = files[i];
        const localFile = new File(MODEL_DIR, file.name);
        if (localFile.exists) {
          console.log(`${TAG} 캐시 사용: ${file.name}`);
          setDownloadStatus(`${file.name} ${t.cached}`);
          setDownloadProgress({
            fileIndex: i + 1,
            totalFiles: files.length,
            fileName: file.name,
            receivedMB: file.sizeMB,
            totalMB: file.sizeMB,
          });
          continue;
        }

        console.log(
          `${TAG} 다운로드 시작 (${i + 1}/${files.length}): ${file.name} ` +
          `(${file.sizeMB} MB)\n  URL: ${file.url}\n  저장: ${MODEL_DIR.uri}`
        );

        // 초기 progress 표시
        setDownloadProgress({
          fileIndex: i + 1,
          totalFiles: files.length,
          fileName: file.name,
          receivedMB: 0,
          totalMB: file.sizeMB,
        });

        const stopPolling = startProgressPolling(file.name, file.sizeMB, i + 1, files.length);

        try {
          await Promise.race([
            File.downloadFileAsync(file.url, MODEL_DIR).then(() => {}),
            cancelSignal(),
          ]);

          const downloaded = new File(MODEL_DIR, file.name);
          console.log(
            `${TAG} 다운로드 완료: ${file.name} ` +
            `(exists=${downloaded.exists}, size=${downloaded.exists ? downloaded.size : "?"})`
          );
        } catch (err: any) {
          stopPolling();

          if (err.message === "CANCELLED") {
            console.log(`${TAG} 다운로드 취소됨: ${file.name}`);
            // 부분 다운로드된 파일 삭제
            try {
              const partial = new File(MODEL_DIR, file.name);
              if (partial.exists) {
                partial.delete();
                console.log(`${TAG} 부분 파일 삭제: ${file.name}`);
              }
            } catch {}
            setDownloadProgress(null);
            setModelState("not_downloaded");
            return;
          }

          console.error(
            `${TAG} ❌ 다운로드 실패: ${file.name}\n` +
            `  에러: ${err?.message ?? err}\n` +
            `  URL: ${file.url}`
          );
          throw err;
        } finally {
          stopPolling();
        }
      }

      if (cancelRef.current) {
        setDownloadProgress(null);
        setModelState("not_downloaded");
        return;
      }

      setDownloadProgress(null);
      setDownloadStatus("");
      setModelState("ready");
    } catch (e: any) {
      console.error(`${TAG} ❌ downloadModels 전체 실패:`, e?.message ?? e);
      setErrorMsg(e.message || t.errorDownload);
      setDownloadProgress(null);
      setModelState("error");
      setDownloadStatus("");
    }
  };

  const cancelDownload = useCallback(() => {
    console.log(`${TAG} 사용자가 다운로드 취소 요청`);
    cancelRef.current = true;
  }, []);

  const tryInitLlama = async (
    textFile: File,
    mmprojFile: File,
    params: DeviceParams,
  ): Promise<LlamaContext> => {
    console.log(
      `${TAG} initLlama 시도: n_gpu_layers=${params.n_gpu_layers}, n_ctx=${params.n_ctx}`,
    );
    const start = Date.now();

    const context = await initLlama({
      model: textFile.uri,
      n_ctx: params.n_ctx,
      n_gpu_layers: params.n_gpu_layers,
      ctx_shift: false,
    });

    console.log(`${TAG} initLlama 성공 (${Date.now() - start}ms)`);
    console.log(`${TAG} GPU: ${context.gpu}, reason: ${context.reasonNoGPU || "N/A"}`);
    console.log(`${TAG} androidLib: ${(context as any).androidLib ?? "unknown"}`);
    console.log(`${TAG} devices: ${JSON.stringify((context as any).devices ?? [])}`);

    // 비전 인코더 GPU 가속 테스트 결과:
    // - Gemma 4: 모든 GPU 백엔드에서 SIGABRT 크래시 (llama.cpp #21402)
    // - Qwen3-VL: 크래시 없지만 OpenCL 전송 오버헤드로 CPU보다 느림
    // 결론: CPU가 가장 빠르고 안정적
    const mmUseGpu = false;
    console.log(`${TAG} initMultimodal use_gpu: ${mmUseGpu}`);
    const mmOk = await context.initMultimodal({
      path: mmprojFile.uri,
      use_gpu: mmUseGpu,
    });

    if (!mmOk) {
      console.warn(`${TAG} 멀티모달 초기화 실패 — 비전 기능 비활성화`);
      Alert.alert(t.warningTitle, t.warningVision);
    }

    const support = await context.getMultimodalSupport();
    console.log(
      `${TAG} Vision: ${support.vision}, Audio: ${support.audio}`,
    );

    activeParamsRef.current = params;
    return context;
  };

  const loadModelInternal = async () => {
    if (contextRef.current) return;
    setLoadingModel(true);
    try {
      const textFile = new File(MODEL_DIR, MODEL_FILES.text.name);
      const mmprojFile = new File(MODEL_DIR, MODEL_FILES.mmproj.name);

      const platform = getDevicePlatform();
      const totalMem = Device.totalMemory ?? 0;
      const totalMemGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);

      let params: DeviceParams | null = Device.isDevice
        ? getDeviceParams(totalMem, platform)
        : { n_gpu_layers: INFERENCE_PARAMS.n_gpu_layers_simulator, n_ctx: INFERENCE_PARAMS.n_ctx_simulator };

      console.log(
        `${TAG} 디바이스 정보: ${Device.modelName ?? "unknown"}, ` +
        `OS=${platform}, RAM=${totalMemGB} GB`,
      );

      // GPU 메모리 부족 시 자동 fallback (최대 3회)
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES && params; attempt++) {
        try {
          const context = await tryInitLlama(textFile, mmprojFile, params);

          // 네이티브 초기화 완료 대기 — "Context is busy" 방지
          await delay(300);

          contextRef.current = context;
          if (attempt > 0) {
            console.warn(
              `${TAG} ⚠️ GPU 메모리 부족으로 설정 하향 적용됨: ` +
              `n_gpu_layers=${params.n_gpu_layers}, n_ctx=${params.n_ctx}`,
            );
          }
          return; // 성공
        } catch (e: unknown) {
          if (isGpuMemoryError(e)) {
            const fallback = getFallbackParams(params);
            console.error(
              `${TAG} ❌ GPU 메모리 할당 실패 (시도 ${attempt + 1}/${MAX_RETRIES}):`,
              e instanceof Error ? e.message : e,
              fallback
                ? `→ fallback: n_gpu_layers=${fallback.n_gpu_layers}, n_ctx=${fallback.n_ctx}`
                : "→ 더 이상 줄일 수 없음",
            );
            params = fallback;
          } else {
            throw e; // GPU 메모리가 아닌 에러는 그대로 전파
          }
        }
      }

      // 모든 fallback 실패
      console.error(`${TAG} ❌ 모든 GPU fallback 실패, 모델 로딩 포기`);
      Alert.alert(
        t.errorModelLoad,
        `디바이스 메모리(${totalMemGB} GB)가 이 모델을 실행하기에 부족합니다.`,
      );
    } catch (e: any) {
      console.error(`${TAG} ❌ 모델 로딩 에러:`, e.message);
      Alert.alert(t.errorModelLoad, e.message);
    } finally {
      setLoadingModel(false);
    }
  };

  const loadModel = useCallback(async () => {
    if (contextRef.current) return;
    if (loadPromiseRef.current) {
      await loadPromiseRef.current;
      return;
    }
    loadPromiseRef.current = loadModelInternal();
    try {
      await loadPromiseRef.current;
    } finally {
      loadPromiseRef.current = null;
    }
  }, []);

  const acquireContext = useCallback(async (): Promise<LlamaContext | null> => {
    await loadModel();
    if (!contextRef.current) return null;

    const maxWait = 10;
    for (let i = 0; i < maxWait; i++) {
      if (!busyRef.current) {
        busyRef.current = true;
        return contextRef.current;
      }
      await delay(500);
    }
    return null;
  }, [loadModel]);

  const releaseContext = useCallback(() => {
    busyRef.current = false;
  }, []);

  return {
    modelState,
    downloadStatus,
    downloadProgress,
    errorMsg,
    loadingModel,
    contextRef,
    busyRef,
    downloadModels,
    cancelDownload,
    loadModel,
    acquireContext,
    releaseContext,
  };
}
