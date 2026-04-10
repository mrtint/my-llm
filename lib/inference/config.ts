import type { ModelFiles, InferenceParams } from "./types";

export const MODEL_FILES: ModelFiles = {
  text: {
    name: "gemma-4-e4b-it-Q4_K_M.gguf",
    url: "https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-e4b-it-Q4_K_M.gguf",
    sizeMB: 5090,
  },
  mmproj: {
    name: "mmproj-gemma-4-e4b-it-f16.gguf",
    url: "https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/mmproj-gemma-4-e4b-it-f16.gguf",
    sizeMB: 944,
  },
};

export const INFERENCE_PARAMS: InferenceParams = {
  n_ctx: 8192,
  n_ctx_simulator: 2048,
  n_predict: 1024,
  temperature: 0.2,
  stop: ["<end_of_turn>"],
  n_gpu_layers_device: 99,
  n_gpu_layers_simulator: 0,
};
