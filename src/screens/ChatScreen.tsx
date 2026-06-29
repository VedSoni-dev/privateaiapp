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
  Image,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import LinearGradient from 'react-native-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RunAnywhere } from '@runanywhere/core';
import { AppColors, Fonts } from '../theme';
import { useModelService } from '../services/ModelService';
import { ChatMessageBubble, ChatMessage, ModelLoaderWidget, ThinkingIndicator, PaywallModal } from '../components';
import { RootStackParamList } from '../navigation/types';
import { prepareTurn, learnInBackground, streamTurn } from '../services/AgentService';
import * as SafeHaptics from '../services/HapticsService';
import { pickAndExtract, type Attachment } from '../services/AttachmentService';
import * as Memory from '../services/MemoryService';
import * as ChatStorage from '../services/ChatStorageService';
import type { ChatSession } from '../services/ChatStorageService';
import { canSendMessage, recordMessage, getUsage, FREE_DAILY_LIMIT, initUsage } from '../services/UsageService';

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
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Thinking');
  const [currentResponse, setCurrentResponse] = useState('');
  const [webEnabled, setWebEnabled] = useState(true);
  const [statusText, setStatusText] = useState('');

  const [showPaywall, setShowPaywall] = useState(false);
  const [usage, setUsage] = useState(getUsage());
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

  useEffect(() => {
    initUsage().then(() => setUsage(getUsage()));
  }, []);

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
      void SafeHaptics.notificationSuccess();
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
    void SafeHaptics.impactLight();
    const typed = (overrideText ?? inputText).trim();
    const turnAttachments = overrideText ? [] : attachments;
    const hasAttach = turnAttachments.length > 0;
    if ((!typed && !hasAttach) || isGenerating) return;

    if (!canSendMessage()) {
      setShowPaywall(true);
      return;
    }

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
    setIsThinking(true);
    setThinkingLabel(hasAttach ? 'Reading files' : 'Thinking');
    setCurrentResponse('');
    setStatusText('');

    try {
      const { prompt, toolCalls } = await prepareTurn({
        history,
        userText: effectiveUserText,
        webEnabled,
        attachments: turnAttachments,
        onStatus: status => {
          if (status.type === 'searching') {
            setThinkingLabel(`Searching "${status.query}"`);
          } else if (status.type === 'recalling') {
            setThinkingLabel('Recalling memories');
          } else if (status.type === 'compacting') {
            setThinkingLabel('Summarizing context');
          }
        },
      });

      setIsThinking(false);
      void recordMessage().then(() => setUsage(getUsage()));
      const hasSearch = toolCalls.some(t => t.tool === 'web_search' && t.found);
      console.log(
        `[Chat] streaming hasSearch=${hasSearch} webEnabled=${webEnabled} history=${history.length}`,
      );

      responseRef.current = '';
      const streamFinal = await streamTurn({
        prompt,
        maxTokens: hasSearch ? 384 : 768,
        temperature: hasSearch ? 0.3 : 0.7,
        onReady: cancel => {
          streamCancelRef.current = cancel;
        },
        onToken: accumulated => {
          responseRef.current = accumulated;
          setCurrentResponse(accumulated);
        },
      });
      streamCancelRef.current = null;

      const replyText = streamFinal.text;

      const assistantMessage: ChatMessage = {
        text: replyText,
        isUser: false,
        timestamp: new Date(),
        tokensPerSecond: streamFinal.tokensPerSecond,
        totalTokens: streamFinal.totalTokens,
        toolCalls: toolCalls
          .filter(tc => tc.tool !== 'datetime')
          .map(tc => ({ tool: tc.tool, query: tc.query, found: tc.found })),
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
      setIsThinking(false);
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    setIsThinking(false);
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

  const renderSuggestionChip = (icon: string, text: string) => (
    <TouchableOpacity
      key={text}
      style={styles.suggestionChip}
      onPress={() => { void SafeHaptics.selection(); handleSend(text); }}
      activeOpacity={0.7}
    >
      <Text style={styles.suggestionIcon}>{icon}</Text>
      <Text style={styles.suggestionText}>{text}</Text>
      <Text style={styles.suggestionArrow}>→</Text>
    </TouchableOpacity>
  );

  if (!modelService.isLLMLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require('../../assets/shield-48.png')}
              style={styles.logoImage}
              accessibilityLabel="Private AI"
            />
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
      <StatusBar barStyle="light-content" />
      <PanGestureHandler activeOffsetX={[-20, 20]} onHandlerStateChange={onEdgePan}>
        <View style={styles.flex1}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/shield-48.png')}
            style={styles.logoImage}
            accessibilityLabel="Private AI"
          />
          <View>
            <Text style={styles.headerTitle}>Private AI</Text>
            <View style={styles.headerBadgeRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerSubtitle}>On-device · Private</Text>
            </View>
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
            <Image
              source={require('../../assets/shield-96.png')}
              style={styles.emptyMarkImage}
              accessibilityLabel="Private AI"
            />
            <Text style={styles.emptyTitle}>What can I{'\n'}help you with?</Text>
            <View style={styles.suggestionsContainer}>
              {renderSuggestionChip('✍️', 'Write a cover letter for a software role')}
              {renderSuggestionChip('📰', "What's in the news today?")}
              {renderSuggestionChip('💡', 'Explain how transformers work in AI')}
              {renderSuggestionChip('🗓️', 'Help me plan my week')}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[
              ...messages,
              ...(isThinking
                ? [{ text: '__thinking__', isUser: false, timestamp: new Date() }]
                : isGenerating
                ? [{ text: currentResponse || '', isUser: false, timestamp: new Date() }]
                : []),
            ]}
            renderItem={({ item, index }) =>
              item.text === '__thinking__'
                ? <ThinkingIndicator key="thinking" label={thinkingLabel} />
                : renderMessageItem({ item, index })
            }
            keyExtractor={(item, index) => item.text === '__thinking__' ? 'thinking' : index.toString()}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={15}
          />
        )}

        <View style={styles.inputContainer}>
          {!!statusText && (
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
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
          <View style={styles.disclaimerRow}>
            <Text style={styles.disclaimer}>
              {usage.isPro
                ? '✦ Pro · Unlimited'
                : `${usage.remaining} of ${usage.limit} messages left today`}
            </Text>
            {!usage.isPro && (
              <TouchableOpacity onPress={() => setShowPaywall(true)}>
                <Text style={styles.upgradeLink}>Upgrade →</Text>
              </TouchableOpacity>
            )}
          </View>
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

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribe={() => {
          // TODO: wire react-native-iap in next native build
          Alert.alert('Coming soon', 'In-app purchase will be available in the next update.');
        }}
        messagesUsed={usage.messages}
        limit={usage.limit}
      />

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
                void SafeHaptics.impactLight();
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
              <Text style={styles.panelRowIcon}>🛡️</Text>
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

            {!usage.isPro && (
              <TouchableOpacity
                style={[styles.panelRow, styles.upgradeRow]}
                onPress={() => { closeMenu(); setShowPaywall(true); }}
              >
                <Text style={styles.panelRowIcon}>✦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panelRowText, { fontWeight: '700', color: AppColors.accentCyan }]}>
                    Upgrade to Pro
                  </Text>
                  <Text style={styles.panelRowSub}>
                    Unlimited messages · Cloud AI coming soon
                  </Text>
                </View>
                <Text style={[styles.panelChevron, { color: AppColors.accentCyan }]}>›</Text>
              </TouchableOpacity>
            )}

            <View style={styles.panelFooter}>
              <Text style={styles.panelFooterText}>
                {usage.isPro
                  ? '✦ Pro — unlimited messages. Thank you!'
                  : `Free plan · ${usage.remaining}/${usage.limit} messages left today`}
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: AppColors.primaryDark },
  flex1:     { flex: 1 },
  container: { flex: 1, backgroundColor: AppColors.primaryDark },

  // ── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: AppColors.border,
    backgroundColor: AppColors.primaryDark,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoImage:  { width: 32, height: 32, borderRadius: 8 },
  headerTitle: {
    fontFamily: Fonts.serif, fontSize: 17,
    color: AppColors.textPrimary, letterSpacing: 0.1,
  },
  headerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: AppColors.accentGreen },
  headerSubtitle: { fontSize: 11, color: AppColors.textMuted, letterSpacing: 0.1 },
  menuButton: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: AppColors.surfaceCard,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: AppColors.border,
  },
  menuGlyph: { alignItems: 'flex-end', gap: 3 },
  menuLine:  { height: 1.5, borderRadius: 1, backgroundColor: AppColors.textSecondary },

  // ── Message list ─────────────────────────────────────────────────
  messageList: { paddingTop: 16, paddingBottom: 8 },

  // ── Empty state ──────────────────────────────────────────────────
  emptyState: {
    flex: 1, justifyContent: 'flex-end',
    paddingHorizontal: 20, paddingBottom: 24,
  },
  emptyMarkImage: { width: 48, height: 48, borderRadius: 12, marginBottom: 20 },
  emptyTitle: {
    fontFamily: Fonts.serif, fontSize: 32, lineHeight: 40,
    color: AppColors.textPrimary, marginBottom: 24, letterSpacing: 0.1,
  },
  suggestionsContainer: { width: '100%', gap: 8 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 10, borderWidth: 1, borderColor: AppColors.border,
  },
  suggestionIcon:  { fontSize: 15, marginRight: 11 },
  suggestionText:  { fontSize: 14, color: AppColors.textSecondary, flex: 1, lineHeight: 20 },
  suggestionArrow: { fontSize: 13, color: AppColors.textMuted, marginLeft: 8 },

  // ── Input area ───────────────────────────────────────────────────
  inputContainer: {
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10,
    backgroundColor: AppColors.primaryDark,
    borderTopWidth: 1, borderTopColor: AppColors.border,
  },
  statusRow: {
    paddingHorizontal: 4, paddingBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  statusDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: AppColors.accentCyan },
  statusText: { fontSize: 12, color: AppColors.accentCyan, fontWeight: '500' },
  attachRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 8, paddingHorizontal: 2 },
  attachChip: {
    flexDirection: 'row', alignItems: 'center',
    maxWidth: 220, paddingLeft: 10, paddingRight: 8, paddingVertical: 6,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, gap: 6,
  },
  attachChipError: { borderColor: AppColors.error + '44' },
  attachChipIcon:  { fontSize: 13 },
  attachChipName:  { flexShrink: 1, fontSize: 12.5, color: AppColors.textPrimary },
  attachChipX:     { fontSize: 11, color: AppColors.textMuted, paddingHorizontal: 2 },

  // Compound input row — wraps input + action buttons
  inputWrapper: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 14, borderWidth: 1, borderColor: AppColors.border,
    paddingHorizontal: 4, paddingVertical: 4, gap: 2,
  },
  attachButton: {
    width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  attachIcon: { fontSize: 20, color: AppColors.textMuted },
  globeButton: {
    width: 36, height: 36, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  globeButtonActive: { backgroundColor: AppColors.accentCyan + '18' },
  globeIcon: { fontSize: 17 },
  input: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 9 : 7,
    paddingBottom: Platform.OS === 'ios' ? 9 : 7,
    fontSize: 15.5, color: AppColors.textPrimary,
    maxHeight: 130, minHeight: 36,
  },
  sendButton: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: AppColors.accentCyan,
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.3 },
  sendIcon: { fontSize: 17, fontWeight: '700', color: '#fff' },
  stopButton: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: AppColors.surfaceCard,
    borderWidth: 1, borderColor: AppColors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  stopIconText: { fontSize: 14, color: AppColors.textSecondary },

  disclaimerRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, marginTop: 7,
  },
  disclaimer:   { fontSize: 11, color: AppColors.textMuted },
  upgradeLink:  { fontSize: 11, color: AppColors.accentCyan, fontWeight: '600' },

  // ── Backdrop + panel ─────────────────────────────────────────────
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: {
    position: 'absolute', top: 0, bottom: 0, right: 0,
    width: PANEL_WIDTH,
    backgroundColor: AppColors.primaryMid,
    borderLeftWidth: 1, borderLeftColor: AppColors.border,
    shadowColor: '#000', shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 24, elevation: 20,
  },
  panelContent:  { paddingHorizontal: 16, paddingBottom: 36 },
  panelHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 16 },
  panelTitle:    { fontFamily: Fonts.serif, fontSize: 22, color: AppColors.textPrimary },
  panelClose:    { width: 30, height: 30, borderRadius: 6, backgroundColor: AppColors.surfaceCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.border },
  panelCloseText: { fontSize: 13, color: AppColors.textSecondary, fontWeight: '600' },
  panelCard: {
    backgroundColor: AppColors.surfaceCard, borderRadius: 12,
    borderWidth: 1, borderColor: AppColors.border,
    padding: 14, marginBottom: 8,
  },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchTextWrap: { flex: 1 },
  switchLabel:   { fontSize: 15, fontWeight: '600', color: AppColors.textPrimary, marginBottom: 2 },
  switchSub:     { fontSize: 12, color: AppColors.textMuted, lineHeight: 16 },
  panelSection:  { fontSize: 11, fontWeight: '700', color: AppColors.textMuted, letterSpacing: 1, marginTop: 20, marginBottom: 6, marginLeft: 2 },
  panelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 10, borderWidth: 1, borderColor: AppColors.border, marginBottom: 6,
  },
  panelRowAccent: { borderColor: AppColors.accentCyan + '33', backgroundColor: AppColors.accentCyan + '08' },
  panelRowActive: { borderColor: AppColors.accentCyan + '66', backgroundColor: AppColors.accentCyan + '12' },
  panelRowSub:    { fontSize: 11, color: AppColors.textMuted, marginTop: 1 },
  panelRowIcon:   { fontSize: 15, width: 24 },
  panelRowText:   { flex: 1, fontSize: 14.5, color: AppColors.textPrimary },
  panelChevron:   { fontSize: 18, color: AppColors.textMuted, marginLeft: 6 },
  upgradeRow:     { borderColor: AppColors.accentCyan + '44', backgroundColor: AppColors.accentCyan + '0A', marginBottom: 6 },

  apiBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  apiBadgeOn:    { backgroundColor: AppColors.accentGreen + '22' },
  apiBadgeOff:   { backgroundColor: AppColors.accentOrange + '22' },
  apiBadgeText:  { fontSize: 9, fontWeight: '800', color: AppColors.textMuted, letterSpacing: 0.6 },
  apiInputRow:   { flexDirection: 'row', gap: 8, marginTop: 10 },
  apiInput: {
    flex: 1, backgroundColor: AppColors.primaryDark, borderRadius: 8,
    paddingHorizontal: 11, paddingVertical: 8, fontSize: 13,
    color: AppColors.textPrimary, borderWidth: 1, borderColor: AppColors.border,
  },
  apiSaveBtn:     { backgroundColor: AppColors.accentCyan, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  apiSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  panelFooter:    { marginTop: 20, padding: 12, backgroundColor: AppColors.surfaceCard, borderRadius: 10, borderWidth: 1, borderColor: AppColors.border },
  panelFooterText: { fontSize: 11.5, color: AppColors.textMuted, textAlign: 'center', lineHeight: 17 },
});
