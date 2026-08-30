// apps/mobile/db/syncQueue.js
//
// Coordinates flushing the local reports_outbox to
// POST /api/v1/reports whenever connectivity is available.
//
// Usage:
//   - Call `initSyncListener()` once near app boot to auto-flush whenever
//     the device transitions from offline -> online.
//   - Call `syncNow()` manually (e.g. from OfflineSyncIndicator's
//     "Sync Now" button or pull-to-refresh).

import NetInfo from '@react-native-community/netinfo';
import api, { OfflineError } from '../lib/api';
import { getPendingReports, markReportSynced, markReportSyncFailed } from './sqlite';

// parseInt on undefined -> NaN, so guard with a fallback rather than
// letting a missing/malformed env var silently disable the retry cap.
const parsedMaxAttempts = parseInt(process.env.EXPO_PUBLIC_SQLITE_MAX_SYNC_ATTEMPTS, 10);
const MAX_SYNC_ATTEMPTS = Number.isFinite(parsedMaxAttempts) ? parsedMaxAttempts : 5;

let isSyncing = false;
let netInfoUnsubscribe = null;
let listeners = new Set(); // UI subscribers wanting sync status updates

export function subscribeSyncStatus(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function emitStatus(status) {
  listeners.forEach((cb) => {
    try {
      cb(status);
    } catch (err) {
      console.warn('[syncQueue] listener threw:', err);
    }
  });
}

/**
 * Attaches a NetInfo listener that triggers a sync pass any time the
 * device regains connectivity. Returns an unsubscribe function.
 */
export function initSyncListener() {
  if (netInfoUnsubscribe) return netInfoUnsubscribe;

  let wasOffline = false;

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);

    if (!isConnected) {
      wasOffline = true;
      emitStatus({ phase: 'offline' });
      return;
    }

    if (wasOffline) {
      wasOffline = false;
      syncNow().catch((err) => console.warn('[syncQueue] auto-sync failed:', err?.message));
    }
  });

  return netInfoUnsubscribe;
}

export function stopSyncListener() {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
}

/**
 * Flushes all pending reports to the backend, one at a time, so a single
 * failure doesn't block reports that would otherwise succeed.
 * Returns a summary: { synced: number, failed: number, remaining: number }
 */
export async function syncNow() {
  if (isSyncing) {
    return { synced: 0, failed: 0, remaining: 0, skipped: true };
  }

  isSyncing = true;
  emitStatus({ phase: 'syncing' });

  let synced = 0;
  let failed = 0;

  try {
    const pending = await getPendingReports();

    for (const report of pending) {
      if (report.syncAttempts >= MAX_SYNC_ATTEMPTS) {
        // Give up on reports that have failed too many times — surfaced
        // to the user via MyReportsScreen's "Failed" badge instead.
        continue;
      }

      try {
        const response = await api.post('/api/v1/reports', {
          scamType: report.scamType,
          content: report.content,
          evidenceFiles: report.evidenceFiles,
          voiceNoteUri: report.voiceNoteUri,
          location:
            report.latitude != null && report.longitude != null
              ? { latitude: report.latitude, longitude: report.longitude }
              : undefined,
          nullifier: report.nullifier,
          zkpHash: report.zkpHash,
          clientCreatedAt: report.createdAt,
        });

        const serverReportId = response.data?.reportId || response.data?.id;
        await markReportSynced(report.localId, serverReportId);
        synced += 1;
      } catch (err) {
        if (err instanceof OfflineError) {
          // Connection dropped mid-flush — stop the loop, remaining stay queued.
          break;
        }
        await markReportSyncFailed(report.localId, err?.message || 'Unknown sync error');
        failed += 1;
      }
    }

    const remaining = (await getPendingReports()).length;
    emitStatus({ phase: 'idle', lastSyncedAt: new Date().toISOString(), synced, failed, remaining });

    return { synced, failed, remaining };
  } finally {
    isSyncing = false;
  }
}

export function isSyncInProgress() {
  return isSyncing;
}