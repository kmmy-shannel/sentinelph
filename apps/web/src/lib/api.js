import axios from 'axios';
import { auth } from '../config/firebase';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor: attaches the current Firebase ID token to every
 * outgoing request so the Express Auth Gateway (Phase 1) and RBAC
 * middleware (Phase 2) can authenticate/authorize the caller.
 */
apiClient.interceptors.request.use(
  async (config) => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      console.log('[TOKEN]', token); 
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor: on 401 (expired/invalid token) forces a fresh
 * token fetch and retries once. On repeated failure, signs the user out
 * so AuthContext can redirect to /login.
 */
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

// ---- Convenience endpoint wrappers -------------------------------------

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
// ---- Review Queue endpoint wrappers -------------------------------------

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

export default apiClient;