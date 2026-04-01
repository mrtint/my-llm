import type { ModelFiles, InferenceParams } from "./types";

export const MODEL_FILES: ModelFiles = {
  text: {
    name: "gemma-3-4b-it-Q4_K_M.gguf",
    url: "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf",
    sizeMB: 2340,
  },
  mmproj: {
    name: "mmproj-model-f16.gguf",
    url: "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/mmproj-model-f16.gguf",
    sizeMB: 812,
  },
};

export const INFERENCE_PARAMS: InferenceParams = {
  n_ctx: 4096,
  n_predict: 1024,
  temperature: 0.2,
  stop: ["<end_of_turn>"],
  n_gpu_layers_device: 99,
  n_gpu_layers_simulator: 0,
};
