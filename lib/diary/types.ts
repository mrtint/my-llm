export interface PhotoAnalysis {
  uri: string;
  time: string;         // "오전 9:30"
  place: string | null; // reverse geocoding 결과, 없으면 null
  description: string;  // LLM 분석 결과
}

export interface DiaryEntry {
  id: number;
  date: string;          // "2026-04-09"
  content: string;       // 합성된 일기 텍스트
  analyses: PhotoAnalysis[];
  createdAt: number;     // Unix timestamp (ms)
}
