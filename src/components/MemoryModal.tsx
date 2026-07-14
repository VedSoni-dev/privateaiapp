import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { Fonts, useTheme, type AppColorsType } from '../theme';
import * as Memory from '../services/MemoryService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const MemoryModal: React.FC<Props> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  // tick only exists to force a re-render after a mutation below —
  // getFactsByCategory() itself is a cheap synchronous read, no memoization needed.
  const [, setTick] = React.useState(0);
  const groups = Memory.getFactsByCategory();
  const total = groups.reduce((n, g) => n + g.facts.length, 0);

  const forget = (id: string) => {
    void Memory.deleteFact(id).then(() => setTick(t => t + 1));
  };

  const confirmForgetAll = () => {
    Alert.alert('Forget everything?', 'This permanently clears all memories.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => void Memory.clearAll().then(() => setTick(t => t + 1)),
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>What I remember</Text>
            <Text style={styles.subtitle}>
              {total === 0 ? 'Nothing yet' : `${total} ${total === 1 ? 'memory' : 'memories'} — stored only on this device`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        {total === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧠</Text>
            <Text style={styles.emptyText}>
              I haven't learned anything about you yet. As we chat, I'll remember durable
              details — your name, projects, preferences — all stored only on this phone.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            {groups.map(group => (
              <View key={group.category} style={styles.section}>
                <Text style={styles.sectionTitle}>{group.label}</Text>
                {group.facts.map(fact => (
                  <View key={fact.id} style={styles.factRow}>
                    <View style={[styles.strengthDot, fact.fading && styles.strengthDotFading]} />
                    <Text style={[styles.factText, fact.fading && styles.factTextFading]}>
                      {fact.text}
                    </Text>
                    <TouchableOpacity
                      onPress={() => forget(fact.id)}
                      style={styles.forgetBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget: ${fact.text}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.forgetTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}

            <TouchableOpacity
              onPress={confirmForgetAll}
              style={styles.forgetAllBtn}
              accessibilityRole="button"
              accessibilityLabel="Forget everything"
            >
              <Text style={styles.forgetAllTxt}>Forget everything</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors: AppColorsType) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: { fontFamily: Fonts.satoshiBold, fontSize: 22, color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  closeTxt: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 16 },
  emptyText: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  // Strong memories read full-color; ones that have faded (per the forgetting
  // curve) desaturate toward the background rather than just disappearing.
  strengthDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accentCyan,
    marginTop: 6,
  },
  strengthDotFading: { backgroundColor: colors.border },
  factText: { flex: 1, fontSize: 14.5, lineHeight: 21, color: colors.textPrimary },
  factTextFading: { color: colors.textMuted },
  forgetBtn: { paddingHorizontal: 2 },
  forgetTxt: { fontSize: 13, color: colors.textMuted },
  forgetAllBtn: { alignSelf: 'center', paddingVertical: 14, marginTop: 8 },
  forgetAllTxt: { fontSize: 14, color: colors.error, fontWeight: '600' },
});
