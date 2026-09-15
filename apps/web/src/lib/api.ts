import { createApiClient } from "@echo/api-client";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export const apiClient = createApiClient({ baseUrl });
