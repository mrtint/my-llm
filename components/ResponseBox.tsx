import { View, Text, StyleSheet } from "react-native";
import { t } from "../lib/i18n";

interface ResponseBoxProps {
  response: string;
  elapsedTime: string | null;
}

export function ResponseBox({ response, elapsedTime }: ResponseBoxProps) {
  if (response.length === 0) return null;

  return (
    <View style={styles.responseBox}>
      <Text style={styles.responseLabel}>
        {t.responseLabel}{elapsedTime ? ` (${elapsedTime})` : ""}:
      </Text>
      <Text style={styles.responseText}>{response}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
