import type { HealthResponse } from "@echo/shared-types";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function createApiClient({ baseUrl, fetchImpl = fetch }: ApiClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`ECHO API request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    health: () => request<HealthResponse>("/api/v1/health"),
  };
}
