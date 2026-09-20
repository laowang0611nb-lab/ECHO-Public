import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

import {
  AuthButton,
  AuthErrorBanner,
  AuthLink,
  AuthScreen,
  PasswordField,
} from "@/components/student/auth-ui";
import { clearAuthSession } from "@/services/auth-session-storage";
import {
  clearPasswordResetChallenge,
  loadPasswordResetChallenge,
  type PasswordResetChallenge,
} from "@/services/password-reset-storage";
import {
  studentAuthService,
  studentReadableAuthError,
} from "@/services/student-auth";

export default function ResetPasswordScreen() {
  const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await loadPasswordResetChallenge();
      if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) {
        await clearPasswordResetChallenge();
        setChallenge(null);
      } else {
        setChallenge(stored);
      }
      setLoadingChallenge(false);
    })();
  }, []);

  async function submit() {
    const nextPasswordError =
      password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
        ? null
        : "密码至少 8 位，并同时包含字母和数字。";
    const nextConfirmError =
      confirmPassword === password ? null : "两次输入的密码不一致。";
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    if (!challenge || nextPasswordError || nextConfirmError || pending) return;

    setPending(true);
    setError(null);
    try {
      await studentAuthService.resetPassword({
        phone: challenge.phone,
        verification_token: challenge.verificationToken,
        new_password: password,
      });
      await Promise.all([
        clearPasswordResetChallenge(),
        clearAuthSession(),
      ]);
      Alert.alert("密码已重置", "请使用新密码重新登录。", [
        {
          text: "返回登录",
          onPress: () => router.replace("/login"),
        },
      ]);
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setPending(false);
    }
  }

  if (!loadingChallenge && !challenge) {
    return (
      <AuthScreen
        description="验证码验证已失效，请重新验证手机号。"
        eyebrow="重置密码"
        title="验证已过期"
      >
        <AuthErrorBanner message="请重新获取验证码后再设置新密码。" />
        <AuthButton
          label="重新验证"
          onPress={() => router.replace("/forgot-password")}
        />
        <AuthLink
          action="返回登录"
          onPress={() => router.replace("/login")}
          prompt=""
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      description="设置一个安全的新密码，完成后使用新密码登录。"
      eyebrow="重置密码"
      title="设置新密码"
    >
      <AuthErrorBanner message={error} />

      <PasswordField
        autoComplete="new-password"
        error={passwordError}
        label="新密码"
        onChangeText={(value) => {
          setPassword(value);
          setPasswordError(null);
        }}
        placeholder="至少 8 位，包含字母和数字"
        value={password}
      />

      <PasswordField
        autoComplete="new-password"
        error={confirmError}
        label="确认新密码"
        onChangeText={(value) => {
          setConfirmPassword(value);
          setConfirmError(null);
        }}
        placeholder="请再次输入新密码"
        value={confirmPassword}
      />

      <AuthButton
        disabled={loadingChallenge || !password || !confirmPassword}
        label={pending ? "重置中..." : "确认重置密码"}
        loading={pending || loadingChallenge}
        onPress={() => void submit()}
      />

      <AuthLink
        action="返回登录"
        onPress={() => router.replace("/login")}
        prompt=""
      />
    </AuthScreen>
  );
}
