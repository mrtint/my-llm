import { File, Paths } from "expo-file-system";
import type { PhotoMeta } from "../photo-meta";
import type { PhotoAnalysis } from "./types";

const TAG = "[Checkpoint]";
const CHECKPOINT_FILE_NAME = "diary-checkpoint.json";

export interface DiaryCheckpoint {
  /** 수집된 사진 목록 */
  photos: PhotoMeta[];
  /** 완료된 분석 결과 */
  completedAnalyses: PhotoAnalysis[];
  /** 현재 단계 */
  phase: "analyzing" | "synthesizing";
  /** 생성 시작 시각 (ms) */
  startedAt: number;
}

function getCheckpointFile(): File {
  return new File(Paths.cache, CHECKPOINT_FILE_NAME);
}

export async function saveCheckpoint(checkpoint: DiaryCheckpoint): Promise<void> {
  try {
    const file = getCheckpointFile();
    const json = JSON.stringify(checkpoint);
    if (!file.exists) file.create();
    file.write(json);
    console.log(
      `${TAG} 저장: phase=${checkpoint.phase}, ` +
      `분석 ${checkpoint.completedAnalyses.length}/${checkpoint.photos.length}`,
    );
  } catch (e) {
    console.error(`${TAG} 저장 실패:`, e);
  }
}

export async function loadCheckpoint(): Promise<DiaryCheckpoint | null> {
  try {
    const file = getCheckpointFile();
    if (!file.exists) return null;

    const json = await file.text();
    const checkpoint = JSON.parse(json) as DiaryCheckpoint;
    console.log(
      `${TAG} 로드: phase=${checkpoint.phase}, ` +
      `분석 ${checkpoint.completedAnalyses.length}/${checkpoint.photos.length}`,
    );
    return checkpoint;
  } catch (e) {
    console.error(`${TAG} 로드 실패:`, e);
    return null;
  }
}

export async function clearCheckpoint(): Promise<void> {
  try {
    const file = getCheckpointFile();
    if (file.exists) file.delete();
    console.log(`${TAG} 클리어`);
  } catch (e) {
    console.error(`${TAG} 클리어 실패:`, e);
  }
}

export async function hasCheckpoint(): Promise<boolean> {
  return getCheckpointFile().exists;
}
