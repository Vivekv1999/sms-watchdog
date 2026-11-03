# 🚀 SMS Watch — Release Build & Version Update Guide

This guide covers everything you need to know to:
1. **Change the app version** across the codebase.
2. **Build a production/release APK** ready to install on phones.
3. **Install and update** the APK on existing phones without losing data.

---

## 📌 Part 1: How to Update the App Version

Whenever you create a new build, follow this **3-step checklist**:

### Step 1: Update UI Version (In-App Footer)
Open **`src/constants/app.ts`**:
```typescript
export const APP_NAME = 'SMS Watchdog';
export const APP_VERSION = '1.0.2'; // 👈 Change to your new version
export const APP_VERSION_LABEL = `${APP_NAME} v${APP_VERSION}`;
```
*(This single edit automatically updates Role Select, Admin Settings, and Worker screens).*

---

### Step 2: Update Android Build Version
Open **`android/app/build.gradle`** (around line 85):
```groovy
defaultConfig {
    applicationId "com.smswatch"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 3          // 👈 Increase by 1 (e.g., 2 -> 3)
    versionName "1.0.2"    // 👈 Match your new version string
}
```

> [!IMPORTANT]
> **Why `versionCode` must be increased:**  
> Android uses `versionCode` to determine if an APK is newer. Increasing it allows phones with the previous APK to tap **"Update"** directly without uninstalling the app or losing paired groups.

---

### Step 3: Update `package.json` *(Optional)*
Open **`package.json`** (line 3):
```json
"version": "1.0.2",
```

---

## 📦 Part 2: How to Build the APK

Open your terminal (PowerShell or Command Prompt) and run:

### For Release APK (Recommended for deployment):
```cmd
cd d:\v_v\apps\SMS-watch\android
gradlew assembleRelease
```

📁 **Generated APK Location:**
```
android/app/build/outputs/apk/release/app-release.apk
```

---

### For Debug/Test APK (Quick testing):
```cmd
cd d:\v_v\apps\SMS-watch\android
gradlew assembleDebug
```

📁 **Generated APK Location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📲 Part 3: How to Install on Phones

### Option A: Send via WhatsApp / Google Drive / USB
1. Send `app-release.apk` to your phone via USB cable, WhatsApp, or Google Drive.
2. Tap the `.apk` file on the phone.
3. If Android prompts *"Install unknown apps"*, tap **Settings → Allow from this source**.
4. Tap **Install** (or **Update**).

---

### Option B: Fast Install via USB with ADB
Connect your phone with USB debugging enabled, then run:
```cmd
adb install -r android/app/build/outputs/apk/release/app-release.apk
```
*(`-r` flag preserves existing app data and group settings).*

---

## 🛠️ Part 4: Troubleshooting & Clean Builds

If you ever encounter build cache errors or Gradle issues, clean the build folder and rebuild:

```cmd
cd d:\v_v\apps\SMS-watch\android
gradlew clean
gradlew assembleRelease
```

---

## 📋 Quick Version Bumping Reference

| Target Version | `src/constants/app.ts` | `android/app/build.gradle` |
|---|---|---|
| **v1.0.1** | `APP_VERSION = '1.0.1'` | `versionCode 2`, `versionName "1.0.1"` |
| **v1.0.2** | `APP_VERSION = '1.0.2'` | `versionCode 3`, `versionName "1.0.2"` |
| **v1.0.3** | `APP_VERSION = '1.0.3'` | `versionCode 4`, `versionName "1.0.3"` |
| **v1.1.0** | `APP_VERSION = '1.1.0'` | `versionCode 5`, `versionName "1.1.0"` |

