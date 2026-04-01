import {
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MODEL_FILES, type ModelState } from "../../lib/constants";
import { t } from "../../lib/i18n";

interface DownloadScreenProps {
  modelState: ModelState;
  downloadStatus: string;
  errorMsg: string;
  downloadModels: () => void;
}

export function DownloadScreen({
  modelState,
  downloadStatus,
  errorMsg,
  downloadModels,
}: DownloadScreenProps) {
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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
});
