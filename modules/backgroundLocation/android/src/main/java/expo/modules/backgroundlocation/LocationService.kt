package expo.modules.backgroundlocation

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
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
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
    ServiceCompat.startForeground(this, Notifications.LOCATION_ID, Notifications.build(this), type)
    if (!Registrar.hasLocationPermission(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    requestUpdates()
    return START_STICKY
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
    private const val UPDATE_INTERVAL_MS = 10_000L
  }
}