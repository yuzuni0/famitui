import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import type { LngLatBounds, ViewPadding } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text, View, } from 'react-native';

import { errorMessage } from '../lib/errors';
import { formatDistance, formatDuration } from '../lib/format';
import { MAP_STYLE_URL, toLngLat } from '../lib/map';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isAssignedTo, observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { fetchCurrentLocation } from '../services/location';
import { observeMember, resolveTransportMode } from '../services/member';
import { getRoute, ROUTE_PROFILES, toRouteProfile } from '../services/routeActions';
import type { RouteProfile, RouteResult } from '../services/routeActions';
import { observeStore } from '../services/store';
import type { StoreWithId } from '../services/store';
import type { GeoPoint } from '../types/firestore';

//現在地から店舗までの経路を表示する画面
type Props = {
  familyId: string;
  uid: string;
  //行き先の店舗
  storeId: string;
};

//出発地と目的地の両方が入るように表示する
const CAMERA_PADDING: ViewPadding = { top: 120, right: 40, bottom: 260, left: 40 };

//経路の線
const ROUTE_LINE_COLOR = '#06c';
const ROUTE_LINE_WIDTH = 4;

export default function RoutePage({ familyId, uid, storeId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [store, setStore] = useState<StoreWithId | null>(null);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [profile, setProfile] = useState<RouteProfile | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileInitialized = useRef(false);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  //店舗の監視を開始する
  useEffect(() => {
    setStore(null);
    setStoreLoaded(false);

    const unsubscribe = observeStore(
      familyId,
      storeId,
      nextStore => {
        setStore(nextStore);
        setStoreLoaded(true);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, storeId]);

  //移動手段を反映する
  useEffect(() => {
    profileInitialized.current = false;

    const unsubscribe = observeMember(
      familyId,
      uid,
      nextMember => {
        if (profileInitialized.current) {
          return;
        }
        profileInitialized.current = true;
        const mode = nextMember === null ? 'none' : resolveTransportMode(nextMember);
        setProfile(toRouteProfile(mode));
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, uid]);

  //品目の監視を行う
  useEffect(() => {
    setItems(null);

    const unsubscribe = observeItems(
      familyId,
      nextItems => {
        setItems(nextItems);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //出発地として現在地を取得する
  useEffect(() => {
    fetchCurrentLocation()
      .then(location => {
        if (unmounted.current) {
          return;
        }
        if (location === null) {
          setError('現在地が取得できないため、経路を表示できません。');
          return;
        }
        setOrigin(location);
      })
      .catch(() => {
        if (unmounted.current) {
          return;
        }
        setError('現在地が取得できないため、経路を表示できません。');
      });
  }, []);

  //経路を取得する
  useEffect(() => {
    if (origin === null || store === null || profile === null) {
      return;
    }

    setError(null);
    setLoading(true);

    getRoute(familyId, origin, store.location, profile)
      .then(nextRoute => {
        if (unmounted.current) {
          return;
        }
        setRoute(nextRoute);
      })
      .catch(routeError => {
        if (unmounted.current) {
          return;
        }
        setRoute(null);
        setError(errorMessage(routeError, 'getRoute'));
      })
      .finally(() => {
        if (!unmounted.current) {
          setLoading(false);
        }
      });
  }, [familyId, origin, store, profile]);

  //店舗で買うものを取得する
  const storeItems = useMemo(
    () =>
      items === null
        ? null
        : items.filter(item => isAssignedTo(item, uid) && item.preferredStoreId === storeId),
    [items, uid, storeId],
  );

  //経路をJSONに変換する
  const routeFeature = useMemo(
    () =>
      route === null
        ? null
        : {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: route.coordinates.map(toLngLat),
            },
          },
    [route],
  );

  //出発地と目的地の両方が入る範囲を求める
  const bounds = useMemo<LngLatBounds | null>(() => {
    if (origin === null || store === null) {
      return null;
    }
    const ne = {
      latitude: Math.max(origin.latitude, store.location.latitude),
      longitude: Math.max(origin.longitude, store.location.longitude),
    };
    const sw = {
      latitude: Math.min(origin.latitude, store.location.latitude),
      longitude: Math.min(origin.longitude, store.location.longitude),
    };
    return [sw.longitude, sw.latitude, ne.longitude, ne.latitude];
  }, [origin, store]);

  //移動手段を切り替える
  function handleSelectProfile(nextProfile: RouteProfile) {
    if (loading || nextProfile === profile) {
      return;
    }
    setProfile(nextProfile);
  }

  //店舗が削除された場合の表示
  if (storeLoaded && store === null) {
    return (
      <View style={styles.message}>
        <Text style={styles.error}>店舗が見つかりませんでした。</Text>
        <Button title="戻る" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  //現在地が取得できない場合の表示
  if (origin === null) {
    return (
      <View style={styles.message}>
        {error === null ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={styles.error}>{error}</Text>
            <Button title="戻る" onPress={() => navigation.goBack()} />
          </>
        )}
      </View>
    );
  }

  //店舗と移動手段の読み込み中の表示
  if (store === null || profile === null || bounds === null) {
    return (
      <View style={styles.message}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera initialViewState={{ bounds, padding: CAMERA_PADDING }} />

        {routeFeature !== null && (
          <GeoJSONSource id="route" data={routeFeature}>
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': ROUTE_LINE_COLOR, 'line-width': ROUTE_LINE_WIDTH }}
            />
          </GeoJSONSource>
        )}

        <Marker id="origin" lngLat={toLngLat(origin)}>
          <View style={styles.currentLocation} />
        </Marker>

        <Marker id="destination" lngLat={toLngLat(store.location)} anchor="bottom">
          <View style={styles.pin} />
        </Marker>
      </Map>

      <View style={styles.choices}>
        {ROUTE_PROFILES.map(entry => (
          <Pressable
            key={entry.id}
            style={[styles.choice, profile === entry.id && styles.choiceSelected]}
            onPress={() => handleSelectProfile(entry.id)}
            disabled={loading}
          >
            <Text style={profile === entry.id ? styles.choiceLabelSelected : undefined}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.storeName}>{store.storeName}</Text>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <Text style={styles.note}>経路を取得しています…</Text>
          </View>
        ) : (
          route !== null && (
            <Text style={styles.summary}>
              {formatDistance(route.distanceMeters)}・{formatDuration(route.durationSeconds)}
            </Text>
          )
        )}

        <Text style={styles.label}>この店舗で買うもの</Text>
        {storeItems !== null && (
          <ScrollView style={styles.itemList}>
            {storeItems.length === 0 ? (
              <Text style={styles.note}>この店舗を指定した担当中の品目はありません。</Text>
            ) : (
              storeItems.map(item => (
                <Text key={item.id} style={styles.itemName}>
                  ・{item.itemName}
                </Text>
              ))
            )}
          </ScrollView>
        )}

        <Button title="戻る" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  container: {
    flex: 1,
  },
  //地図の表示
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  //出発地の表示
  currentLocation: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2a7fff',
    borderWidth: 3,
    borderColor: '#fff',
  },
  //目的地の表示
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#06c',
    borderWidth: 3,
    borderColor: '#fff',
  },
  choices: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  choiceSelected: {
    borderColor: '#06c',
    backgroundColor: '#06c',
  },
  choiceLabelSelected: {
    color: '#fff',
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '45%',
    padding: 12,
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  storeName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  summary: {
    fontSize: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    marginTop: 4,
    color: '#666',
  },
  itemList: {
    flexShrink: 1,
  },
  itemName: {
    fontSize: 16,
  },
  note: {
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});