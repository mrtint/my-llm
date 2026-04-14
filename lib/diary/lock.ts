import { File, Paths } from "expo-file-system";

const LOCK_FILE_NAME = ".diary-generation-lock";
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10분

function getLockFile(): File {
  return new File(Paths.cache, LOCK_FILE_NAME);
}

export async function acquireGenerationLock(): Promise<boolean> {
  const lock = getLockFile();

  if (lock.exists) {
    // stale 락 체크 — 10분 이상이면 강제 해제
    try {
      const content = await lock.text();
      const startTime = parseInt(content, 10);
      if (!isNaN(startTime) && Date.now() - startTime > STALE_TIMEOUT_MS) {
        console.log("[Lock] stale 락 감지, 강제 해제");
        lock.delete();
      } else {
        console.log("[Lock] 이미 락이 존재함, 획득 실패");
        return false;
      }
    } catch {
      // 파일 읽기 실패 시 삭제 후 재생성
      lock.delete();
    }
  }

  lock.create();
  lock.write(String(Date.now()));
  console.log("[Lock] 락 획득 성공");
  return true;
}

export async function releaseGenerationLock(): Promise<void> {
  const lock = getLockFile();
  if (lock.exists) {
    lock.delete();
    console.log("[Lock] 락 해제");
  }
}

export async function isGenerationLocked(): Promise<boolean> {
  const lock = getLockFile();
  if (!lock.exists) return false;

  // stale 체크
  try {
    const content = await lock.text();
    const startTime = parseInt(content, 10);
    if (!isNaN(startTime) && Date.now() - startTime > STALE_TIMEOUT_MS) {
      lock.delete();
      return false;
    }
  } catch {
    lock.delete();
    return false;
  }

  return true;
}
