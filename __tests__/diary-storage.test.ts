/**
 * expo-sqlite를 mock하여 storage.ts의 CRUD 변환 로직을 검증한다.
 *
 * 주의: storage.ts는 module-level db 싱글톤을 가지므로
 * openDatabaseAsync는 전체 테스트 스위트에서 한 번만 호출된다.
 * 각 테스트에서 mockDB 메서드의 반환값을 재설정하는 방식으로 동작을 제어한다.
 */

// jest.mock은 호이스팅되므로 팩토리 내부에서 jest.fn()을 직접 생성하고
// __mockDB로 외부에 노출해 테스트에서 참조한다.
jest.mock("expo-sqlite", () => {
  const db = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  };
  return {
    openDatabaseAsync: jest.fn().mockResolvedValue(db),
    __mockDB: db,
  };
});

import { saveDiaryEntry, getDiaryEntries, getDiaryEntry } from "../lib/diary/storage";
import type { PhotoAnalysis } from "../lib/diary/types";

// 호이스팅 완료 후 참조 취득
const { __mockDB: db } = require("expo-sqlite");

const sampleAnalyses: PhotoAnalysis[] = [
  { uri: "file://photo.jpg", time: "오후 2:00", place: "강남", description: "공원 산책" },
];

beforeEach(() => {
  jest.clearAllMocks();
  db.runAsync.mockResolvedValue(undefined);
  db.getAllAsync.mockResolvedValue([]);
  db.getFirstAsync.mockResolvedValue(null);
});

describe("saveDiaryEntry", () => {
  it("날짜·내용·analyses를 INSERT OR REPLACE로 저장한다", async () => {
    await saveDiaryEntry("2026-04-10", "오늘 하루 즐거웠다", sampleAnalyses);

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("INSERT OR REPLACE"),
      "2026-04-10",
      "오늘 하루 즐거웠다",
      JSON.stringify(sampleAnalyses),
      expect.any(Number),
    );
  });
});

describe("getDiaryEntries", () => {
  it("rows를 DiaryEntry 배열로 변환한다", async () => {
    db.getAllAsync.mockResolvedValueOnce([
      {
        id: 1,
        date: "2026-04-10",
        content: "즐거운 하루",
        analyses: JSON.stringify(sampleAnalyses),
        created_at: 1712700000000,
      },
    ]);

    const entries = await getDiaryEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-04-10");
    expect(entries[0].content).toBe("즐거운 하루");
    expect(entries[0].analyses).toEqual(sampleAnalyses);
    expect(entries[0].createdAt).toBe(1712700000000);
  });

  it("빈 테이블이면 빈 배열을 반환한다", async () => {
    db.getAllAsync.mockResolvedValueOnce([]);
    const entries = await getDiaryEntries();
    expect(entries).toEqual([]);
  });
});

describe("getDiaryEntry", () => {
  it("해당 날짜 row를 DiaryEntry로 변환한다", async () => {
    db.getFirstAsync.mockResolvedValueOnce({
      id: 2,
      date: "2026-04-09",
      content: "어제 일기",
      analyses: JSON.stringify(sampleAnalyses),
      created_at: 1712613600000,
    });

    const entry = await getDiaryEntry("2026-04-09");

    expect(entry).not.toBeNull();
    expect(entry!.id).toBe(2);
    expect(entry!.content).toBe("어제 일기");
    expect(entry!.analyses).toEqual(sampleAnalyses);
  });

  it("row가 없으면 null을 반환한다", async () => {
    db.getFirstAsync.mockResolvedValueOnce(null);
    const entry = await getDiaryEntry("2000-01-01");
    expect(entry).toBeNull();
  });
});
