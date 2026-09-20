import { router } from "expo-router";
import { useState } from "react";

import {
  AuthButton,
  AuthErrorBanner,
  AuthField,
  AuthLink,
  AuthScreen,
  PasswordField,
} from "@/components/student/auth-ui";
import {
  PENDING_COURSE_CODE_KEY,
  studentReadableAuthError,
} from "@/services/student-auth";
import { studentStorage } from "@/services/student-storage";
import { useStudentSession } from "@/providers/student-session-provider";

export default function LoginScreen() {
  const { login } = useStudentSession();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit() {
    const normalizedAccount = account.trim();
    const nextAccountError = normalizedAccount
      ? null
      : "请输入手机号或邮箱。";
    const nextPasswordError = password ? null : "请输入密码。";
    setAccountError(nextAccountError);
    setPasswordError(nextPasswordError);
    if (nextAccountError || nextPasswordError || pending) return;

    setPending(true);
    setError(null);
    try {
      await login({ account: normalizedAccount, password });
      const pendingCourseCode = await studentStorage.getItem(
        PENDING_COURSE_CODE_KEY,
      );
      if (pendingCourseCode) {
        router.replace({
          pathname: "/join-course",
          params: { code: pendingCourseCode },
        });
      } else {
        router.replace("/(tabs)/ai");
      }
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthScreen
      description="使用手机号或邮箱登录，继续你的课程学习。"
      eyebrow="学生登录"
      title="欢迎回来"
    >
      <AuthErrorBanner message={error} />

      <AuthField
        autoCapitalize="none"
        autoComplete="username"
        error={accountError}
        keyboardType="email-address"
        label="手机号或邮箱"
        onChangeText={(value) => {
          setAccount(value);
          setAccountError(null);
        }}
        onSubmitEditing={() => void handleSubmit()}
        placeholder="请输入手机号或邮箱"
        returnKeyType="next"
        value={account}
      />

      <PasswordField
        autoComplete="current-password"
        error={passwordError}
        label="密码"
        onChangeText={(value) => {
          setPassword(value);
          setPasswordError(null);
        }}
        onSubmitEditing={() => void handleSubmit()}
        placeholder="请输入密码"
        returnKeyType="done"
        value={password}
      />

      <AuthButton
        disabled={!account.trim() || !password}
        label={pending ? "登录中..." : "登录"}
        loading={pending}
        onPress={() => void handleSubmit()}
      />

      <AuthLink
        action="忘记密码"
        onPress={() => router.push("/forgot-password")}
        prompt=""
      />
      <AuthLink
        action="注册账号"
        onPress={() => router.push("/register")}
        prompt="还没有账号？"
      />
      <AuthLink
        action="网络与连接"
        onPress={() => router.push("/network-settings" as never)}
        prompt=""
      />
    </AuthScreen>
  );
}
