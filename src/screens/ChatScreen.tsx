import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  AccessibilityInfo,
} from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, Fonts } from '../theme';
import { ChatMessageBubble, ChatMessage, ThinkingIndicator, PaywallModal, MemoryModal } from '../components';
import { RootStackParamList } from '../navigation/types';
import { prepareTurn, learnInBackground, streamTurn, type LearnedFact } from '../services/AgentService';
import { getPersonalizedSuggestions, type SuggestionChip } from '../services/SuggestionService';
import { getProactiveNudge } from '../services/ProactiveNudgeService';
import { purchasePro, restorePurchases } from '../services/PurchaseService';
import { scheduleQuotaResetReminder } from '../services/NotificationService';
import { addEventToCalendar } from '../services/CalendarService';
import * as LiveActivity from '../services/LiveActivityService';
import * as BackgroundExecution from '../services/BackgroundExecutionService';
import * as SafeHaptics from '../services/HapticsService';
import * as Memory from '../services/MemoryService';
import * as ChatStorage from '../services/ChatStorageService';
import type { ChatSession } from '../services/ChatStorageService';
import { canSendMessage, recordMessage, getUsage, FREE_DAILY_LIMIT, initUsage } from '../services/UsageService';

type ChatScreenProps = {
  navigation: StackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

const PANEL_WIDTH = Math.min(340, Dimensions.get('window').width * 0.85);

// Raw fetch/backend errors ("TypeError: Network request failed", "backend
// chat failed: 502") read as broken/scary to a user. Map the common cases to
// something a person would actually understand; log the raw error for
// debugging instead of surfacing it.
function friendlyErrorText(error: unknown): string {
  const raw = String((error as Error)?.message ?? error);
  console.warn('[Chat] turn failed:', raw);

  if (/network request failed|failed to fetch|internet connection/i.test(raw)) {
    return "Can't reach the server — check your internet connection and try again.";
  }
  if (/\b429\b/.test(raw)) {
    return "You're sending messages a bit fast — wait a few seconds and try again.";
  }
  if (/\b(502|503|504)\b/.test(raw)) {
    return 'The server is waking up or briefly overloaded — try again in a few seconds.';
  }
  if (/timed out|timeout/i.test(raw)) {
    return 'That took too long to respond. Try again.';
  }
  return "Something went wrong on our end. Try again — if it keeps happening, it's not you.";
}

export const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Thinking');
  const [currentResponse, setCurrentResponse] = useState('');
  const [webEnabled, setWebEnabled] = useState(true);
  const [statusText, setStatusText] = useState('');

  const [showPaywall, setShowPaywall] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [remindMeScheduled, setRemindMeScheduled] = useState(false);
  const [usage, setUsage] = useState(getUsage());
  // "Memory moment" — the transparency chip shown when the AI learns a fact.
  const [memoryMoment, setMemoryMoment] = useState<{ kind: 'learned' | 'dreamed' | 'nudge'; ids: string[]; label: string } | null>(null);
  const memoryMomentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [personalChips, setPersonalChips] = useState<SuggestionChip[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
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

  const copyMessageText = async (text: string) => {
    try {
      // Lazily required so older dev-client binaries don't crash on import.
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
    } catch {
      await Share.share({ message: text }).catch(() => {});
    }
  };

  // Native "Add Event" dialog handles the actual date/time picking — these
  // are just a reasonable starting point (tomorrow morning) the user can
  // change freely before saving.
  const addToCalendar = async (text: string) => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const title = text.replace(/\s+/g, ' ').trim().slice(0, 60);

    const result = await addEventToCalendar({ title, notes: text, startDate: start, endDate: end });
    if (result === 'unavailable') {
      Alert.alert('Calendar', "Couldn't add that — check calendar permissions in Settings.");
    }
  };

  // Hand-off from the Share Extension (user shared text/a message from
  // another app). Prefill the input rather than auto-sending — sending
  // still costs a quota message, so let them confirm/edit the question first.
  useEffect(() => {
    const shared = route.params?.sharedText;
    if (!shared) return;
    setInputText(`About this:\n\n"${shared}"\n\n`);
    navigation.setParams({ sharedText: undefined });
  }, [route.params?.sharedText, navigation]);

  useEffect(() => {
    initUsage().then(() => setUsage(getUsage()));
    // Personalized empty-state chips, generated from memory (cached daily).
    getPersonalizedSuggestions().then(chips => { if (chips) setPersonalChips(chips); }).catch(() => {});
    // Slight delay so it doesn't flash in before the user's oriented, and
    // doesn't visually collide with anything else appearing at mount.
    const nudgeTimer = setTimeout(() => {
      getProactiveNudge().then(label => { if (label) showNudge(label); }).catch(() => {});
    }, 1500);
    return () => {
      clearTimeout(nudgeTimer);
      if (memoryMomentTimer.current) clearTimeout(memoryMomentTimer.current);
    };
  }, []);

  const showMemoryMoment = (added: LearnedFact[], dreamed: boolean) => {
    const label = added.length
      ? `Remembered: ${added[0].text}${added.length > 1 ? ` (+${added.length - 1} more)` : ''}`
      : dreamed
        ? 'Tidied up my memories'
        : '';
    if (!label) return;
    setMemoryMoment({ kind: added.length ? 'learned' : 'dreamed', ids: added.map(f => f.id), label });
    AccessibilityInfo.announceForAccessibility(label);
    if (memoryMomentTimer.current) clearTimeout(memoryMomentTimer.current);
    memoryMomentTimer.current = setTimeout(() => setMemoryMoment(null), 8000);
  };

  const showNudge = (label: string) => {
    setMemoryMoment({ kind: 'nudge', ids: [], label });
    AccessibilityInfo.announceForAccessibility(label);
    if (memoryMomentTimer.current) clearTimeout(memoryMomentTimer.current);
    memoryMomentTimer.current = setTimeout(() => setMemoryMoment(null), 10000);
  };

  const forgetMemoryMoment = () => {
    if (memoryMoment) {
      for (const id of memoryMoment.ids) void Memory.deleteFact(id);
    }
    setMemoryMoment(null);
    void SafeHaptics.selection();
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

  // Auto-scroll follows the stream only while the user is near the bottom.
  // If they scroll up to re-read something mid-stream, stop yanking them down;
  // scrolling back to the bottom re-engages following.
  const autoScrollRef = useRef(true);
  const onListScroll = (e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    autoScrollRef.current = distFromBottom < 120;
  };
  const onListContentSizeChange = () => {
    if (autoScrollRef.current) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleSend = async (overrideText?: string, overrideHistory?: ChatMessage[]) => {
    void SafeHaptics.impactLight();
    const text = (overrideText ?? inputText).trim();
    if (!text || (isGenerating && !overrideHistory)) return;

    if (!canSendMessage()) {
      setShowPaywall(true);
      return;
    }

    const userMessage: ChatMessage = {
      text,
      isUser: true,
      timestamp: new Date(),
    };
    const history = overrideHistory ?? messages;
    autoScrollRef.current = true; // sending always snaps focus to the reply
    setMessages([...history, userMessage]);
    setInputText('');
    setIsGenerating(true);
    setIsThinking(true);
    setThinkingLabel('Thinking');
    setCurrentResponse('');
    setStatusText('');
    // Dynamic Island / lock screen progress if the user backgrounds the app,
    // plus the OS-granted grace period so the stream itself survives long
    // enough to actually finish in the background (see BackgroundExecutionService).
    LiveActivity.startAnswerActivity(text);
    void BackgroundExecution.beginBackgroundGrace();

    try {
      const { messages: preparedMessages, toolCalls } = await prepareTurn({
        history,
        userText: text,
        webEnabled,
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
      const hasSearch = toolCalls.some(t => t.tool === 'web_search' && t.found);
      console.log(
        `[Chat] streaming hasSearch=${hasSearch} webEnabled=${webEnabled} history=${history.length}`,
      );

      responseRef.current = '';
      const streamFinal = await streamTurn({
        messages: preparedMessages,
        maxTokens: hasSearch ? 900 : 1400,
        temperature: hasSearch ? 0.3 : 0.7,
        onReady: cancel => {
          streamCancelRef.current = cancel;
        },
        onToken: accumulated => {
          if (!responseRef.current) void SafeHaptics.selection(); // first token tick
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
          .map(tc => ({ tool: tc.tool, query: tc.query, found: tc.found, sources: tc.sources })),
      };
      setMessages(prev => {
        const next = [...prev, assistantMessage];
        // Auto-save session after each completed exchange.
        const session = currentSessionRef.current;
        if (session.title === 'New chat' && userMessage.text) {
          session.title = ChatStorage.autoTitle(text);
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
      // VoiceOver users otherwise get no signal that the reply finished.
      AccessibilityInfo.announceForAccessibility('Response ready');
      void recordMessage().then(() => setUsage(getUsage()));

      void SafeHaptics.notificationSuccess(); // answer-complete thud
      LiveActivity.completeAnswerActivity(replyText);
      void BackgroundExecution.endBackgroundGrace();

      // Learn durable facts from this exchange in the background; surface
      // what was learned as a dismissable "memory moment" chip.
      void learnInBackground(text, replyText, ({ added, dreamed }) => {
        showMemoryMoment(added, dreamed);
      });
    } catch (error) {
      setIsThinking(false);
      setIsGenerating(false);
      setStatusText('');
      // A user-initiated stop rejects the pending streamTurn() with an abort
      // error — handleStop() already appended the cancelled-response bubble,
      // so don't also show a spurious "Error: AbortError" one on top of it.
      const isAbort = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
      LiveActivity.endAnswerActivity(isAbort ? 'cancelled' : 'error');
      const expiredInBackground = BackgroundExecution.didExpireDuringLastTurn();
      void BackgroundExecution.endBackgroundGrace();
      if (isAbort) {
        setCurrentResponse('');
        return;
      }
      // The stream outlasted the OS's background execution grace — an honest,
      // expected limit (see BackgroundExecutionService), not a real failure.
      const errorMessage: ChatMessage = {
        text: expiredInBackground
          ? "That answer was still going when the background time ran out. Reopen the app and ask again — it'll pick up faster with things warmed up."
          : friendlyErrorText(error),
        isUser: false,
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMessage]);
      setCurrentResponse('');
      // Put the failed message back in the input so retry is one tap away.
      setInputText(prev => prev || text);
    }
  };

  const handleStop = (options?: { quiet?: boolean }) => {
    setIsThinking(false);
    void BackgroundExecution.endBackgroundGrace();
    if (streamCancelRef.current) {
      streamCancelRef.current();
      if (responseRef.current && !options?.quiet) {
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

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter(session => {
      const haystack = [
        session.title,
        session.lastMessagePreview || '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [sessionSearch, sessions]);

  function findPreviousUserMessageIndex(fromIndex: number): number {
    for (let i = fromIndex - 1; i >= 0; i -= 1) {
      if (messages[i]?.isUser) return i;
    }
    return -1;
  }

  function handleEditMessage(index: number): void {
    const message = messages[index];
    if (!message?.isUser || !message.text) return;
    if (isGenerating) handleStop({ quiet: true });
    const trimmed = messages.slice(0, index);
    setMessages(trimmed);
    setInputText(message.text);
    setStatusText('Editing previous message');
  }

  function handleResendMessage(index: number): void {
    const message = messages[index];
    if (!message?.isUser || !message.text) return;
    if (isGenerating) handleStop({ quiet: true });
    const trimmed = messages.slice(0, index);
    setMessages(trimmed);
    setInputText('');
    void handleSend(message.text, trimmed);
  }

  function handleRegenerateMessage(index: number): void {
    const message = messages[index];
    if (!message || message.isUser) return;
    const userIndex = findPreviousUserMessageIndex(index);
    if (userIndex < 0) return;
    const userText = messages[userIndex]?.text?.trim();
    if (!userText) return;
    if (isGenerating) handleStop({ quiet: true });
    const trimmed = messages.slice(0, index);
    setMessages(trimmed);
    setInputText('');
    void handleSend(userText, trimmed);
  }

  function handleLongPressMessage(message: ChatMessage, index: number): void {
    if (!message.text) return;
    const buttons = message.isUser
      ? [
          { text: 'Edit', onPress: () => handleEditMessage(index) },
          { text: 'Resend', onPress: () => void handleResendMessage(index) },
          { text: 'Copy', onPress: () => void copyMessageText(message.text) },
          { text: 'Share', onPress: () => { Share.share({ message: message.text }).catch(() => {}); } },
          { text: 'Add to Calendar', onPress: () => void addToCalendar(message.text) },
          { text: 'Cancel', style: 'cancel' as const },
        ]
      : [
          { text: 'Regenerate', onPress: () => void handleRegenerateMessage(index) },
          { text: 'Copy', onPress: () => void copyMessageText(message.text) },
          { text: 'Share', onPress: () => { Share.share({ message: message.text }).catch(() => {}); } },
          { text: 'Add to Calendar', onPress: () => void addToCalendar(message.text) },
          { text: 'Cancel', style: 'cancel' as const },
        ];
    Alert.alert('Message', undefined, buttons);
  }

  const renderMessageItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <ChatMessageBubble
        message={item}
        isStreaming={isGenerating && index === messages.length}
        onLongPress={(message) => handleLongPressMessage(message, index)}
      />
    ),
    [isGenerating, messages.length, handleLongPressMessage],
  );

  const renderSuggestionChip = (icon: string, text: string) => (
    <TouchableOpacity
      key={text}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={styles.suggestionChip}
      onPress={() => { void SafeHaptics.selection(); handleSend(text); }}
      activeOpacity={0.7}
    >
      <Text style={styles.suggestionIcon}>{icon}</Text>
      <Text style={styles.suggestionText}>{text}</Text>
      <Text style={styles.suggestionArrow}>→</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
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
              <Text style={styles.headerSubtitle}>Confidential · Encrypted</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={openMenu} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Settings and chat history">
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
              {personalChips
                ? [
                    ...personalChips.map(c => renderSuggestionChip(c.icon, c.text)),
                    renderSuggestionChip('📰', "What's in the news today?"),
                  ]
                : [
                    renderSuggestionChip('✍️', 'Write a cover letter for a software role'),
                    renderSuggestionChip('📰', "What's in the news today?"),
                    renderSuggestionChip('💡', 'Explain how transformers work in AI'),
                    renderSuggestionChip('🗓️', 'Help me plan my week'),
                  ]}
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
            onScroll={onListScroll}
            scrollEventThrottle={64}
            onContentSizeChange={onListContentSizeChange}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={15}
          />
        )}

        <View style={styles.inputContainer}>
          {memoryMoment && (
            <View style={styles.memoryMomentRow}>
              <Text style={styles.memoryMomentText} numberOfLines={1}>
                {memoryMoment.kind === 'learned' ? '🧠 ' : memoryMoment.kind === 'dreamed' ? '🌙 ' : '💡 '}
                {memoryMoment.label}
              </Text>
              {memoryMoment.ids.length > 0 && (
                <TouchableOpacity
                  onPress={forgetMemoryMoment}
                  accessibilityRole="button"
                  accessibilityLabel="Forget this memory"
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Text style={styles.memoryMomentUndo}>Forget</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setMemoryMoment(null)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              >
                <Text style={styles.memoryMomentDismiss}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          {!!statusText && (
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
            </View>
          )}
          <View style={styles.modeRow}>
            <TouchableOpacity
              onPress={() => setWebEnabled(false)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Private mode, no web search"
              accessibilityState={{ selected: !webEnabled }}
              style={[styles.modeButton, !webEnabled && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, !webEnabled && styles.modeTextActive]}>Private</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWebEnabled(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Web mode, searches the web when helpful"
              accessibilityState={{ selected: webEnabled }}
              style={[styles.modeButton, webEnabled && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, webEnabled && styles.modeTextActive]}>Web</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Message Private AI..."
              placeholderTextColor={AppColors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSend()}
              multiline
              accessibilityLabel="Message input"
            />
            {isGenerating ? (
              <TouchableOpacity
                onPress={() => handleStop()}
                style={styles.stopButton}
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.stopIconText}>⏹</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleSend()}
                disabled={!inputText.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !inputText.trim() }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
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
              <TouchableOpacity
                onPress={() => setShowPaywall(true)}
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Pro"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.upgradeLink}>Upgrade →</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* FTC AI-transparency disclosure — keep visible near the input. */}
          <Text style={styles.aiNotice}>Responses are AI-generated and may be inaccurate.</Text>
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

      <MemoryModal visible={showMemoryModal} onClose={() => setShowMemoryModal(false)} />

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribe={() => {
          void purchasePro().then(result => {
            setUsage(getUsage());
            if (result.ok) {
              setShowPaywall(false);
              void SafeHaptics.notificationSuccess();
              Alert.alert('Welcome to Pro', 'Unlimited messages are now unlocked.');
            } else if (result.message) {
              Alert.alert('Purchase', result.message);
            }
          });
        }}
        onRestore={() => {
          void restorePurchases().then(result => {
            setUsage(getUsage());
            if (result.ok) {
              setShowPaywall(false);
              Alert.alert('Restored', 'Your Pro subscription is active again.');
            } else if (result.message) {
              Alert.alert('Restore', result.message);
            }
          });
        }}
        onRemindMe={() => {
          void scheduleQuotaResetReminder().then(ok => {
            setRemindMeScheduled(ok);
            if (!ok) Alert.alert('Reminders', "Couldn't schedule that — check notification permissions in Settings.");
          });
        }}
        remindMeScheduled={remindMeScheduled}
        messagesUsed={usage.messages}
        limit={usage.limit}
      />

      <Animated.View style={[styles.panel, { transform: [{ translateX: panelX }] }]}>
        <SafeAreaView style={styles.flex1}>
          <ScrollView contentContainerStyle={styles.panelContent}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Settings</Text>
              <TouchableOpacity
                onPress={closeMenu}
                style={styles.panelClose}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
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

            <View style={styles.panelCard}>
              <Text style={styles.switchLabel}>Search chats</Text>
              <View style={styles.searchRow}>
                <TextInput
                  value={sessionSearch}
                  onChangeText={setSessionSearch}
                  placeholder="Title or preview"
                  placeholderTextColor={AppColors.textMuted}
                  style={styles.searchInput}
                />
                {sessionSearch ? (
                  <TouchableOpacity
                    onPress={() => setSessionSearch('')}
                    style={styles.searchClear}
                    accessibilityLabel="Clear chat search"
                  >
                    <Text style={styles.searchClearText}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <Text style={styles.panelSection}>CHAT</Text>
            <TouchableOpacity
              style={[styles.panelRow, styles.panelRowAccent]}
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
              onPress={() => {
                void SafeHaptics.impactLight();
                handleNewChat();
                closeMenu();
              }}
            >
              <Text style={styles.panelRowIcon}>✎</Text>
              <Text style={[styles.panelRowText, { fontWeight: '600' }]}>New chat</Text>
            </TouchableOpacity>

            {filteredSessions.slice(0, 7).map(s => (
              <TouchableOpacity
                key={s.id}
                accessibilityRole="button"
                accessibilityLabel={`Open chat: ${s.title}`}
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
            {filteredSessions.length === 0 && (
              <View style={styles.panelEmptyRow}>
                <Text style={styles.panelEmptyText}>
                  {sessionSearch ? 'No chats match that search.' : 'Your chats will show up here.'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.panelRow}
              accessibilityRole="button"
              accessibilityLabel="What AI remembers about you"
              onPress={() => {
                closeMenu();
                setShowMemoryModal(true);
              }}
            >
              <Text style={styles.panelRowIcon}>🛡️</Text>
              <Text style={styles.panelRowText}>What AI remembers</Text>
            </TouchableOpacity>

            {!usage.isPro && (
              <TouchableOpacity
                style={[styles.panelRow, styles.upgradeRow]}
                accessibilityRole="button"
                accessibilityLabel="Upgrade to Pro"
                onPress={() => { closeMenu(); setShowPaywall(true); }}
              >
                <Text style={styles.panelRowIcon}>✦</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.panelRowText, { fontWeight: '700', color: AppColors.accentCyan }]}>
                    Upgrade to Pro
                  </Text>
                  <Text style={styles.panelRowSub}>
                    Unlimited messages, no daily cap
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
    fontFamily: Fonts.satoshi, fontSize: 17,
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
    fontFamily: Fonts.satoshi, fontSize: 32, lineHeight: 40,
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

  // Compound input row — wraps input + action buttons
  modeRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    backgroundColor: AppColors.surfaceElevated,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
    gap: 2,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  modeButtonActive: {
    backgroundColor: AppColors.surfaceCard,
  },
  modeText: {
    color: AppColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  modeTextActive: {
    color: AppColors.textPrimary,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 14, borderWidth: 1, borderColor: AppColors.border,
    paddingHorizontal: 4, paddingVertical: 4, gap: 2,
  },
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
  aiNotice:     { fontSize: 10.5, color: AppColors.textMuted, textAlign: 'center', marginTop: 3 },

  // ── Memory moment chip ───────────────────────────────────────────
  memoryMomentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    maxWidth: '96%',
    backgroundColor: AppColors.surfaceCard,
    borderColor: AppColors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 8,
    shadowColor: AppColors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  memoryMomentText: { flexShrink: 1, fontSize: 12.5, color: AppColors.textSecondary },
  memoryMomentUndo: { fontSize: 12.5, color: AppColors.accentCyan, fontWeight: '700' },
  memoryMomentDismiss: { fontSize: 12, color: AppColors.textMuted, fontWeight: '600' },

  // ── Backdrop + panel ─────────────────────────────────────────────
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
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
  panelTitle:    { fontFamily: Fonts.satoshi, fontSize: 22, color: AppColors.textPrimary },
  panelClose:    { width: 30, height: 30, borderRadius: 6, backgroundColor: AppColors.surfaceCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.border },
  panelCloseText: { fontSize: 13, color: AppColors.textSecondary, fontWeight: '600' },
  panelCard: {
    backgroundColor: AppColors.surfaceCard, borderRadius: 12,
    borderWidth: 1, borderColor: AppColors.border,
    padding: 14, marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: AppColors.textPrimary,
    fontSize: 14,
  },
  searchClear: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
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
  panelEmptyRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  panelEmptyText: {
    fontSize: 12,
    color: AppColors.textMuted,
    lineHeight: 18,
  },
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
