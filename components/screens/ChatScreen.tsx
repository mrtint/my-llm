import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { t } from "../../lib/i18n";
import { ImageGrid } from "../ImageGrid";
import { InferenceButton } from "../InferenceButton";
import { ResponseBox } from "../ResponseBox";

interface ChatScreenProps {
  imageUris: string[];
  onRemoveImage: (index: number) => void;
  onPickImage: () => void;
  prompt: string;
  setPrompt: (text: string) => void;
  inferring: boolean;
  loadingModel: boolean;
  elapsedTime: string | null;
  response: string;
  onRunInference: () => void;
}

export function ChatScreen({
  imageUris,
  onRemoveImage,
  onPickImage,
  prompt,
  setPrompt,
  inferring,
  loadingModel,
  elapsedTime,
  response,
  onRunInference,
}: ChatScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.headerContainer}>
        <Text style={styles.header}>{t.appTitle}</Text>
        <Text style={styles.headerModel}>{t.modelName}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <ImageGrid
          imageUris={imageUris}
          onRemove={onRemoveImage}
          onAdd={onPickImage}
        />

        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          placeholder={t.promptPlaceholder}
          multiline
        />

        <InferenceButton
          inferring={inferring}
          loadingModel={loadingModel}
          elapsedTime={elapsedTime}
          onPress={onRunInference}
        />

        <ResponseBox response={response} elapsedTime={elapsedTime} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerContainer: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    alignItems: "center",
  },
  header: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  headerModel: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
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
});
