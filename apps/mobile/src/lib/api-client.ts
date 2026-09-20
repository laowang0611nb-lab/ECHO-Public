import { createApiClient } from "@echo/api-client";
import { fetch as expoFetch } from "expo/fetch";
import {
  clearAuthSession,
  getAccessTokenSync,
  getRefreshTokenSync,
  persistAuthSession,
} from "@/services/auth-session-storage";
import { getApiBaseUrlSync } from "@/services/api-network-config";
const baseUrl = getApiBaseUrlSync();

export const apiClient = createApiClient({
  baseUrl,
  getBaseUrl: getApiBaseUrlSync,
  fetchImpl: expoFetch as unknown as typeof fetch,
  getAccessToken: getAccessTokenSync,
  getRefreshToken: getRefreshTokenSync,
  onAuthSessionUpdate: persistAuthSession,
  onAuthSessionExpired: clearAuthSession,
});
