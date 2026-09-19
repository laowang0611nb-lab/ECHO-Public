import type { User } from "@echo/shared-types";

export function isPlaceholderPhoneEmail(email: string): boolean {
  return /^phone-\d+@echo\.example$/i.test(email);
}

export function accountIdentifier(user: Pick<User, "phone" | "email">): string {
  if (user.phone) return user.phone;
  return isPlaceholderPhoneEmail(user.email) ? "未绑定邮箱" : user.email;
}
