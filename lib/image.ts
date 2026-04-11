import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const MAX_DIMENSION = 1024;

/**
 * HEIC/PNG/WebP 등 → JPEG 변환 + 1024px 리사이즈.
 * llama.rn 비전 인코더는 HEIC를 지원하지 않고,
 * 내부적으로 512px 타일링하므로 1024px 이상은 품질 향상 없이 시간만 소모.
 */
export async function prepareImageForInference(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: 0.8, format: SaveFormat.JPEG },
  );
  return result.uri;
}
