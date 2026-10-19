// apps/web/src/lib/api.js
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

// ─── CHANGE PASSWORD (FIXED) ──────────────────────────────────────────
export async function changePassword({
  currentPassword,
  newPassword,
  confirmPassword,
  otpCode,
}) {
  // Forcefully strip any hidden spaces from the OTP code
  const cleanOtp = otpCode ? String(otpCode).replace(/\s/g, '') : '';

  const body = { currentPassword, newPassword, confirmPassword };
  if (cleanOtp) body.otpCode = cleanOtp;

  const response = await apiClient.post('/api/v1/account/change-password', body);
  return response.data;
}

export async function requestPasswordChangeOtp({ currentPassword }) {
  const response = await apiClient.post('/api/v1/account/request-password-change-otp', {
    currentPassword,
  });
  return response.data;
}

export async function requestPasswordResetOtp(email) {
  const response = await apiClient.post('/api/v1/auth/request-password-otp', { email });
  return response.data;
}

export async function verifyPasswordResetOtp(email, otp) {
  const response = await apiClient.post('/api/v1/auth/verify-password-otp', { email, otp });
  return response.data;
}

export async function resetPasswordWithOtp(resetSessionToken, newPassword) {
  const response = await apiClient.post('/api/v1/auth/reset-password-with-otp', {
    resetSessionToken,
    newPassword,
  });
  return response.data;
}

export default apiClient;