import { useEffect, useRef, useState, useCallback } from "react";
import { Alert } from "react-native";
import { File } from "expo-file-system";
import * as Device from "expo-device";
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useModelManager() {
  const [modelState, setModelState] = useState<ModelState>("checking");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);

  const contextRef = useRef<LlamaContext | null>(null);
  const busyRef = useRef(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

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

  const loadModelInternal = async () => {
    if (contextRef.current) return;
    setLoadingModel(true);
    try {
      const textFile = new File(MODEL_DIR, MODEL_FILES.text.name);
      const mmprojFile = new File(MODEL_DIR, MODEL_FILES.mmproj.name);

      const context = await initLlama({
        model: textFile.uri,
        n_ctx: Device.isDevice
          ? INFERENCE_PARAMS.n_ctx
          : INFERENCE_PARAMS.n_ctx_simulator,
        n_gpu_layers: Device.isDevice
          ? INFERENCE_PARAMS.n_gpu_layers_device
          : INFERENCE_PARAMS.n_gpu_layers_simulator,
        ctx_shift: false,
      });

      const mmOk = await context.initMultimodal({
        path: mmprojFile.uri,
        use_gpu: false,
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

      // 네이티브 초기화 완료 대기 — "Context is busy" 방지
      await delay(300);

      contextRef.current = context;
    } catch (e: any) {
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
    errorMsg,
    loadingModel,
    contextRef,
    busyRef,
    downloadModels,
    loadModel,
    acquireContext,
    releaseContext,
  };
}
