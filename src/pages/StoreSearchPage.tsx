import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef, MapRef } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, TextInput, View, } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { searchPlaces } from '../services/mapSearch';
import type { SearchResult } from '../services/mapSearch';
import { classifyStore } from '../services/storeActions';
import type { CategoryId, GeoPoint } from '../types/firestore';

//キーワードで店舗を検索し、地図で確認して選ぶ画面
type Props = {
  familyId: string;
};

//自宅位置の指定とほぼ同じ
const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? ''}`;

//初期座標
const DEFAULT_CENTER: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

//地図のズーム
const INITIAL_ZOOM = 14;
const SELECTED_ZOOM = 16;

//登録店舗に必要な情報を持つ
export type PendingStore = SearchResult & { categories: CategoryId[] };

let pendingStore: PendingStore | null = null;

//選んだ店舗を取り出す
export function takePendingStore(): PendingStore | null {
  const store = pendingStore;
  pendingStore = null;
  return store;
}

//座標に変換する
function toLngLat(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}

//現在地の取得
async function fetchCurrentLocation(): Promise<GeoPoint | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const position = await Location.getCurrentPositionAsync();
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

//距離の表示
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function StoreSearchPage({ familyId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const unmounted = useRef(false);
  const viewBeforeSelect = useRef<{ center: [number, number]; zoom: number } | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [listVisible, setListVisible] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  //現在地を取得して地図を動かす
  useEffect(() => {
    fetchCurrentLocation()
      .then(location => {
        if (unmounted.current || location === null) {
          return;
        }
        setCurrentLocation(location);
        cameraRef.current?.easeTo({ center: toLngLat(location), zoom: INITIAL_ZOOM });
      })
      .catch(() => {
      });
  }, []);

  //検索画面の中心地点
  async function resolveSearchCenter(): Promise<GeoPoint> {
    if (currentLocation !== null) {
      return currentLocation;
    }
    const center = await mapRef.current?.getCenter();
    if (center === undefined) {
      return DEFAULT_CENTER;
    }
    const [longitude, latitude] = center;
    return { latitude, longitude };
  }

  //キーワードで検索する
  async function handleSearch() {
    const trimmed = query.trim();
    if (trimmed === '' || searching || submitting) {
      return;
    }

    setError(null);
    setSearching(true);
    try {
      const center = await resolveSearchCenter();
      const nextResults = await searchPlaces(trimmed, center);
      if (unmounted.current) {
        return;
      }
      setResults(nextResults);
      setSelected(null);
      setListVisible(true);
      viewBeforeSelect.current = null;
    } catch (searchError) {
      if (unmounted.current) {
        return;
      }
      setError(errorMessage(searchError));
    } finally {
      if (!unmounted.current) {
        setSearching(false);
      }
    }
  }

  //候補店へ地図を動かす
  async function handleSelect(result: SearchResult) {
    if (submitting) {
      return;
    }

    //選択前の地図の位置を保存する
    if (viewBeforeSelect.current === null) {
      const view = await mapRef.current?.getViewState();
      if (unmounted.current) {
        return;
      }
      if (view !== undefined) {
        viewBeforeSelect.current = { center: view.center, zoom: view.zoom };
      }
    }

    setSelected(result);
    setListVisible(false);
    cameraRef.current?.easeTo({ center: toLngLat(result.location), zoom: SELECTED_ZOOM });
  }

  //詳細のパネルを閉じて、候補の一覧と元の地図の位置に戻る
  function handleCloseDetail() {
    if (submitting) {
      return;
    }
    setSelected(null);
    if (results !== null) {
      setListVisible(true);
    }

    const view = viewBeforeSelect.current;
    viewBeforeSelect.current = null;
    if (view !== null) {
      cameraRef.current?.easeTo({ center: view.center, zoom: view.zoom });
    }
  }

  //現在地に地図の中心を移動する
  function handleMoveToCurrentLocation() {
    if (currentLocation === null) {
      return;
    }
    cameraRef.current?.easeTo({ center: toLngLat(currentLocation), zoom: INITIAL_ZOOM });
  }

  //選んだ店舗を登録して前の画面に戻る
  async function handleSubmit() {
    if (selected === null || submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { categories } = await classifyStore(familyId, {
        sourceId: selected.sourceId,
        storeName: selected.name,
        location: selected.location,
        address: selected.address,
        osmCategories: selected.osmCategories,
      });
      pendingStore = { ...selected, categories };
      navigation.goBack();
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Map ref={mapRef} style={styles.map} mapStyle={MAP_STYLE_URL}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: toLngLat(DEFAULT_CENTER), zoom: INITIAL_ZOOM }}
        />

        {currentLocation !== null && (
          <Marker id="current" lngLat={toLngLat(currentLocation)}>
            <View style={styles.currentLocation} />
          </Marker>
        )}

        {(results ?? []).map(result => {
          const isSelected = selected?.sourceId === result.sourceId;
          return (
            <Marker
              key={result.sourceId}
              id={result.sourceId}
              lngLat={toLngLat(result.location)}
              anchor="bottom"
            >
              <Pressable onPress={() => handleSelect(result)} disabled={submitting}>
                <View style={[styles.pin, isSelected && styles.pinSelected]} />
              </Pressable>
            </Marker>
          );
        })}
      </Map>

      <View style={styles.searchOverlay}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="店舗名で検索する"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            editable={!searching && !submitting}
          />
          <Button
            title="検索"
            onPress={handleSearch}
            disabled={query.trim() === '' || searching || submitting}
          />
        </View>
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.locationButton}>
        <Button
          title="現在地へ戻る"
          onPress={handleMoveToCurrentLocation}
          disabled={currentLocation === null || submitting}
        />
      </View>

      {searching && (
        <View style={styles.bottomOverlay}>
          <ActivityIndicator size="large" />
        </View>
      )}

      {!searching && listVisible && results !== null && (
        <View style={styles.bottomOverlay}>
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>候補</Text>
            <Button title="閉じる" onPress={() => setListVisible(false)} />
          </View>
          <FlatList
            data={results}
            keyExtractor={result => result.sourceId}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>候補が見つかりませんでした。</Text>
            }
            renderItem={({ item: result }) => (
              <Pressable
                style={styles.result}
                onPress={() => handleSelect(result)}
                disabled={submitting}
              >
                <Text style={styles.resultName}>{result.name}</Text>
                <Text style={styles.resultMeta}>
                  {formatDistance(result.distanceMeters)}・{result.address ?? '住所なし'}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {!searching && !listVisible && selected !== null && (
        <View style={styles.bottomOverlay}>
          <View style={styles.overlayHeader}>
            <Text style={styles.overlayTitle}>{selected.name}</Text>
            <Button title="閉じる" onPress={handleCloseDetail} disabled={submitting} />
          </View>
          <Text style={styles.detailText}>{selected.address ?? '住所なし'}</Text>
          <Text style={styles.detailText}>
            {currentLocation !== null ? '現在地から' : '検索の中心から'}{' '}
            {formatDistance(selected.distanceMeters)}
          </Text>
          <Text style={styles.detailText}>登録の際に取り扱いを自動で判定します</Text>
          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator />
              <Text style={styles.detailText}>取り扱いを判定しています…</Text>
            </View>
          ) : (
            <Button title="この店舗にする" onPress={handleSubmit} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  //検索窓などを地図に重ねる
  map: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  //現在地は青い円
  currentLocation: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2a7fff',
    borderWidth: 3,
    borderColor: '#fff',
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#c33',
    borderWidth: 3,
    borderColor: '#fff',
  },
  pinSelected: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#06c',
  },
  searchOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    backgroundColor: '#fff',
  },
  locationButton: {
    position: 'absolute',
    top: 88,
    right: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '50%',
    padding: 12,
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overlayTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
  },
  result: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  resultName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultMeta: {
    color: '#666',
  },
  detailText: {
    color: '#666',
  },
  //判定中の表示
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 8,
  },
  empty: {
    textAlign: 'center',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
});