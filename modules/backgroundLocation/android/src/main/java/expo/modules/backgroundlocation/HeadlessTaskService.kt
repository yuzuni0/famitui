package expo.modules.backgroundlocation

import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class HeadlessTaskService : HeadlessJsTaskService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.extras == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (intent.getBooleanExtra(Events.EXTRA_FOREGROUND, false)) {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE else 0
      try {
        ServiceCompat.startForeground(this, Notifications.TASK_ID, Notifications.build(this), type)
      } catch (error: Exception) {
        Log.w(TAG, "前面化できません", error)
        stopSelf()
        return START_NOT_STICKY
      }
    }
    return super.onStartCommand(intent, flags, startId)
  }

  override fun onTimeout(startId: Int) {
    stopSelf()
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(Events.TASK_NAME, Arguments.fromBundle(extras), TIMEOUT_MS, true)
  }

  companion object {
    private const val TAG = "BackgroundLocation"
    private const val TIMEOUT_MS = 60_000L
  }
}