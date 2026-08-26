import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef, PressEvent } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, View } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { observeFamilyDoc, updateHomeLocation } from '../services/family';
import type { FamilyDoc, GeoPoint } from '../types/firestore';

//家の位置を設定する画面
type Props = {
  familyId: string;
};

//MapTiler のスタイル URL
const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? ''}`;

//位置情報が無い時に使う座標(東京駅）
const DEFAULT_CENTER: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

//地図の初期のズーム値
const INITIAL_ZOOM = 15;

//GeoPointをMapLibre の座標に変換する
function toLngLat(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}

//expo-location で現在地を取得する
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

export default function HomeLocationPage({ familyId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const cameraRef = useRef<CameraRef>(null);

  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [familyLoaded, setFamilyLoaded] = useState(false);
  const [pinLocation, setPinLocation] = useState<GeoPoint | null>(null);
  const [initialCenter, setInitialCenter] = useState<GeoPoint | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const centerInitialized = useRef(false);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  //家族情報の監視を開始する
  useEffect(() => {
    setFamily(null);
    setFamilyLoaded(false);
    centerInitialized.current = false;

    const unsubscribe = observeFamilyDoc(
      familyId,
      nextFamily => {
        setFamily(nextFamily);
        setFamilyLoaded(true);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //地図の初期の中心を決める
  useEffect(() => {
    if (!familyLoaded || centerInitialized.current) {
      return;
    }
    centerInitialized.current = true;

    //登録済みの家の位置情報を使う(あれば)
    const homeLocation = family?.homeLocation ?? null;
    if (homeLocation !== null) {
      setInitialCenter(homeLocation);
      setPinLocation(homeLocation);
    }

    //現在地に戻るボタン
    fetchCurrentLocation()
      .then(location => {
        if (unmounted.current) {
          return;
        }
        setCurrentLocation(location);
        if (homeLocation === null) {
          //現在地がなければ既定の座標から始める
          setInitialCenter(location ?? DEFAULT_CENTER);
        }
      })
      .catch(() => {
        if (unmounted.current || homeLocation !== null) {
          return;
        }
        setInitialCenter(DEFAULT_CENTER);
        setError('現在地が取得できませんでした');
      });
  }, [familyLoaded, family]);

  //タップした位置にピンを移動する。移動前に確認する
  function handleMapPress(event: NativeSyntheticEvent<PressEvent>) {
    if (submitting) {
      return;
    }

    const [longitude, latitude] = event.nativeEvent.lngLat;
    Alert.alert('家の位置', 'この位置にピンを置きますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ピンを置く', onPress: () => setPinLocation({ latitude, longitude }) },
    ]);
  }

  //現在地に地図の中心を移動する
  function handleMoveToCurrentLocation() {
    if (currentLocation === null) {
      return;
    }
    cameraRef.current?.easeTo({ center: toLngLat(currentLocation), duration: 500 });
  }

  //ピンの位置を家の位置として保存する
  async function handleSubmit() {
    if (pinLocation === null || submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await updateHomeLocation(familyId, pinLocation);
      navigation.goBack();
    } catch (updateError) {
      setError(errorMessage(updateError));
      setSubmitting(false);
    }
  }

  //中心座標のローディング
  if (initialCenter === null) {
    return (
      <View style={styles.loading}>
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

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={MAP_STYLE_URL} onPress={handleMapPress}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: toLngLat(initialCenter), zoom: INITIAL_ZOOM }}
        />
        {pinLocation !== null && (
          <Marker id="home" lngLat={toLngLat(pinLocation)} anchor="bottom">
            <View style={styles.pin} />
          </Marker>
        )}
      </Map>

      <View style={styles.panel}>
        <Text style={styles.note}>
          {pinLocation === null
            ? '地図をタップして家の位置を指定してください。'
            : 'ピンの位置を家の位置として登録します。'}
        </Text>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        <Button
          title="現在地へ戻る"
          onPress={handleMoveToCurrentLocation}
          disabled={currentLocation === null || submitting}
        />

        {submitting ? (
          <ActivityIndicator />
        ) : (
          <Button
            title="この位置にする"
            onPress={handleSubmit}
            disabled={pinLocation === null}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#06c',
    borderWidth: 3,
    borderColor: '#fff',
  },
  panel: {
    padding: 24,
    gap: 12,
  },
  note: {
    textAlign: 'center',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});