import {
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { t } from "../lib/i18n";

interface InferenceButtonProps {
  inferring: boolean;
  loadingModel: boolean;
  elapsedTime: string | null;
  onPress: () => void;
}

export function InferenceButton({
  inferring,
  loadingModel,
  elapsedTime,
  onPress,
}: InferenceButtonProps) {
  const disabled = inferring || loadingModel;

  return (
    <TouchableOpacity
      style={[styles.runBtn, disabled && styles.runBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
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
  );
}

const styles = StyleSheet.create({
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
});
