// apps/mobile/lib/api.js
//
// Central Axios instance for SentinelPH Citizen App.
// - Injects a fresh Firebase ID token on every request.
// - Detects offline state via NetInfo and short-circuits with a typed
//   OfflineError instead of letting the request hang/timeout, so screens
//   can catch it and fall back to the SQLite queue.
// - Normalizes backend error payloads into a single shape screens can rely on.

import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { auth } from '../config/firebase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set. Add it to your .env file.'
  );
}

export class OfflineError extends Error {
  constructor(message = 'Device is offline') {
    super(message);
    this.name = 'OfflineError';
    this.isOffline = true;
  }
}

export class ApiError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor: auth token + connectivity gate ──────────────────
api.interceptors.request.use(
  async (config) => {
    if (!config.skipOfflineCheck) {
      const netState = await NetInfo.fetch();
      const isConnected = Boolean(netState.isConnected && netState.isInternetReachable !== false);
      if (!isConnected) {
        return Promise.reject(new OfflineError());
      }
    }

    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken(false);
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('[api] Failed to attach Firebase ID token:', err?.message);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor: normalize errors, retry once on 401 ────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error instanceof OfflineError) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    // Token likely expired mid-flight — force refresh once and retry.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const freshToken = await currentUser.getIdToken(true);
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        console.warn('[api] Token refresh failed:', refreshErr?.message);
      }
    }

    if (!error.response) {
      return Promise.reject(new OfflineError('Request failed — check your connection'));
    }

    const { status, data } = error.response;
    return Promise.reject(
      new ApiError(data?.error?.message || 'Something went wrong. Please try again.', {
        status,
        code: data?.error?.code,
        data,
      })
    );
  }
);

export default api;