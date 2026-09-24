package expo.modules.backgroundlocation

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class RegisteredStore(
  val storeId: String,
  val storeName: String,
  val latitude: Double,
  val longitude: Double,
  val categories: List<String>,
  val radius: Float,
)

//店舗と監視状態を保存する
class StoreStorage(context: Context) {
  private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun saveStores(stores: List<RegisteredStore>) {
    val array = JSONArray()
    for (store in stores) {
      array.put(
        JSONObject()
          .put("storeId", store.storeId)
          .put("storeName", store.storeName)
          .put("latitude", store.latitude)
          .put("longitude", store.longitude)
          .put("categories", JSONArray(store.categories))
          .put("radius", store.radius.toDouble()),
      )
    }
    prefs.edit().putString(KEY_STORES, array.toString()).apply()
  }

  fun loadStores(): List<RegisteredStore> {
    val raw = prefs.getString(KEY_STORES, null) ?: return emptyList()
    val array = JSONArray(raw)
    return (0 until array.length()).map { index ->
      val json = array.getJSONObject(index)
      val categories = json.getJSONArray("categories")
      RegisteredStore(
        storeId = json.getString("storeId"),
        storeName = json.getString("storeName"),
        latitude = json.getDouble("latitude"),
        longitude = json.getDouble("longitude"),
        categories = (0 until categories.length()).map { categories.getString(it) },
        radius = json.getDouble("radius").toFloat(),
      )
    }
  }

  fun findStore(storeId: String): RegisteredStore? {
    return loadStores().firstOrNull { it.storeId == storeId }
  }

  fun setEnabled(enabled: Boolean) {
    prefs.edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  fun isEnabled(): Boolean {
    return prefs.getBoolean(KEY_ENABLED, false)
  }

  fun saveOptions(notificationTitle: String, notificationBody: String, distanceMeters: Float) {
    prefs.edit()
      .putString(KEY_NOTIFICATION_TITLE, notificationTitle)
      .putString(KEY_NOTIFICATION_BODY, notificationBody)
      .putFloat(KEY_DISTANCE_METERS, distanceMeters)
      .apply()
  }

  fun notificationTitle(): String {
    return prefs.getString(KEY_NOTIFICATION_TITLE, "ファミつい") ?: "ファミつい"
  }

  fun notificationBody(): String {
    return prefs.getString(KEY_NOTIFICATION_BODY, "近くの店舗を確認しています") ?: "近くの店舗を確認しています"
  }

  fun distanceMeters(): Float {
    return prefs.getFloat(KEY_DISTANCE_METERS, 30f)
  }

  fun getValue(key: String): String? {
    return prefs.getString("$VALUE_PREFIX$key", null)
  }

  fun setValue(key: String, value: String?) {
    prefs.edit().putString("$VALUE_PREFIX$key", value).apply()
  }

  companion object {
    private const val PREFS_NAME = "backgroundLocation"
    private const val KEY_STORES = "stores"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_NOTIFICATION_TITLE = "notificationTitle"
    private const val KEY_NOTIFICATION_BODY = "notificationBody"
    private const val KEY_DISTANCE_METERS = "distanceMeters"
    private const val VALUE_PREFIX = "value_"
  }
}