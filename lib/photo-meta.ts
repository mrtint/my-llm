import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import type { ImagePickerAsset } from "expo-image-picker";

export interface PhotoMeta {
  uri: string;
  /** 촬영 시간 (로컬 포맷, e.g. "오후 3:20") */
  time: string | null;
  /** 촬영 날짜 (e.g. "2026-04-11") */
  date: string | null;
  /** 촬영 시각 Unix ms (정렬용, null이면 시간 불명) */
  timestamp: number | null;
  /** 역지오코딩된 장소명 (e.g. "강남구 역삼동") */
  place: string | null;
  /** GPS 좌표 */
  location: { latitude: number; longitude: number } | null;
  /** 원본 EXIF 데이터 (사용처에서 필요한 필드 선택) */
  exif: Record<string, any> | null;
}

/**
 * expo-image-picker 결과 asset에서 메타 정보를 추출한다.
 *
 * 1. picker의 exif 필드에서 촬영 시간 추출 (DateTimeOriginal)
 * 2. assetId가 있으면 MediaLibrary.getAssetInfoAsync()로 GPS 위치 추출
 * 3. GPS가 있으면 reverse geocoding으로 장소명 변환
 */
export async function extractPhotoMeta(
  asset: ImagePickerAsset,
): Promise<PhotoMeta> {
  const meta: PhotoMeta = {
    uri: asset.uri,
    time: null,
    date: null,
    timestamp: null,
    place: null,
    location: null,
    exif: asset.exif ?? null,
  };

  // 1. EXIF에서 촬영 시간 추출
  if (asset.exif) {
    const dateStr =
      asset.exif.DateTimeOriginal ??
      asset.exif.DateTimeDigitized ??
      asset.exif.DateTime;
    if (dateStr) {
      const parsed = parseExifDateTime(dateStr);
      if (parsed) {
        meta.timestamp = parsed.getTime();
        meta.time = parsed.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        meta.date = parsed.toISOString().split("T")[0];
      }
    }
  }

  // 2. MediaLibrary에서 GPS 위치 추출
  if (asset.assetId) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
      if (info.location) {
        meta.location = {
          latitude: info.location.latitude,
          longitude: info.location.longitude,
        };

        // 3. Reverse geocoding
        meta.place = await reverseGeocode(
          info.location.latitude,
          info.location.longitude,
        );
      }

      // EXIF가 picker에서 비어있었다면 MediaLibrary에서 보충
      if (!meta.exif && info.exif) {
        meta.exif = info.exif as Record<string, any>;
      }

      // 시간이 아직 없으면 creationTime에서 추출
      if (!meta.time && info.creationTime) {
        const created = new Date(info.creationTime);
        meta.timestamp = created.getTime();
        meta.time = created.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        meta.date = created.toISOString().split("T")[0];
      }
    } catch (e) {
      console.warn("[PhotoMeta] MediaLibrary 조회 실패:", e);
    }
  }

  return meta;
}

/** EXIF DateTimeOriginal 파싱: "2026:04:11 15:30:00" → Date */
function parseExifDateTime(exifDate: string): Date | null {
  // "YYYY:MM:DD HH:MM:SS" 형식
  const match = exifDate.match(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
}

/** 촬영 시간순 정렬. timestamp가 없는 사진은 맨 뒤로. */
export function sortPhotosByTime(photos: PhotoMeta[]): PhotoMeta[] {
  return [...photos].sort((a, b) => {
    if (a.timestamp == null && b.timestamp == null) return 0;
    if (a.timestamp == null) return 1;
    if (b.timestamp == null) return -1;
    return a.timestamp - b.timestamp;
  });
}

/** Haversine 공식으로 두 GPS 좌표 간 직선 거리 (km). */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // 지구 반지름 (km)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
