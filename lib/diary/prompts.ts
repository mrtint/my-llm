import type { PhotoAnalysis } from "./types";
import { haversineDistance } from "../photo-meta";

export function buildPhotoPrompt(time: string, place: string | null): string {
  const meta = [
    `시간: ${time}`,
    place ? `장소: ${place}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${meta}\n\n이 사진에서 무엇을 하고 있는지, 어디인지, 분위기를 2~3문장으로 설명해줘. 간결하게.`;
}

const DISTANCE_THRESHOLD_KM = 1;

/**
 * 사진 분석 결과를 장소 그룹으로 나눈 뒤 합성 프롬프트를 생성한다.
 * GPS 직선거리 1km 이상이면 다른 장소 그룹으로 분리.
 * 그룹이 여러 개이면 LLM에게 문단을 나눠 쓰도록 지시.
 */
export function buildSynthesisPrompt(
  analyses: PhotoAnalysis[],
  locations?: ({ latitude: number; longitude: number } | null)[],
): string {
  const groups = groupAnalysesByLocation(analyses, locations);
  const hasMultipleGroups = groups.length > 1;

  const sections = groups
    .map((group, gi) => {
      const lines = group
        .map((a) => {
          const loc = a.place ? ` (${a.place})` : "";
          return `- ${a.time}${loc}: ${a.description}`;
        })
        .join("\n");

      if (hasMultipleGroups) {
        const label = group[0].place ?? `장소 ${gi + 1}`;
        return `[${label}]\n${lines}`;
      }
      return lines;
    })
    .join("\n\n");

  let instruction =
    `오늘 하루 기록:\n${sections}\n\n` +
    `위 내용을 바탕으로 1인칭 한국어 일기를 써줘. 자연스럽고 따뜻하게. 200~300자.`;

  if (hasMultipleGroups) {
    instruction +=
      `\n장소가 바뀌는 부분에서 문단을 나눠줘. 장소 이동의 흐름이 느껴지도록.`;
  }

  return instruction;
}

/**
 * GPS 좌표 기반으로 analyses를 연속된 장소 그룹으로 분리.
 * 인접 사진 간 직선거리가 1km 이상이면 새 그룹 시작.
 * 좌표 정보가 없으면 전체를 하나의 그룹으로.
 */
function groupAnalysesByLocation(
  analyses: PhotoAnalysis[],
  locations?: ({ latitude: number; longitude: number } | null)[],
): PhotoAnalysis[][] {
  if (!locations || locations.length !== analyses.length) {
    return [analyses];
  }

  const groups: PhotoAnalysis[][] = [];
  let currentGroup: PhotoAnalysis[] = [];

  for (let i = 0; i < analyses.length; i++) {
    if (i === 0) {
      currentGroup.push(analyses[i]);
      continue;
    }

    const prev = locations[i - 1];
    const curr = locations[i];

    if (prev && curr) {
      const dist = haversineDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude,
      );
      if (dist >= DISTANCE_THRESHOLD_KM) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }

    currentGroup.push(analyses[i]);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
