/**
 * 모델 다운로드 URL이 실제로 존재하는지 검증한다.
 * HEAD 요청으로 200 응답을 확인하여 파일명 케이싱 오류 등을 커밋 전에 잡는다.
 */

import { MODEL_FILES } from "../lib/inference/config";

const TIMEOUT_MS = 15000;

async function checkUrl(url: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

describe("모델 다운로드 URL 유효성", () => {
  it(
    `text 모델 URL이 200을 반환한다 (${MODEL_FILES.text.name})`,
    async () => {
      const status = await checkUrl(MODEL_FILES.text.url);
      expect(status).toBe(200);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    `mmproj 모델 URL이 200을 반환한다 (${MODEL_FILES.mmproj.name})`,
    async () => {
      const status = await checkUrl(MODEL_FILES.mmproj.url);
      expect(status).toBe(200);
    },
    TIMEOUT_MS + 5000,
  );
});
