import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as Memory from './services/MemoryService';
import { initUsage } from './services/UsageService';
import { initPurchases } from './services/PurchaseService';
import { AppColors, Fonts } from './theme';
import { OnboardingScreen, ChatScreen } from './screens';
import { checkOnboardingDone } from './screens/OnboardingScreen';
import { ErrorBoundary } from './components';
import { RootStackParamList } from './navigation/types';

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  const [initialRoute, setInitialRoute] = useState<'Onboarding' | 'Chat' | null>(null);

  // Satoshi is loaded at runtime via expo-font so the app runs in Expo Go with
  // no native font linking. If loading fails we proceed anyway (system font).
  const [fontsLoaded, fontError] = useFonts({
    'Satoshi-Regular': require('../assets/fonts/Satoshi-Regular.ttf'),
    'Satoshi-Medium': require('../assets/fonts/Satoshi-Medium.ttf'),
    'Satoshi-Bold': require('../assets/fonts/Satoshi-Bold.ttf'),
  });

  useEffect(() => {
    const boot = async () => {
      const [done] = await Promise.all([
        checkOnboardingDone(),
        Memory.init(),
        initUsage(),
        initPurchases(), // no-op in Expo Go / until the RevenueCat key is set
      ]);
      setInitialRoute(done ? 'Chat' : 'Onboarding');
    };
    boot();
  }, []);

  if (!initialRoute || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: AppColors.primaryDark }} />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor={AppColors.primaryDark} />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: AppColors.primaryDark },
              ...TransitionPresets.SlideFromRightIOS,
            }}
          >
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
};

export default App;
