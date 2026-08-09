import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { keepPreviousData } from '@tanstack/react-query';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StaleBanner } from '@/components/StaleBanner';
import { useColors } from '@/hooks/useColors';
import { useRefreshInterval } from '@/hooks/useRefreshInterval';
import { useStaleBanner } from '@/hooks/useStaleBanner';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useGetRaces, getGetRacesQueryKey } from '@workspace/api-client-react';
import type { Race } from '@workspace/api-client-react';

function QualifiedBadge({ count }: { count: number }) {
  const colors = useColors();
  if (count === 0) return null;
  return (
    <View style={[styles.qualBadge, { backgroundColor: '#002E11' }]}>
      <Feather name="check-circle" size={11} color={colors.primary} />
      <Text style={[styles.qualBadgeText, { color: colors.primary }]}>
        {count} sel{count !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}

function RaceCard({ race }: { race: Race }) {
  const colors = useColors();
  const hasSelections = race.qualifiedCount > 0;

  return (
    <Pressable
      onPress={() => router.push(`/race/${race.id}` as never)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: hasSelections ? colors.primary + '40' : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {/* Left accent bar for races with selections */}
      {hasSelections && (
        <View style={[styles.accentBar, { backgroundColor: colors.primary }]} />
      )}

      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.trackName, { color: colors.foreground }]} numberOfLines={1}>
              {race.trackName}
            </Text>
            {race.raceName ? (
              <Text style={[styles.raceName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {race.raceName}
              </Text>
            ) : null}
          </View>
          <QualifiedBadge count={race.qualifiedCount} />
        </View>

        <View style={styles.cardMeta}>
          <MetaItem icon="hash" value={`R${race.raceNumber}`} colors={colors} />
          <MetaItem icon="users" value={`${race.fieldSize} runners`} colors={colors} />
          {race.distance ? (
            <MetaItem icon="map-pin" value={`${race.distance}m`} colors={colors} />
          ) : null}
          {race.raceTime ? (
            <MetaItem icon="clock" value={race.raceTime} colors={colors} />
          ) : null}
          <MetaItem icon="calendar" value={race.raceDate} colors={colors} />
        </View>
      </View>

      <Feather
        name="chevron-right"
        size={16}
        color={colors.mutedForeground}
        style={styles.chevron}
      />
    </Pressable>
  );
}

function MetaItem({
  icon, value, colors,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.metaItem}>
      <Feather name={icon} size={11} color={colors.mutedForeground} />
      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

function useSecondsAgo(timestamp: number): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  if (timestamp === 0) return '';
  const secs = Math.floor((Date.now() - timestamp) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ago`;
}

export default function RacesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const refetchInterval = useRefreshInterval();

  const {
    data: races,
    isLoading,
    isError,
    refetch,
    isRefetching,
    dataUpdatedAt,
    failureCount,
  } = useGetRaces({ query: { queryKey: getGetRacesQueryKey(), refetchInterval } });
  const updatedLabel = useSecondsAgo(dataUpdatedAt);
  const { showBanner: showStaleBanner, dismiss: dismissStaleBanner } = useStaleBanner(failureCount, isError);

  const isWeb = Platform.OS === 'web';
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  // Group races by date
  const grouped = React.useMemo(() => {
    if (!races) return [];
    const map = new Map<string, Race[]>();
    for (const race of races) {
      const existing = map.get(race.raceDate) ?? [];
      existing.push(race);
      map.set(race.raceDate, existing);
    }
    const entries: { date: string; races: Race[] }[] = [];
    for (const [date, rs] of map.entries()) {
      entries.push({ date, races: rs.sort((a, b) => a.raceNumber - b.raceNumber) });
    }
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  }, [races]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Race Explorer</Text>
          {updatedLabel ? (
            <Text style={[styles.updatedLabel, { color: colors.mutedForeground }]}>
              Updated {updatedLabel}
            </Text>
          ) : null}
        </View>
        {races && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {races.length} upcoming races
          </Text>
        )}
      </View>

      {/* Offline banner — only when errored but cached data is still on-screen */}
      {isError && races ? <OfflineBanner /> : null}
      {/* Stale banner — after several consecutive background-fetch failures */}
      {showStaleBanner ? (
        <StaleBanner onRefresh={refetch} onDismiss={dismissStaleBanner} />
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError && !races ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load races
          </Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.border }]}>
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="flag" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No upcoming races
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.date}
          renderItem={({ item }) => (
            <View>
              <View style={[styles.dateHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                  {item.date}
                </Text>
              </View>
              {item.races.map(race => (
                <RaceCard key={race.id} race={race} />
              ))}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={grouped.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  updatedLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  cardInner: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  trackName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  raceName: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  chevron: { marginRight: 12 },
  qualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  qualBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  dateHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  dateText: { fontFamily: 'Inter_500Medium', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  retryText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
});
