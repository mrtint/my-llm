import { useState, useCallback, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { t } from "./lib/i18n";
import { useModelManager } from "./hooks/useModelManager";
import { useImagePicker } from "./hooks/useImagePicker";
import { useInference } from "./hooks/useInference";
import { CheckingScreen } from "./components/screens/CheckingScreen";
import { DownloadScreen } from "./components/screens/DownloadScreen";
import { ChatScreen } from "./components/screens/ChatScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const model = useModelManager();
  const [prompt, setPrompt] = useState<string>(t.defaultPrompt);

  const clearResponseRef = useRef<() => void>(() => {});

  const images = useImagePicker(
    useCallback(() => clearResponseRef.current(), []),
  );

  const inference = useInference(
    model.contextRef,
    images.imageUris,
    prompt,
    model.loadModel,
  );

  clearResponseRef.current = () => inference.setResponse("");

  if (model.modelState === "checking") {
    return <CheckingScreen />;
  }

  if (
    model.modelState === "not_downloaded" ||
    model.modelState === "downloading" ||
    model.modelState === "error"
  ) {
    return (
      <DownloadScreen
        modelState={model.modelState}
        downloadStatus={model.downloadStatus}
        errorMsg={model.errorMsg}
        downloadModels={model.downloadModels}
      />
    );
  }

  return (
    <ChatScreen
      imageUris={images.imageUris}
      onRemoveImage={images.removeImage}
      onPickImage={images.pickImage}
      prompt={prompt}
      setPrompt={setPrompt}
      inferring={inference.inferring}
      loadingModel={model.loadingModel}
      elapsedTime={inference.elapsedTime}
      response={inference.response}
      onRunInference={inference.runInference}
    />
  );
}
