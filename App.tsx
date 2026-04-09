import { useState, useCallback, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { t } from "./lib/i18n";
import { useModelManager } from "./hooks/useModelManager";
import { useImagePicker } from "./hooks/useImagePicker";
import { useInference } from "./hooks/useInference";
import { CheckingScreen } from "./components/screens/CheckingScreen";
import { DownloadScreen } from "./components/screens/DownloadScreen";
import { ChatScreen } from "./components/screens/ChatScreen";
import { DiaryHomeScreen } from "./components/screens/DiaryHomeScreen";
import { DiaryDetailScreen } from "./components/screens/DiaryDetailScreen";
import type { DiaryStackParamList } from "./navigation/types";

const DiaryStack = createNativeStackNavigator<DiaryStackParamList>();
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const model = useModelManager();

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
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen
          name="DiaryTab"
          options={{
            tabBarLabel: t.tabDiary,
            tabBarIcon: ({ color, size }) => (
              <Text style={{ fontSize: size - 2, color }}>📔</Text>
            ),
          }}
        >
          {() => (
            <DiaryStack.Navigator screenOptions={{ headerShown: false }}>
              <DiaryStack.Screen name="DiaryHome">
                {(props) => (
                  <DiaryHomeScreen
                    {...props}
                    contextRef={model.contextRef}
                  />
                )}
              </DiaryStack.Screen>
              <DiaryStack.Screen name="DiaryDetail" component={DiaryDetailScreen} />
            </DiaryStack.Navigator>
          )}
        </Tab.Screen>

        <Tab.Screen
          name="ChatTab"
          options={{
            tabBarLabel: t.tabChat,
            tabBarIcon: ({ color, size }) => (
              <Text style={{ fontSize: size - 2, color }}>💬</Text>
            ),
          }}
        >
          {() => <ChatTabContent model={model} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function ChatTabContent({ model }: { model: ReturnType<typeof useModelManager> }) {
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
