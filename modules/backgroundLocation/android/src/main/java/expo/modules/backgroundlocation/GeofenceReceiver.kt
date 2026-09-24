package expo.modules.backgroundlocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.os.bundleOf
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent

class GeofenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) {
      Log.w(TAG, "ジオフェンスのエラー ${event.errorCode}")
      return
    }
    val action = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
      else -> return
    }
    val storage = StoreStorage(context)
    val location = event.triggeringLocation
    for (geofence in event.triggeringGeofences.orEmpty()) {
      val store = storage.findStore(geofence.requestId) ?: continue
      Events.dispatch(
        context,
        bundleOf(
          "type" to "geofence",
          "action" to action,
          "storeId" to store.storeId,
          "storeName" to store.storeName,
          "categories" to ArrayList(store.categories),
          "latitude" to (location?.latitude ?: store.latitude),
          "longitude" to (location?.longitude ?: store.longitude),
        ),
      )
    }
  }

  companion object {
    private const val TAG = "BackgroundLocation"
  }
}