import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { AppColors, Fonts } from '../theme';

export interface ChatMessage {
  text: string;
  isUser: boolean;
  timestamp: Date;
  tokensPerSecond?: number;
  totalTokens?: number;
  isError?: boolean;
  wasCancelled?: boolean;
  toolCalls?: Array<{ tool: string; query?: string; found: boolean }>;
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onLongPress?: (message: ChatMessage) => void;
}

const mdStyles = StyleSheet.create({
  body: {
    color: AppColors.textPrimary,
    fontSize: 15,
    lineHeight: 26,
    fontFamily: Fonts.sans,
  },
  heading1: { fontSize: 19, fontWeight: '700', color: AppColors.textPrimary, marginBottom: 8, marginTop: 16 },
  heading2: { fontSize: 16, fontWeight: '600', color: AppColors.textPrimary, marginBottom: 6, marginTop: 12 },
  heading3: { fontSize: 15, fontWeight: '600', color: AppColors.textSecondary, marginBottom: 4, marginTop: 8 },
  strong: { fontWeight: '600', color: AppColors.textPrimary },
  em: { fontStyle: 'italic', color: AppColors.textSecondary },
  code_inline: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    color: AppColors.accentCyan,
  },
  fence: {
    fontFamily: Fonts.mono,
    fontSize: 12.5,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 8,
    padding: 14,
    marginVertical: 8,
    color: AppColors.textPrimary,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: AppColors.border,
    paddingLeft: 14,
    marginLeft: 0,
    color: AppColors.textMuted,
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 3 },
  bullet_list_icon: { color: AppColors.textMuted, marginRight: 8, fontSize: 15 },
  ordered_list_icon: { color: AppColors.textMuted, marginRight: 8, fontSize: 15 },
  link: { color: AppColors.accentCyan, textDecorationLine: 'underline' },
  hr: { backgroundColor: AppColors.border, height: 1, marginVertical: 12 },
  table: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 6, overflow: 'hidden', marginVertical: 8 },
  th: { backgroundColor: AppColors.surfaceCard, padding: 10, fontWeight: '600', color: AppColors.textPrimary },
  td: { padding: 10, borderTopWidth: 1, borderTopColor: AppColors.border, color: AppColors.textPrimary },
});

const TOOL_ICONS: Record<string, string> = {
  web_search: '🔍',
  memory_recall: '🧠',
  datetime: '🕐',
};

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = memo(({
  message, isStreaming = false, onLongPress,
}) => {
  const { text, isUser, tokensPerSecond, totalTokens, isError, wasCancelled, toolCalls } = message;

  if (isUser) {
    return (
      <View style={styles.userContainer}>
        <Pressable
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={300}
          style={({ pressed }) => [styles.userBubble, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.userText}>{text}</Text>
        </Pressable>
      </View>
    );
  }

  // Assistant — no bubble, flows directly on background (ChatGPT style)
  return (
    <Pressable
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={300}
      style={({ pressed }) => [styles.assistantContainer, pressed && { opacity: 0.7 }]}
    >
      {/* Tool call pills */}
      {toolCalls && toolCalls.filter(tc => tc.tool !== 'datetime').length > 0 && (
        <View style={styles.toolRow}>
          {toolCalls
            .filter(tc => tc.tool !== 'datetime')
            .map((tc, i) => (
              <View key={i} style={[styles.toolPill, !tc.found && styles.toolPillFailed]}>
                <Text style={styles.toolPillIcon}>{TOOL_ICONS[tc.tool] ?? '⚙️'}</Text>
                <Text style={styles.toolPillText} numberOfLines={1}>
                  {tc.tool === 'web_search'
                    ? tc.found ? `Searched "${tc.query}"` : `No results`
                    : 'Memory recalled'}
                </Text>
              </View>
            ))}
        </View>
      )}

      {/* Message content */}
      <View style={styles.assistantContent}>
        <Markdown
          style={isError ? { ...mdStyles, body: { ...mdStyles.body, color: AppColors.error } } : mdStyles}
        >
          {text || (isStreaming ? ' ' : '')}
        </Markdown>

        {isStreaming && (
          <View style={styles.streamingCursor} />
        )}

        {wasCancelled && (
          <Text style={styles.cancelledText}>— stopped</Text>
        )}
      </View>

      {/* Metadata */}
      {!isStreaming && (tokensPerSecond || totalTokens) && (
        <View style={styles.meta}>
          {tokensPerSecond ? (
            <Text style={styles.metaText}>{tokensPerSecond.toFixed(1)} tok/s</Text>
          ) : null}
          {totalTokens ? (
            <Text style={styles.metaText}>{totalTokens} tokens</Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // User — right-aligned zinc card
  userContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 18,
    borderTopRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  userText: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 23,
    color: AppColors.textPrimary,
  },

  // Assistant — no bubble, plain layout
  assistantContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginVertical: 2,
  },
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  toolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: AppColors.surfaceCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  toolPillFailed: { opacity: 0.4 },
  toolPillIcon: { fontSize: 11 },
  toolPillText: {
    fontSize: 11.5,
    color: AppColors.textMuted,
    fontWeight: '500',
    maxWidth: 220,
  },
  assistantContent: {},
  streamingCursor: {
    width: 2,
    height: 16,
    backgroundColor: AppColors.accentCyan,
    borderRadius: 1,
    marginTop: 2,
  },
  cancelledText: {
    fontSize: 12,
    color: AppColors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 0,
  },
  metaText: {
    fontSize: 11,
    color: AppColors.textMuted,
  },
});
