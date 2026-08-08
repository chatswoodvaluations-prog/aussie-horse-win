import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetNominations, useGetNominationsSummary } from '@workspace/api-client-react';
import type { Nomination } from '@workspace/api-client-react';

type StatusFilter = 'All' | 'Pending' | 'Won' | 'Placed' | 'Unplaced';
const STATUS_FILTERS: StatusFilter[] = ['All', 'Pending', 'Won', 'Placed', 'Unplaced'];

function StatusBadge({ status }: { status: Nomination['status'] }) {
  const colors = useColors();
  const badgeColors: Record<Nomination['status'], { bg: string; text: string }> = {
    Pending: { bg: colors.secondary, text: colors.mutedForeground },
    Won:     { bg: '#002E11', text: colors.primary },
    Placed:  { bg: '#1A2E00', text: '#A3E635' },
    Unplaced: { bg: '#2A0A0A', text: colors.destructive },
  };
  const c = badgeColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{status}</Text>
    </View>
  );
}

function NominationCard({ item }: { item: Nomination }) {
  const colors = useColors();
  const isPending = item.status === 'Pending';
  const net = item.status === 'Won'
    ? item.projectedWinReturn - item.totalOutlay
    : item.status === 'Placed'
    ? item.projectedPlaceReturn - item.totalOutlay
    : -item.totalOutlay;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.horseName, { color: colors.foreground }]} numberOfLines={1}>
            {item.horseName}
          </Text>
          <Text style={[styles.raceInfo, { color: colors.mutedForeground }]}>
            {item.trackName} · R{item.raceNumber} · {item.raceDate}
          </Text>
        </View>
        <StatusBadge status={item.status} />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.cardStats}>
        <StatItem label="Win" value={`$${item.winOdds.toFixed(1)}`} colors={colors} />
        <StatItem label="Place" value={`$${item.placeOdds.toFixed(1)}`} colors={colors} />
        <StatItem label="Barrier" value={`${item.barrierNumber}`} colors={colors} />
        <StatItem label="Outlay" value={`$${item.totalOutlay.toFixed(0)}`} colors={colors} />
        {!isPending && (
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Net</Text>
            <Text style={[
              styles.statValue,
              { color: net >= 0 ? colors.primary : colors.destructive, fontFamily: 'Inter_700Bold' },
            ]}>
              {net >= 0 ? '+' : ''}{net.toFixed(0)}
            </Text>
          </View>
        )}
      </View>

      {item.speedMapPosition ? (
        <View style={[styles.posTag, { backgroundColor: colors.muted }]}>
          <Text style={[styles.posTagText, { color: colors.mutedForeground }]}>
            {item.speedMapPosition}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StatItem({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function SelectionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<StatusFilter>('All');

  const { data: nominations, isLoading, isError, refetch, isRefetching } = useGetNominations();
  const { data: summary } = useGetNominationsSummary();

  const filtered = nominations
    ? filter === 'All' ? nominations : nominations.filter(n => n.status === filter)
    : [];

  const isWeb = Platform.OS === 'web';
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Selections</Text>
        {summary && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {summary.totalNominations} picks · $
            {summary.totalOutlay.toFixed(0)} outlay
          </Text>
        )}
      </View>

      {/* Summary pills */}
      {summary && (
        <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
          <SummaryPill
            label="Won" count={summary.wonCount} color={colors.primary} colors={colors}
          />
          <SummaryPill
            label="Placed" count={summary.placedCount} color="#A3E635" colors={colors}
          />
          <SummaryPill
            label="Pending" count={summary.pendingCount} color={colors.mutedForeground} colors={colors}
          />
          <SummaryPill
            label="Unplaced" count={summary.unplacedCount} color={colors.destructive} colors={colors}
          />
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.filterContent}
      >
        {STATUS_FILTERS.map(f => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterPill,
              {
                backgroundColor: filter === f ? colors.primary : colors.muted,
                borderColor: filter === f ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[
              styles.filterPillText,
              { color: filter === f ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load selections
          </Text>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { borderColor: colors.border }]}>
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No {filter === 'All' ? '' : filter.toLowerCase()} selections this week
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <NominationCard item={item} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
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

function SummaryPill({
  label, count, color, colors,
}: {
  label: string; count: number; color: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.summaryPill}>
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 16,
  },
  summaryPill: { alignItems: 'center' },
  summaryCount: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 },
  filterScroll: { borderBottomWidth: 1, maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  listContent: { padding: 16, gap: 12 },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  horseName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  raceInfo: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginVertical: 10 },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: { minWidth: 48 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  statValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 1 },
  posTag: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  posTagText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  retryText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
});
