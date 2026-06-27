import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RunAnywhere, SDKEnvironment } from '@runanywhere/core';
import { LlamaCPP } from '@runanywhere/llamacpp';
import { ONNX } from '@runanywhere/onnx';
import { ModelServiceProvider, registerDefaultModels } from './services/ModelService';
import * as Memory from './services/MemoryService';
import { AppColors, Fonts } from './theme';
import {
  ChatScreen,
  SpeechToTextScreen,
  TextToSpeechScreen,
  VoicePipelineScreen,
} from './screens';
import { RootStackParamList } from './navigation/types';

const Stack = createStackNavigator<RootStackParamList>();

const App: React.FC = () => {
  useEffect(() => {
    const initializeSDK = async () => {
      try {
        // Load the on-device long-term memory store (local file, no network).
        Memory.init().catch(() => {});

        await RunAnywhere.initialize({
          environment: SDKEnvironment.Development,
        });

        LlamaCPP.register();
        ONNX.register();
        await registerDefaultModels();

        console.log('Private AI: SDK initialized');
      } catch (error) {
        console.error('Private AI: SDK initialization failed:', error);
      }
    };

    initializeSDK();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ModelServiceProvider>
        <StatusBar barStyle="dark-content" backgroundColor={AppColors.primaryDark} />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Chat"
            screenOptions={{
              headerStyle: {
                backgroundColor: AppColors.primaryDark,
                elevation: 0,
                shadowOpacity: 0,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: AppColors.border,
              },
              headerTintColor: AppColors.accentCyan,
              headerTitleStyle: {
                fontFamily: Fonts.serif,
                fontSize: 18,
                color: AppColors.textPrimary,
              },
              cardStyle: {
                backgroundColor: AppColors.primaryDark,
              },
              ...TransitionPresets.SlideFromRightIOS,
            }}
          >
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="VoicePipeline"
              component={VoicePipelineScreen}
              options={{ title: 'Voice Assistant' }}
            />
            <Stack.Screen
              name="SpeechToText"
              component={SpeechToTextScreen}
              options={{ title: 'Speech to Text' }}
            />
            <Stack.Screen
              name="TextToSpeech"
              component={TextToSpeechScreen}
              options={{ title: 'Text to Speech' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ModelServiceProvider>
    </GestureHandlerRootView>
  );
};

export default App;
