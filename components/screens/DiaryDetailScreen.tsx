import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { getDiaryEntry } from "../../lib/diary/storage";
import type { DiaryEntry } from "../../lib/diary/types";
import type { DiaryStackParamList } from "../../navigation/types";

interface DiaryDetailScreenProps {
  navigation: NativeStackNavigationProp<DiaryStackParamList, "DiaryDetail">;
  route: RouteProp<DiaryStackParamList, "DiaryDetail">;
}

export function DiaryDetailScreen({ navigation, route }: DiaryDetailScreenProps) {
  const { date } = route.params;
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDiaryEntry(date).then((e) => {
      setEntry(e);
      setLoading(false);
    });
  }, [date]);

  const dateLabel = formatDate(date);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{dateLabel}</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4a90d9" />
        </View>
      ) : !entry ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>일기를 찾을 수 없습니다</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {entry.analyses.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.photoStrip}
              contentContainerStyle={styles.photoStripContent}
            >
              {entry.analyses.map((a, i) => (
                <View key={i} style={styles.photoItem}>
                  <Image source={{ uri: a.uri }} style={styles.photo} resizeMode="cover" />
                  <Text style={styles.photoTime}>{a.time}</Text>
                  {a.place && <Text style={styles.photoPlace}>{a.place}</Text>}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.contentBox}>
            <Text style={styles.content}>{entry.content}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: { width: 36 },
  backText: { fontSize: 22, color: "#4a90d9" },
  headerTitle: { fontSize: 16, fontWeight: "600", flex: 1, textAlign: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 15, color: "#aaa" },
  scrollContent: { paddingBottom: 40 },
  photoStrip: { marginTop: 16 },
  photoStripContent: { paddingHorizontal: 16, gap: 12 },
  photoItem: { alignItems: "center" },
  photo: { width: 160, height: 160, borderRadius: 10 },
  photoTime: { fontSize: 12, color: "#888", marginTop: 4 },
  photoPlace: { fontSize: 11, color: "#bbb", marginTop: 2 },
  contentBox: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  content: { fontSize: 17, color: "#222", lineHeight: 28 },
});
