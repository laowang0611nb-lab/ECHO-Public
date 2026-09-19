const MAINLAND_PHONE_PATTERN = /^1[3-9]\d{9}$/;

export function normalizeMainlandPhone(value: string): string {
  let normalized = value.replace(/[\s-]/g, "");
  if (normalized.startsWith("+86")) {
    normalized = normalized.slice(3);
  } else if (/^86\d{11}$/.test(normalized)) {
    normalized = normalized.slice(2);
  }
  return normalized.replace(/\D/g, "").slice(0, 11);
}

export function isValidMainlandPhone(value: string): boolean {
  return MAINLAND_PHONE_PATTERN.test(value);
}

export function passwordValidationMessage(password: string): string | null {
  if (password.length < 8) {
    return "密码至少需要 8 位。";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "密码必须同时包含字母和数字。";
  }
  return null;
}
