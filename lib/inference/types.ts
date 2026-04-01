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
  n_ctx: number;
  n_predict: number;
  temperature: number;
  stop: string[];
  n_gpu_layers_device: number;
  n_gpu_layers_simulator: number;
}

export interface InferenceResult {
  text: string;
  tokens_predicted: number;
  elapsed_ms: number;
  tokens_per_second?: number;
  stopped_eos?: boolean;
  truncated?: boolean;
}
