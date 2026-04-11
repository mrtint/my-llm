import * as SQLite from "expo-sqlite";
import type { DiaryEntry, PhotoAnalysis } from "./types";

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("diary.db");
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS diary_entries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT    NOT NULL UNIQUE,
        content    TEXT    NOT NULL,
        analyses   TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export async function saveDiaryEntry(
  date: string,
  content: string,
  analyses: PhotoAnalysis[]
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO diary_entries (date, content, analyses, created_at)
     VALUES (?, ?, ?, ?)`,
    date,
    content,
    JSON.stringify(analyses),
    Date.now()
  );
}

export async function getDiaryEntries(): Promise<DiaryEntry[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<{
    id: number;
    date: string;
    content: string;
    analyses: string;
    created_at: number;
  }>(`SELECT * FROM diary_entries ORDER BY date DESC`);
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    content: r.content,
    analyses: JSON.parse(r.analyses) as PhotoAnalysis[],
    createdAt: r.created_at,
  }));
}

export async function getDiaryEntry(date: string): Promise<DiaryEntry | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{
    id: number;
    date: string;
    content: string;
    analyses: string;
    created_at: number;
  }>(`SELECT * FROM diary_entries WHERE date = ?`, date);
  if (!row) return null;
  return {
    id: row.id,
    date: row.date,
    content: row.content,
    analyses: JSON.parse(row.analyses) as PhotoAnalysis[],
    createdAt: row.created_at,
  };
}
