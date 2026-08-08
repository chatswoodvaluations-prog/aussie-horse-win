import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useGetRace, useRecordResult } from '@workspace/api-client-react';
import type { Race } from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';

type Runner = Race['runners'][number];

// Speed map position ordering for display
const SPEED_MAP_ORDER: Record<string, number> = {
  Lead: 1, 'On-Pace': 2, Handy: 3, Midfield: 4, 'Back-Marker': 5,
};

function SpeedMapBadge({ position, colors }: { position: string; colors: ReturnType<typeof useColors> }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    Lead:         { bg: '#002E11', text: '#00CC4A' },
    'On-Pace':    { bg: '#1A2E00', text: '#A3E635' },
    Handy:        { bg: '#1A1A00', text: '#FFC107' },
    Midfield:     { bg: colors.muted, text: colors.mutedForeground },
    'Back-Marker': { bg: '#2A0A0A', text: colors.destructive },
  };
  const c = colorMap[position] ?? { bg: colors.muted, text: colors.mutedForeground };
  return (
    <View style={[styles.speedBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.speedBadgeText, { color: c.text }]}>{position}</Text>
    </View>
  );
}

function FilterResultRow({
  rule, passed, message, colors,
}: {
  rule: string; passed: boolean; message: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.filterRow}>
      <Feather
        name={passed ? 'check' : 'x'}
        size={13}
        color={passed ? colors.primary : colors.destructive}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.filterRule, { color: passed ? colors.foreground : colors.mutedForeground }]}>
          {rule}
        </Text>
        <Text style={[styles.filterMsg, { color: colors.mutedForeground }]}>{message}</Text>
      </View>
    </View>
  );
}

function SettleModal({
  visible,
  runner,
  raceId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  runner: Runner | null;
  raceId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState('');
  const [winReturn, setWinReturn] = useState('');
  const [placeReturn, setPlaceReturn] = useState('');

  const { mutate, isPending } = useRecordResult({
    mutation: {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSuccess();
        onClose();
        resetForm();
      },
      onError: (err) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', 'Failed to record result. Please try again.');
        console.error(err);
      },
    },
  });

  function resetForm() {
    setPosition('');
    setWinReturn('');
    setPlaceReturn('');
  }

  function handleSubmit() {
    const posNum = parseInt(position, 10);
    if (!position || isNaN(posNum) || posNum < 1) {
      Alert.alert('Invalid', 'Please enter a valid finish position (1 or higher).');
      return;
    }
    if (!runner) return;

    mutate({
      id: raceId,
      data: {
        runnerId: runner.id,
        finishPosition: posNum,
        actualWinReturn: winReturn ? parseFloat(winReturn) : null,
        actualPlaceReturn: placeReturn ? parseFloat(placeReturn) : null,
      },
    });
  }

  const isWeb = Platform.OS === 'web';
  const bottomInset = isWeb ? 34 : insets.bottom;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Handle */}
        <View style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </View>

        {/* Title */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Settle Result</Text>
            {runner && (
              <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
                {runner.horseName} · Barrier {runner.barrierNumber}
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.modalContent, { paddingBottom: bottomInset + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Finish position */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              FINISH POSITION *
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.muted,
                  borderColor: position ? colors.primary : colors.border,
                  color: colors.foreground,
                  fontFamily: 'Inter_600SemiBold',
                },
              ]}
              placeholder="e.g. 1"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              value={position}
              onChangeText={setPosition}
              maxLength={2}
            />
          </View>

          {/* Quick position buttons */}
          <View style={styles.quickButtons}>
            {[1, 2, 3, 4].map(pos => (
              <Pressable
                key={pos}
                onPress={() => setPosition(String(pos))}
                style={({ pressed }) => [
                  styles.quickBtn,
                  {
                    backgroundColor: position === String(pos) ? colors.primary : colors.secondary,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[
                  styles.quickBtnText,
                  { color: position === String(pos) ? colors.primaryForeground : colors.foreground },
                ]}>
                  {pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : '4th'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Win return */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              ACTUAL WIN RETURN ($)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: 'Inter_400Regular',
                },
              ]}
              placeholder="Leave blank if no win return"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={winReturn}
              onChangeText={setWinReturn}
            />
          </View>

          {/* Place return */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              ACTUAL PLACE RETURN ($)
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: 'Inter_400Regular',
                },
              ]}
              placeholder="Leave blank if no place return"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              value={placeReturn}
              onChangeText={setPlaceReturn}
            />
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={isPending || !position}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: !position ? colors.muted : colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.submitBtnText, { color: !position ? colors.mutedForeground : colors.primaryForeground }]}>
                Record Result
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function RunnerCard({
  runner,
  isNominated,
  onSettle,
  colors,
}: {
  runner: Runner;
  isNominated: boolean;
  onSettle: (runner: Runner) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState(false);
  const passCount = runner.filterResults.filter(f => f.passed).length;
  const totalFilters = runner.filterResults.length;

  return (
    <View
      style={[
        styles.runnerCard,
        {
          backgroundColor: colors.card,
          borderColor: isNominated ? colors.primary + '50' : colors.border,
        },
      ]}
    >
      {/* Runner header */}
      <Pressable onPress={() => setExpanded(e => !e)} style={styles.runnerHeader}>
        {isNominated && (
          <View style={[styles.nominatedDot, { backgroundColor: colors.primary }]} />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.runnerNameRow}>
            <Text style={[styles.barrierNum, { color: colors.mutedForeground }]}>
              {runner.barrierNumber}
            </Text>
            <Text style={[styles.runnerName, { color: colors.foreground }]} numberOfLines={1}>
              {runner.horseName}
            </Text>
            {isNominated && (
              <View style={[styles.selBadge, { backgroundColor: '#002E11' }]}>
                <Text style={[styles.selBadgeText, { color: colors.primary }]}>SEL</Text>
              </View>
            )}
          </View>
          <View style={styles.runnerMeta}>
            <SpeedMapBadge position={runner.speedMapPosition} colors={colors} />
            <Text style={[styles.oddsText, { color: colors.foreground }]}>
              W ${runner.winOdds.toFixed(1)} · P ${runner.placeOdds.toFixed(1)}
            </Text>
            <Text style={[styles.filtersText, { color: runner.passed ? colors.primary : colors.mutedForeground }]}>
              {passCount}/{totalFilters}
            </Text>
          </View>
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.mutedForeground}
        />
      </Pressable>

      {/* Filter details (expanded) */}
      {expanded && (
        <View style={[styles.filterList, { borderTopColor: colors.border }]}>
          {runner.filterResults.map((f, i) => (
            <FilterResultRow key={i} {...f} colors={colors} />
          ))}
          {runner.jockey && (
            <Text style={[styles.jockeyText, { color: colors.mutedForeground }]}>
              J: {runner.jockey}{runner.trainer ? ` · T: ${runner.trainer}` : ''}
            </Text>
          )}
        </View>
      )}

      {/* Settle button for nominated runners */}
      {isNominated && (
        <Pressable
          onPress={() => onSettle(runner)}
          style={({ pressed }) => [
            styles.settleBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="check-square" size={14} color={colors.primaryForeground} />
          <Text style={[styles.settleBtnText, { color: colors.primaryForeground }]}>
            Settle
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function RaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raceId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [settleRunner, setSettleRunner] = useState<Runner | null>(null);

  const { data: race, isLoading, isError, refetch } = useGetRace(raceId);

  const isWeb = Platform.OS === 'web';
  const bottomPad = isWeb ? 34 : insets.bottom;

  // The nominated runners are those with passed === true
  const nominatedRunnerIds = new Set(
    (race?.runners ?? []).filter(r => r.passed).map(r => r.id)
  );

  const sortedRunners = React.useMemo(() => {
    if (!race) return [];
    return [...race.runners].sort((a, b) => {
      // Nominated runners first, then by speed map position
      if (a.passed !== b.passed) return a.passed ? -1 : 1;
      const aOrder = SPEED_MAP_ORDER[a.speedMapPosition] ?? 99;
      const bOrder = SPEED_MAP_ORDER[b.speedMapPosition] ?? 99;
      return aOrder - bOrder;
    });
  }, [race]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !race) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <Feather name="alert-circle" size={40} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Race not found</Text>
        <Pressable onPress={() => router.back()} style={[styles.retryBtn, { borderColor: colors.border }]}>
          <Text style={[styles.retryText, { color: colors.foreground }]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Race info header */}
      <View style={[styles.raceInfoBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.raceInfoRow}>
          <View style={styles.raceInfoItem}>
            <Text style={[styles.raceInfoLabel, { color: colors.mutedForeground }]}>TRACK</Text>
            <Text style={[styles.raceInfoValue, { color: colors.foreground }]}>{race.trackName}</Text>
          </View>
          <View style={styles.raceInfoItem}>
            <Text style={[styles.raceInfoLabel, { color: colors.mutedForeground }]}>RACE</Text>
            <Text style={[styles.raceInfoValue, { color: colors.foreground }]}>R{race.raceNumber}</Text>
          </View>
          {race.raceTime && (
            <View style={styles.raceInfoItem}>
              <Text style={[styles.raceInfoLabel, { color: colors.mutedForeground }]}>TIME</Text>
              <Text style={[styles.raceInfoValue, { color: colors.foreground }]}>{race.raceTime}</Text>
            </View>
          )}
          {race.distance && (
            <View style={styles.raceInfoItem}>
              <Text style={[styles.raceInfoLabel, { color: colors.mutedForeground }]}>DIST</Text>
              <Text style={[styles.raceInfoValue, { color: colors.foreground }]}>{race.distance}m</Text>
            </View>
          )}
          <View style={styles.raceInfoItem}>
            <Text style={[styles.raceInfoLabel, { color: colors.mutedForeground }]}>FIELD</Text>
            <Text style={[styles.raceInfoValue, { color: colors.foreground }]}>{race.fieldSize}</Text>
          </View>
        </View>

        {race.qualifiedCount > 0 && (
          <View style={[styles.selectionsBanner, { backgroundColor: '#002E11' }]}>
            <Feather name="check-circle" size={13} color={colors.primary} />
            <Text style={[styles.selectionsBannerText, { color: colors.primary }]}>
              {race.qualifiedCount} selection{race.qualifiedCount !== 1 ? 's' : ''} this race
            </Text>
          </View>
        )}
      </View>

      {/* Runner list */}
      <FlatList
        data={sortedRunners}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <RunnerCard
            runner={item}
            isNominated={nominatedRunnerIds.has(item.id)}
            onSettle={setSettleRunner}
            colors={colors}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={sortedRunners.length > 0}
        refreshControl={
          <Pressable onPress={() => refetch()} />
        }
      />

      {/* Settle modal */}
      <SettleModal
        visible={settleRunner !== null}
        runner={settleRunner}
        raceId={raceId}
        onClose={() => setSettleRunner(null)}
        onSuccess={() => refetch()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  raceInfoBar: { borderBottomWidth: 1, padding: 14 },
  raceInfoRow: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  raceInfoItem: {},
  raceInfoLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, letterSpacing: 0.6 },
  raceInfoValue: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 2 },
  selectionsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  selectionsBannerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  listContent: { padding: 12, gap: 10 },
  runnerCard: { borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  nominatedDot: {
    width: 3,
    alignSelf: 'stretch',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  runnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 14,
    gap: 10,
  },
  runnerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  barrierNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    minWidth: 18,
    textAlign: 'center',
  },
  runnerName: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  selBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  selBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  runnerMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  speedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  speedBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10 },
  oddsText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  filtersText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  filterList: { borderTopWidth: 1, padding: 12, gap: 8 },
  filterRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  filterRule: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  filterMsg: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 },
  jockeyText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 10,
    marginTop: 0,
    paddingVertical: 9,
    borderRadius: 6,
  },
  settleBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 15, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  retryText: { fontFamily: 'Inter_500Medium', fontSize: 14 },

  // Modal styles
  modalContainer: { flex: 1 },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  modalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 3 },
  modalContent: { padding: 20, gap: 4 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.6, marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  quickButtons: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  quickBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
});
