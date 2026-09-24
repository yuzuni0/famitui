package expo.modules.backgroundlocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.os.bundleOf
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

class ActivityTransitionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    for (event in result.transitionEvents) {
      if (event.transitionType != ActivityTransition.ACTIVITY_TRANSITION_ENTER) continue
      val mode = toTransportMode(event.activityType) ?: continue
      Events.dispatch(context, bundleOf("type" to "activity", "mode" to mode))
    }
  }

  private fun toTransportMode(activityType: Int): String? {
    return when (activityType) {
      DetectedActivity.WALKING, DetectedActivity.ON_FOOT, DetectedActivity.RUNNING -> "walk"
      DetectedActivity.ON_BICYCLE -> "bike"
      DetectedActivity.IN_VEHICLE -> "vehicle"
      DetectedActivity.STILL -> "none"
      else -> null
    }
  }
}