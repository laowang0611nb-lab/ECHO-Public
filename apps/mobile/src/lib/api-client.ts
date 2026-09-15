import { createApiClient } from "@echo/api-client";
import { fetch as expoFetch } from "expo/fetch";

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export const apiClient = createApiClient({
  baseUrl,
  fetchImpl: expoFetch as unknown as typeof fetch,
});
