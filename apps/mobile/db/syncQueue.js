// apps/mobile/db/syncQueue.js
import NetInfo from '@react-native-community/netinfo';
import api, { OfflineError } from '../lib/api';
import {
  getPendingReports,
  markReportSynced,
  markReportSyncFailed,
  updateReportReviewStatusByNullifier,
  updateReportOfficerVerdictByNullifier,
  upsertReportsFromServer,
} from './sqlite';
export { setActiveUser, getActiveUserId } from './sqlite';

const DEFAULT_SCAM_TYPE = 'UNKNOWN';
const DEFAULT_REGION = 'UNCLASSIFIED';

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

function normalizeRegion(value) {
  if (typeof value !== 'string') return DEFAULT_REGION;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REGION;
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
        const region = normalizeRegion(report.region);

        const response = await api.post('/api/v1/reports', {
          scamType,
          senderNumber: report.senderNumber || undefined,
          content: report.content,
          evidenceFiles: report.evidenceFiles,
          evidenceImage: report.evidenceImage,
          location: {
            latitude: report.latitude ?? null,
            longitude: report.longitude ?? null,
            region,
          },
          region,
          nullifier: report.nullifier,
          zkpHash: report.zkpHash,
          clientCreatedAt: report.createdAt,
          // Target kind — server classifier may override; this is a
          // hint so sync'd reports inherit the same kind they were
          // classified with on-device (when known).
          targetKind: report.targetKind === 'brand' ? 'brand' : 'number',
          brandName: report.brandName || undefined,
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

    await refreshReportStatuses().catch(() => {});

    emitStatus({ phase: 'idle', lastSyncedAt: new Date().toISOString(), synced, failed, remaining });

    return { synced, failed, remaining };
  } finally {
    isSyncing = false;
  }
}

export async function refreshReportStatuses() {
  try {
    const response = await api.get('/api/v1/reports/mine');
    const reports = response.data?.reports;
    if (!Array.isArray(reports) || reports.length === 0) {
      return { updated: 0, inserted: 0 };
    }

    const { inserted, updated } = await upsertReportsFromServer(reports);

    return { updated, inserted, total: reports.length };
  } catch (err) {
    if (err instanceof OfflineError) {
      return { updated: 0, inserted: 0, offline: true };
    }
    console.warn('[syncQueue] refreshReportStatuses failed:', err?.message);
    return { updated: 0, inserted: 0, error: err?.message };
  }
}

export function isSyncInProgress() {
  return isSyncing;
}