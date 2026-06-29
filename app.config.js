/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'PrivateAI',
  slug: 'private-ai',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon-1024.png',
  userInterfaceStyle: 'light',
  plugins: [
    [
      'expo-build-properties',
      {
        ios: {
          buildReactNativeFromSource: true,
        },
      },
    ],
  ],
  splash: {
    backgroundColor: '#FFFFFF',
  },
  ios: {
    bundleIdentifier: 'inc.neocast.privateai',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Private AI uses the microphone for optional voice chat features.',
      NSSpeechRecognitionUsageDescription:
        'Private AI uses on-device speech recognition for voice input.',
    },
  },
  android: {
    package: 'inc.neocast.privateai',
    adaptiveIcon: {
      backgroundColor: '#0A0E1A',
    },
  },
  extra: {
    eas: {
      projectId: '6ebf0c81-ab43-48e3-ac07-6d59087788be',
    },
  },
};
