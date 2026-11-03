package com.smswatch

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class SmsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private var localReceiver: BroadcastReceiver? = null

    init {
        reactContext.addLifecycleEventListener(this)
        registerLocalSmsReceiver()
    }

    override fun getName(): String = "SmsNativeModule"

    private fun registerLocalSmsReceiver() {
        localReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == SmsReceiver.ACTION_SMS_RECEIVED_EVENT) {
                    val params = Arguments.createMap().apply {
                        putString("sender", intent.getStringExtra("sender"))
                        putString("body", intent.getStringExtra("body"))
                        putString("otp", intent.getStringExtra("otp"))
                        putString("service", intent.getStringExtra("service"))
                        putDouble("timestamp", intent.getLongExtra("timestamp", System.currentTimeMillis()).toDouble())
                        putString("deviceId", intent.getStringExtra("deviceId"))
                        putString("deviceName", intent.getStringExtra("deviceName"))
                    }
                    sendEvent("onSmsReceived", params)
                }
            }
        }
        val filter = IntentFilter(SmsReceiver.ACTION_SMS_RECEIVED_EVENT)
        ContextCompat.registerReceiver(
            reactContext,
            localReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (reactContext.hasActiveReactInstance()) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun getHardwareDeviceId(promise: Promise) {
        try {
            val androidId = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: "DEVICE_${System.currentTimeMillis()}"
            val model = Build.MODEL ?: "Android"
            val manufacturer = Build.MANUFACTURER ?: "Device"
            
            // Generate clean short hash for easy identification
            val shortId = androidId.takeLast(6).uppercase()
            val result = Arguments.createMap().apply {
                putString("deviceId", "DEV-$shortId")
                putString("fullId", androidId)
                putString("model", "$manufacturer $model")
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DEVICE_ID_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startSyncService(config: ReadableMap, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            val editor = prefs.edit()

            val deviceId = if (config.hasKey("deviceId")) config.getString("deviceId") else "DEV-UNKNOWN"
            val deviceName = if (config.hasKey("deviceName")) config.getString("deviceName") else "Worker Phone"
            val groupId = if (config.hasKey("groupId")) config.getString("groupId") else "DEFAULT"
            val isApproved = if (config.hasKey("isApproved")) config.getBoolean("isApproved") else false
            val filterMode = if (config.hasKey("filterMode")) config.getString("filterMode") else "SPECIFIC"
            val keywords = if (config.hasKey("keywords")) config.getString("keywords") else ""
            val firebaseProjectId = if (config.hasKey("firebaseProjectId")) config.getString("firebaseProjectId") else ""
            val firebaseApiKey = if (config.hasKey("firebaseApiKey")) config.getString("firebaseApiKey") else ""

            editor.putBoolean("is_sync_active", true)
            editor.putBoolean("is_device_approved", isApproved)
            editor.putString("device_id", deviceId)
            editor.putString("device_name", deviceName)
            editor.putString("group_id", groupId)
            editor.putString("filter_mode", filterMode)
            editor.putString("keywords", keywords)
            editor.putString("firebase_project_id", firebaseProjectId)
            editor.putString("firebase_api_key", firebaseApiKey)
            editor.apply()

            val serviceIntent = Intent(reactContext, SmsForegroundService::class.java).apply {
                setAction(SmsForegroundService.ACTION_START)
                putExtra("deviceName", deviceName)
                putExtra("groupId", groupId)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent)
            } else {
                reactContext.startService(serviceIntent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopSyncService(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("is_sync_active", false).apply()

            val serviceIntent = Intent(reactContext, SmsForegroundService::class.java).apply {
                setAction(SmsForegroundService.ACTION_STOP)
            }
            reactContext.startService(serviceIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun updateFilterSettings(filterMode: String, keywords: String, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("filter_mode", filterMode)
                .putString("keywords", keywords)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_FILTER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setDeviceApproval(isApproved: Boolean, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("is_device_approved", isApproved).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("APPROVAL_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setDevicePaused(isPaused: Boolean, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("is_device_paused", isPaused).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DEVICE_PAUSED_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getSyncStatus(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            val result = Arguments.createMap().apply {
                putBoolean("isSyncActive", prefs.getBoolean("is_sync_active", false))
                putBoolean("isApproved", prefs.getBoolean("is_device_approved", false))
                putString("filterMode", prefs.getString("filter_mode", "SPECIFIC"))
                putString("keywords", prefs.getString("keywords", ""))
                putString("deviceId", prefs.getString("device_id", ""))
                putString("deviceName", prefs.getString("device_name", ""))
                putString("groupId", prefs.getString("group_id", ""))
                putBoolean("isServiceRunning", isMyServiceRunning(SmsForegroundService::class.java))
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent()
                val packageName = reactContext.packageName
                val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
                if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                    intent.action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    intent.data = Uri.parse("package:$packageName")
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    reactContext.startActivity(intent)
                    promise.resolve(false) // prompted user
                    return
                }
                promise.resolve(true) // already ignored
                return
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_OPTI_ERROR", e.message)
        }
    }

    private fun isMyServiceRunning(serviceClass: Class<*>): Boolean {
        val manager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        @Suppress("DEPRECATION")
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }

    override fun onHostResume() {}
    override fun onHostPause() {}
    override fun onHostDestroy() {
        localReceiver?.let {
            try {
                reactContext.unregisterReceiver(it)
            } catch (_: Exception) {}
        }
    }
}
