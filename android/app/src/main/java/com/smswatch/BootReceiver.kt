package com.smswatch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON" ||
            action == "com.htc.intent.action.QUICKBOOT_POWERON"
        ) {
            val prefs = context.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
            val isSyncActive = prefs.getBoolean("is_sync_active", false)
            val isApproved = prefs.getBoolean("is_device_approved", false)

            if (isSyncActive && isApproved) {
                Log.d("SmsBootReceiver", "Device rebooted. Restarting SMS Watchdog Foreground Service...")
                val deviceName = prefs.getString("device_name", "Worker SIM Phone") ?: "Worker SIM Phone"
                val groupId = prefs.getString("group_id", "Active") ?: "Active"

                val serviceIntent = Intent(context, SmsForegroundService::class.java).apply {
                    setAction(SmsForegroundService.ACTION_START)
                    putExtra("deviceName", deviceName)
                    putExtra("groupId", groupId)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
