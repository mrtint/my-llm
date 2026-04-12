export interface ModelFileInfo {
  name: string;
  url: string;
  sizeMB: number;
}

export interface ModelFiles {
  text: ModelFileInfo;
  mmproj: ModelFileInfo;
}

export interface InferenceParams {
  n_ctx_simulator: number;
  n_predict: number;
  temperature: number;
  stop: string[];
  n_gpu_layers_simulator: number;
}

export type DevicePlatform = "ios" | "android" | "unknown";

export interface DeviceParams {
  n_gpu_layers: number;
  n_ctx: number;
}

export interface InferenceResult {
  text: string;
  tokens_predicted: number;
  elapsed_ms: number;
  tokens_per_second?: number;
  stopped_eos?: boolean;
  truncated?: boolean;
}
