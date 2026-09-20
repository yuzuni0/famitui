import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef, PressEvent } from '@maplibre/maplibre-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';

import { errorMessage } from '../../lib/errors';
import { DEFAULT_CENTER, MAP_STYLE_URL, toLngLat } from '../../lib/map';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { observeFamilyDoc, updateHomeLocation } from '../../services/firestore/family';
import { fetchCurrentLocation } from '../../services/device/location';
import type { FamilyDoc, GeoPoint } from '../../types/firestore';

//家の位置を設定する画面
type Props = {
  familyId: string;
};

//地図の初期のズーム値
const INITIAL_ZOOM = 15;

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
          <Text style={styles.error}>{error}</Text>
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

        <View style={styles.buttons}>
          <Pressable
            onPress={handleMoveToCurrentLocation}
            disabled={currentLocation === null || submitting}
            style={({ pressed }) => [
              styles.button,
              styles.buttonHalf,
              pressed && styles.buttonPressed,
              (currentLocation === null || submitting) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>現在地へ戻る</Text>
          </Pressable>

          {submitting ? (
            <View style={[styles.button, styles.buttonHalf, styles.buttonPrimary]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={pinLocation === null}
              style={({ pressed }) => [
                styles.button,
                styles.buttonHalf,
                styles.buttonPrimary,
                pressed && styles.buttonPressed,
                pinLocation === null && styles.buttonDisabled,
              ]}
            >
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>この位置にする</Text>
            </Pressable>
          )}
        </View>
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
    backgroundColor: '#F7F9FC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
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
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  panel: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#dde3ea',
    backgroundColor: '#fff',
  },
  note: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ea',
    backgroundColor: '#fff',
  },
  buttonHalf: {
    flex: 1,
  },
  buttonPrimary: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});
