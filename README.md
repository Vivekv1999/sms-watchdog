# ⚡ SMS Watchdog — Multi-Device E-Commerce OTP & SMS Gateway

A cross-device React Native application built to centralize OTPs and incoming SMS from multiple SIM cards/phones (e.g. Amazon, Flipkart, Meesho, Myntra, Bank accounts) onto one or more Admin devices with zero email/password authentication and zero server costs.

---

## 🎯 Key Features

### 👑 1. Admin & Co-Admin Mode
* **Instant Live Feed:** Incoming OTPs appear in real time (< 1 second).
* **1-Tap "Copy OTP":** Automatic regex detection isolates 4–8 digit OTP codes with a prominent "📋 COPY OTP" button.
* **Filter Toggle (Configurable by Admin):**
  * Switch between **Forward ALL SMS** and **Specific Keywords Only**.
  * Add custom keywords on the fly (`Flipkart`, `Amazon`, `Meesho`, `OTP`, `verification`, `bank`, etc.).
  * Filter updates are immediately dispatched to all connected SIM devices.
* **Co-Admin Capability:** Multiple devices can act as Admins simultaneously by entering the Master Key.

### 🛡️ 2. Zero-Auth Security & APK Theft Defense
* **No Email/Password Needed:** Access is locked via a private Master PIN / Secret Key stored with local encryption.
* **Device Approval Gate:** If someone copies or steals the APK file and installs it on their phone:
  * The app detects an unknown hardware UUID.
  * The app locks onto a **"Waiting for Admin Approval"** screen.
  * An alert appears on your Admin dashboard: *New Device requesting connection: [Approve] / [Block]*.
  * Without your explicit approval, the stolen APK cannot send or view any messages.
* **One-Way Isolation:** Worker SIM phones are purely one-way forwarders. They cannot read or inspect OTPs from other accounts.
* **Remote Kill Switch:** Instantly revoke or delete any phone from your Admin dashboard.

### 📱 3. Worker SIM Phone Mode (24/7 Background Persistence)
* **1-Step Pairing:** Non-technical users just enter a device nickname and the 6-digit Group Code (or scan QR).
* **Foreground Service with Persistent Notification:** Prevents OEM aggressive battery managers (Samsung OneUI, Xiaomi MIUI/HyperOS, Realme, Oppo, Vivo) from sleeping the listener.
* **Auto-Start on Reboot:** Includes native Android `BOOT_COMPLETED` receiver to restart sync automatically when the phone turns back on.
* **Direct Cloud Ingestion:** Native Android BroadcastReceiver dispatches SMS directly to the cloud in the background even if the app UI is closed.

---

## 🚀 How to Build and Run the APK

### 1. Run in Development Mode
```bash
# Start Metro bundler
npm start

# Run on connected Android device / emulator
npm run android
```

### 2. Generate Release APK for Sideloading
To install this private APK on your team's SIM phones:
```bash
# Build standalone release APK
cd android
./gradlew app:assembleRelease
```
The installable `.apk` file will be generated at:
```
android/app/build/outputs/apk/release/app-release.apk
```
(Or for immediate testing without signing keys: `./gradlew app:assembleDebug` produces `app-debug.apk`).

---

## 📂 Architecture Overview

```
SMS-watch/
├── android/
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml          # SMS permissions, Foreground Service, Boot Receiver
│   │   └── java/com/smswatch/
│   │       ├── SmsReceiver.kt           # Native SMS interceptor + Direct Cloud POST
│   │       ├── SmsForegroundService.kt  # 24/7 background foreground persistence
│   │       ├── BootReceiver.kt          # Restarts sync on phone reboot
│   │       ├── SmsModule.kt             # React Native native bridge
│   │       └── SmsPackage.kt            # Module registration
├── src/
│   ├── components/
│   │   └── OtpCard.tsx                  # 1-tap copy, service tag, full body expander
│   ├── screens/
│   │   ├── RoleSelectScreen.tsx         # Switch between Admin & Worker mode
│   │   ├── AdminAuthScreen.tsx          # Master PIN security gate (No email/password)
│   │   ├── AdminDashboardScreen.tsx     # Live stream, filters, OTP copy, test simulator
│   │   ├── AdminSettingsScreen.tsx      # All vs Specific toggle, keyword chips, Firebase Spark config
│   │   ├── AdminDevicesScreen.tsx       # Device approval gate & remote kill switch
│   │   └── WorkerSetupScreen.tsx        # 1-click SIM phone background forwarder
│   ├── services/
│   │   ├── smsBridge.ts                 # Bridge to Android native service & permissions
│   │   ├── storage.ts                   # Secure local storage (PIN, roles, cache)
│   │   └── cloudSync.ts                 # Firestore REST real-time sync engine
│   ├── utils/
│   │   └── otpExtractor.ts              # High-accuracy regex extractor
│   └── theme/
│   │   └── colors.ts                    # Sleek dark mode design system
│   App.tsx                              # Root navigation router
```
