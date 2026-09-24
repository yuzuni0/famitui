package expo.modules.backgroundlocation

import android.content.Context
import android.util.Log
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StartOptions : Record {
  @Field val notificationTitle: String = ""
  @Field val notificationBody: String = ""
  @Field val distanceMeters: Double = 30.0
}

class StoreRecord : Record {
  @Field val storeId: String = ""
  @Field val storeName: String = ""
  @Field val latitude: Double = 0.0
  @Field val longitude: Double = 0.0
  @Field val categories: List<String> = emptyList()
}

class BackgroundLocationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BackgroundLocation")

    Function("isEnabled") {
      StoreStorage(context).isEnabled()
    }

    Function("hasActivityPermission") {
      Registrar.hasActivityPermission(context)
    }

    AsyncFunction("start") { options: StartOptions, promise: Promise ->
      val storage = StoreStorage(context)
      storage.saveOptions(options.notificationTitle, options.notificationBody, options.distanceMeters.toFloat())
      storage.setEnabled(true)
      Registrar.startLocationService(context)
      Registrar.startActivityTransitions(context)
        .addOnFailureListener { error -> Log.w(TAG, "移動手段の監視を開始できません", error) }
        .addOnCompleteListener { promise.resolve(null) }
    }

    Function("getValue") { key: String ->
      StoreStorage(context).getValue(key)
    }

    Function("setValue") { key: String, value: String? ->
      StoreStorage(context).setValue(key, value)
    }

    AsyncFunction("stop") { promise: Promise ->
      val storage = StoreStorage(context)
      storage.setEnabled(false)
      storage.saveStores(emptyList())
      Registrar.stopLocationService(context)
      Registrar.stopActivityTransitions(context)
      Registrar.removeGeofences(context)
        .addOnCompleteListener { promise.resolve(null) }
    }

    AsyncFunction("replaceGeofences") { stores: List<StoreRecord>, radius: Double, promise: Promise ->
      val registered = stores.map { store ->
        RegisteredStore(store.storeId, store.storeName, store.latitude, store.longitude, store.categories, radius.toFloat())
      }
      StoreStorage(context).saveStores(registered)
      Registrar.replaceGeofences(context, registered)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { error -> promise.reject("E_GEOFENCE", error.message, error) }
    }

    Function("getRegisteredStores") {
      StoreStorage(context).loadStores().map { store ->
        mapOf(
          "storeId" to store.storeId,
          "storeName" to store.storeName,
          "latitude" to store.latitude,
          "longitude" to store.longitude,
          "categories" to store.categories,
          "radius" to store.radius.toDouble(),
        )
      }
    }

    AsyncFunction("getCurrentPosition") { promise: Promise ->
      if (!Registrar.hasLocationPermission(context)) {
        promise.reject("E_PERMISSION", "位置情報の権限がありません", null)
        return@AsyncFunction
      }
      val client = LocationServices.getFusedLocationProviderClient(context)
      client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
        .addOnSuccessListener { location ->
          if (location == null) {
            promise.reject("E_LOCATION", "現在地を取得できませんでした", null)
          } else {
            promise.resolve(mapOf("latitude" to location.latitude, "longitude" to location.longitude))
          }
        }
        .addOnFailureListener { error -> promise.reject("E_LOCATION", error.message, error) }
    }
  }

  companion object {
    private const val TAG = "BackgroundLocation"
  }
}