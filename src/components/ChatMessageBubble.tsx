import React, { memo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { AppColors, Fonts } from '../theme';

export interface ChatSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ChatMessage {
  text: string;
  isUser: boolean;
  timestamp: Date;
  tokensPerSecond?: number;
  totalTokens?: number;
  isError?: boolean;
  wasCancelled?: boolean;
  toolCalls?: Array<{
    tool: string;
    query?: string;
    found: boolean;
    sources?: ChatSource[];
  }>;
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
  heading1: { fontFamily: Fonts.satoshiBold, fontSize: 19, fontWeight: '700', color: AppColors.textPrimary, marginBottom: 8, marginTop: 16 },
  heading2: { fontFamily: Fonts.satoshiBold, fontSize: 16, fontWeight: '600', color: AppColors.textPrimary, marginBottom: 6, marginTop: 12 },
  heading3: { fontFamily: Fonts.satoshiMedium, fontSize: 15, fontWeight: '600', color: AppColors.textSecondary, marginBottom: 4, marginTop: 8 },
  strong: { fontFamily: Fonts.satoshiBold, fontWeight: '700', color: AppColors.textPrimary },
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

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Search',
  memory_recall: 'Memory',
  datetime: 'Time',
};

function domainOf(url = ''): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sourceCountLabel(count: number): string {
  return `${count} source${count === 1 ? '' : 's'}`;
}

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = memo(({
  message, isStreaming = false, onLongPress,
}) => {
  const { text, isUser, tokensPerSecond, totalTokens, isError, wasCancelled, toolCalls } = message;
  const visibleToolCalls = toolCalls?.filter(tc => tc.tool !== 'datetime') ?? [];
  const sources = visibleToolCalls
    .filter(tc => tc.tool === 'web_search' && tc.found)
    .flatMap(tc => tc.sources ?? [])
    .slice(0, 4);

  if (isUser) {
    return (
      <View style={styles.userContainer}>
        <Pressable
          accessibilityLabel={`Your message: ${text}`}
          accessibilityHint="Long press for message actions"
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={300}
          style={({ pressed }) => [styles.userBubble, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.userText}>{text}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint="Long press for message actions"
      onLongPress={() => onLongPress?.(message)}
      delayLongPress={300}
      style={({ pressed }) => [styles.assistantContainer, pressed && { opacity: 0.7 }]}
    >
      {visibleToolCalls.length > 0 && (
        <View style={styles.toolRow}>
          {visibleToolCalls.map((tc, i) => {
            const count = tc.sources?.length || 1;
            return (
              <View key={i} style={[styles.toolPill, !tc.found && styles.toolPillFailed]}>
                <Text style={styles.toolPillIcon}>{TOOL_LABELS[tc.tool] ?? 'Tool'}</Text>
                <Text style={styles.toolPillText} numberOfLines={1}>
                  {tc.tool === 'web_search'
                    ? tc.found ? sourceCountLabel(count) : 'No results'
                    : 'Recalled'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.assistantContent}>
        <Markdown
          style={isError ? { ...mdStyles, body: { ...mdStyles.body, color: AppColors.error } } : mdStyles}
        >
          {text || (isStreaming ? ' ' : '')}
        </Markdown>

        {isStreaming && <View style={styles.streamingCursor} />}

        {wasCancelled && <Text style={styles.cancelledText}>Stopped</Text>}
      </View>

      {sources.length > 0 && (
        <View style={styles.sources}>
          <Text style={styles.sourcesTitle}>Sources</Text>
          {sources.map((source, i) => (
            <View key={`${source.url}-${i}`} style={styles.sourceRow}>
              <Text style={styles.sourceIndex}>{i + 1}</Text>
              <View style={styles.sourceBody}>
                <Text style={styles.sourceTitle} numberOfLines={1}>{source.title}</Text>
                <Text style={styles.sourceDomain} numberOfLines={1}>{domainOf(source.url)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

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
  userContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: AppColors.surfaceElevated,
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: AppColors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  toolPillFailed: { opacity: 0.45 },
  toolPillIcon: {
    fontSize: 10,
    color: AppColors.accentCyan,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  toolPillText: {
    fontSize: 11.5,
    color: AppColors.textMuted,
    fontWeight: '500',
    maxWidth: 220,
  },
  assistantContent: {},
  sources: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    gap: 7,
  },
  sourcesTitle: {
    fontSize: 11,
    color: AppColors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  sourceIndex: {
    width: 18,
    height: 18,
    borderRadius: 5,
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
    backgroundColor: AppColors.surfaceElevated,
    color: AppColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  sourceBody: { flex: 1, minWidth: 0 },
  sourceTitle: {
    fontSize: 12.5,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  sourceDomain: {
    fontSize: 11,
    color: AppColors.textMuted,
    marginTop: 1,
  },
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
