# Biomarker Lock App

Simple Expo React Native app for Android and iOS.

Features:
- Fingerprint authentication
- Face ID authentication
- 4-digit passcode lock
- Works on Android and iPhone
- Uses device biometrics

## Supported Biometrics

### iOS
- Face ID
- Touch ID

### Android
- Fingerprint

## Get started

1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npx expo start
```

## Run on device

### iOS

```bash
npx expo run:ios
```

### Android

```bash
npx expo run:android
```

## Required Expo packages

```bash
npx expo install expo-local-authentication
npx expo install @react-native-async-storage/async-storage
npx expo install @expo/vector-icons
```