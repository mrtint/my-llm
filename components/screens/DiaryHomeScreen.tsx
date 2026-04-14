import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LlamaContext } from "llama.rn";
import { t } from "../../lib/i18n";
import { getDiaryEntries } from "../../lib/diary/storage";
import type { DiaryEntry } from "../../lib/diary/types";
import { extractPhotoMeta, type PhotoMeta } from "../../lib/photo-meta";
import { useDiaryGenerator } from "../../hooks/useDiaryGenerator";
import { useDailyNotification } from "../../hooks/useDailyNotification";
import { DiaryCard } from "../DiaryCard";
import type { DiaryStackParamList } from "../../navigation/types";

const MAX_PHOTOS = 3;

interface DiaryHomeScreenProps {
  acquireContext: () => Promise<LlamaContext | null>;
  releaseContext: () => void;
  navigation: NativeStackNavigationProp<DiaryStackParamList, "DiaryHome">;
}

export function DiaryHomeScreen({
  acquireContext,
  releaseContext,
  navigation,
}: DiaryHomeScreenProps) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [todayEntry, setTodayEntry] = useState<DiaryEntry | null>(null);
  const [pastEntries, setPastEntries] = useState<DiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoMeta[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const diary = useDiaryGenerator(acquireContext, releaseContext);

  const confirmAndGenerate = useCallback(() => {
    if (todayEntry) {
      Alert.alert(
        "일기 다시 작성",
        "오늘 적은 일기가 이미 있는데요?\n정말 다시 작성할까요?",
        [
          { text: "아니오", style: "cancel" },
          { text: "네", onPress: () => diary.generateFromToday() },
        ],
      );
    } else {
      diary.generateFromToday();
    }
  }, [todayEntry, diary.generateFromToday]);

  // 알림 탭 → 자동 생성 트리거
  useDailyNotification(() => {
    confirmAndGenerate();
  });

  const loadEntries = useCallback(async () => {
    const all = await getDiaryEntries();
    const today = all.find((e) => e.date === todayStr) ?? null;
    setTodayEntry(today);
    setPastEntries(all.filter((e) => e.date !== todayStr));
  }, [todayStr]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (diary.status === "done") {
      loadEntries();
      setSelectedPhotos([]);
      setManualMode(false);
    }
  }, [diary.status, loadEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  const pickPhotos = useCallback(async () => {
    const remaining = MAX_PHOTOS - selectedPhotos.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
      exif: true,
    });

    if (!result.canceled) {
      const newMetas = await Promise.all(
        result.assets.map((asset) => extractPhotoMeta(asset)),
      );
      setSelectedPhotos((prev) =>
        [...prev, ...newMetas].slice(0, MAX_PHOTOS),
      );
    }
  }, [selectedPhotos.length]);

  const removePhoto = useCallback((index: number) => {
    setSelectedPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const isGenerating = ![
    "idle", "done", "error", "no_photos", "paused",
  ].includes(diary.status);
  const canGenerate = selectedPhotos.length > 0 && !isGenerating;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.diaryTitle}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 자동/수동 생성 UI */}
        {!isGenerating && diary.status !== "done" && (
          <View style={styles.section}>
            {/* 사진 없음 상태 */}
            {diary.status === "no_photos" && (
              <View style={styles.noPhotosBox}>
                <Text style={styles.noPhotosText}>
                  {t.diaryNoPhotos}{"\n"}내일 다시 알려드릴게요
                </Text>
                <TouchableOpacity
                  style={styles.manualModeBtn}
                  onPress={() => { diary.reset(); setManualMode(true); }}
                >
                  <Text style={styles.manualModeBtnText}>사진 직접 선택</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 에러 상태 */}
            {diary.status === "error" && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>{t.diaryError}</Text>
                <Text style={styles.errorMsg}>{diary.error}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={diary.reset}
                >
                  <Text style={styles.retryBtnText}>{t.diaryRetry}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 중단된 생성 재개 버튼 */}
            {diary.status === "paused" && diary.hasCheckpoint && (
              <View>
                <TouchableOpacity
                  style={styles.resumeBtn}
                  onPress={diary.resumeFromCheckpoint}
                  activeOpacity={0.8}
                >
                  <Text style={styles.resumeBtnTitle}>이어서 생성하기</Text>
                  <Text style={styles.resumeBtnDesc}>이전에 중단된 일기 생성을 이어서 진행합니다</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.restartBtn}
                  onPress={diary.reset}
                  activeOpacity={0.8}
                >
                  <Text style={styles.restartBtnTitle}>새로 다시 생성하기</Text>
                  <Text style={styles.restartBtnDesc}>이전 진행 내용을 버리고 처음부터 생성합니다</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 자동 생성 버튼 (기본 모드) */}
            {diary.status === "idle" && !manualMode && (
              <View>
                <TouchableOpacity
                  style={styles.autoGenerateBtn}
                  onPress={confirmAndGenerate}
                  activeOpacity={0.8}
                >
                  <Text style={styles.autoGenerateTitle}>{t.diaryAutoGenerate}</Text>
                  <Text style={styles.autoGenerateDesc}>{t.diaryAutoGenerateDesc}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.manualModeBtn}
                  onPress={() => setManualMode(true)}
                >
                  <Text style={styles.manualModeBtnText}>사진 직접 선택</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 수동 사진 선택 모드 */}
            {diary.status === "idle" && manualMode && (
              <View>
                <TouchableOpacity
                  style={styles.backToAutoBtn}
                  onPress={() => { setManualMode(false); setSelectedPhotos([]); }}
                >
                  <Text style={styles.backToAutoBtnText}>← 자동 생성</Text>
                </TouchableOpacity>

                <View style={styles.photoRow}>
                  {selectedPhotos.map((photo, i) => (
                    <View key={i} style={styles.photoThumbWrap}>
                      <Image source={{ uri: photo.uri }} style={styles.photoThumb} resizeMode="cover" />
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removePhoto(i)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                      {photo.time && (
                        <Text style={styles.photoMetaLabel}>{photo.time}</Text>
                      )}
                    </View>
                  ))}
                  {selectedPhotos.length < MAX_PHOTOS && (
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhotos}>
                      <Text style={styles.addPhotoBtnIcon}>+</Text>
                      <Text style={styles.addPhotoBtnLabel}>
                        {selectedPhotos.length === 0
                          ? t.diaryGenerate
                          : `${selectedPhotos.length}/${MAX_PHOTOS}`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {selectedPhotos.length > 0 && (
                  <TouchableOpacity
                    style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
                    onPress={() => diary.generate(selectedPhotos)}
                    disabled={!canGenerate}
                  >
                    <Text style={styles.generateBtnText}>{t.diaryGenerating}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* 생성 중 */}
        {isGenerating && (
          <View style={styles.generatingBox}>
            <ActivityIndicator size="small" color="#4a90d9" style={styles.spinner} />
            <View style={styles.generatingInfo}>
              <Text style={styles.generatingText}>{diary.progress}</Text>
              {diary.elapsedTime && (
                <Text style={styles.elapsedText}>{diary.elapsedTime}</Text>
              )}
            </View>
          </View>
        )}

        {/* 완료 + 소요 시간 */}
        {diary.status === "done" && diary.elapsedTime && (
          <Text style={styles.doneTime}>
            {diary.elapsedTime}에 생성 완료
          </Text>
        )}

        {/* 오늘 일기 */}
        {todayEntry && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>오늘</Text>
            <TouchableOpacity
              style={styles.todayCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("DiaryDetail", { date: todayStr })}
            >
              <Text style={styles.todayContent} numberOfLines={5}>
                {todayEntry.content}
              </Text>
              <Text style={styles.readMore}>더 보기 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 과거 일기 */}
        {pastEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.diaryPastEntries}</Text>
            {pastEntries.map((entry) => (
              <DiaryCard
                key={entry.id}
                entry={entry}
                onPress={() =>
                  navigation.navigate("DiaryDetail", { date: entry.date })
                }
              />
            ))}
          </View>
        )}

        {todayEntry === null && pastEntries.length === 0 && !isGenerating && diary.status === "idle" && !manualMode && (
          <Text style={styles.emptyText}>{t.diaryEmpty}</Text>
        )}

        {/* 디버그 패널 (__DEV__ only) */}
        {__DEV__ && <DebugPanel />}
      </ScrollView>
    </SafeAreaView>
  );
}

function DebugPanel() {
  const [debugLog, setDebugLog] = useState("");

  const onTriggerNotif = async () => {
    setDebugLog("알림 발송 중...");
    const { triggerDiaryNotificationNow } = await import("../../lib/diary/debug-trigger");
    await triggerDiaryNotificationNow();
    setDebugLog("알림 발송됨");
  };

  const onSchedule1min = async () => {
    setDebugLog("1분 후 스케줄 중...");
    const { rescheduleDiaryNotification } = await import("../../lib/diary/debug-trigger");
    await rescheduleDiaryNotification(1);
    setDebugLog("1분 후 스케줄됨");
  };

  return (
    <View style={debugStyles.container}>
      <Text style={debugStyles.title}>Debug</Text>
      <View style={debugStyles.row}>
        <TouchableOpacity style={debugStyles.btn} onPress={onTriggerNotif}>
          <Text style={debugStyles.btnText}>테스트 알림</Text>
        </TouchableOpacity>
        <TouchableOpacity style={debugStyles.btn} onPress={onSchedule1min}>
          <Text style={debugStyles.btnText}>1분 후</Text>
        </TouchableOpacity>
      </View>
      {debugLog !== "" && <Text style={debugStyles.log}>{debugLog}</Text>}
    </View>
  );
}

const debugStyles = StyleSheet.create({
  container: {
    marginTop: 32,
    padding: 12,
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  title: { fontSize: 12, fontWeight: "700", color: "#92400e", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: "#f59e0b",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  log: { fontSize: 11, color: "#92400e", marginTop: 6 },
});

const THUMB_SIZE = 90;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    alignItems: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  autoGenerateBtn: {
    backgroundColor: "#4a90d9",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  autoGenerateTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  autoGenerateDesc: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 6 },
  manualModeBtn: {
    alignSelf: "center",
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  manualModeBtnText: { color: "#888", fontSize: 14 },
  backToAutoBtn: {
    marginBottom: 12,
    paddingVertical: 4,
  },
  backToAutoBtnText: { color: "#4a90d9", fontSize: 14, fontWeight: "500" },
  noPhotosBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  noPhotosText: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  photoThumbWrap: {
    width: THUMB_SIZE,
    borderRadius: 10,
    overflow: "visible",
  },
  photoThumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#333",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  photoMetaLabel: {
    fontSize: 10,
    color: "#888",
    textAlign: "center",
    marginTop: 3,
  },
  addPhotoBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#4a90d9",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoBtnIcon: { fontSize: 24, color: "#4a90d9", lineHeight: 28 },
  addPhotoBtnLabel: { fontSize: 11, color: "#4a90d9", marginTop: 2 },
  generateBtn: {
    backgroundColor: "#4a90d9",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  generateBtnDisabled: { backgroundColor: "#b0c8e8" },
  generateBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  generatingBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  spinner: { marginRight: 12 },
  generatingInfo: { flex: 1 },
  generatingText: { fontSize: 15, color: "#555" },
  elapsedText: { fontSize: 13, color: "#999", marginTop: 4 },
  doneTime: {
    textAlign: "center",
    fontSize: 13,
    color: "#4a90d9",
    marginBottom: 12,
    fontWeight: "500",
  },
  errorBox: {
    backgroundColor: "#fff5f5",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#fcc",
  },
  errorTitle: { fontSize: 15, fontWeight: "600", color: "#c00", marginBottom: 4 },
  errorMsg: { fontSize: 14, color: "#666", marginBottom: 12 },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#c00",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  todayCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  todayContent: { fontSize: 16, color: "#222", lineHeight: 26 },
  readMore: { fontSize: 13, color: "#4a90d9", marginTop: 10, fontWeight: "500" },
  emptyText: { textAlign: "center", color: "#bbb", fontSize: 15, marginTop: 40 },
  resumeBtn: {
    backgroundColor: "#f0f7ff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#bdd8f5",
  },
  resumeBtnTitle: { fontSize: 16, fontWeight: "700", color: "#4a90d9" },
  resumeBtnDesc: { fontSize: 13, color: "#7aabe0", marginTop: 4 },
  restartBtn: {
    backgroundColor: "#fff5f5",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#fcc",
  },
  restartBtnTitle: { fontSize: 16, fontWeight: "700", color: "#c00" },
  restartBtnDesc: { fontSize: 13, color: "#e08080", marginTop: 4 },
});
