import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { DiaryEntry } from "../lib/diary/types";

interface DiaryCardProps {
  entry: DiaryEntry;
  onPress: () => void;
}

export function DiaryCard({ entry, onPress }: DiaryCardProps) {
  const dateLabel = formatDate(entry.date);
  const preview = entry.content.slice(0, 80) + (entry.content.length > 80 ? "..." : "");

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.date}>{dateLabel}</Text>
      <Text style={styles.preview}>{preview}</Text>
      {entry.analyses.length > 0 && (
        <Text style={styles.meta}>{entry.analyses.length}장의 사진</Text>
      )}
    </TouchableOpacity>
  );
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  date: {
    fontSize: 13,
    fontWeight: "600",
    color: "#888",
    marginBottom: 6,
  },
  preview: {
    fontSize: 15,
    color: "#222",
    lineHeight: 22,
  },
  meta: {
    fontSize: 12,
    color: "#bbb",
    marginTop: 8,
  },
});
