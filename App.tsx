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
    name: "SmolVLM-500M-Instruct-Q8_0.gguf",
    url: "https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-Q8_0.gguf",
    sizeMB: 437,
  },
  mmproj: {
    name: "mmproj-SmolVLM-500M-Instruct-Q8_0.gguf",
    url: "https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf",
    sizeMB: 109,
  },
};

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
  const [prompt, setPrompt] = useState("What do you see in this image?");
  const [response, setResponse] = useState("");
  const [inferring, setInferring] = useState(false);
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
          setDownloadStatus(`${file.name} (cached)`);
          continue;
        }

        setDownloadStatus(
          `Downloading ${i + 1}/${files.length}: ${file.name} (${file.sizeMB}MB)...`
        );

        await File.downloadFileAsync(file.url, MODEL_DIR);
      }

      setDownloadStatus("");
      setModelState("ready");
    } catch (e: any) {
      setErrorMsg(e.message || "Download failed");
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
        n_ctx: 2048,
        n_gpu_layers: 0,
        ctx_shift: false,
      });

      const mmOk = await context.initMultimodal({
        path: mmprojFile.uri,
        use_gpu: false,
      });

      if (!mmOk) {
        Alert.alert(
          "Warning",
          "Multimodal init returned false — vision may not work."
        );
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
      Alert.alert("Model Load Error", e.message);
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
      Alert.alert("Error", "Model not loaded");
      return;
    }
    if (!imageUri) {
      Alert.alert("Error", "Please select an image first");
      return;
    }

    setInferring(true);
    setResponse("");
    try {
      const result = await contextRef.current.completion(
        {
          messages: [
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
          n_predict: 256,
          temperature: 0.2,
          stop: ["<|im_end|>", "</s>"],
        },
        (data) => {
          if (data.token) {
            setResponse((prev) => prev + data.token);
          }
        }
      );
      console.log("Completion stats:", {
        tokens: result.tokens_predicted,
        speed: result.timings?.predicted_per_second?.toFixed(1) + " t/s",
      });
    } catch (e: any) {
      console.error("Inference error:", e);
      Alert.alert(
        "Inference Error",
        e?.message || JSON.stringify(e) || "Unknown error"
      );
    } finally {
      setInferring(false);
    }
  };

  if (modelState === "checking") {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.statusText}>Checking models...</Text>
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
        <Text style={styles.title}>On-Device Vision LLM</Text>
        <Text style={styles.subtitle}>SmolVLM-500M (Q8_0)</Text>
        <Text style={styles.sizeInfo}>
          Total download: ~
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
            <Text style={styles.downloadBtnText}>Download Model</Text>
          </TouchableOpacity>
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.header}>Vision LLM</Text>

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
              <Text style={styles.placeholderText}>Tap to select image</Text>
            </View>
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Ask about the image..."
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
              <Text style={styles.runBtnText}> Loading model...</Text>
            </View>
          ) : inferring ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.runBtnText}> Thinking...</Text>
            </View>
          ) : (
            <Text style={styles.runBtnText}>Ask AI</Text>
          )}
        </TouchableOpacity>

        {response.length > 0 && (
          <View style={styles.responseBox}>
            <Text style={styles.responseLabel}>Response:</Text>
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
