import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import { sortPhotosByTime, type PhotoMeta } from "../photo-meta";

const MAX_ASSETS = 100;

/**
 * 오늘 찍은 사진을 자동 수집하고 시간대별 대표 사진을 선택한다.
 * __DEV__ 모드에서는 최근 7일로 범위를 넓혀 시뮬레이터 테스트를 지원한다.
 */
export async function collectTodayPhotos(maxPhotos = 3): Promise<PhotoMeta[]> {
  const { status } = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
  if (status !== "granted") throw new Error("사진 접근 권한이 필요합니다");

  const createdAfter = __DEV__
    ? Date.now() - 7 * 24 * 60 * 60 * 1000  // 개발: 최근 7일
    : getStartOfToday();                      // 프로덕션: 오늘 0시

  const { assets } = await MediaLibrary.getAssetsAsync({
    mediaType: "photo",
    createdAfter,
    sortBy: MediaLibrary.SortBy.creationTime,
    first: MAX_ASSETS,
  });

  if (assets.length === 0) return [];

  const clusters = clusterByTimePeriod(assets);
  const selected = selectRepresentative(clusters, maxPhotos) as MediaLibrary.Asset[];

  const metas = await Promise.all(
    selected.map((asset) => extractMetaFromAsset(asset)),
  );
  return sortPhotosByTime(metas);
}

function getStartOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 시간대별 클러스터링: 오전(~12시) / 오후(12~18시) / 저녁(18시~).
 * 순수 함수 — 테스트 가능.
 */
export function clusterByTimePeriod(
  assets: { creationTime: number }[],
): { creationTime: number }[][] {
  const morning: typeof assets = [];
  const afternoon: typeof assets = [];
  const evening: typeof assets = [];

  for (const a of assets) {
    const hour = new Date(a.creationTime * 1000).getHours();
    if (hour < 12) morning.push(a);
    else if (hour < 18) afternoon.push(a);
    else evening.push(a);
  }

  return [morning, afternoon, evening].filter((c) => c.length > 0);
}

/**
 * 각 클러스터에서 중간 사진 1장을 선택하여 최대 maxPhotos장 반환.
 * 순수 함수 — 테스트 가능.
 */
export function selectRepresentative<T>(
  clusters: T[][],
  maxPhotos: number,
): T[] {
  const result: T[] = [];
  for (const cluster of clusters) {
    if (result.length >= maxPhotos) break;
    result.push(cluster[Math.floor(cluster.length / 2)]);
  }
  return result;
}

/**
 * MediaLibrary.Asset에서 PhotoMeta를 추출한다.
 * (ImagePickerAsset 기반의 extractPhotoMeta와 별도 — 입력 타입이 다름)
 */
async function extractMetaFromAsset(
  asset: MediaLibrary.Asset,
): Promise<PhotoMeta> {
  const created = new Date(asset.creationTime * 1000);
  const meta: PhotoMeta = {
    uri: asset.uri,
    timestamp: created.getTime(),
    time: created.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    date: created.toISOString().split("T")[0],
    place: null,
    location: null,
    exif: null,
  };

  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset.id);
    if (info.localUri) {
      meta.uri = info.localUri;
    }
    if (info.location) {
      meta.location = {
        latitude: info.location.latitude,
        longitude: info.location.longitude,
      };
      meta.place = await reverseGeocode(
        info.location.latitude,
        info.location.longitude,
      );
    }
    if (info.exif) {
      meta.exif = info.exif as Record<string, any>;
    }
  } catch (e) {
    console.warn("[PhotoCollector] asset info 조회 실패:", e);
  }

  return meta;
}

async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lon,
    });
    if (results.length === 0) return null;
    const r = results[0];
    return (
      [r.district, r.subregion, r.region].filter(Boolean).join(" ") || null
    );
  } catch {
    return null;
  }
}
