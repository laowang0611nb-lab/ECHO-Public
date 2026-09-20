import { studentStorage } from "@/services/student-storage";
import { getApiBaseUrlSync } from "@/services/api-network-config";

const PASSWORD_RESET_CHALLENGE_KEY =
  "echo.student.password-reset.challenge.v1";

export interface PasswordResetChallenge {
  apiBaseUrl: string;
  phone: string;
  verificationToken: string;
  expiresAt: string;
}

type PasswordResetChallengeInput = Omit<PasswordResetChallenge, "apiBaseUrl">;

export async function savePasswordResetChallenge(
  challenge: PasswordResetChallengeInput,
): Promise<void> {
  await studentStorage.setItem(
    PASSWORD_RESET_CHALLENGE_KEY,
    JSON.stringify({
      ...challenge,
      apiBaseUrl: getApiBaseUrlSync(),
    }),
  );
}

export async function loadPasswordResetChallenge(): Promise<PasswordResetChallenge | null> {
  const stored = await studentStorage.getItem(PASSWORD_RESET_CHALLENGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as PasswordResetChallenge;
    if (
      typeof parsed.apiBaseUrl !== "string" ||
      typeof parsed.phone !== "string" ||
      typeof parsed.verificationToken !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      await clearPasswordResetChallenge();
      return null;
    }
    if (parsed.apiBaseUrl !== getApiBaseUrlSync()) {
      await clearPasswordResetChallenge();
      return null;
    }
    return parsed;
  } catch {
    await clearPasswordResetChallenge();
    return null;
  }
}

export async function clearPasswordResetChallenge(): Promise<void> {
  await studentStorage.removeItem(PASSWORD_RESET_CHALLENGE_KEY);
}
