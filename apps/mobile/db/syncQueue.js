// apps/mobile/db/syncQueue.js
//
// Coordinates flushing the local reports_outbox to
// POST /api/v1/reports whenever connectivity is available.
//
// FIX (offline sender/region loss — CRITICAL): previously this file only
// forwarded scamType, content, evidenceFiles, evidenceImage, nullifier,
// zkpHash, and clientCreatedAt to the server. `senderNumber` was never
// sent at all, and `location` only ever carried latitude/longitude (never
// region), and only when both were non-null. Since reportController.js
// requires a sender (400 SENDER_REQUIRED otherwise), every offline-queued
// report was guaranteed to fail sync permanently — it would just retry
// until sync_attempts hit MAX_SYNC_ATTEMPTS and then silently stop.
// Both senderNumber and region (now read from sqlite.js's new columns via
// getPendingReports()) are forwarded on every sync attempt, in the same
// shape ReportScreen.js already sends on the live/online submission path
// (a `location` object carrying region, plus a top-level `region` field —
// reportController.js accepts either).

import NetInfo from '@react-native-community/netinfo';
import api, { OfflineError } from '../lib/api';
import { getPendingReports, markReportSynced, markReportSyncFailed } from './sqlite';

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

// FIX: mirrors normalizeScamType()'s defensive pattern for region, so a
// row with a blank/legacy value still forwards something the officer
// queue's region filter can match against — 'UNCLASSIFIED' is the same
// sentinel reportController.js falls back to server-side.
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
          // FIX: previously omitted entirely — this is what caused every
          // offline report to be rejected with 400 SENDER_REQUIRED.
          senderNumber: report.senderNumber || undefined,
          content: report.content,
          evidenceFiles: report.evidenceFiles,
          evidenceImage: report.evidenceImage,
          // FIX: always send a location object carrying `region`, not just
          // lat/lng, and not gated on both being present — matches the
          // shape ReportScreen.js already sends on the online path.
          location: {
            latitude: report.latitude ?? null,
            longitude: report.longitude ?? null,
            region,
          },
          // FIX: also send region at the top level, mirroring
          // ReportScreen.js's online payload — reportController.js
          // accepts either location.region or body.region.
          region,
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