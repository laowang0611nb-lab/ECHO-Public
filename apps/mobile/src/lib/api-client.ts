import { createApiClient } from "@echo/api-client";
import { fetch as expoFetch } from "expo/fetch";
const localApiUrl = "http://127.0.0.1:8000";
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? localApiUrl;

export const apiClient = createApiClient({
  baseUrl,
  fetchImpl: expoFetch as unknown as typeof fetch,
});
