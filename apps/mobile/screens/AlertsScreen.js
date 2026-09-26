// apps/mobile/screens/AlertsScreen.js
//
// Personal activity feed + nearby scam alerts.
//
// Section A — "Your Reports":
//   Synthesized from local SQLite reviewStatus. Every time a report you
//   submitted moves from queued → under_review → confirmed | rejected,
//   a synthetic alert fires. Read state is tracked per-alert in
//   AsyncStorage. Tapping "Mark all read" flips every unread alert to
//   read WITHOUT removing it — the row dims, unbolds, and its unread
//   dot fades out with a short layout animation (Messenger-style).
//
// Section B — "Nearby Scams":
//   Pulled from GET /api/v1/blacklist/public using the citizen's stored
//   region from ProfileScreen. Best-effort — offline shows the last
//   cached list (or nothing if never fetched).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  RefreshControl,
  TouchableOpacity,
  SectionList,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import api, { OfflineError } from '../lib/api';
import { getAllReports } from '../db/sqlite';
import { UNCLASSIFIED_REGION } from '../lib/regionResolver';

// Enable LayoutAnimation on Android — required for the read-state
// transition to animate there. Safe no-op on iOS.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SEEN_STATE_KEY = '@sentinelph_alerts_seen_state';

function Badge({ label, color }) {
  const palette = {
    rose: { text: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.25)' },
    amber: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    emerald: { text: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
    indigo: { text: '#818cf8', bg: 'rgba(79,70,229,0.12)', border: 'rgba(79,70,229,0.25)' },
  };
  const s = palette[color] || palette.indigo;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function formatRelative(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

// Maps a reviewStatus value into a citizen-friendly alert.
function reviewStatusToAlert(report) {
  const rs = report.reviewStatus || 'queued';
  const sender =
    report.senderNumber || report.reportedNumber || 'unknown sender';
  const shortId = report.serverReportId
    ? report.serverReportId.slice(-6)
    : `LOCAL-${String(report.localId || '').slice(0, 6).toUpperCase()}`;

  if (rs === 'under_review') {
    return {
      id: `${report.localId}:under_review`,
      title: `Your report on ${sender} is Under Review`,
      body: `An officer has reviewed your report ${shortId}. Waiting for a second review to confirm.`,
      level: 'indigo',
      badgeLabel: 'Under Review',
      when: report.createdAt,
      reportLocalId: report.localId,
    };
  }
  if (rs === 'confirmed') {
    return {
      id: `${report.localId}:confirmed`,
      title: `${sender} confirmed as a scam`,
      body: `Your report ${shortId} was confirmed. The number is now on the SentinelPH blacklist.`,
      level: 'rose',
      badgeLabel: 'Confirmed Scam',
      when: report.createdAt,
      reportLocalId: report.localId,
    };
  }
  if (rs === 'rejected') {
    return {
      id: `${report.localId}:rejected`,
      title: `Report ${shortId} was dismissed`,
      body: `Officers reviewed your report on ${sender} and found no scam signal. Thank you for helping.`,
      level: 'emerald',
      badgeLabel: 'Dismissed',
      when: report.createdAt,
      reportLocalId: report.localId,
    };
  }
  return null;
}

// ─── Single row. Owns its own Animated.Value for the unread dot, and
//     reads `isRead` from the parent so a "Mark all read" tap re-renders
//     it as read. When `isRead` flips, the dot fades out with a spring
//     and the title/body unbold. ─────────────────────────────────────
function AlertRow({ item, isRead, onPress }) {
  const dotOpacity = useRef(new Animated.Value(isRead ? 0 : 1)).current;

  React.useEffect(() => {
    Animated.timing(dotOpacity, {
      toValue: isRead ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [isRead, dotOpacity]);

  const titleWeight = isRead ? '500' : '700';
  const titleColor = isRead ? '#94a3b8' : '#e2e8f0';
  const bodyColor = isRead ? '#475569' : '#64748b';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(148,163,184,0.07)',
        backgroundColor: isRead
          ? 'transparent'
          : 'rgba(79,70,229,0.04)',
      }}
    >
      {/* Unread dot — fades out when read */}
      <View style={{ paddingTop: 5, width: 8 }}>
        <Animated.View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#818cf8',
            opacity: dotOpacity,
          }}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              color: titleColor,
              fontSize: 13,
              fontWeight: titleWeight,
              flex: 1,
            }}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={{ color: '#334155', fontSize: 10 }}>
            {formatRelative(item.when)}
          </Text>
        </View>
        <Text
          style={{
            color: bodyColor,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          {item.body}
        </Text>
        <View
          style={{
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Badge label={item.badgeLabel} color={item.level} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AlertsScreen() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [personalAlerts, setPersonalAlerts] = useState([]);
  const [nearbyAlerts, setNearbyAlerts] = useState([]);

  // readIds: { [alertId]: true } — persists across app restarts.
  // An alert that is not in this map is UNREAD.
  const [readIds, setReadIds] = useState({});

  const load = useCallback(async () => {
    setLoading(true);

    // ── Load read state from AsyncStorage ────────────────────────────
    let persistedRead = {};
    try {
      const raw = await AsyncStorage.getItem(SEEN_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Backwards-compat: older builds stored { seen, dismissed }.
        // Migrate any dismissed keys into readIds so users who already
        // tapped Dismiss / Mark all read don't see them unread again.
        persistedRead = parsed.read || {};
        if (parsed.dismissed) {
          persistedRead = { ...persistedRead, ...parsed.dismissed };
        }
      }
    } catch (err) {
      console.warn('[AlertsScreen] failed to read state:', err?.message);
    }
    setReadIds(persistedRead);

    // ── Section A — synthesize personal alerts from local reports ────
    try {
      const all = await getAllReports();
      const synthetic = all
        .map(reviewStatusToAlert)
        .filter(Boolean);

      synthetic.sort(
        (a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()
      );
      setPersonalAlerts(synthetic);
    } catch (err) {
      console.warn(
        '[AlertsScreen] failed to load personal alerts:',
        err?.message
      );
    }

    // ── Section B — nearby blacklisted numbers in the citizen's region ─
    try {
      const storedRegion = await AsyncStorage.getItem(
        '@sentinelph_user_region'
      );
      const region = storedRegion || UNCLASSIFIED_REGION;

      const response = await api.get('/api/v1/blacklist/public', {
        params: { region, limit: 20 },
      });

      const entries = response.data?.data || [];
      const nearby = entries.map((e) => ({
        id: `nearby:${e.phoneNumber}`,
        title: `${e.phoneNumber} confirmed as scam`,
        body: e.scamType
          ? `${e.scamType}${e.reportCount ? ` · ${e.reportCount} reports` : ''}`
          : 'Reported and confirmed in your region.',
        level: 'rose',
        badgeLabel: 'Nearby Scam',
        when: e.blacklistedAt || e.updatedAt || e.createdAt,
        phoneNumber: e.phoneNumber,
      }));
      setNearbyAlerts(nearby);
    } catch (err) {
      if (err instanceof OfflineError) {
        // Offline: leave nearbyAlerts as-is (previous fetch if any).
      } else if (
        err?.response?.status === 403 ||
        err?.response?.status === 404
      ) {
        // Not available — silent.
        setNearbyAlerts([]);
      } else {
        console.warn(
          '[AlertsScreen] failed to load nearby alerts:',
          err?.message
        );
        setNearbyAlerts([]);
      }
    }

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Persists the current read map to AsyncStorage.
  const persistRead = useCallback(async (next) => {
    try {
      await AsyncStorage.setItem(
        SEEN_STATE_KEY,
        JSON.stringify({ read: next })
      );
    } catch (err) {
      console.warn('[AlertsScreen] failed to persist read state:', err?.message);
    }
  }, []);

  // Marks a single alert as read. Animates the row, keeps it visible.
  const markOneRead = useCallback(
    async (alertId) => {
      if (readIds[alertId]) return;

      // Animate the layout change on the row so the dot fades and the
      // font weight change is smooth on Android (iOS handles it via the
      // Animated.Value inside AlertRow).
      LayoutAnimation.configureNext(
        LayoutAnimation.Presets.easeInEaseOut
      );

      const next = { ...readIds, [alertId]: true };
      setReadIds(next);
      await persistRead(next);
    },
    [readIds, persistRead]
  );

  // Marks every personal alert as read. Keeps them in the list; the
  // badge counter drops to zero and each row dims + unbolds.
  const markAllRead = useCallback(async () => {
    if (personalAlerts.length === 0) return;

    // LayoutAnimation makes the font-weight change feel less abrupt on
    // Android. On iOS the dot fade is animated by Animated in AlertRow.
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut
    );

    const next = { ...readIds };
    for (const a of personalAlerts) next[a.id] = true;

    setReadIds(next);
    await persistRead(next);
  }, [personalAlerts, readIds, persistRead]);

  // ── Compose sections ─────────────────────────────────────────────
  const sections = useMemo(() => {
    const out = [];
    if (personalAlerts.length > 0) {
      out.push({
        title: 'YOUR REPORTS',
        data: personalAlerts,
        isPersonal: true,
      });
    }
    if (nearbyAlerts.length > 0) {
      out.push({
        title: 'NEARBY SCAMS',
        data: nearbyAlerts,
        isPersonal: false,
      });
    }
    return out;
  }, [personalAlerts, nearbyAlerts]);

  // Unread = personal alerts whose id is not in readIds.
  const totalUnread = useMemo(
    () => personalAlerts.filter((a) => !readIds[a.id]).length,
    [personalAlerts, readIds]
  );

  const hasUnread = totalUnread > 0;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: '#0a1120' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexShrink: 1,
          }}
        >
          <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>
            Alerts
          </Text>
          {totalUnread > 0 && (
            <View
              style={{
                minWidth: 18,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f43f5e',
              }}
            >
              <Text
                style={{ fontSize: 10, color: 'white', fontWeight: '700' }}
              >
                {totalUnread}
              </Text>
            </View>
          )}
        </View>
        {personalAlerts.length > 0 && (
          <TouchableOpacity
            onPress={markAllRead}
            disabled={!hasUnread}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={{
                color: hasUnread ? '#4f46e5' : '#334155',
                fontSize: 12,
                fontWeight: '500',
              }}
            >
              Mark all read
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator color="#4f46e5" />
        </View>
      ) : sections.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
            paddingBottom: 64,
          }}
        >
          <Text
            style={{
              color: '#64748b',
              fontSize: 14,
              fontWeight: '500',
              marginBottom: 8,
            }}
          >
            No alerts yet
          </Text>
          <Text
            style={{
              color: '#334155',
              fontSize: 11,
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 16,
            }}
          >
            When officers review your reports or a scam is confirmed near
            you, it will appear here.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#818cf8"
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Text
                style={{
                  color: '#475569',
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                }}
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, section }) => {
            // Nearby scams are informational only — they don't have a
            // read/unread state. Personal alerts do.
            if (!section.isPersonal) {
              return (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(148,163,184,0.07)',
                  }}
                >
                  <View style={{ paddingTop: 5, width: 8 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#f43f5e',
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: '#e2e8f0',
                          fontSize: 13,
                          fontWeight: '600',
                          flex: 1,
                        }}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      <Text style={{ color: '#334155', fontSize: 10 }}>
                        {formatRelative(item.when)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: '#475569',
                        fontSize: 11,
                        lineHeight: 16,
                      }}
                    >
                      {item.body}
                    </Text>
                    <View style={{ marginTop: 8 }}>
                      <Badge label={item.badgeLabel} color={item.level} />
                    </View>
                  </View>
                </View>
              );
            }

            const isRead = Boolean(readIds[item.id]);
            return (
              <AlertRow
                item={item}
                isRead={isRead}
                onPress={() => {
                  // Tapping a row marks it read (Messenger-style). It
                  // still navigates so the user can inspect the report.
                  if (!isRead) markOneRead(item.id);
                  if (item.reportLocalId) {
                    navigation.navigate('MyReports');
                  }
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}