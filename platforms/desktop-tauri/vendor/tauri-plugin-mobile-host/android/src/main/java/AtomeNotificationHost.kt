package one.atome.mobile

import android.content.Context
import org.json.JSONObject

// Only bounded OS references cross JNI. Filesystem/account/inbox ownership
// remains in the canonical Rust/Axum authentication module, even on cold wake.
object AtomeNotificationHost {
    init { System.loadLibrary("squirrel_lib") }
    @JvmStatic external fun storage(root: String, command: String, payload: String): String
    fun query(context: Context, command: String, payload: JSONObject = JSONObject()): JSONObject {
        return JSONObject(storage(context.applicationInfo.dataDir, command, payload.toString()))
    }
    fun require(context: Context, command: String, payload: JSONObject = JSONObject()): JSONObject {
        val result = query(context, command, payload)
        if (!result.optBoolean("ok")) throw IllegalStateException(result.optString("error", "notifications_storage_unavailable"))
        return result
    }
    fun context(context: Context) = require(context, "context").optJSONObject("context")
}
