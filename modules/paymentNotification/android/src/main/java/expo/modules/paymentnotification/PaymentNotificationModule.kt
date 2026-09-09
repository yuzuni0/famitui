package expo.modules.paymentnotification

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaymentNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PaymentNotification")

    Function("isPermissionGranted") {
      val listeners = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
      listeners?.contains(context.packageName) ?: false
    }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("getLastPayment") {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (!prefs.contains("lastPaymentTime")) return@Function null
      mapOf(
        "time" to prefs.getLong("lastPaymentTime", 0L),
        "packageName" to (prefs.getString("lastPaymentPackage", "") ?: ""),
        "text" to (prefs.getString("lastPaymentText", "") ?: ""),
      )
    }

    Function("clearLastPayment") {
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        .remove("lastPaymentTime")
        .remove("lastPaymentPackage")
        .remove("lastPaymentText")
        .remove("lastSbnKey")
        .apply()
    }
  }
}