import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * A slim banner shown when a query has errored but cached (stale) data is
 * still being displayed. Keeps punters informed without blanking the screen.
 */
export function OfflineBanner() {
  const colors = useColors();
  return (
    <View style={[styles.banner, { backgroundColor: '#1A1000', borderBottomColor: '#3D2B00' }]}>
      <Feather name="wifi-off" size={13} color="#F59E0B" />
      <Text style={[styles.text, { color: '#F59E0B' }]}>
        Offline — showing last known data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  text: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
});
