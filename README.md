# 🍽️ MessTrack - Mess Food & Attendance Tracker (Android & Web)

A modern, offline-first mobile app designed for students and hostellers to record daily mess meals, track attendance, calculate monthly mess bills, and generate printable mess slips.

---

## ✨ Features

- **Daily Meal Recording**:
  - One-tap tracking for **Breakfast 🍳**, **Lunch 🍛**, **Evening Snacks ☕**, and **Dinner 🍲**.
  - Preset quick actions: **All Eaten Today** or **Mess Leave / Cut**.
  - Dynamic day spend and meal count indicators.
  - Optional daily notes (e.g., special menu items or guest charges).
  - Horizontal 7-day week strip for quick historical navigation.

- **Interactive Monthly Calendar**:
  - Full-month grid with color-coded meal dots.
  - Leave indicators and daily total cost badges.
  - Tap any day to edit meal attendance, leave status, or notes in a slide-up sheet.

- **Monthly Billing & Analytics**:
  - Configurable billing model:
    - **Per-Meal Model**: Pay only for meals consumed.
    - **Fixed Monthly Model**: Fixed monthly fee with daily leave rebates deducted.
  - Attendance rate percentage bar.
  - Meal distribution breakdown (counts & costs for Breakfast, Lunch, Snacks, Dinner).
  - **Generate Mess Bill Slip**: Clean printable invoice format with student & warden signature lines.
  - One-click copy or share summary for WhatsApp.

- **Android PWA & Offline Support**:
  - Full Progressive Web App (PWA) with Service Worker caching (`sw.js`).
  - Works 100% offline without internet.
  - Installable directly to the Android Home Screen with standalone full-screen experience and app icon.

- **Personalization & Backup**:
  - Dark Mode and Light Mode support with smooth theme toggle.
  - Customizable mess name, student name, room/roll number, currency symbol, and meal prices.
  - Export and Import all data as JSON files for backup and restore.
  - One-click sample demo data loader.

---

## 🚀 How to Run Locally

Since Python is already installed on your system:

```bash
# In this directory:
python -m http.server 8080
```

Open your browser to:
[http://localhost:8080](http://localhost:8080)

---

## 📲 How to Install on Android Phone

### Option 1: Direct Install via Browser (Recommended - Instant)
1. Ensure your phone and computer are on the same Wi-Fi network, or deploy the folder to GitHub Pages / Vercel / Netlify (zero setup needed, just static files).
2. Open the URL in **Google Chrome** or **Samsung Internet** on your Android phone.
3. Tap the **"Install"** banner at the top of the app, or open Chrome menu (**⋮**) and tap **"Add to Home screen"** / **"Install app"**.
4. The app will install with its own icon on your app drawer and home screen, running full-screen without address bars and working completely offline!

### Option 2: Convert to Standalone Android APK (.apk)
If you want an installable `.apk` file:
- Use **[PWABuilder](https://www.pwabuilder.com/)**: Enter your deployed URL and click **Package for Android** to generate an APK.
- Or package with **Capacitor**:
  ```bash
  npm install @capacitor/core @capacitor/cli @capacitor/android
  npx cap init "MessTrack" "com.messtrack.app"
  npx cap add android
  npx cap run android
  ```
