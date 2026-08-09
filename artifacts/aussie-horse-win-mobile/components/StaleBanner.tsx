import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface StaleBannerProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

/**
 * Shown after several consecutive failed background fetches.
 * Punters can tap anywhere on the banner to trigger a manual refresh,
 * or hit the × to dismiss it until the next failure streak.
 */
export function StaleBanner({ onRefresh, onDismiss }: StaleBannerProps) {
  return (
    <Pressable
      onPress={onRefresh}
      style={({ pressed }) => [
        styles.banner,
        { opacity: pressed ? 0.8 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Data may be stale. Tap to refresh."
    >
      <Feather name="alert-circle" size={13} color="#F59E0B" style={styles.icon} />
      <Text style={styles.text}>Data may be stale — tap to refresh</Text>
      <Pressable
        onPress={e => { e.stopPropagation?.(); onDismiss(); }}
        hitSlop={10}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="Dismiss stale data warning"
      >
        <Feather name="x" size={13} color="#F59E0B" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1000',
    borderBottomWidth: 1,
    borderBottomColor: '#3D2B00',
    paddingHorizontal: 16,
    paddingVertical: 7,
    gap: 6,
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#F59E0B',
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
});
