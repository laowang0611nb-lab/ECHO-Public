import { studentStorage } from "@/services/student-storage";

const PASSWORD_RESET_CHALLENGE_KEY =
  "echo.student.password-reset.challenge.v1";

export interface PasswordResetChallenge {
  phone: string;
  verificationToken: string;
  expiresAt: string;
}

export async function savePasswordResetChallenge(
  challenge: PasswordResetChallenge,
): Promise<void> {
  await studentStorage.setItem(
    PASSWORD_RESET_CHALLENGE_KEY,
    JSON.stringify(challenge),
  );
}

export async function loadPasswordResetChallenge(): Promise<PasswordResetChallenge | null> {
  const stored = await studentStorage.getItem(PASSWORD_RESET_CHALLENGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as PasswordResetChallenge;
    if (
      typeof parsed.phone !== "string" ||
      typeof parsed.verificationToken !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
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
