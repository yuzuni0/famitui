package expo.modules.paymentnotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat

private val TARGET_PACKAGES = setOf("jp.ne.paypay.android.app", "com.mobilesuica.msapp", "com.google.android.apps.walletnfcrel")
private val PAYMENT_KEYWORDS = listOf("支払い", "支払", "決済", "利用")
private val EXCLUDE_KEYWORDS = listOf("さんから", "チャージ", "キャンペーン", "ポイント", "クーポン")
internal const val PREFS_NAME = "payment_notification"
private const val CHANNEL_ID = "payment_confirm"
private const val NOTIFICATION_ID = 1001

class PaymentNotificationService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName !in TARGET_PACKAGES) return

    val extras = sbn.notification.extras
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
    val body = text + bigText

    if (EXCLUDE_KEYWORDS.any { body.contains(it) }) {
      Log.d("PaymentNotif", "excluded: $body")
      return
    }

    val isPayment = PAYMENT_KEYWORDS.any { body.contains(it) }
    val isReceived = body.contains("さんが") && body.contains("受け取りました")
    if (!isPayment && !isReceived) {
      Log.d("PaymentNotif", "unmatched: $body")
      return
    }

    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val lastSbnKey = prefs.getString("lastSbnKey", null)
    val lastPaymentTime = prefs.getLong("lastPaymentTime", 0L)
    if (lastSbnKey == sbn.key || sbn.postTime - lastPaymentTime < 5000) return

    prefs.edit()
      .putLong("lastPaymentTime", sbn.postTime)
      .putString("lastPaymentPackage", sbn.packageName)
      .putString("lastPaymentText", body.take(200))
      .putString("lastSbnKey", sbn.key)
      .apply()

    Log.d("PaymentNotif", "matched: $body")
    showConfirmNotification()
  }

  private fun showConfirmNotification() {
    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "購入確認", NotificationManager.IMPORTANCE_HIGH)
      notificationManager.createNotificationChannel(channel)
    }

    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
    intent.putExtra("openPurchaseConfirm", true)
    intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setContentTitle("依頼品を購入しましたか？")
      .setContentText("タップして購入報告を行えます")
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)

    notificationManager.notify(NOTIFICATION_ID, builder.build())
  }
}