package expo.modules.backgroundlocation

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks

object Registrar {
  private const val TAG = "BackgroundLocation"
  private val ACTIVITY_TYPES = listOf(
    DetectedActivity.IN_VEHICLE,
    DetectedActivity.ON_BICYCLE,
    DetectedActivity.WALKING,
    DetectedActivity.RUNNING,
    DetectedActivity.ON_FOOT,
    DetectedActivity.STILL,
  )

  fun hasLocationPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
  }

  fun hasActivityPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
  }

  private fun geofencePendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, GeofenceReceiver::class.java)
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
  }

  private fun activityPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ActivityTransitionReceiver::class.java)
    return PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
  }

  fun replaceGeofences(context: Context, stores: List<RegisteredStore>): Task<Void> {
    if (!hasLocationPermission(context)) {
      return Tasks.forException(SecurityException("位置情報の権限がありません"))
    }
    val client = LocationServices.getGeofencingClient(context)
    val pendingIntent = geofencePendingIntent(context)
    return client.removeGeofences(pendingIntent).continueWithTask { _ ->
      if (stores.isEmpty()) return@continueWithTask Tasks.forResult(null)
      val geofences = stores.map { store ->
        Geofence.Builder()
          .setRequestId(store.storeId)
          .setCircularRegion(store.latitude, store.longitude, store.radius)
          .setExpirationDuration(Geofence.NEVER_EXPIRE)
          .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
          .build()
      }
      val request = GeofencingRequest.Builder()
        .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
        .addGeofences(geofences)
        .build()
      client.addGeofences(request, pendingIntent)
    }
  }

  fun removeGeofences(context: Context): Task<Void> {
    return LocationServices.getGeofencingClient(context).removeGeofences(geofencePendingIntent(context))
  }

  fun startActivityTransitions(context: Context): Task<Void> {
    if (!hasActivityPermission(context)) {
      return Tasks.forException(SecurityException("身体活動の権限がありません"))
    }
    val transitions = ACTIVITY_TYPES.map { type ->
      ActivityTransition.Builder()
        .setActivityType(type)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build()
    }
    val request = ActivityTransitionRequest(transitions)
    return ActivityRecognition.getClient(context).requestActivityTransitionUpdates(request, activityPendingIntent(context))
  }

  fun stopActivityTransitions(context: Context): Task<Void> {
    return ActivityRecognition.getClient(context).removeActivityTransitionUpdates(activityPendingIntent(context))
  }

  fun startLocationService(context: Context) {
    try {
      ContextCompat.startForegroundService(context, Intent(context, LocationService::class.java))
    } catch (error: IllegalStateException) {
      Log.w(TAG, "位置更新サービスを起動できません", error)
    }
  }

  fun stopLocationService(context: Context) {
    context.stopService(Intent(context, LocationService::class.java))
  }
}