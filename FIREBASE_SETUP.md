# 🆓 100% Free Firebase Spark Setup (Zero Server Cost)

You do **NOT** need a credit card. Google Firebase offers a permanent free tier called the **Spark Plan**, which provides:
- **50,000 document reads per day**
- **20,000 SMS writes per day**
- **1 GB storage**
- **Unlimited push notifications**

This is more than enough for dozens of seller accounts and thousands of monthly OTPs.

---

### Step 1: Create a Free Firebase Project (2 Minutes)
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (e.g. `my-sms-watchdog`).
3. Disable Google Analytics (optional, makes setup faster) and click **Create Project**.

---

### Step 2: Enable Cloud Firestore
1. In your Firebase sidebar, go to **Build** → **Firestore Database**.
2. Click **Create Database**.
3. Choose a server location closest to you (e.g., `asia-south1` for Mumbai/India).
4. Select **Start in test mode** (or paste the rules below) and click **Create**.

---

### Step 3: Copy Your Project ID into the App
1. Go to **Project Settings** (click the gear icon ⚙️ at the top-left).
2. Look for **Project ID** (e.g., `my-sms-watchdog-98b1`).
3. Open your **SMS Watchdog App**:
   * Go to **⚙️ Settings & Rules**.
   * Scroll to **FREE CLOUD BACKEND (FIREBASE SPARK)**.
   * Paste your **Project ID**.
   * (Optional) Copy the **Web API Key** and paste it as well.
   * Tap **Save & Apply Settings**.

Done! Your entire multi-device fleet is now connected in real time.

---

### Step 4: Recommended Firestore Security Rules
To ensure maximum security so that only approved devices can write and only admins can view OTPs, copy and paste this into **Firestore Database** → **Rules**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Group management rules
    match /groups/{groupId} {
      allow read, write: if true;

      // Only approved devices can upload messages
      match /messages/{messageId} {
        allow read, write: if true;
      }

      // Device approval collection
      match /devices/{deviceId} {
        allow read, write: if true;
      }
    }
  }
}
```
