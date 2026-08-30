import { onCall, HttpsError } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";

const openRouteServiceApiKey = defineSecret("OPENROUTESERVICE_API_KEY");

// 移動手段の候補
const PROFILES = [
  "foot-walking",
  "cycling-regular",
  "driving-car",
] as const;

type Profile = (typeof PROFILES)[number];

type GeoPoint = {
  latitude: number;
  longitude: number;
};

type Route = {
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
};

const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions";

function isProfile(value: unknown): value is Profile {
  return PROFILES.includes(value as Profile);
}

// 緯度と経度の型を確認する
function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { latitude, longitude } = value as {
    latitude?: unknown; longitude?: unknown;
  };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

// 緯度・経度の配列に変換する
function toLngLat(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}

// サービスの応答を変換する
function parseRoute(body: unknown): Route | null {
  const features = (body as { features?: unknown })?.features;
  if (!Array.isArray(features) || features.length === 0) {
    return null;
  }

  const feature = features[0] as {
    geometry?: { coordinates?: unknown };
    properties?: { summary?: { distance?: unknown; duration?: unknown } };
  };

  const rawCoordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(rawCoordinates)) {
    return null;
  }

  const coordinates: GeoPoint[] = [];
  for (const raw of rawCoordinates) {
    if (!Array.isArray(raw)) {
      return null;
    }
    const [longitude, latitude] = raw as unknown[];
    if (typeof longitude !== "number" || typeof latitude !== "number") {
      return null;
    }
    // 緯度・経度の範囲を確認する
    coordinates.push({ latitude, longitude });
  }

  const summary = feature?.properties?.summary;
  const distance = summary?.distance;
  const duration = summary?.duration;
  if (typeof distance !== "number" || typeof duration !== "number") {
    return null;
  }

  return {
    coordinates,
    distanceMeters: distance,
    durationSeconds: duration,
  };
}

// 出発地から目的地までの経路を取得する
export const getRoute = onCall(
  { secrets: [openRouteServiceApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const uid = request.auth.uid;

    const familyId = request.data?.familyId;
    if (typeof familyId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "familyId は文字列で指定してください。"
      );
    }

    const origin = request.data?.origin;
    if (!isGeoPoint(origin)) {
      throw new HttpsError(
        "invalid-argument",
        "origin は有効な座標で指定してください。"
      );
    }

    const destination = request.data?.destination;
    if (!isGeoPoint(destination)) {
      throw new HttpsError(
        "invalid-argument",
        "destination は有効な座標で指定してください。"
      );
    }

    const profile = request.data?.profile;
    if (!isProfile(profile)) {
      throw new HttpsError(
        "invalid-argument",
        `profile は ${PROFILES.join(", ")} のいずれかで指定してください。`
      );
    }

    // 家族グループの所属を確認する
    const db = getFirestore();
    const memberSnapshot = await db
      .collection("families")
      .doc(familyId)
      .collection("members")
      .doc(uid)
      .get();
    if (!memberSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "この家族グループに所属していません。"
      );
    }

    const response = await fetch(`${ORS_BASE_URL}/${profile}/geojson`, {
      method: "POST",
      headers: {
        "Authorization": openRouteServiceApiKey.value(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 出発地と目的地
        coordinates: [toLngLat(origin), toLngLat(destination)],
      }),
    });

    if (!response.ok) {
      logger.error("経路を取得できませんでした", {
        profile,
        status: response.status,
        body: await response.text(),
      });
      throw new HttpsError("not-found", "経路が見つかりませんでした。");
    }

    const body: unknown = await response.json();
    const route = parseRoute(body);
    if (route === null) {
      logger.error("経路の応答の形式が想定と異なります", { profile, body });
      throw new HttpsError("internal", "経路の取得に失敗しました。");
    }

    return route;
  }
);
