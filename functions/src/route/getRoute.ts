import { onCall, HttpsError } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { GeoPoint } from "../lib/geo";
import {
  requireAuth, requireGeoPoint, requireMembership, requireString,
} from "../lib/request";

const openRouteServiceApiKey = defineSecret("OPENROUTESERVICE_API_KEY");

// 移動手段の候補
const PROFILES = [
  "foot-walking",
  "cycling-regular",
  "driving-car",
] as const;

type Profile = (typeof PROFILES)[number];

type Route = {
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
};

const ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions";

function isProfile(value: unknown): value is Profile {
  return PROFILES.includes(value as Profile);
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
    const uid = requireAuth(request);
    const familyId = requireString(request.data?.familyId, "familyId");
    const origin = requireGeoPoint(request.data?.origin, "origin");
    const destination = requireGeoPoint(
      request.data?.destination,
      "destination"
    );

    const profile = request.data?.profile;
    if (!isProfile(profile)) {
      throw new HttpsError(
        "invalid-argument",
        `profile は ${PROFILES.join(", ")} のいずれかで指定してください。`
      );
    }

    await requireMembership(getFirestore(), familyId, uid);

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
