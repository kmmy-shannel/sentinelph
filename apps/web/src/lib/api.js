// apps/web/src/lib/api.js
//
// Axios instance for the SentinelPH Express API Gateway.

import axios from 'axios';
import { auth } from '../config/firebase';

function resolveBaseUrl() {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:4000';

  return String(raw)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '');
}

export const API_BASE_URL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
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

// ─── Change password (two-step with OTP) ──────────────────────────────

/**
 * POST /api/v1/account/request-password-change-otp
 *
 * Step 1 of 2. Verifies the current password and sends a 6-digit
 * verification code to the officer's registered email address.
 *
 * Returns { success: true, message } on success.
 * Throws on 400 (wrong current password, no email, cooldown) with
 * err.response.data.message carrying the reason.
 */
export async function requestPasswordChangeOtp({ currentPassword }) {
  const response = await apiClient.post(
    '/api/v1/account/request-password-change-otp',
    { currentPassword }
  );
  return response.data;
}

/**
 * POST /api/v1/account/change-password
 *
 * Step 2 of 2. Requires the OTP that was emailed in step 1.
 * The server re-verifies the current password (defense in depth),
 * verifies the OTP against the hashed stored value, enforces
 * expiry + single-use + attempt limits, then updates the password
 * via Firebase Admin SDK.
 */
export async function changePassword({
  currentPassword,
  newPassword,
  confirmPassword,
  otpCode,
}) {
  const response = await apiClient.post('/api/v1/account/change-password', {
    currentPassword,
    newPassword,
    confirmPassword,
    otpCode,
  });
  return response.data;
}

export default apiClient;