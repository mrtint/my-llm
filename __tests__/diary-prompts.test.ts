import { buildPhotoPrompt, buildSynthesisPrompt } from "../lib/diary/prompts";
import type { PhotoAnalysis } from "../lib/diary/types";

describe("buildPhotoPrompt", () => {
  it("장소가 있을 때 시간과 장소를 모두 포함한다", () => {
    const result = buildPhotoPrompt("오후 3:00", "강남구");
    expect(result).toContain("시간: 오후 3:00");
    expect(result).toContain("장소: 강남구");
  });

  it("장소가 null일 때 장소 항목을 생략한다", () => {
    const result = buildPhotoPrompt("오전 10:00", null);
    expect(result).toContain("시간: 오전 10:00");
    expect(result).not.toContain("장소");
  });

  it("분석 지시 문장을 포함한다", () => {
    const result = buildPhotoPrompt("오후 1:00", null);
    expect(result).toContain("이 사진에서");
  });
});

describe("buildSynthesisPrompt", () => {
  const analyses: PhotoAnalysis[] = [
    { uri: "file://a.jpg", time: "오전 9:00", place: "홍대", description: "카페에서 커피를 마셨다" },
    { uri: "file://b.jpg", time: "오후 2:00", place: null, description: "공원을 산책했다" },
  ];

  it("각 사진 분석 내용을 순서대로 포함한다", () => {
    const result = buildSynthesisPrompt(analyses);
    expect(result).toContain("오전 9:00 (홍대): 카페에서 커피를 마셨다");
    expect(result).toContain("오후 2:00: 공원을 산책했다");
  });

  it("장소가 없는 항목은 장소 괄호 없이 출력한다", () => {
    const result = buildSynthesisPrompt(analyses);
    expect(result).not.toMatch(/오후 2:00 \(/);
  });

  it("일기 작성 지시를 포함한다", () => {
    const result = buildSynthesisPrompt(analyses);
    expect(result).toContain("1인칭 한국어 일기");
  });

  it("빈 배열이면 빈 summaries로 처리된다", () => {
    const result = buildSynthesisPrompt([]);
    expect(result).toContain("오늘 하루 기록:");
  });

  it("locations 없으면 하나의 그룹으로 처리한다", () => {
    const result = buildSynthesisPrompt(analyses);
    // 장소 그룹 헤더가 없어야 함
    expect(result).not.toContain("[홍대]");
  });

  it("1km 이상 떨어진 사진은 장소 그룹으로 분리한다", () => {
    const locations = [
      { latitude: 37.5563, longitude: 126.9236 }, // 홍대
      { latitude: 37.4979, longitude: 127.0276 }, // 강남
    ];
    const result = buildSynthesisPrompt(analyses, locations);
    expect(result).toContain("[홍대]");
    expect(result).toContain("문단을 나눠줘");
  });

  it("1km 미만이면 그룹을 나누지 않는다", () => {
    const locations = [
      { latitude: 37.5563, longitude: 126.9236 },
      { latitude: 37.5570, longitude: 126.9240 }, // 100m 미만
    ];
    const result = buildSynthesisPrompt(analyses, locations);
    expect(result).not.toContain("[홍대]");
    expect(result).not.toContain("문단을 나눠줘");
  });
});
