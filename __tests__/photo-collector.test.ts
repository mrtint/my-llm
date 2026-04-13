import {
  clusterByTimePeriod,
  selectRepresentative,
} from "../lib/diary/photo-collector";

/** creationTime은 MediaLibrary 형식: Unix seconds (ms/1000) */
function makeAsset(hour: number, minute = 0) {
  const d = new Date(2026, 3, 13, hour, minute);
  return { creationTime: d.getTime() / 1000 };
}

describe("clusterByTimePeriod", () => {
  it("오전/오후/저녁 3개 클러스터로 나눈다", () => {
    const assets = [
      makeAsset(8),   // 오전
      makeAsset(10),  // 오전
      makeAsset(14),  // 오후
      makeAsset(20),  // 저녁
    ];
    const clusters = clusterByTimePeriod(assets);
    expect(clusters).toHaveLength(3);
    expect(clusters[0]).toHaveLength(2); // 오전 2장
    expect(clusters[1]).toHaveLength(1); // 오후 1장
    expect(clusters[2]).toHaveLength(1); // 저녁 1장
  });

  it("한 시간대에만 사진이 있으면 1개 클러스터", () => {
    const assets = [makeAsset(9), makeAsset(10), makeAsset(11)];
    const clusters = clusterByTimePeriod(assets);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });

  it("빈 배열이면 빈 배열 반환", () => {
    expect(clusterByTimePeriod([])).toEqual([]);
  });

  it("경계값: 12시는 오후, 18시는 저녁", () => {
    const assets = [makeAsset(11, 59), makeAsset(12, 0), makeAsset(17, 59), makeAsset(18, 0)];
    const clusters = clusterByTimePeriod(assets);
    expect(clusters).toHaveLength(3);
    expect(clusters[0]).toHaveLength(1); // 오전 (11:59)
    expect(clusters[1]).toHaveLength(2); // 오후 (12:00, 17:59)
    expect(clusters[2]).toHaveLength(1); // 저녁 (18:00)
  });
});

describe("selectRepresentative", () => {
  it("각 클러스터에서 중간 요소를 선택한다", () => {
    const clusters = [
      ["a", "b", "c"],     // 중간: "b"
      ["d", "e"],           // 중간: "d"
      ["f", "g", "h", "i"], // 중간: "g"
    ];
    const result = selectRepresentative(clusters, 3);
    expect(result).toEqual(["b", "e", "h"]);
  });

  it("maxPhotos 제한을 지킨다", () => {
    const clusters = [["a"], ["b"], ["c"]];
    const result = selectRepresentative(clusters, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual(["a", "b"]);
  });

  it("클러스터 1개, 사진 1장이면 그대로 반환", () => {
    const result = selectRepresentative([["x"]], 3);
    expect(result).toEqual(["x"]);
  });

  it("빈 클러스터 배열이면 빈 배열", () => {
    expect(selectRepresentative([], 3)).toEqual([]);
  });
});
