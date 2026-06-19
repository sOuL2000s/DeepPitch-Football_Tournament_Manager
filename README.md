# 🏆 DeepPitch

[![Expo](https://img.shields.io/badge/Expo-56.0-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React_Native-0.85-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**DeepPitch** is a professional-grade tournament management application designed for organizers who demand precision, flexibility, and real-time control. Whether you're running a local football league, a high-stakes eSports bracket, or a multi-stage World Cup format, DeepPitch provides a high-performance command center right in your pocket.

---

## 📖 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Usage](#usage)
- [API Documentation](#api-documentation)
- [Security & Performance](#security--performance)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## 🔍 Overview

DeepPitch solves the complexity of tournament administration by automating fixture generation, standings calculation, and report generation. It bridges the gap between simple local storage and powerful cloud-based processing via its dedicated **Serverless Engine**, allowing users to export professional PDF reports and CSV data with a single tap.

---

## ✨ Features

- 🏟️ **Multiple Formats**: Support for Round-Robin Leagues, Single-Elimination Knockouts, and Group Stages.
- ⚡ **Instant Templates**: Pre-configured setups for World Cup (32 teams), UCL (32 teams), Euro (24 teams), and more.
- ⏱️ **Live Match Tracking**: Real-time score updates, match timers, and event logging (Goals, Assists, Yellow/Red cards).
- 📊 **Dynamic Standings**: Automatic calculation of points, Goal Difference (GD), and Fair Play (FP) points.
- 🔄 **Intelligent Transitions**: Automatic advancement from Group Stages to Knockout Brackets.
- 📤 **Professional Exports**: 
    - Full PDF tournament reports.
    - CSV fixture exports.
    - High-resolution image exports for Standings and Brackets.
- 🌓 **Modern UI**: Optimized dark-themed interface with high-contrast elements for outdoor readability.

---

## 🛠 Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React Native, Expo SDK 56 |
| **State Management** | React Hooks (useState, useEffect, useRef) |
| **Storage** | AsyncStorage (Offline-first architecture) |
| **Icons** | Lucide React Native |
| **Backend** | Node.js (Vercel Serverless Functions) |
| **Export Engines** | Expo Print, React Native View Shot, Expo Sharing |
| **CI/CD** | GitHub Actions (Android APK Automation) |

---

## 🏗 Architecture

DeepPitch utilizes a **Hybrid Local-Cloud Architecture**:

1.  **Local Core**: Tournament data, team rosters, and match results are stored locally using `AsyncStorage`. This ensures the app remains fully functional without an internet connection during the heat of a tournament.
2.  **Serverless Engine**: Complex tasks—such as HTML-to-PDF rendering and CSV data transformation—are offloaded to a Node.js backend hosted on Vercel.
3.  **Communication**: The mobile client communicates with the Vercel Engine via a secure REST API protected by an API Key.

---

## 📂 Folder Structure

```text
DeepPitch/
├── .github/workflows/      # GitHub Actions for automated Android builds
├── .vercel/                # Vercel project configuration
├── api/
│   └── index.js            # Serverless Node.js engine for PDF/CSV generation
├── assets/                 # App icons, splash screens, and SVG logos
├── src/
│   └── utils/
│       └── tournamentHelpers.js # Shared logic for stats, colors, and scoring
├── App.js                  # Main Application Entry & UI logic
├── app.json                # Expo configuration
├── eas.json                # Expo Application Services build profiles
├── package.json            # Project dependencies and scripts
└── .env                    # Environment variables (Internal/Dev)
```

---

## 🚀 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [Expo Go](https://expo.dev/client) app on your mobile device
- [EAS CLI](https://docs.expo.dev/build/setup/) (for native builds)

### Setup Steps
1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/deeppitch.git
   cd deeppitch
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SERVERLESS_API_KEY=your_secret_key
   EXPO_PUBLIC_DEV_API_URL=http://your-local-ip:3000/api
   EXPO_PUBLIC_PROD_API_URL=https://your-app.vercel.app/api
   ```

---

## ⚙️ Environment Variables

| Variable | Description | Purpose |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_SERVERLESS_API_KEY` | SHA-256 Auth Token | Authenticates app with the Vercel backend. |
| `EXPO_PUBLIC_DEV_API_URL` | Local API Endpoint | Used for local testing of serverless functions. |
| `EXPO_PUBLIC_PROD_API_URL` | Vercel API Endpoint | Production URL for report generation. |

---

## 🏃 Running the Project

- **Start Development**: `npx expo start`
- **Run on Android**: `npm run android`
- **Run on iOS**: `npm run ios`
- **Build APK**: `eas build -p android --profile preview`

---

## 📱 Usage

1.  **Creation**: Click the `+` icon. Choose a template or "Custom". Enter team names separated by commas.
2.  **Management**: Select a tournament from the Home screen. Navigate between Fixtures, Standings, and Stats.
3.  **Match Day**: Tap a match to enter "Live" mode. Start the clock, add goals/cards, and finalize results.
4.  **Reporting**: Use the "Share" or "PDF" icons in the top header to generate professional documentation for participants.

---

## 📡 API Documentation

The serverless engine (`/api/index.js`) handles POST requests with the following structure:

### Endpoint: `POST /api`
**Headers**: `Authorization: Bearer <API_KEY>`

| Action | Payload | Description |
| :--- | :--- | :--- |
| `GENERATE_PDF_HTML` | `{ tournament, type }` | Returns a base64 encoded PDF or HTML string for reports. |
| `GENERATE_CSV` | `{ tournament }` | Returns a raw CSV string of fixtures and results. |
| `SHARE_ID` | `{ tournament }` | Generates a unique short-link for cloud synchronization. |

---

## 🔒 Security & Error Handling

-   **API Security**: All cloud requests require a Bearer token verification.
-   **Validation**: The backend includes a `validateAndSanitizeTournament` function to prevent XSS and ensure data integrity before rendering PDFs.
-   **Safe Input**: `escapeHtml` utility is used across the app to sanitize team and player names.
-   **Graceful Failures**: Includes loading overlays and `ActivityIndicators` to handle network latency during report generation.

---

## 🚀 Deployment

### Serverless Engine (Vercel)
The `/api` folder is configured for zero-config deployment on Vercel.
```bash
vercel deploy --prod
```

### Mobile App (EAS)
Build and submit to the Google Play Store or Apple App Store using Expo Application Services.
```bash
eas build --platform android
```

---

## 🗺 Roadmap

- [ ] **Cloud Sync**: Optional Firebase/Supabase integration for real-time multiplayer editing.
- [ ] **Custom Tie-breakers**: Expanded logic for complex regional tournament rules.
- [ ] **Draft Mode**: Integrated team drafting tool for "pick-up" games.
- [ ] **Push Notifications**: Alerts for match starts and results for shared tournaments.

---

## 🤝 Contributing

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## ⚖️ License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 💎 Acknowledgements

- [Expo SDK](https://expo.dev/)
- [Lucide Icons](https://lucide.dev/)
- [Vercel](https://vercel.com/)
- [React Native View Shot](https://github.com/gre/react-native-view-shot)

---
*Generated by DeepPitch Maintainers. Professionalism in every pitch.*