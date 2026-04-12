import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { MODEL_FILES, type ModelState } from "../../lib/constants";
import type { DownloadProgress } from "../../hooks/useModelManager";
import { t } from "../../lib/i18n";

interface DownloadScreenProps {
  modelState: ModelState;
  downloadStatus: string;
  downloadProgress: DownloadProgress | null;
  errorMsg: string;
  downloadModels: () => void;
  cancelDownload: () => void;
}

function ProgressBar({ progress }: { progress: number }) {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: Math.min(Math.max(progress, 0), 1),
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthPercent = animatedWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width: widthPercent }]} />
    </View>
  );
}

export function DownloadScreen({
  modelState,
  downloadStatus,
  downloadProgress,
  errorMsg,
  downloadModels,
  cancelDownload,
}: DownloadScreenProps) {
  const totalSize = MODEL_FILES.text.sizeMB + MODEL_FILES.mmproj.sizeMB;

  // 전체 진행률 계산 (0~1)
  const overallProgress = downloadProgress
    ? (() => {
        const prevFilesMB =
          downloadProgress.fileIndex === 1 ? 0 : MODEL_FILES.mmproj.sizeMB;
        const currentFileMB =
          downloadProgress.fileIndex === 1
            ? MODEL_FILES.mmproj.sizeMB
            : MODEL_FILES.text.sizeMB;
        const currentRatio =
          currentFileMB > 0
            ? Math.min(downloadProgress.receivedMB / currentFileMB, 1)
            : 0;
        return (prevFilesMB + currentRatio * currentFileMB) / totalSize;
      })()
    : 0;

  return (
    <SafeAreaView style={styles.centered}>
      <Text style={styles.title}>{t.downloadTitle}</Text>
      <Text style={styles.subtitle}>{t.modelName}</Text>
      <Text style={styles.sizeInfo}>
        {t.totalDownload}: ~{totalSize} MB
      </Text>

      {modelState === "error" && (
        <Text style={styles.errorText}>{errorMsg}</Text>
      )}

      {modelState === "downloading" ? (
        <View style={styles.progressContainer}>
          {/* 전체 진행률 바 */}
          <ProgressBar progress={overallProgress} />

          {downloadProgress ? (
            <>
              <Text style={styles.percentText}>
                {Math.round(overallProgress * 100)}%
              </Text>
              <Text style={styles.fileNameText}>
                {downloadProgress.fileIndex}/{downloadProgress.totalFiles} — {downloadProgress.fileName}
              </Text>
              <Text style={styles.bytesText}>
                {downloadProgress.receivedMB} / {downloadProgress.totalMB} MB
              </Text>
            </>
          ) : (
            <Text style={styles.downloadingText}>{downloadStatus}</Text>
          )}

          {/* 취소 버튼 */}
          <TouchableOpacity style={styles.cancelBtn} onPress={cancelDownload}>
            <Text style={styles.cancelBtnText}>{t.cancelBtn}</Text>
          </TouchableOpacity>
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
    gap: 10,
    width: "100%",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 4,
  },
  percentText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#007AFF",
    marginTop: 4,
  },
  fileNameText: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
  },
  bytesText: {
    fontSize: 13,
    color: "#888",
  },
  downloadingText: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
  },
  cancelBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d32f2f",
  },
  cancelBtnText: {
    color: "#d32f2f",
    fontSize: 15,
    fontWeight: "600",
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
