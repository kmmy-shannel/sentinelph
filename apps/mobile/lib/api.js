// apps/mobile/lib/api.js
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

export async function fetchReports(params = {}) {
  const response = await api.get('/api/v1/reports', { params });
  return response.data;
}

export async function submitReportVote(reportId, { decision, comment }) {
  const response = await api.post(`/api/v1/reports/${reportId}/vote`, {
    decision,
    comment,
  });
  return response.data;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error instanceof OfflineError) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

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

export async function bootstrapCitizenRole() {
  const response = await api.post('/api/v1/auth/bootstrap-citizen', {});
  return response.data;
}

// ─── Registry detail ──────────────────────────────────────────────────
/**
 * GET /api/v1/blacklist/:identifier/detail
 * Returns the citizen-facing explanation payload for a blacklisted
 * number or impersonated brand: AI verdict, officer verdict, report
 * count, region, blacklisted-at. Throws ApiError (404) if no entry.
 */
export async function getBlacklistDetail(identifier) {
  const encoded = encodeURIComponent(String(identifier || '').trim());
  const response = await api.get(`/api/v1/blacklist/${encoded}/detail`);
  return response.data?.data || null;
}

export default api;