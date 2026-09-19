import { ApiClientError } from "@echo/api-client";

export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.status >= 500;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("fetch") ||
      message.includes("connect") ||
      message.includes("timeout")
    );
  }

  return false;
}
