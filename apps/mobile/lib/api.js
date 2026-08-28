import axios from 'axios';

export const API_BASE_URL = 'https://api.sentinelph.gov.ph';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Attach or clear the JWT issued by the Phase 1 Auth Gateway.
 * @param {string|null} token
 */
export function setAuthToken(token) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

export async function submitReport(reportPayload) {
  const response = await apiClient.post('/api/v1/reports', reportPayload);
  return response.data;
}

export async function fetchBlacklistStatus(phoneNumber) {
  const response = await apiClient.get(`/api/v1/blacklist/${encodeURIComponent(phoneNumber)}`);
  return response.data;
}

export async function fetchNearbyAlerts(latitude, longitude, radiusKm = 5) {
  const response = await apiClient.get('/api/v1/alerts/nearby', {
    params: { lat: latitude, lng: longitude, radius: radiusKm },
  });
  return response.data;
}