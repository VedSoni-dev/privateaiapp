import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  SafeAreaView,
  Alert,
  Animated,
  Switch,
  Share,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RunAnywhere } from '@runanywhere/core';
import { AppColors, Fonts } from '../theme';
import { useModelService } from '../services/ModelService';
import { ChatMessageBubble, ChatMessage, ModelLoaderWidget } from '../components';
import { RootStackParamList } from '../navigation/types';
import { prepareTurn, learnInBackground } from '../services/AgentService';
import * as Haptics from 'expo-haptics';
import { pickAndExtract, type Attachment } from '../services/AttachmentService';
import * as Memory from '../services/MemoryService';
import * as ChatStorage from '../services/ChatStorageService';
import type { ChatSession } from '../services/ChatStorageService';

type ChatScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Chat'>;
};

const PANEL_WIDTH = Math.min(340, Dimensions.get('window').width * 0.85);

export const ChatScreen: React.FC<ChatScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const modelService = useModelService();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [webEnabled, setWebEnabled] = useState(true);
  const [statusText, setStatusText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const currentSessionRef = useRef<ChatStorage.ChatSessionFull>(ChatStorage.createSession());
  const flatListRef = useRef<FlatList>(null);
  const streamCancelRef = useRef<(() => void) | null>(null);
  const responseRef = useRef('');
  const panelX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(panelX, {
        toValue: menuOpen ? 0 : PANEL_WIDTH,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: menuOpen ? 1 : 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [menuOpen, panelX, backdropOpacity]);

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const onEdgePan = (e: { nativeEvent: { state: number; translationX: number } }) => {
    if (e.nativeEvent.state === State.END && e.nativeEvent.translationX < -45) {
      openMenu();
    }
  };

  const handleLongPressMessage = (m: ChatMessage) => {
    if (!m.text) return;
    Alert.alert('Message', undefined, [
      {
        text: 'Copy',
        onPress: () => {
          try {
            // Lazily required so older dev-client binaries don't crash on import.
            const Clipboard = require('expo-clipboard');
            void Clipboard.setStringAsync(m.text);
          } catch {
            Share.share({ message: m.text }).catch(() => {});
          }
        },
      },
      {
        text: 'Share',
        onPress: () => {
          Share.share({ message: m.text }).catch(() => {});
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleAttach = async () => {
    if (isAttaching) return;
    try {
      setIsAttaching(true);
      const picked = await pickAndExtract();
      if (picked.length) {
        setAttachments(prev => [...prev, ...picked]);
        const failed = picked.filter(p => p.error);
        if (failed.length) {
          Alert.alert(
            "Couldn't read some files",
            failed.map(f => `• ${f.name}: ${f.error}`).join('\n'),
          );
        }
      }
    } catch (e) {
      Alert.alert('Attach failed', String(e));
    } finally {
      setIsAttaching(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Load session list and restore the most recent session on mount.
  useEffect(() => {
    ChatStorage.loadSessions().then(async saved => {
      setSessions(saved);
      if (saved.length > 0) {
        const full = await ChatStorage.loadSession(saved[0].id);
        if (full && full.messages.length > 0) {
          currentSessionRef.current = full;
          setMessages(full.messages);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!modelService.isLLMLoaded && !modelService.isLLMDownloading && !modelService.isLLMLoading) {
      modelService.downloadAndLoadLLM();
    }
  }, [modelService]);

  useEffect(() => {
    if (modelService.isLLMLoaded) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [modelService.isLLMLoaded]);

  useEffect(() => {
    if (messages.length > 0 || currentResponse) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, currentResponse]);

  const handleSend = async (overrideText?: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const typed = (overrideText ?? inputText).trim();
    const turnAttachments = overrideText ? [] : attachments;
    const hasAttach = turnAttachments.length > 0;
    if ((!typed && !hasAttach) || isGenerating) return;

    const effectiveUserText =
      typed || 'Please read the attached file(s) and summarize the key points.';
    const displayText = hasAttach
      ? `${typed ? typed + '\n\n' : ''}${turnAttachments
          .map(a => `📎 ${a.name}`)
          .join('\n')}`
      : typed;

    const userMessage: ChatMessage = {
      text: displayText,
      isUser: true,
      timestamp: new Date(),
    };
    const history = messages;
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setAttachments([]);
    setIsGenerating(true);
    setCurrentResponse('');
    setStatusText(hasAttach ? 'Reading attachments…' : webEnabled ? 'Thinking…' : '');

    try {
      const { prompt, searchedQuery } = await prepareTurn({
        history,
        userText: effectiveUserText,
        webEnabled,
        attachments: turnAttachments,
        onStatus: status => {
          if (status.type === 'searching') {
            setStatusText(`Searching the web for "${status.query}"…`);
          } else if (status.type === 'compacting') {
            setStatusText('Summarizing earlier messages…');
          }
        },
      });

      setStatusText('');
      const streamResult = await RunAnywhere.generateStream(prompt, {
        maxTokens: searchedQuery ? 1024 : 1536,
        temperature: searchedQuery ? 0.3 : 0.7,
      });

      streamCancelRef.current = streamResult.cancel;
      responseRef.current = '';

      for await (const token of streamResult.stream) {
        responseRef.current += token;
        setCurrentResponse(responseRef.current);
      }

      const finalResult = await streamResult.result;
      const replyText = responseRef.current;

      const assistantMessage: ChatMessage = {
        text: replyText,
        isUser: false,
        timestamp: new Date(),
        tokensPerSecond: finalResult.tokensPerSecond,
        totalTokens: finalResult.tokensUsed,
      };
      setMessages(prev => {
        const next = [...prev, assistantMessage];
        // Auto-save session after each completed exchange.
        const session = currentSessionRef.current;
        if (session.title === 'New chat' && userMessage.text) {
          session.title = ChatStorage.autoTitle(effectiveUserText);
        }
        session.messages = next;
        session.updatedAt = Date.now();
        session.messageCount = next.length;
        void ChatStorage.saveSession(session).then(() => {
          ChatStorage.loadSessions().then(s => setSessions(s)).catch(() => {});
        });
        return next;
      });
      setCurrentResponse('');
      responseRef.current = '';
      setIsGenerating(false);

      // Learn durable facts from this exchange in the background.
      void learnInBackground(effectiveUserText, replyText);
    } catch (error) {
      const errorMessage: ChatMessage = {
        text: `Error: ${error}`,
        isUser: false,
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
      setCurrentResponse('');
      setStatusText('');
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    if (streamCancelRef.current) {
      streamCancelRef.current();
      if (responseRef.current) {
        const message: ChatMessage = {
          text: responseRef.current,
          isUser: false,
          timestamp: new Date(),
          wasCancelled: true,
        };
        setMessages(prev => [...prev, message]);
      }
      setCurrentResponse('');
      responseRef.current = '';
      setStatusText('');
      setIsGenerating(false);
    }
  };

  const showMemory = async () => {
    const facts = Memory.getFacts();
    if (facts.length === 0) {
      Alert.alert(
        'Memory',
        "I haven't learned anything about you yet. As we chat, I'll remember durable details (your name, projects, preferences) — all stored only on this phone.",
      );
      return;
    }
    const list = facts
      .slice(0, 20)
      .map(f => `• ${f.text}`)
      .join('\n');
    Alert.alert(
      `Memory (${facts.length})`,
      `What I remember about you — stored only on this device:\n\n${list}`,
      [
        { text: 'Close', style: 'cancel' },
        {
          text: 'Forget everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Forget everything?', 'This permanently clears all memories.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Forget',
                style: 'destructive',
                onPress: () => {
                  void Memory.clearAll();
                },
              },
            ]);
          },
        },
      ],
    );
  };

  const handleNewChat = () => {
    if (isGenerating) {
      handleStop();
    }
    currentSessionRef.current = ChatStorage.createSession();
    setMessages([]);
    setInputText('');
    setCurrentResponse('');
  };

  const handleSwitchSession = async (id: string) => {
    if (isGenerating) handleStop();
    const full = await ChatStorage.loadSession(id);
    if (full) {
      currentSessionRef.current = full;
      setMessages(full.messages);
    }
    closeMenu();
  };

  const renderMessageItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <ChatMessageBubble
        message={item}
        isStreaming={isGenerating && index === messages.length}
        onLongPress={handleLongPressMessage}
      />
    ),
    [isGenerating, messages.length, handleLongPressMessage],
  );

  const go = (screen: 'VoicePipeline' | 'SpeechToText' | 'TextToSpeech') => {
    closeMenu();
    navigation.navigate(screen);
  };

  const renderSuggestionChip = (text: string) => (
    <TouchableOpacity
      key={text}
      style={styles.suggestionChip}
      onPress={() => { void Haptics.selectionAsync(); handleSend(text); }}
      activeOpacity={0.7}
    >
      <Text style={styles.suggestionText}>{text}</Text>
      <Text style={styles.suggestionArrow}>→</Text>
    </TouchableOpacity>
  );

  if (!modelService.isLLMLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={[AppColors.accentViolet, AppColors.accentCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Text style={styles.logoText}>✦</Text>
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>Private AI</Text>
              <Text style={styles.headerSubtitle}>100% on your device</Text>
            </View>
          </View>
        </View>
        <ModelLoaderWidget
          title="Setting up your private AI"
          subtitle="Downloading the Qwen2.5 3B language model (~1.9GB). This only happens once — Wi-Fi recommended."
          icon="chat"
          accentColor={AppColors.accentCyan}
          isDownloading={modelService.isLLMDownloading}
          isLoading={modelService.isLLMLoading}
          progress={modelService.llmDownloadProgress}
          onLoad={modelService.downloadAndLoadLLM}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <PanGestureHandler activeOffsetX={[-20, 20]} onHandlerStateChange={onEdgePan}>
        <View style={styles.flex1}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <LinearGradient
            colors={[AppColors.accentViolet, AppColors.accentCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoBadge}
          >
            <Text style={styles.logoText}>✦</Text>
          </LinearGradient>
          <View>
            <Text style={styles.headerTitle}>Private AI</Text>
            <Text style={styles.headerSubtitle}>On-device · Offline · Private</Text>
          </View>
        </View>
        <TouchableOpacity onPress={openMenu} style={styles.menuButton} accessibilityLabel="Settings">
          <View style={styles.menuGlyph}>
            <View style={[styles.menuLine, { width: 16 }]} />
            <View style={[styles.menuLine, { width: 11 }]} />
            <View style={[styles.menuLine, { width: 14 }]} />
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={[AppColors.accentViolet, AppColors.accentCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyMark}
            >
              <Text style={styles.emptyMarkText}>✦</Text>
            </LinearGradient>
            <Text style={styles.emptyTitle}>How can I help you?</Text>
            <Text style={styles.emptySubtitle}>
              Your conversations never leave this phone.{'\n'}
              No account. No cloud. Just you and your AI.
            </Text>
            <View style={styles.suggestionsContainer}>
              {renderSuggestionChip('Explain quantum computing simply')}
              {renderSuggestionChip('Help me plan my day')}
              {renderSuggestionChip('Write a short poem about privacy')}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[
              ...messages,
              ...(isGenerating
                ? [{ text: currentResponse || '...', isUser: false, timestamp: new Date() }]
                : []),
            ]}
            renderItem={renderMessageItem}
            keyExtractor={(_, index) => index.toString()}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={15}
          />
        )}

        <View style={styles.inputContainer}>
          {(statusText || webEnabled) && (
            <View style={styles.statusRow}>
              <Text style={styles.statusText} numberOfLines={1}>
                {statusText || '🌐 Web search on — recent info enabled'}
              </Text>
            </View>
          )}
          {attachments.length > 0 && (
            <View style={styles.attachRow}>
              {attachments.map(a => (
                <View
                  key={a.id}
                  style={[styles.attachChip, !!a.error && styles.attachChipError]}
                >
                  <Text style={styles.attachChipIcon}>
                    {a.error ? '⚠️' : a.kind === 'pdf' ? '📄' : '📃'}
                  </Text>
                  <Text style={styles.attachChipName} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeAttachment(a.id)} hitSlop={8}>
                    <Text style={styles.attachChipX}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.inputWrapper}>
            <TouchableOpacity
              onPress={handleAttach}
              disabled={isGenerating || isAttaching}
              style={styles.attachButton}
              accessibilityLabel="Attach file"
            >
              <Text style={styles.attachIcon}>{isAttaching ? '…' : '+'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWebEnabled(prev => !prev)}
              style={[styles.globeButton, webEnabled && styles.globeButtonActive]}
            >
              <Text style={styles.globeIcon}>🌐</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message Private AI..."
              placeholderTextColor={AppColors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSend()}
              editable={!isGenerating}
              multiline
            />
            {isGenerating ? (
              <TouchableOpacity onPress={handleStop} style={styles.stopButton}>
                <Text style={styles.stopIconText}>⏹</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => handleSend()} disabled={!inputText.trim()}>
                <LinearGradient
                  colors={[AppColors.accentCyan, AppColors.accentViolet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                >
                  <Text style={styles.sendIcon}>↑</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.disclaimer}>
            Private AI runs locally on your device. Responses may be inaccurate.
          </Text>
        </View>
      </KeyboardAvoidingView>
        </View>
      </PanGestureHandler>

      <Animated.View
        pointerEvents={menuOpen ? 'auto' : 'none'}
        style={[styles.backdrop, { opacity: backdropOpacity }]}
      >
        <Pressable style={styles.flex1} onPress={closeMenu} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX: panelX }] }]}>
        <SafeAreaView style={styles.flex1}>
          <ScrollView contentContainerStyle={styles.panelContent}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Settings</Text>
              <TouchableOpacity onPress={closeMenu} style={styles.panelClose}>
                <Text style={styles.panelCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panelCard}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchLabel}>Web search</Text>
                  <Text style={styles.switchSub}>
                    Look up recent info (news, scores, prices). Only the query leaves your phone.
                  </Text>
                </View>
                <Switch
                  value={webEnabled}
                  onValueChange={setWebEnabled}
                  trackColor={{ false: AppColors.borderStrong, true: AppColors.accentCyan }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={AppColors.borderStrong}
                />
              </View>
            </View>

            <Text style={styles.panelSection}>CHAT</Text>
            <TouchableOpacity
              style={[styles.panelRow, styles.panelRowAccent]}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleNewChat();
                closeMenu();
              }}
            >
              <Text style={styles.panelRowIcon}>✎</Text>
              <Text style={[styles.panelRowText, { fontWeight: '600' }]}>New chat</Text>
            </TouchableOpacity>

            {sessions.slice(0, 7).map(s => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.panelRow,
                  s.id === currentSessionRef.current.id && styles.panelRowActive,
                ]}
                onPress={() => { void handleSwitchSession(s.id); }}
              >
                <Text style={styles.panelRowIcon}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.panelRowText} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.panelRowSub} numberOfLines={1}>
                    {s.messageCount} messages · {new Date(s.updatedAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.panelChevron}>›</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.panelRow}
              onPress={() => {
                closeMenu();
                showMemory();
              }}
            >
              <Text style={styles.panelRowIcon}>✦</Text>
              <Text style={styles.panelRowText}>What AI remembers</Text>
            </TouchableOpacity>

            <Text style={styles.panelSection}>VOICE & SPEECH</Text>
            <TouchableOpacity style={styles.panelRow} onPress={() => go('VoicePipeline')}>
              <Text style={styles.panelRowIcon}>🎙</Text>
              <Text style={styles.panelRowText}>Voice assistant</Text>
              <Text style={styles.panelChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.panelRow} onPress={() => go('SpeechToText')}>
              <Text style={styles.panelRowIcon}>🎤</Text>
              <Text style={styles.panelRowText}>Speech to text</Text>
              <Text style={styles.panelChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.panelRow} onPress={() => go('TextToSpeech')}>
              <Text style={styles.panelRowIcon}>🔊</Text>
              <Text style={styles.panelRowText}>Text to speech</Text>
              <Text style={styles.panelChevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.panelFooter}>
              <Text style={styles.panelFooterText}>
                🔒 Everything runs on-device. No account, no cloud inference.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.primaryDark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 3,
  },
  logoText: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: -1,
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    color: AppColors.textPrimary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: AppColors.textMuted,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  menuGlyph: {
    alignItems: 'flex-end',
    gap: 3,
  },
  menuLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: AppColors.textSecondary,
  },
  flex1: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: AppColors.primaryDark,
  },
  messageList: {
    paddingVertical: 18,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  emptyMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 5,
  },
  emptyMarkText: {
    fontSize: 26,
    color: '#FFFFFF',
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    color: AppColors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  emptySubtitle: {
    fontSize: 14.5,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: AppColors.surfaceElevated,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
    shadowColor: '#1A1916',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  suggestionText: {
    fontSize: 14.5,
    color: AppColors.textPrimary,
    flex: 1,
  },
  suggestionArrow: {
    fontSize: 15,
    color: AppColors.accentCyan,
    marginLeft: 12,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: AppColors.primaryDark,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  statusRow: {
    paddingHorizontal: 6,
    paddingBottom: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: AppColors.accentCyan,
    fontWeight: '500',
  },
  globeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  globeButtonActive: {
    backgroundColor: AppColors.accentCyan + '1A',
    borderColor: AppColors.accentCyan,
  },
  globeIcon: {
    fontSize: 18,
  },
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  attachIcon: {
    fontSize: 24,
    color: AppColors.textSecondary,
    marginTop: -2,
  },
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 220,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 7,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.borderStrong,
    gap: 7,
  },
  attachChipError: {
    backgroundColor: AppColors.error + '12',
    borderColor: AppColors.error + '55',
  },
  attachChipIcon: {
    fontSize: 14,
  },
  attachChipName: {
    flexShrink: 1,
    fontSize: 13,
    color: AppColors.textPrimary,
  },
  attachChipX: {
    fontSize: 12,
    color: AppColors.textMuted,
    paddingHorizontal: 2,
  },
  input: {
    flex: 1,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 11 : 8,
    paddingBottom: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 16,
    color: AppColors.textPrimary,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.borderStrong,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  sendButtonDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
  },
  sendIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stopButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppColors.error + '14',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.error + '55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIconText: {
    fontSize: 16,
    color: AppColors.error,
  },
  disclaimer: {
    fontSize: 11,
    color: AppColors.textMuted,
    textAlign: 'center',
    marginTop: 11,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,25,22,0.32)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: PANEL_WIDTH,
    backgroundColor: AppColors.primaryDark,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: AppColors.border,
    shadowColor: '#1A1916',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 16,
  },
  panelContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 18,
  },
  panelTitle: {
    fontFamily: Fonts.serif,
    fontSize: 26,
    color: AppColors.textPrimary,
    letterSpacing: 0.2,
  },
  panelClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppColors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  panelCloseText: {
    fontSize: 14,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  panelCard: {
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
    padding: 16,
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchTextWrap: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 3,
  },
  switchSub: {
    fontSize: 12.5,
    color: AppColors.textSecondary,
    lineHeight: 17,
  },
  panelSection: {
    fontSize: 11.5,
    fontWeight: '700',
    color: AppColors.textMuted,
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: AppColors.surfaceElevated,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
    marginBottom: 8,
  },
  panelRowAccent: {
    borderColor: AppColors.accentCyan + '55',
    backgroundColor: AppColors.accentCyan + '0C',
  },
  panelRowActive: {
    borderColor: AppColors.accentCyan,
    backgroundColor: AppColors.accentCyan + '14',
  },
  panelRowSub: {
    fontSize: 11.5,
    color: AppColors.textMuted,
    marginTop: 2,
  },
  panelRowIcon: {
    fontSize: 16,
    width: 26,
    color: AppColors.accentCyan,
  },
  panelRowText: {
    flex: 1,
    fontSize: 15.5,
    color: AppColors.textPrimary,
  },
  panelChevron: {
    fontSize: 20,
    color: AppColors.textMuted,
    marginLeft: 8,
  },
  panelFooter: {
    marginTop: 24,
    padding: 14,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  panelFooterText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
