import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import { sortPhotosByTime, type PhotoMeta } from "../photo-meta";

const MAX_ASSETS = 100;

/**
 * 오늘 찍은 사진을 자동 수집하고 시간대별 대표 사진을 선택한다.
 * __DEV__ 모드에서는 날짜 제한 없이 가장 최근 사진 순으로 가져온다.
 */
export async function collectTodayPhotos(maxPhotos = 3): Promise<PhotoMeta[]> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (perm.status !== "granted") {
    throw new Error("사진 접근 권한이 필요합니다. 설정에서 권한을 허용해주세요.");
  }
  if (perm.accessPrivileges === "limited") {
    // "제한된 접근" — 전체 라이브러리가 아닌 선택한 사진만 접근 가능
    // 사용자에게 전체 접근 권한을 요청
    await MediaLibrary.presentPermissionsPickerAsync();
  }

  const queryOptions: MediaLibrary.AssetsOptions = __DEV__
    ? {
        // 개발: 날짜 무관, 최근 사진 순으로 maxPhotos장만 가져옴
        mediaType: "photo",
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        first: maxPhotos,
      }
    : {
        // 프로덕션: 오늘 0시 이후 사진
        mediaType: "photo",
        createdAfter: getStartOfToday(),
        sortBy: MediaLibrary.SortBy.creationTime,
        first: MAX_ASSETS,
      };

  const { assets } = await MediaLibrary.getAssetsAsync(queryOptions);

  if (__DEV__) {
    console.log(
      `[PhotoCollector] ⚠️ DEV 모드 — 날짜 무관 최근 ${maxPhotos}장 사용`,
    );
  }

  if (assets.length === 0) return [];

  // 개발 모드: 이미 최근 순으로 maxPhotos장 가져왔으므로 바로 사용
  if (__DEV__) {
    const metas = await Promise.all(assets.map((a) => extractMetaFromAsset(a)));
    metas.forEach((m, i) => {
      console.log(
        `[PhotoCollector] 사진 ${i + 1}: date=${m.date} time=${m.time ?? "-"} place=${m.place ?? "-"} uri=...${m.uri.slice(-20)}`,
      );
    });
    return sortPhotosByTime(metas);
  }

  const clusters = clusterByTimePeriod(assets);
  const selected = selectRepresentative(clusters, maxPhotos) as MediaLibrary.Asset[];

  const metas = await Promise.all(
    selected.map((asset) => extractMetaFromAsset(asset)),
  );
  metas.forEach((m, i) => {
    console.log(
      `[PhotoCollector] 사진 ${i + 1}: date=${m.date} time=${m.time ?? "-"} place=${m.place ?? "-"} uri=...${m.uri.slice(-20)}`,
    );
  });
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
    const hour = new Date(a.creationTime).getHours();
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
  // creationTime은 Android에서 ms 단위 (DATE_TAKEN)
  const created = new Date(asset.creationTime);
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
    console.log(`[PhotoCollector] assetInfo id=${asset.id} location=${JSON.stringify(info.location ?? null)} exif keys=${Object.keys(info.exif ?? {}).slice(0, 5).join(",")}`);
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
    console.log(`[PhotoCollector] reverseGeocode (${lat.toFixed(4)}, ${lon.toFixed(4)}) → ${JSON.stringify(results[0] ?? null)}`);
    if (results.length === 0) return null;
    const r = results[0];
    return (
      [r.district, r.subregion, r.region].filter(Boolean).join(" ") || null
    );
  } catch (e) {
    console.warn(`[PhotoCollector] reverseGeocode 실패:`, e);
    return null;
  }
}
