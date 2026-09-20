import { getApiBaseUrlSync } from "@/services/api-network-config";
import { studentStorage } from "@/services/student-storage";

export const PENDING_COURSE_CODE_KEY = "echo.student.pending-course-code";

interface StoredPendingCourse {
  version: 1;
  apiBaseUrl: string;
  code: string;
}

function isStoredPendingCourse(value: unknown): value is StoredPendingCourse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredPendingCourse>;
  return (
    candidate.version === 1 &&
    typeof candidate.apiBaseUrl === "string" &&
    typeof candidate.code === "string"
  );
}

export async function savePendingCourseCode(code: string): Promise<void> {
  const stored: StoredPendingCourse = {
    version: 1,
    apiBaseUrl: getApiBaseUrlSync(),
    code,
  };
  await studentStorage.setItem(PENDING_COURSE_CODE_KEY, JSON.stringify(stored));
}

export async function loadPendingCourseCode(): Promise<string | null> {
  const stored = await studentStorage.getItem(PENDING_COURSE_CODE_KEY);
  if (!stored) return null;

  try {
    const parsed: unknown = JSON.parse(stored);
    if (isStoredPendingCourse(parsed)) {
      if (parsed.apiBaseUrl !== getApiBaseUrlSync()) {
        await clearPendingCourseCode();
        return null;
      }
      return parsed.code;
    }
  } catch {
    // Older builds stored a plain course code string.
  }

  const legacyCode = stored.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(legacyCode)) {
    await clearPendingCourseCode();
    return null;
  }
  await savePendingCourseCode(legacyCode);
  return legacyCode;
}

export async function clearPendingCourseCode(): Promise<void> {
  await studentStorage.removeItem(PENDING_COURSE_CODE_KEY);
}
