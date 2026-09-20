import { router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";

import {
  AuthButton,
  AuthErrorBanner,
  AuthScreen,
  PasswordField,
} from "@/components/student/auth-ui";
import { apiClient } from "@/lib/api-client";
import { studentReadableAuthError } from "@/services/student-auth";
import { useStudentSession } from "@/providers/student-session-provider";

export default function ChangePasswordScreen() {
  const { user, logout } = useStudentSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit() {
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.currentPassword = "请输入当前密码。";
    if (
      newPassword.length < 8 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      errors.newPassword = "新密码至少 8 位，并同时包含字母和数字。";
    }
    if (confirmPassword !== newPassword) {
      errors.confirmPassword = "两次输入的新密码不一致。";
    }
    setFieldErrors(errors);
    if (!user || Object.keys(errors).length > 0 || pending) return;

    setPending(true);
    setError(null);
    try {
      await apiClient.changePassword(user.id, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      Alert.alert("密码已修改", "其他登录会话已失效，请重新登录。", [
        {
          text: "重新登录",
          onPress: () => {
            void logout().then(() => router.replace("/login"));
          },
        },
      ]);
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      description="修改成功后，其他登录设备上的会话会失效。"
      eyebrow="账号与安全"
      title="修改密码"
    >
      <AuthErrorBanner message={error} />

      <PasswordField
        autoComplete="current-password"
        error={fieldErrors.currentPassword}
        label="当前密码"
        onChangeText={(value) => {
          setCurrentPassword(value);
          setFieldErrors((current) => ({ ...current, currentPassword: "" }));
        }}
        placeholder="请输入当前密码"
        value={currentPassword}
      />

      <PasswordField
        autoComplete="new-password"
        error={fieldErrors.newPassword}
        label="新密码"
        onChangeText={(value) => {
          setNewPassword(value);
          setFieldErrors((current) => ({ ...current, newPassword: "" }));
        }}
        placeholder="至少 8 位，包含字母和数字"
        value={newPassword}
      />

      <PasswordField
        autoComplete="new-password"
        error={fieldErrors.confirmPassword}
        label="确认新密码"
        onChangeText={(value) => {
          setConfirmPassword(value);
          setFieldErrors((current) => ({ ...current, confirmPassword: "" }));
        }}
        placeholder="请再次输入新密码"
        value={confirmPassword}
      />

      <AuthButton
        disabled={!currentPassword || !newPassword || !confirmPassword}
        label={pending ? "修改中..." : "确认修改"}
        loading={pending}
        onPress={() => void submit()}
      />
    </AuthScreen>
  );
}
