import { useEffect, useRef, useState, useCallback } from "react";
import { Alert } from "react-native";
import { File } from "expo-file-system";
import { initLlama, type LlamaContext } from "llama.rn";
import { MODEL_DIR, MODEL_FILES, type ModelState } from "../lib/constants";
import { INFERENCE_PARAMS } from "../lib/inference";
import { t } from "../lib/i18n";

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

export function useModelManager() {
  const [modelState, setModelState] = useState<ModelState>("checking");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);

  const contextRef = useRef<LlamaContext | null>(null);

  useEffect(() => {
    checkModels();
    return () => {
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

  const downloadModels = async () => {
    setModelState("downloading");
    setDownloadStatus("");
    try {
      if (!MODEL_DIR.exists) {
        MODEL_DIR.create();
      }

      cleanupOldModels();

      const files = [MODEL_FILES.mmproj, MODEL_FILES.text];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const localFile = new File(MODEL_DIR, file.name);
        if (localFile.exists) {
          setDownloadStatus(`${file.name} ${t.cached}`);
          continue;
        }

        setDownloadStatus(
          t.downloadingStatus(i + 1, files.length, file.name, file.sizeMB)
        );

        await File.downloadFileAsync(file.url, MODEL_DIR);
      }

      setDownloadStatus("");
      setModelState("ready");
    } catch (e: any) {
      setErrorMsg(e.message || t.errorDownload);
      setModelState("error");
      setDownloadStatus("");
    }
  };

  const loadModel = useCallback(async () => {
    if (contextRef.current) return;
    setLoadingModel(true);
    try {
      const textFile = new File(MODEL_DIR, MODEL_FILES.text.name);
      const mmprojFile = new File(MODEL_DIR, MODEL_FILES.mmproj.name);

      const context = await initLlama({
        model: textFile.uri,
        n_ctx: INFERENCE_PARAMS.n_ctx,
        n_gpu_layers: INFERENCE_PARAMS.n_gpu_layers_simulator,
        ctx_shift: false,
      });

      const mmOk = await context.initMultimodal({
        path: mmprojFile.uri,
        use_gpu: false,
        image_max_tokens: 512,
      });

      if (!mmOk) {
        Alert.alert(t.warningTitle, t.warningVision);
      }

      const support = await context.getMultimodalSupport();
      console.log(
        "Vision support:",
        support.vision,
        "Audio support:",
        support.audio
      );

      contextRef.current = context;
    } catch (e: any) {
      Alert.alert(t.errorModelLoad, e.message);
    } finally {
      setLoadingModel(false);
    }
  }, []);

  return {
    modelState,
    downloadStatus,
    errorMsg,
    loadingModel,
    contextRef,
    downloadModels,
    loadModel,
  };
}
