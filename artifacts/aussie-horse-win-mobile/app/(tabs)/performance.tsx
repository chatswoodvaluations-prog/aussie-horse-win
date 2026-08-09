import React, { useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StaleBanner } from '@/components/StaleBanner';
import { useStaleBanner } from '@/hooks/useStaleBanner';
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
import {
  useGetPerformance,
  useGetBetHistory,
  useGetTrackBreakdown,
} from '@workspace/api-client-react';
import type { BetResult, TrackPerformance } from '@workspace/api-client-react';

type Tab = 'overview' | 'history' | 'tracks';

function MetricCard({
  label,
  value,
  isHighlight,
  colors,
}: {
  label: string;
  value: string;
  isHighlight?: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: isHighlight ? '#002E11' : colors.card,
          borderColor: isHighlight ? colors.primary + '60' : colors.border,
        },
      ]}
    >
      <Text style={[styles.metricValue, { color: isHighlight ? colors.primary : colors.foreground }]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function BetHistoryItem({ item }: { item: BetResult }) {
  const colors = useColors();
  const isPositive = item.netResult >= 0;
  const outcomeColors: Record<BetResult['outcome'], string> = {
    Won: colors.primary,
    Placed: '#A3E635',
    Unplaced: colors.destructive,
  };

  return (
    <View style={[styles.historyItem, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.histHorseName, { color: colors.foreground }]} numberOfLines={1}>
          {item.horseName}
        </Text>
        <Text style={[styles.histMeta, { color: colors.mutedForeground }]}>
          {item.trackName} · R{item.raceDate}
        </Text>
      </View>
      <View style={styles.histRight}>
        <Text style={[styles.histOutcome, { color: outcomeColors[item.outcome] }]}>
          {item.outcome}
        </Text>
        <Text style={[styles.histNet, { color: isPositive ? colors.primary : colors.destructive }]}>
          {isPositive ? '+' : ''}${item.netResult.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

function TrackRow({ item }: { item: TrackPerformance }) {
  const colors = useColors();
  const isPositive = item.netProfitLoss >= 0;

  return (
    <View style={[styles.trackRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.trackName, { color: colors.foreground }]}>{item.trackName}</Text>
        <Text style={[styles.trackMeta, { color: colors.mutedForeground }]}>
          {item.state} · {item.totalBets} bets · {(item.winStrikeRate * 100).toFixed(0)}% win
        </Text>
      </View>
      <View style={styles.trackRight}>
        <Text style={[styles.trackRoi, { color: colors.mutedForeground }]}>
          ROI {(item.roi * 100).toFixed(0)}%
        </Text>
        <Text style={[styles.trackPnl, { color: isPositive ? colors.primary : colors.destructive }]}>
          {isPositive ? '+' : ''}${item.netProfitLoss.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

export default function PerformanceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('overview');

  const {
    data: perf,
    isLoading: perfLoading,
    isError: perfError,
    refetch: refetchPerf,
    isRefetching: perfRefetching,
    failureCount: perfFailureCount,
  } = useGetPerformance();

  const {
    data: history,
    isLoading: histLoading,
    refetch: refetchHist,
    isRefetching: histRefetching,
  } = useGetBetHistory();

  const {
    data: tracks,
    isLoading: tracksLoading,
    refetch: refetchTracks,
    isRefetching: tracksRefetching,
  } = useGetTrackBreakdown();

  const { showBanner: showStaleBanner, dismiss: dismissStaleBanner } = useStaleBanner(perfFailureCount, perfError);

  const isWeb = Platform.OS === 'web';
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const isLoading = perfLoading || histLoading || tracksLoading;
  const isRefreshing = perfRefetching || histRefetching || tracksRefetching;

  function handleRefresh() {
    refetchPerf();
    if (tab === 'history') refetchHist();
    if (tab === 'tracks') refetchTracks();
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'history', label: 'Trade Log' },
    { key: 'tracks', label: 'By Track' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Performance</Text>
        {perf && (
          <Text
            style={[
              styles.pnlHero,
              { color: perf.netProfitLoss >= 0 ? colors.primary : colors.destructive },
            ]}
          >
            {perf.netProfitLoss >= 0 ? '+' : ''}${perf.netProfitLoss.toFixed(2)}
          </Text>
        )}
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[
              styles.tabBtn,
              {
                borderBottomColor: tab === t.key ? colors.primary : 'transparent',
                borderBottomWidth: 2,
              },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: tab === t.key ? colors.primary : colors.mutedForeground },
              ]}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Offline banner — only when errored but cached data is still on-screen */}
      {perfError && perf ? <OfflineBanner /> : null}
      {/* Stale banner — after several consecutive background-fetch failures */}
      {showStaleBanner ? (
        <StaleBanner onRefresh={handleRefresh} onDismiss={dismissStaleBanner} />
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : perfError && !perf ? (
        <View style={styles.centered}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Could not load performance
          </Text>
          <Pressable onPress={handleRefresh} style={[styles.retryBtn, { borderColor: colors.border }]}>
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : tab === 'overview' && perf ? (
        <ScrollView
          contentContainerStyle={[styles.overviewContent, { paddingBottom: bottomPad + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        >
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Net P&L"
              value={`${perf.netProfitLoss >= 0 ? '+' : ''}$${perf.netProfitLoss.toFixed(2)}`}
              isHighlight
              colors={colors}
            />
            <MetricCard label="ROI" value={`${(perf.roi * 100).toFixed(1)}%`} colors={colors} />
            <MetricCard
              label="Win Strike"
              value={`${(perf.winStrikeRate * 100).toFixed(0)}%`}
              colors={colors}
            />
            <MetricCard
              label="Place Strike"
              value={`${(perf.placeStrikeRate * 100).toFixed(0)}%`}
              colors={colors}
            />
            <MetricCard label="Total Bets" value={`${perf.totalBets}`} colors={colors} />
            <MetricCard label="Outlay" value={`$${perf.totalOutlay.toFixed(0)}`} colors={colors} />
            <MetricCard label="Returns" value={`$${perf.totalReturns.toFixed(0)}`} colors={colors} />
            <MetricCard label="Avg Win Odds" value={`$${perf.avgOddsWin.toFixed(1)}`} colors={colors} />
          </View>

          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RESULTS</Text>
          </View>
          <View style={[styles.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ResultStat label="Won" value={perf.totalWins} color={colors.primary} colors={colors} />
            <View style={[styles.vDivider, { backgroundColor: colors.border }]} />
            <ResultStat label="Placed" value={perf.totalPlaced} color="#A3E635" colors={colors} />
            <View style={[styles.vDivider, { backgroundColor: colors.border }]} />
            <ResultStat label="Unplaced" value={perf.totalUnplaced} color={colors.destructive} colors={colors} />
          </View>

          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>STREAKS</Text>
          </View>
          <View style={[styles.resultRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ResultStat label="Best Win Streak" value={perf.longestWinStreak} color={colors.primary} colors={colors} />
            <View style={[styles.vDivider, { backgroundColor: colors.border }]} />
            <ResultStat label="Longest Losing" value={perf.longestLosingStreak} color={colors.destructive} colors={colors} />
          </View>
        </ScrollView>
      ) : tab === 'history' ? (
        !history || history.length === 0 ? (
          <View style={styles.centered}>
            <Feather name="list" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No bet history yet</Text>
          </View>
        ) : (
          <FlatList
            data={[...history].reverse()}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => <BetHistoryItem item={item} />}
            contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={history.length > 0}
            refreshControl={
              <RefreshControl refreshing={histRefetching} onRefresh={refetchHist} tintColor={colors.primary} />
            }
          />
        )
      ) : tab === 'tracks' ? (
        !tracks || tracks.length === 0 ? (
          <View style={styles.centered}>
            <Feather name="map-pin" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No track data yet</Text>
          </View>
        ) : (
          <FlatList
            data={[...tracks].sort((a, b) => b.netProfitLoss - a.netProfitLoss)}
            keyExtractor={item => item.trackName}
            renderItem={({ item }) => <TrackRow item={item} />}
            contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={tracks.length > 0}
            refreshControl={
              <RefreshControl refreshing={tracksRefetching} onRefresh={refetchTracks} tintColor={colors.primary} />
            }
          />
        )
      ) : null}
    </View>
  );
}

function ResultStat({
  label, value, color, colors,
}: {
  label: string;
  value: number;
  color: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.resultStat}>
      <Text style={[styles.resultValue, { color }]}>{value}</Text>
      <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.5 },
  pnlHero: { fontFamily: 'Inter_700Bold', fontSize: 40, letterSpacing: -1, marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  tabLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  overviewContent: { padding: 16, gap: 0 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: '44%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.5 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  sectionHeader: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  resultRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  resultStat: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  resultValue: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -0.5 },
  resultLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  vDivider: { width: 1, alignSelf: 'stretch' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  histHorseName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  histMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  histRight: { alignItems: 'flex-end' },
  histOutcome: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  histNet: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 2 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  trackName: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  trackMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  trackRight: { alignItems: 'flex-end' },
  trackRoi: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  trackPnl: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  retryBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  retryText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
});
