import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useGetSettings,
  useGetTracks,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from '@workspace/api-client-react';
import type { Track } from '@workspace/api-client-react';

const STATE_ORDER = ['VIC', 'NSW', 'QLD', 'SA', 'WA'] as const;
type State = typeof STATE_ORDER[number];

const STATE_LABELS: Record<string, string> = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  SA:  'South Australia',
  WA:  'Western Australia',
};

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.secondary,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? colors.primaryForeground : colors.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Track row ────────────────────────────────────────────────────────────────

function TrackRow({
  track,
  enabled,
  onToggle,
  colors,
}: {
  track: Track;
  enabled: boolean;
  onToggle: (id: number, next: boolean) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.trackRow,
        {
          backgroundColor: colors.card,
          borderColor: enabled ? colors.primary + '40' : colors.border,
        },
      ]}
    >
      {enabled && (
        <View style={[styles.accentBar, { backgroundColor: colors.primary }]} />
      )}
      <Text
        style={[
          styles.trackName,
          { color: colors.foreground, marginLeft: enabled ? 10 : 14 },
        ]}
        numberOfLines={1}
      >
        {track.name}
      </Text>
      <Switch
        value={enabled}
        onValueChange={next => onToggle(track.id, next)}
        thumbColor={enabled ? colors.primary : colors.mutedForeground}
        trackColor={{ false: colors.secondary, true: colors.primary + '60' }}
        ios_backgroundColor={colors.secondary}
        style={styles.switchArea}
      />
    </View>
  );
}

// ─── Serialised, debounced save hook ─────────────────────────────────────────
//
// Guarantees that:
//  1. Rapid toggles are coalesced — only the final state is sent after a 350ms
//     quiet period, so we never fire two mutations for a burst of taps.
//  2. If a mutation IS in flight when the debounce fires, we defer the next
//     flush until the current one settles, so payloads are always applied in
//     the order the user intended and an older response can never overwrite a
//     newer toggle.

function useSerialisedSave() {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateSettings();

  // Always points to the latest ids we want to persist — updated synchronously
  // on every toggle before any async work begins.
  const latestIdsRef = useRef<number[]>([]);

  // True while a PATCH is in flight.
  const isMutatingRef = useRef(false);

  // Set to true when a toggle arrived while a mutation was already in flight;
  // signals that we must re-flush once the current mutation settles.
  const needsFlushRef = useRef(false);

  const [isSaving, setIsSaving] = useState(false);

  // Debounce timer id
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (isMutatingRef.current) {
      // Another mutation is in flight — mark that we need another flush.
      needsFlushRef.current = true;
      return;
    }

    const ids = latestIdsRef.current;
    isMutatingRef.current = true;
    setIsSaving(true);

    updateMutation.mutate(
      { data: { enabledTrackIds: ids } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => {
          // Revert UI to whatever the server thinks is true.
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onSettled: () => {
          isMutatingRef.current = false;
          if (needsFlushRef.current) {
            needsFlushRef.current = false;
            // Flush again with the latest ids accumulated since the mutation
            // was kicked off.
            flush();
          } else {
            setIsSaving(false);
          }
        },
      },
    );
  }, [updateMutation, queryClient]);

  /**
   * Schedule a save. Call this on every toggle with the full updated ids array.
   * Resets the debounce window on each call so that only the final state after
   * a rapid burst is sent.
   */
  const scheduleSave = useCallback(
    (ids: number[]) => {
      latestIdsRef.current = ids;
      // Show the pending indicator right away so the user gets instant feedback.
      setIsSaving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 350);
    },
    [flush],
  );

  return { scheduleSave, isSaving };
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: settings, isLoading: isSettingsLoading } = useGetSettings();
  const { data: tracks, isLoading: isTracksLoading } = useGetTracks();
  const { scheduleSave, isSaving } = useSerialisedSave();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<State | null>(null);

  // ── Local optimistic state ────────────────────────────────────────────────
  // Tracks what the user has toggled.  Initialised once from the server response;
  // subsequent server refetches only update it when there is no pending/in-flight
  // save (to avoid server state clobbering in-flight optimistic changes).
  const [localIds, setLocalIds] = useState<number[] | null>(null);
  const initialised = useRef(false);

  useEffect(() => {
    if (settings && !initialised.current) {
      setLocalIds(settings.enabledTrackIds ?? []);
      initialised.current = true;
    }
  }, [settings]);

  // When the server refetch resolves and no save is in progress, sync local
  // state to the server-confirmed truth.
  useEffect(() => {
    if (settings && initialised.current && !isSaving) {
      setLocalIds(settings.enabledTrackIds ?? []);
    }
    // isSaving intentionally omitted from deps — we only want to run this when
    // settings changes, and we gate on isSaving at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const enabledTrackIds = localIds ?? settings?.enabledTrackIds ?? [];

  const isLoading = isSettingsLoading || isTracksLoading || localIds === null;
  const isWeb = Platform.OS === 'web';
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const availableStates = useMemo<State[]>(() => {
    if (!tracks) return [];
    const seen = new Set(tracks.map(t => t.state as string));
    return STATE_ORDER.filter(s => seen.has(s));
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    if (!tracks) return [];
    return tracks.filter(t => {
      const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesState  = !stateFilter || t.state === stateFilter;
      return matchesSearch && matchesState;
    });
  }, [tracks, search, stateFilter]);

  const groupedTracks = useMemo(() => {
    return STATE_ORDER.map(state => ({
      state,
      tracks: filteredTracks.filter(t => t.state === state),
    })).filter(g => g.tracks.length > 0);
  }, [filteredTracks]);

  // ── Toggle handlers ───────────────────────────────────────────────────────

  const handleToggle = useCallback(
    (trackId: number, next: boolean) => {
      setLocalIds(prev => {
        const current = prev ?? [];
        const updated = next
          ? Array.from(new Set([...current, trackId]))
          : current.filter(id => id !== trackId);
        scheduleSave(updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  const handleSelectAll = useCallback(
    (ids: number[]) => {
      setLocalIds(prev => {
        const current = prev ?? [];
        const updated = Array.from(new Set([...current, ...ids]));
        scheduleSave(updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  const handleDeselectAll = useCallback(
    (ids: number[]) => {
      setLocalIds(prev => {
        const idsSet = new Set(ids);
        const current = prev ?? [];
        const updated = current.filter(id => !idsSet.has(id));
        scheduleSave(updated);
        return updated;
      });
    },
    [scheduleSave],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Track Settings</Text>
          {isSaving && (
            <View style={styles.savingPill}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.savingText, { color: colors.primary }]}>Saving…</Text>
            </View>
          )}
        </View>
        {!isLoading && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {enabledTrackIds.length} / {tracks?.length ?? 0} circuits enabled
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading circuits…
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Search ── */}
          <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search tracks…"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
                clearButtonMode="while-editing"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search.length > 0 && Platform.OS !== 'ios' && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>

          {/* ── State filter ── */}
          <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>STATE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <FilterChip
                label="All"
                active={stateFilter === null}
                onPress={() => setStateFilter(null)}
                colors={colors}
              />
              {availableStates.map(s => (
                <FilterChip
                  key={s}
                  label={s}
                  active={stateFilter === s}
                  onPress={() => setStateFilter(stateFilter === s ? null : s)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          </View>

          {/* ── Track groups ── */}
          {groupedTracks.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="map-pin" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No tracks match your search
              </Text>
            </View>
          ) : (
            groupedTracks.map(({ state, tracks: stateTracks }) => {
              const stateIds = stateTracks.map(t => t.id);
              const allEnabled  = stateIds.every(id => enabledTrackIds.includes(id));
              const someEnabled = stateIds.some(id => enabledTrackIds.includes(id));

              return (
                <View key={state} style={styles.stateGroup}>
                  {/* State header */}
                  <View style={[styles.stateHeader, { borderBottomColor: colors.border }]}>
                    <View style={styles.stateHeaderLeft}>
                      <Text style={[styles.stateCode, { color: colors.foreground }]}>{state}</Text>
                      <Text style={[styles.stateName, { color: colors.mutedForeground }]}>
                        {STATE_LABELS[state]}
                      </Text>
                      <View style={[styles.countBadge, { borderColor: colors.border }]}>
                        <Text style={[styles.countText, { color: colors.mutedForeground }]}>
                          {stateIds.filter(id => enabledTrackIds.includes(id)).length}/{stateTracks.length}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.stateActions}>
                      <Pressable
                        onPress={() => handleSelectAll(stateIds)}
                        disabled={allEnabled}
                        style={({ pressed }) => ({ opacity: allEnabled ? 0.35 : pressed ? 0.6 : 1 })}
                      >
                        <Text style={[styles.actionText, { color: colors.primary }]}>All on</Text>
                      </Pressable>
                      <Text style={[styles.actionDot, { color: colors.mutedForeground }]}>·</Text>
                      <Pressable
                        onPress={() => handleDeselectAll(stateIds)}
                        disabled={!someEnabled}
                        style={({ pressed }) => ({ opacity: !someEnabled ? 0.35 : pressed ? 0.6 : 1 })}
                      >
                        <Text style={[styles.actionText, { color: colors.mutedForeground }]}>All off</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Tracks */}
                  <View style={styles.trackList}>
                    {stateTracks.map(track => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        enabled={enabledTrackIds.includes(track.id)}
                        onToggle={handleToggle}
                        colors={colors}
                      />
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  savingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 3,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 80,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  filterLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  stateGroup: {
    marginBottom: 8,
  },
  stateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  stateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stateCode: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  stateName: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  countBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  countText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  stateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  actionDot: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  trackList: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    minHeight: 50,
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  trackName: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    paddingVertical: 14,
  },
  switchArea: {
    marginRight: 12,
  },
});
