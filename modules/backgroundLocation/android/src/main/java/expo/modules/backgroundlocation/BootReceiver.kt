package expo.modules.backgroundlocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val storage = StoreStorage(context)
    if (!storage.isEnabled()) return
    Registrar.startLocationService(context)
    Registrar.replaceGeofences(context, storage.loadStores())
    Registrar.startActivityTransitions(context)
  }
}