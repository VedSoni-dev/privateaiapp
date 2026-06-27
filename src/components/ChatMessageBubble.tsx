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
}

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onLongPress?: (message: ChatMessage) => void;
}

// Markdown style rules matching the app's ivory/clay palette.
const mdStyles = StyleSheet.create({
  body: {
    color: AppColors.textPrimary,
    fontSize: 15.5,
    lineHeight: 23,
    fontFamily: Fonts.sans,
  },
  heading1: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  heading2: {
    fontSize: 17,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 4,
    marginTop: 8,
  },
  heading3: {
    fontSize: 15.5,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 2,
    marginTop: 6,
  },
  strong: {
    fontWeight: '700',
  },
  em: {
    fontStyle: 'italic',
  },
  code_inline: {
    fontFamily: Fonts.mono,
    fontSize: 13.5,
    backgroundColor: AppColors.borderStrong + '55',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    color: AppColors.accentCyan,
  },
  fence: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    backgroundColor: AppColors.primaryMid,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
    color: AppColors.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.borderStrong,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: AppColors.accentCyan,
    paddingLeft: 12,
    marginLeft: 0,
    opacity: 0.8,
  },
  bullet_list: {
    marginVertical: 2,
  },
  ordered_list: {
    marginVertical: 2,
  },
  list_item: {
    marginVertical: 1,
  },
  bullet_list_icon: {
    color: AppColors.accentCyan,
    marginRight: 6,
    fontSize: 15.5,
  },
  ordered_list_icon: {
    color: AppColors.textSecondary,
    marginRight: 6,
    fontSize: 15.5,
  },
  link: {
    color: AppColors.accentCyan,
    textDecorationLine: 'underline',
  },
  hr: {
    backgroundColor: AppColors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 6,
  },
  th: {
    backgroundColor: AppColors.surfaceCard,
    padding: 8,
    fontWeight: '600',
  },
  td: {
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
});

export const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = memo(({
  message,
  isStreaming = false,
  onLongPress,
}) => {
  const { text, isUser, tokensPerSecond, totalTokens, isError, wasCancelled } = message;

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <Pressable
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={300}
        style={({ pressed }) => [
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          isError && styles.errorBubble,
          pressed && styles.bubblePressed,
        ]}
      >
        {isUser ? (
          <Text
            style={[
              styles.text,
              styles.userText,
            ]}
          >
            {text}
          </Text>
        ) : (
          <Markdown style={isError ? { body: { ...mdStyles.body, color: AppColors.error } } : mdStyles}>
            {text || (isStreaming ? ' ' : '')}
          </Markdown>
        )}

        {!isUser && !isStreaming && (tokensPerSecond || totalTokens) && (
          <View style={styles.metricsContainer}>
            {tokensPerSecond && (
              <Text style={styles.metrics}>
                ⚡ {tokensPerSecond.toFixed(1)} tok/s
              </Text>
            )}
            {totalTokens && (
              <Text style={styles.metrics}>📊 {totalTokens} tokens</Text>
            )}
          </View>
        )}

        {wasCancelled && (
          <Text style={styles.cancelledText}>⚠️ Generation cancelled</Text>
        )}

        {isStreaming && <Text style={styles.streamingIndicator}>▊</Text>}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 5,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 20,
    marginVertical: 2,
  },
  userBubble: {
    backgroundColor: AppColors.accentCyan,
    borderBottomRightRadius: 6,
    shadowColor: AppColors.accentCyan,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 2,
  },
  assistantBubble: {
    backgroundColor: AppColors.surfaceCard,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppColors.border,
  },
  errorBubble: {
    backgroundColor: AppColors.error + '12',
    borderColor: AppColors.error + '44',
  },
  bubblePressed: {
    opacity: 0.7,
  },
  text: {
    fontFamily: Fonts.sans,
    fontSize: 15.5,
    lineHeight: 23,
  },
  userText: {
    color: '#FFFFFF',
  },
  metricsContainer: {
    flexDirection: 'row',
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    gap: 14,
  },
  metrics: {
    fontSize: 11,
    color: AppColors.textMuted,
  },
  cancelledText: {
    fontSize: 11,
    color: AppColors.warning,
    marginTop: 4,
  },
  streamingIndicator: {
    fontSize: 15,
    color: AppColors.accentCyan,
    marginTop: 2,
  },
});
