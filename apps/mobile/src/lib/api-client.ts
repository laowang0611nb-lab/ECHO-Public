import { createApiClient } from "@echo/api-client";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";

const localApiUrl = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000";
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? localApiUrl;

export const apiClient = createApiClient({
  baseUrl,
  fetchImpl: expoFetch as unknown as typeof fetch,
});
