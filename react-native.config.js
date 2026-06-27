/**
 * React Native configuration for RunAnywhere
 *
 * NOTE: automaticPodsInstallation is disabled because the @runanywhere packages
 * use "podspecPath" in their react-native.config.js, which is not allowed by
 * the RN 0.83 CLI. Pods must be installed manually: cd ios && pod install && cd ..
 */
module.exports = {
  project: {
    ios: {
      automaticPodsInstallation: false,
    },
  },
  dependencies: {
    // Disable packages not needed on iOS
    'react-native-sound': {
      platforms: {
        ios: null,
      },
    },
    'react-native-audio-recorder-player': {
      platforms: {
        ios: null,
      },
    },
  },
};
