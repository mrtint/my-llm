import { useRef, useState } from "react";
import { Alert } from "react-native";
import type { LlamaContext } from "llama.rn";
import { INFERENCE_PARAMS, buildLanguageInstruction } from "../lib/inference";
import { t } from "../lib/i18n";

export function useInference(
  contextRef: React.MutableRefObject<LlamaContext | null>,
  imageUris: string[],
  prompt: string,
  loadModel: () => Promise<void>,
) {
  const [response, setResponse] = useState("");
  const [elapsedTime, setElapsedTime] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const runInference = async () => {
    if (!contextRef.current) {
      await loadModel();
    }
    if (!contextRef.current) {
      Alert.alert(t.errorTitle, t.errorModelNotLoaded);
      return;
    }
    if (imageUris.length === 0) {
      Alert.alert(t.errorTitle, t.errorSelectImage);
      return;
    }

    setInferring(true);
    setResponse("");
    setElapsedTime(null);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(formatTime(Date.now() - startTimeRef.current));
    }, 1000);
    try {
      const result = await contextRef.current.completion(
        {
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt + "\n\n" + buildLanguageInstruction(prompt) },
                ...imageUris.map((uri) => ({
                  type: "image_url" as const,
                  image_url: { url: uri },
                })),
              ],
            },
          ],
          n_predict: INFERENCE_PARAMS.n_predict,
          temperature: INFERENCE_PARAMS.temperature,
          stop: INFERENCE_PARAMS.stop,
          enable_thinking: false,
        },
        (data) => {
          if (data.token) {
            setResponse((prev) => prev + data.token);
          }
        }
      );
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(formatTime(Date.now() - startTimeRef.current));
      console.log("Completion stats:", {
        tokens: result.tokens_predicted,
        speed: result.timings?.predicted_per_second?.toFixed(1) + " t/s",
        stopped_eos: result.stopped_eos,
        stopped_word: result.stopped_word,
        stopping_word: result.stopping_word,
        truncated: result.truncated,
      });
      if (result.tokens_predicted === 0) {
        Alert.alert(t.errorTitle, t.errorEmptyResponse);
      }
    } catch (e: any) {
      console.error("Inference error:", e);
      Alert.alert(
        t.errorInference,
        e?.message || JSON.stringify(e) || "Unknown error"
      );
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setInferring(false);
    }
  };

  return { response, setResponse, elapsedTime, inferring, runInference };
}
