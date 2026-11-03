package com.smswatch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.regex.Pattern

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsWatchReceiver"
        const val ACTION_SMS_RECEIVED_EVENT = "com.smswatch.SMS_RECEIVED_EVENT"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = context.getSharedPreferences("SmsWatchPrefs", Context.MODE_PRIVATE)
        val isSyncActive = prefs.getBoolean("is_sync_active", false)
        val isApproved = prefs.getBoolean("is_device_approved", false)
        val isDevicePaused = prefs.getBoolean("is_device_paused", false)

        // Security Gate: Ignore if sync is paused, device not approved, or device paused by admin
        if (!isSyncActive || !isApproved || isDevicePaused) {
            Log.d(TAG, "SMS received but sync is inactive, device is not approved, or device is paused by Admin")
            return
        }

        val messages: Array<SmsMessage> = try {
            Telephony.Sms.Intents.getMessagesFromIntent(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing SMS messages", e)
            return
        }

        if (messages.isEmpty()) return

        val sender = messages[0].displayOriginatingAddress ?: "Unknown"
        val timestamp = messages[0].timestampMillis

        // Combine multipart SMS segments
        val bodyBuilder = StringBuilder()
        for (msg in messages) {
            msg.displayMessageBody?.let { bodyBuilder.append(it) }
        }
        val fullBody = bodyBuilder.toString()

        val deviceId = prefs.getString("device_id", "DEV-UNKNOWN") ?: "DEV-UNKNOWN"
        val deviceName = prefs.getString("device_name", "Worker Phone") ?: "Worker Phone"
        val groupId = prefs.getString("group_id", "DEFAULT") ?: "DEFAULT"
        val firebaseProjectId = prefs.getString("firebase_project_id", "") ?: ""
        val firebaseApiKey = prefs.getString("firebase_api_key", "") ?: ""

        // Use goAsync() so Android keeps the receiver alive while background thread executes
        // This is CRITICAL: network operations MUST run on a background thread in Android!
        val pendingResult = goAsync()

        Thread {
            try {
                var filterMode = prefs.getString("filter_mode", "SPECIFIC") ?: "SPECIFIC"
                var keywordsString = prefs.getString("keywords", "otp,code,verification,flipkart,amazon,meesho,bank,sbi,hdfc,icici,axis,paytm") ?: ""

                val lastRuleCheckTime = prefs.getLong("last_rule_check_time", 0L)
                val now = System.currentTimeMillis()

                // Refresh Admin rules & device status from Firestore if > 5s elapsed (runs on background thread, NO NetworkOnMainThreadException!)
                if ((now - lastRuleCheckTime > 5000L) && firebaseProjectId.isNotEmpty() && groupId.isNotEmpty()) {
                    val remoteRule = fetchRemoteFilterConfig(firebaseProjectId, firebaseApiKey, groupId)
                    if (remoteRule != null) {
                        filterMode = remoteRule.first
                        keywordsString = remoteRule.second
                        prefs.edit()
                            .putString("filter_mode", filterMode)
                            .putString("keywords", keywordsString)
                            .putLong("last_rule_check_time", now)
                            .apply()
                        Log.d(TAG, "Successfully synced Admin rule from cloud: filterMode='$filterMode', keywords='$keywordsString'")
                    }

                    if (deviceId.isNotEmpty()) {
                        val remotePaused = fetchRemoteDevicePaused(firebaseProjectId, firebaseApiKey, groupId, deviceId)
                        if (remotePaused != null) {
                            prefs.edit().putBoolean("is_device_paused", remotePaused).apply()
                            if (remotePaused) {
                                Log.d(TAG, "Worker device $deviceId is paused by Admin in Firestore. Aborting forward.")
                                return@Thread
                            }
                        }
                    }
                }

                // Check again in case prefs updated
                if (prefs.getBoolean("is_device_paused", false)) {
                    Log.d(TAG, "Device is paused by Admin. Aborting forward.")
                    return@Thread
                }

                val shouldForward = shouldForwardMessage(fullBody, sender, filterMode, keywordsString)
                if (!shouldForward) {
                    Log.d(TAG, "Message filtered out by Admin rules (mode=$filterMode): $fullBody")
                    return@Thread
                }

                val extractedOtp = extractOtp(fullBody)
                val detectedService = detectService(sender, fullBody)

                // Notify active React Native UI if running
                val localIntent = Intent(ACTION_SMS_RECEIVED_EVENT).apply {
                    putExtra("sender", sender)
                    putExtra("body", fullBody)
                    putExtra("otp", extractedOtp)
                    putExtra("service", detectedService)
                    putExtra("timestamp", timestamp)
                    putExtra("deviceId", deviceId)
                    putExtra("deviceName", deviceName)
                }
                context.sendBroadcast(localIntent)

                // Dispatch directly to Cloud Backend
                if (firebaseProjectId.isNotEmpty() && groupId.isNotEmpty()) {
                    forwardToFirestore(
                        firebaseProjectId = firebaseProjectId,
                        apiKey = firebaseApiKey,
                        groupId = groupId,
                        deviceId = deviceId,
                        deviceName = deviceName,
                        sender = sender,
                        body = fullBody,
                        otp = extractedOtp,
                        service = detectedService,
                        timestamp = timestamp
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error in SMS background processing", e)
            } finally {
                pendingResult.finish()
            }
        }.start()
    }

    private fun shouldForwardMessage(body: String, sender: String, mode: String, keywordsStr: String): Boolean {
        // Admin-Only No Message Forwarding Mode
        if (mode.trim().equals("NO_FORWARD", ignoreCase = true) ||
            mode.trim().equals("NONE", ignoreCase = true) ||
            mode.trim().equals("NO_MESSAGE_FORWARD", ignoreCase = true)) {
            Log.d(TAG, "Filter mode is NO_FORWARD (Admin-Only No Message Forward Mode): Rejecting all forwarding")
            return false
        }

        if (mode.trim().equals("ALL", ignoreCase = true)) {
            Log.d(TAG, "Filter mode is ALL: Forwarding message without filtering")
            return true
        }

        val defaultKeywords = "otp,code,verification,flipkart,amazon,meesho,bank,sbi,hdfc,icici,axis,paytm,myntra,shopify,zomato,swiggy"
        val effectiveKeywords = if (keywordsStr.trim().isEmpty()) defaultKeywords else keywordsStr
        val keywords = effectiveKeywords.split(",").map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotEmpty() }

        if (keywords.isEmpty()) {
            Log.d(TAG, "Specific mode but no keywords defined: Rejecting message")
            return false
        }

        val combined = "$sender $body".lowercase(Locale.ROOT)

        for (kw in keywords) {
            if (combined.contains(kw)) {
                Log.d(TAG, "Specific mode: Keyword matched '$kw' -> forwarding message")
                return true
            }
        }

        Log.d(TAG, "Specific mode: No keyword matched in '$combined' -> rejecting")
        return false
    }

    private fun extractOtp(body: String): String {
        // High confidence OTP match: words like otp, code, verification followed by 4-8 digits
        val highConfidence = Pattern.compile("(?i)(?:otp|code|verification|is|pin|login)[^0-9]{0,12}([0-9]{4,8})\\b")
        val matcher1 = highConfidence.matcher(body)
        if (matcher1.find()) {
            return matcher1.group(1) ?: ""
        }

        // Generic 4-8 digit standalone number
        val generic = Pattern.compile("\\b([0-9]{4,8})\\b")
        val matcher2 = generic.matcher(body)
        if (matcher2.find()) {
            return matcher2.group(1) ?: ""
        }

        return ""
    }

    private fun detectService(sender: String, body: String): String {
        val s = "$sender $body".uppercase(Locale.ROOT)
        return when {
            s.contains("FLPKRT") || s.contains("FLIPKART") -> "FLIPKART"
            s.contains("AMAZON") || s.contains("AMZIN") -> "AMAZON"
            s.contains("MEESHO") -> "MEESHO"
            s.contains("MYNTRA") -> "MYNTRA"
            s.contains("SHOPIFY") -> "SHOPIFY"
            s.contains("SBI") || s.contains("STATE BANK") -> "SBI"
            s.contains("HDFC") -> "HDFC"
            s.contains("ICICI") -> "ICICI"
            s.contains("AXIS") -> "AXIS BANK"
            s.contains("PAYTM") -> "PAYTM"
            s.contains("RAZORPAY") -> "RAZORPAY"
            s.contains("ZOMATO") -> "ZOMATO"
            s.contains("SWIGGY") -> "SWIGGY"
            else -> "OTHER"
        }
    }

    private fun forwardToFirestore(
        firebaseProjectId: String,
        apiKey: String,
        groupId: String,
        deviceId: String,
        deviceName: String,
        sender: String,
        body: String,
        otp: String,
        service: String,
        timestamp: Long
    ) {
        try {
            val urlString = if (apiKey.isNotEmpty()) {
                "https://firestore.googleapis.com/v1/projects/$firebaseProjectId/databases/(default)/documents/groups/$groupId/messages?key=$apiKey"
            } else {
                "https://firestore.googleapis.com/v1/projects/$firebaseProjectId/databases/(default)/documents/groups/$groupId/messages"
            }

            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 15000

            // Firestore REST JSON format
            val fields = JSONObject().apply {
                put("deviceId", JSONObject().put("stringValue", deviceId))
                put("deviceName", JSONObject().put("stringValue", deviceName))
                put("sender", JSONObject().put("stringValue", sender))
                put("body", JSONObject().put("stringValue", body))
                put("otp", JSONObject().put("stringValue", otp))
                put("service", JSONObject().put("stringValue", service))
                put("timestamp", JSONObject().put("integerValue", timestamp.toString()))
                put("createdAt", JSONObject().put("integerValue", System.currentTimeMillis().toString()))
            }
            val root = JSONObject().put("fields", fields)

            val writer = OutputStreamWriter(conn.outputStream, "UTF-8")
            writer.write(root.toString())
            writer.flush()
            writer.close()

            val responseCode = conn.responseCode
            Log.d(TAG, "Firestore sync response code: $responseCode")
            conn.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to upload SMS to Firestore", e)
        }
    }

    private fun fetchRemoteFilterConfig(
        projectId: String,
        apiKey: String,
        groupId: String
    ): Pair<String, String>? {
        return try {
            val urlString = if (apiKey.isNotEmpty()) {
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/groups/$groupId?key=$apiKey"
            } else {
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/groups/$groupId"
            }
            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 4000
            conn.readTimeout = 4000

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream, "UTF-8"))
                val response = reader.readText()
                reader.close()
                conn.disconnect()

                val json = JSONObject(response)
                val fields = json.optJSONObject("fields")
                val filterMode = fields?.optJSONObject("filterMode")?.optString("stringValue") ?: "SPECIFIC"
                val noForwarding = fields?.optJSONObject("noMessageForwarding")?.optBoolean("booleanValue", false) ?: false
                val resolvedMode = if (noForwarding || filterMode.equals("NO_FORWARD", ignoreCase = true)) "NO_FORWARD" else filterMode
                val keywords = fields?.optJSONObject("keywords")?.optString("stringValue") ?: ""
                Log.d(TAG, "Native fetched remote Admin rule from Firestore: filterMode='$resolvedMode'")
                Pair(resolvedMode, keywords)
            } else {
                conn.disconnect()
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to fetch remote filter config from Firestore", e)
            null
        }
    }

    private fun fetchRemoteDevicePaused(
        projectId: String,
        apiKey: String,
        groupId: String,
        deviceId: String
    ): Boolean? {
        return try {
            val urlString = if (apiKey.isNotEmpty()) {
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/groups/$groupId/devices/$deviceId?key=$apiKey"
            } else {
                "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/groups/$groupId/devices/$deviceId"
            }
            val url = URL(urlString)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 4000
            conn.readTimeout = 4000

            if (conn.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream, "UTF-8"))
                val response = reader.readText()
                reader.close()
                conn.disconnect()

                val json = JSONObject(response)
                val fields = json.optJSONObject("fields")
                val isPaused = fields?.optJSONObject("pausedForwarding")?.optBoolean("booleanValue", false) ?: false
                Log.d(TAG, "Native fetched remote device paused status for $deviceId: isPaused=$isPaused")
                isPaused
            } else {
                conn.disconnect()
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to fetch remote device paused status from Firestore", e)
            null
        }
    }
}
