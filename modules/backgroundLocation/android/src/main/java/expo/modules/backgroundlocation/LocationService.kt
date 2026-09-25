package expo.modules.backgroundlocation

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.os.bundleOf
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class LocationService : Service() {
  private lateinit var client: FusedLocationProviderClient
  private var listening = false

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val location = result.lastLocation ?: return
      Events.dispatch(
        this@LocationService,
        bundleOf("type" to "location", "latitude" to location.latitude, "longitude" to location.longitude),
      )
    }
  }

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val permitted = Registrar.hasLocationPermission(this)
    val type = when {
      !permitted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      else -> 0
    }
    try {
      ServiceCompat.startForeground(this, Notifications.LOCATION_ID, Notifications.build(this), type)
    } catch (error: Exception) {
      Log.w(TAG, "前面化できません", error)
      stopSelf()
      return START_NOT_STICKY
    }
    if (!permitted) {
      Log.w(TAG, "位置情報の権限がないため停止します")
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    requestUpdates()
    return START_STICKY
  }

  override fun onTimeout(startId: Int) {
    stopSelf()
  }

  private fun requestUpdates() {
    if (listening) return
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
      .setMinUpdateDistanceMeters(StoreStorage(this).distanceMeters())
      .build()
    try {
      client.requestLocationUpdates(request, callback, Looper.getMainLooper())
      listening = true
    } catch (error: SecurityException) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    if (listening) {
      client.removeLocationUpdates(callback)
      listening = false
    }
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val TAG = "BackgroundLocation"
    private const val UPDATE_INTERVAL_MS = 10_000L
  }
}