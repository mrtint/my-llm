import type { PhotoAnalysis } from "./types";

export function buildPhotoPrompt(time: string, place: string | null): string {
  const meta = [
    `시간: ${time}`,
    place ? `장소: ${place}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${meta}\n\n이 사진에서 무엇을 하고 있는지, 어디인지, 분위기를 2~3문장으로 설명해줘. 간결하게.`;
}

export function buildSynthesisPrompt(analyses: PhotoAnalysis[]): string {
  const summaries = analyses
    .map((a, i) => {
      const loc = a.place ? ` (${a.place})` : "";
      return `${i + 1}. ${a.time}${loc}: ${a.description}`;
    })
    .join("\n");
  return (
    `오늘 하루 기록:\n${summaries}\n\n` +
    `위 내용을 바탕으로 1인칭 한국어 일기를 써줘. 자연스럽고 따뜻하게. 200~300자.`
  );
}
