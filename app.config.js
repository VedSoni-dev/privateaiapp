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
    [
      'expo-font',
      {
        fonts: [
          './assets/fonts/Satoshi-Regular.ttf',
          './assets/fonts/Satoshi-Medium.ttf',
          './assets/fonts/Satoshi-Bold.ttf',
        ],
        android: {
          fonts: [
            {
              fontFamily: 'Satoshi',
              fontDefinitions: [
                { path: './assets/fonts/Satoshi-Regular.ttf', weight: 400 },
                { path: './assets/fonts/Satoshi-Medium.ttf', weight: 500 },
                { path: './assets/fonts/Satoshi-Bold.ttf', weight: 700 },
              ],
            },
          ],
        },
      },
    ],
  ],  splash: {
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
