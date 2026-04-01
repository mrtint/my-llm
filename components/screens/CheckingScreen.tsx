import { Text, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { t } from "../../lib/i18n";

export function CheckingScreen() {
  return (
    <SafeAreaView style={styles.centered}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.statusText}>{t.checkingModels}</Text>
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
  statusText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
});
