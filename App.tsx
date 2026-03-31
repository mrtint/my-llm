import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { File, Directory, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { initLlama, type LlamaContext } from "llama.rn";

const MODEL_DIR = new Directory(Paths.document, "models");

const MODEL_FILES = {
  text: {
    name: "InternVL2_5-1B-Q8_0.gguf",
    url: "https://huggingface.co/ggml-org/InternVL2_5-1B-GGUF/resolve/main/InternVL2_5-1B-Q8_0.gguf",
    sizeMB: 644,
  },
  mmproj: {
    name: "mmproj-InternVL2_5-1B-Q8_0.gguf",
    url: "https://huggingface.co/ggml-org/InternVL2_5-1B-GGUF/resolve/main/mmproj-InternVL2_5-1B-Q8_0.gguf",
    sizeMB: 317,
  },
};

// i18n: device locale → UI strings
const STRINGS = {
  ko: {
    appTitle: "Vision LLM",
    checkingModels: "모델 확인 중...",
    downloadTitle: "온디바이스 Vision LLM",
    modelName: "InternVL2.5-1B (Q8_0)",
    totalDownload: "총 다운로드",
    downloadBtn: "모델 다운로드",
    tapToSelect: "이미지를 탭하여 선택",
    promptPlaceholder: "이미지에 대해 질문하세요...",
    defaultPrompt: "이 이미지에서 무엇이 보이나요?",
    askAI: "AI에게 묻기",
    loadingModel: "모델 로딩 중...",
    thinking: "생각하는 중...",
    responseLabel: "응답",
    cached: "(캐시됨)",
    downloadingStatus: (i: number, total: number, name: string, size: number) =>
      `다운로드 중 ${i}/${total}: ${name} (${size}MB)...`,
    warningTitle: "경고",
    warningVision: "멀티모달 초기화 실패 — 비전 기능이 작동하지 않을 수 있습니다.",
    errorTitle: "오류",
    errorModelNotLoaded: "모델이 로드되지 않았습니다",
    errorSelectImage: "먼저 이미지를 선택해주세요",
    errorModelLoad: "모델 로드 오류",
    errorInference: "추론 오류",
    errorDownload: "다운로드 실패",
  },
  ja: {
    appTitle: "Vision LLM",
    checkingModels: "モデルを確認中...",
    downloadTitle: "オンデバイス Vision LLM",
    modelName: "InternVL2.5-1B (Q8_0)",
    totalDownload: "合計ダウンロード",
    downloadBtn: "モデルをダウンロード",
    tapToSelect: "タップして画像を選択",
    promptPlaceholder: "画像について質問してください...",
    defaultPrompt: "この画像には何が見えますか？",
    askAI: "AIに聞く",
    loadingModel: "モデル読み込み中...",
    thinking: "考え中...",
    responseLabel: "返答",
    cached: "（キャッシュ済み）",
    downloadingStatus: (i: number, total: number, name: string, size: number) =>
      `ダウンロード中 ${i}/${total}: ${name} (${size}MB)...`,
    warningTitle: "警告",
    warningVision: "マルチモーダル初期化が失敗しました — ビジョン機能が動作しない可能性があります。",
    errorTitle: "エラー",
    errorModelNotLoaded: "モデルが読み込まれていません",
    errorSelectImage: "最初に画像を選択してください",
    errorModelLoad: "モデル読み込みエラー",
    errorInference: "推論エラー",
    errorDownload: "ダウンロード失敗",
  },
  zh: {
    appTitle: "Vision LLM",
    checkingModels: "正在检查模型...",
    downloadTitle: "本地 Vision LLM",
    modelName: "InternVL2.5-1B (Q8_0)",
    totalDownload: "总下载量",
    downloadBtn: "下载模型",
    tapToSelect: "点击选择图片",
    promptPlaceholder: "询问关于图片的问题...",
    defaultPrompt: "这张图片里有什么？",
    askAI: "询问AI",
    loadingModel: "正在加载模型...",
    thinking: "思考中...",
    responseLabel: "回答",
    cached: "（已缓存）",
    downloadingStatus: (i: number, total: number, name: string, size: number) =>
      `正在下载 ${i}/${total}: ${name} (${size}MB)...`,
    warningTitle: "警告",
    warningVision: "多模态初始化失败 — 视觉功能可能无法正常工作。",
    errorTitle: "错误",
    errorModelNotLoaded: "模型未加载",
    errorSelectImage: "请先选择图片",
    errorModelLoad: "模型加载错误",
    errorInference: "推理错误",
    errorDownload: "下载失败",
  },
  en: {
    appTitle: "Vision LLM",
    checkingModels: "Checking models...",
    downloadTitle: "On-Device Vision LLM",
    modelName: "InternVL2.5-1B (Q8_0)",
    totalDownload: "Total download",
    downloadBtn: "Download Model",
    tapToSelect: "Tap to select image",
    promptPlaceholder: "Ask about the image...",
    defaultPrompt: "What do you see in this image?",
    askAI: "Ask AI",
    loadingModel: "Loading model...",
    thinking: "Thinking...",
    responseLabel: "Response",
    cached: "(cached)",
    downloadingStatus: (i: number, total: number, name: string, size: number) =>
      `Downloading ${i}/${total}: ${name} (${size}MB)...`,
    warningTitle: "Warning",
    warningVision: "Multimodal init returned false — vision may not work.",
    errorTitle: "Error",
    errorModelNotLoaded: "Model not loaded",
    errorSelectImage: "Please select an image first",
    errorModelLoad: "Model Load Error",
    errorInference: "Inference Error",
    errorDownload: "Download failed",
  },
} as const;

type LangCode = keyof typeof STRINGS;

const getStrings = () => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const lang = locale.split("-")[0].toLowerCase() as LangCode;
    return STRINGS[lang in STRINGS ? lang : "en"] ?? STRINGS.en;
  } catch {
    return STRINGS.en;
  }
};

const t = getStrings();


type ModelState =
  | "checking"
  | "not_downloaded"
  | "downloading"
  | "ready"
  | "loading"
  | "error";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [modelState, setModelState] = useState<ModelState>("checking");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(t.defaultPrompt);
  const [response, setResponse] = useState("");
  const [elapsedTime, setElapsedTime] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);

  const contextRef = useRef<LlamaContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

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
        n_ctx: 4096,
        n_gpu_layers: 0,
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

      contextRef.current = context;
    } catch (e: any) {
      Alert.alert(t.errorModelLoad, e.message);
    } finally {
      setLoadingModel(false);
    }
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setResponse("");
    }
  };

  const runInference = async () => {
    if (!contextRef.current) {
      await loadModel();
    }
    if (!contextRef.current) {
      Alert.alert(t.errorTitle, t.errorModelNotLoaded);
      return;
    }
    if (!imageUri) {
      Alert.alert(t.errorTitle, t.errorSelectImage);
      return;
    }

    setInferring(true);
    setResponse("");
    setElapsedTime(null);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startTimeRef.current;
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setElapsedTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    }, 1000);
    try {
      const result = await contextRef.current.completion(
        {
          messages: [
            {
              role: "system",
              content:
                "You MUST reply in the same language the user writes in. " +
                "If the user writes Korean (한국어), reply in Korean only. " +
                "If Japanese (日本語), reply in Japanese only. " +
                "If Chinese (中文), reply in Chinese only. " +
                "If English, reply in English only. Never switch languages.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: imageUri },
                },
              ],
            },
          ],
          n_predict: 512,
          temperature: 0.2,
          stop: ["<|im_end|>", "</s>"],
        },
        (data) => {
          if (data.token) {
            setResponse((prev) => prev + data.token);
          }
        }
      );
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const ms = Date.now() - startTimeRef.current;
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setElapsedTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
      console.log("Completion stats:", {
        tokens: result.tokens_predicted,
        speed: result.timings?.predicted_per_second?.toFixed(1) + " t/s",
      });
    } catch (e: any) {
      console.error("Inference error:", e);
      Alert.alert(
        t.errorInference,
        e?.message || JSON.stringify(e) || "Unknown error"
      );
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setInferring(false);
    }
  };

  if (modelState === "checking") {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.statusText}>{t.checkingModels}</Text>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  if (
    modelState === "not_downloaded" ||
    modelState === "downloading" ||
    modelState === "error"
  ) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>{t.downloadTitle}</Text>
        <Text style={styles.subtitle}>{t.modelName}</Text>
        <Text style={styles.sizeInfo}>
          {t.totalDownload}: ~
          {MODEL_FILES.text.sizeMB + MODEL_FILES.mmproj.sizeMB} MB
        </Text>

        {modelState === "error" && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}

        {modelState === "downloading" ? (
          <View style={styles.progressContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.downloadingText}>{downloadStatus}</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.downloadBtn} onPress={downloadModels}>
            <Text style={styles.downloadBtnText}>{t.downloadBtn}</Text>
          </TouchableOpacity>
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.header}>{t.appTitle}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="cover"
              style={styles.preview}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>{t.tapToSelect}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t.promptPlaceholder}
          multiline
        />

        <TouchableOpacity
          style={[
            styles.runBtn,
            (inferring || loadingModel) && styles.runBtnDisabled,
          ]}
          onPress={runInference}
          disabled={inferring || loadingModel}
        >
          {loadingModel ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.runBtnText}> {t.loadingModel}</Text>
            </View>
          ) : inferring ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.runBtnText}>
                {" "}{t.thinking}{elapsedTime ? ` (${elapsedTime})` : ""}
              </Text>
            </View>
          ) : (
            <Text style={styles.runBtnText}>{t.askAI}</Text>
          )}
        </TouchableOpacity>

        {response.length > 0 && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>
              {t.responseLabel}{elapsedTime ? ` (${elapsedTime})` : ""}:
            </Text>
            <Text style={styles.responseText}>{response}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  sizeInfo: {
    fontSize: 14,
    color: "#999",
    marginBottom: 24,
  },
  statusText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    color: "#d32f2f",
    marginBottom: 16,
    textAlign: "center",
  },
  progressContainer: {
    alignItems: "center",
    gap: 12,
  },
  downloadingText: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
  },
  downloadBtn: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  downloadBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  imagePicker: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#e9ecef",
    marginBottom: 16,
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 16,
    color: "#888",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 56,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
  },
  runBtn: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  runBtnDisabled: {
    opacity: 0.6,
  },
  runBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  responseBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  responseLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  responseText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#222",
  },
});
