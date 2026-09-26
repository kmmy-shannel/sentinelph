// apps/web/src/lib/api.js
//
// Axios instance for the SentinelPH Express API Gateway.
//
// BASE URL RESOLUTION:
//   Prefers VITE_API_BASE_URL (the name used in apps/web/.env), falls back
//   to VITE_API_URL (older name), and finally to localhost. In ALL cases
//   the resulting base URL must NOT include the /api/v1 prefix — every
//   call in this file (and in the pages) already passes a full path
//   starting with /api/v1. Prepending it here would double the prefix
//   and produce /api/v1/api/v1/... 404s.
//
// TOKEN FLOW:
//   Request interceptor attaches the current Firebase ID token from
//   firebase/auth. Response interceptor retries once on 401 with a
//   forced-refresh token, then signs the user out if that also fails.

import axios from 'axios';
import { auth } from '../config/firebase';

// Read both possible env var names. Trim any trailing slash so
// `${API_BASE_URL}/api/v1/...` never produces `//api/v1/...`.
// Strip a trailing `/api/v1` if present so callers can pass
// `/api/v1/...` themselves without doubling the prefix.
function resolveBaseUrl() {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:4000';

  return String(raw)
    .trim()
    .replace(/\/+$/, '')       // strip trailing slashes
    .replace(/\/api\/v1$/, ''); // strip a trailing /api/v1 if present
}

export const API_BASE_URL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Render free tier can cold-start in 30–50s. 30s is enough for the
  // change-password handler (Firebase verify + Admin update + Mongo
  // audit) to complete even on a sleeping instance.
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor: attach Firebase ID token ────────────────────
apiClient.interceptors.request.use(
  async (config) => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor: refresh token on 401, retry once ───────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't try to refresh for the change-password endpoint on a 401
    // from the *server* (which uses 401 to signal expired token, not
    // wrong password). The change-password endpoint returns 400 for
    // wrong password, so a 401 here genuinely means the token expired.
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const freshToken = await currentUser.getIdToken(true);
          originalRequest.headers.Authorization = `Bearer ${freshToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        await auth.signOut();
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 401) {
      await auth.signOut();
    }

    return Promise.reject(error);
  }
);

// ─── Convenience endpoint wrappers ────────────────────────────────────

export async function fetchCurrentUserProfile() {
  const response = await apiClient.get('/api/v1/auth/me');
  return response.data;
}

export async function fetchCases(params = {}) {
  const response = await apiClient.get('/api/v1/cases', { params });
  return response.data;
}

export async function fetchCaseById(caseId) {
  const response = await apiClient.get(`/api/v1/cases/${caseId}`);
  return response.data;
}

export async function approveCase(caseId, note) {
  const response = await apiClient.post(`/api/v1/cases/${caseId}/approve`, { note });
  return response.data;
}

export async function rejectCase(caseId, note) {
  const response = await apiClient.post(`/api/v1/cases/${caseId}/reject`, { note });
  return response.data;
}

export async function fetchAnalyticsSummary(range = '30d') {
  const response = await apiClient.get('/api/v1/analytics/summary', { params: { range } });
  return response.data;
}

export async function fetchAnalyticsByRegion(range = '30d') {
  const response = await apiClient.get('/api/v1/analytics/by-region', { params: { range } });
  return response.data;
}

export async function fetchAnalyticsByType(range = '30d') {
  const response = await apiClient.get('/api/v1/analytics/by-type', { params: { range } });
  return response.data;
}

export async function fetchAuditLog(params = {}) {
  const response = await apiClient.get('/api/v1/audit', { params });
  return response.data;
}

export async function verifyAuditChain() {
  const response = await apiClient.get('/api/v1/audit/verify');
  return response.data;
}

// ─── Review Queue endpoint wrappers ───────────────────────────────────

export async function fetchReports(params = {}) {
  const response = await apiClient.get('/api/v1/reports', { params });
  return response.data;
}

export async function submitReportVote(reportId, { decision, comment }) {
  const response = await apiClient.post(`/api/v1/reports/${reportId}/vote`, {
    decision,
    comment,
  });
  return response.data;
}

// ─── Change password ──────────────────────────────────────────────────

/**
 * POST /api/v1/account/change-password
 * Sends { currentPassword, newPassword, confirmPassword }. The server
 * verifies the current password against Firebase, then updates via the
 * Admin SDK. Returns { success: true } on success.
 */
export async function changePassword({ currentPassword, newPassword, confirmPassword }) {
  const response = await apiClient.post('/api/v1/account/change-password', {
    currentPassword,
    newPassword,
    confirmPassword,
  });
  return response.data;
}

export default apiClient;