import type { ModelFiles, InferenceParams, DeviceParams, DevicePlatform } from "./types";

export const MODEL_FILES: ModelFiles = {
  text: {
    name: "Qwen3VL-4B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/Qwen3VL-4B-Instruct-Q4_K_M.gguf",
    sizeMB: 2382,
  },
  mmproj: {
    name: "mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf",
    url: "https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf",
    sizeMB: 433,
  },
};

export const INFERENCE_PARAMS: InferenceParams = {
  n_ctx_simulator: 2048,
  n_predict: 1024,
  temperature: 0.2,
  stop: ["<|im_end|>", "<|endoftext|>"],
  n_gpu_layers_simulator: 0,
};

const GB = 1024 * 1024 * 1024;

/**
 * 디바이스 총 RAM + 플랫폼 기반으로 GPU 레이어 수와 컨텍스트 크기를 결정한다.
 *
 * Android Vulkan 백엔드는 iOS Metal 대비 GPU 메모리 효율이 낮고,
 * 디바이스 파편화가 심하므로 동일 RAM이어도 더 보수적으로 설정한다.
 *
 * @param totalMemoryBytes Device.totalMemory 값 (바이트)
 * @param platform "ios" | "android" | "unknown"
 */
export function getDeviceParams(
  totalMemoryBytes: number,
  platform: DevicePlatform = "ios",
): DeviceParams {
  if (platform === "android") {
    // Android: Vulkan 백엔드 불안정, GPU 메모리 관리 보수적
    if (totalMemoryBytes >= 12 * GB) {
      // 플래그십 (Galaxy S24 Ultra, Pixel 9 Pro 등)
      return { n_gpu_layers: 45, n_ctx: 4096 };
    }
    if (totalMemoryBytes >= 8 * GB) {
      // 미드-하이 (Galaxy S23, Pixel 8 등)
      return { n_gpu_layers: 30, n_ctx: 4096 };
    }
    if (totalMemoryBytes >= 6 * GB) {
      // 미드레인지
      return { n_gpu_layers: 15, n_ctx: 2048 };
    }
    // 저사양 — GPU를 소량 시도, 실패 시 fallback이 0까지 내림
    return { n_gpu_layers: 5, n_ctx: 2048 };
  }

  // iOS: Metal 백엔드 — OS/앱 메모리 오버헤드를 감안해 보수적으로
  if (totalMemoryBytes >= 8 * GB) {
    // iPhone 16 Pro/Max, 15 Pro/Max — 8 GB
    return { n_gpu_layers: 48, n_ctx: 4096 };
  }
  if (totalMemoryBytes >= 6 * GB) {
    // iPhone 15, 14 Pro, 14 — 6 GB
    return { n_gpu_layers: 32, n_ctx: 3072 };
  }
  // iPhone 12–13 시리즈 이하 — 4 GB
  return { n_gpu_layers: 16, n_ctx: 2048 };
}

/**
 * GPU 메모리 부족 시 한 단계 낮춘 파라미터를 반환한다.
 * null이면 더 이상 줄일 수 없음 (이미 CPU only).
 */
export function getFallbackParams(current: DeviceParams): DeviceParams | null {
  if (current.n_gpu_layers <= 0) return null;

  const reduced = Math.floor(current.n_gpu_layers * 0.5);
  const reducedCtx = current.n_ctx > 2048 ? Math.floor(current.n_ctx * 0.75) : current.n_ctx;

  return { n_gpu_layers: reduced, n_ctx: reducedCtx };
}
