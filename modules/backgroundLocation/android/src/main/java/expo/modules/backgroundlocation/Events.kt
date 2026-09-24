package expo.modules.backgroundlocation

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.core.content.ContextCompat

object Events {
  const val TASK_NAME = "BackgroundLocationEvent"
  const val EXTRA_FOREGROUND = "startedInForeground"
  private const val TAG = "BackgroundLocation"

  fun dispatch(context: Context, extras: Bundle) {
    val intent = Intent(context, HeadlessTaskService::class.java).putExtras(extras)
    try {
      context.startService(intent)
    } catch (error: IllegalStateException) {
      intent.putExtra(EXTRA_FOREGROUND, true)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (foregroundError: IllegalStateException) {
        Log.w(TAG, "イベントを配送できません", foregroundError)
      }
    }
  }
}