import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LlamaContext } from "llama.rn";
import { t } from "../../lib/i18n";
import { getDiaryEntries, getDiaryEntry } from "../../lib/diary/storage";
import type { DiaryEntry } from "../../lib/diary/types";
import { useDiaryGenerator } from "../../hooks/useDiaryGenerator";
import { useDailyNotification } from "../../hooks/useDailyNotification";
import { DiaryCard } from "../DiaryCard";
import type { DiaryStackParamList } from "../../navigation/types";

interface DiaryHomeScreenProps {
  contextRef: React.MutableRefObject<LlamaContext | null>;
  navigation: NativeStackNavigationProp<DiaryStackParamList, "DiaryHome">;
}

export function DiaryHomeScreen({ contextRef, navigation }: DiaryHomeScreenProps) {
  useDailyNotification();

  const todayStr = new Date().toISOString().split("T")[0];
  const [todayEntry, setTodayEntry] = useState<DiaryEntry | null>(null);
  const [pastEntries, setPastEntries] = useState<DiaryEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const diary = useDiaryGenerator(contextRef);

  const loadEntries = useCallback(async () => {
    const all = await getDiaryEntries();
    const today = all.find((e) => e.date === todayStr) ?? null;
    setTodayEntry(today);
    setPastEntries(all.filter((e) => e.date !== todayStr));
  }, [todayStr]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // After diary generation completes, reload entries
  useEffect(() => {
    if (diary.status === "done") {
      loadEntries();
    }
  }, [diary.status, loadEntries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  const isGenerating = !["idle", "done", "error"].includes(diary.status);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.diaryTitle}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Today's diary section */}
        <View style={styles.section}>
          {isGenerating ? (
            <View style={styles.generatingBox}>
              <ActivityIndicator size="small" color="#4a90d9" style={styles.spinner} />
              <Text style={styles.generatingText}>{diary.progress}</Text>
            </View>
          ) : diary.status === "error" ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>{t.diaryError}</Text>
              <Text style={styles.errorMsg}>{diary.error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => { diary.reset(); diary.generate(); }}
              >
                <Text style={styles.retryBtnText}>{t.diaryRetry}</Text>
              </TouchableOpacity>
            </View>
          ) : todayEntry ? (
            <TouchableOpacity
              style={styles.todayCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate("DiaryDetail", { date: todayStr })}
            >
              <Text style={styles.todayLabel}>오늘</Text>
              <Text style={styles.todayContent} numberOfLines={5}>
                {todayEntry.content}
              </Text>
              <Text style={styles.readMore}>더 보기 →</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{t.diaryEmpty}</Text>
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={diary.generate}
                disabled={isGenerating}
              >
                <Text style={styles.generateBtnText}>{t.diaryGenerate}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Past entries */}
        {pastEntries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.diaryPastEntries}</Text>
            {pastEntries.map((entry) => (
              <DiaryCard
                key={entry.id}
                entry={entry}
                onPress={() => navigation.navigate("DiaryDetail", { date: entry.date })}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  generatingBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  spinner: { marginRight: 12 },
  generatingText: { fontSize: 15, color: "#555", flex: 1 },
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
  todayLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4a90d9",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  todayContent: { fontSize: 16, color: "#222", lineHeight: 26 },
  readMore: { fontSize: 13, color: "#4a90d9", marginTop: 10, fontWeight: "500" },
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyText: { fontSize: 15, color: "#aaa", marginBottom: 20 },
  generateBtn: {
    backgroundColor: "#4a90d9",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  generateBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
