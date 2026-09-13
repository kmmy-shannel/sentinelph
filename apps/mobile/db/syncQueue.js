// apps/mobile/db/syncQueue.js
//
// Coordinates flushing the local reports_outbox to
// POST /api/v1/reports whenever connectivity is available.

import NetInfo from '@react-native-community/netinfo';
import api, { OfflineError } from '../lib/api';
import { getPendingReports, markReportSynced, markReportSyncFailed } from './sqlite';

const DEFAULT_SCAM_TYPE = 'UNKNOWN';

const parsedMaxAttempts = parseInt(process.env.EXPO_PUBLIC_SQLITE_MAX_SYNC_ATTEMPTS, 10);
const MAX_SYNC_ATTEMPTS = Number.isFinite(parsedMaxAttempts) ? parsedMaxAttempts : 5;

let isSyncing = false;
let netInfoUnsubscribe = null;
let listeners = new Set();

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

function normalizeScamType(value) {
  if (typeof value !== 'string') return DEFAULT_SCAM_TYPE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SCAM_TYPE;
}

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
        continue;
      }

      try {
        const scamType = normalizeScamType(report.scamType);

        const response = await api.post('/api/v1/reports', {
          scamType,
          content: report.content,
          evidenceFiles: report.evidenceFiles,
          evidenceImage: report.evidenceImage,
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