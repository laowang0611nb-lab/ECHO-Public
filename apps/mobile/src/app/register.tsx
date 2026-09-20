import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  AuthButton,
  AuthErrorBanner,
  AuthField,
  AuthLink,
  AuthScreen,
  PasswordField,
} from "@/components/student/auth-ui";
import { studentTheme } from "@/constants/student-theme";
import {
  isMainlandPhone,
  normalizePhone,
  studentAuthService,
  studentReadableAuthError,
} from "@/services/student-auth";
import { loadPendingCourseCode } from "@/services/pending-course-storage";
import { useStudentSession } from "@/providers/student-session-provider";

export default function RegisterScreen() {
  const { register } = useStudentSession();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!displayName.trim()) errors.displayName = "请输入姓名。";
    const normalizedPhone = normalizePhone(phone);
    if (!isMainlandPhone(normalizedPhone)) {
      errors.phone = "请输入正确的 11 位手机号。";
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "请输入正确的邮箱地址。";
    }
    if (!/^[A-Za-z0-9]{4,8}$/.test(code.trim())) {
      errors.code = "请输入正确的验证码。";
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errors.password = "密码至少 8 位，并同时包含字母和数字。";
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "两次输入的密码不一致。";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function sendCode() {
    const normalizedPhone = normalizePhone(phone);
    if (!isMainlandPhone(normalizedPhone) || sendingCode || cooldown > 0) {
      setFieldErrors((current) => ({
        ...current,
        phone: "请输入正确的 11 位手机号。",
      }));
      return;
    }
    setSendingCode(true);
    setError(null);
    try {
      const response = await studentAuthService.sendSmsCode(normalizedPhone);
      setCooldown(response.cooldown_seconds);
      setFieldErrors((current) => ({ ...current, phone: "" }));
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setSendingCode(false);
    }
  }

  async function submit() {
    if (pending || !validate()) return;
    setPending(true);
    setError(null);
    try {
      const normalizedPhone = normalizePhone(phone);
      const verification = await studentAuthService.verifySmsCode(
        normalizedPhone,
        code.trim(),
        "register",
      );
      await register({
        displayName: displayName.trim(),
        phone: normalizedPhone,
        email: email.trim() || null,
        password,
        verificationToken: verification.verification_token,
        deviceName: "ECHO Android",
      });
      const pendingCourseCode = await loadPendingCourseCode();
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
      description="使用手机号验证身份，创建你的学生账号。"
      eyebrow="学生注册"
      title="创建学生账号"
    >
      <AuthErrorBanner message={error} />

      <AuthField
        autoComplete="name"
        error={fieldErrors.displayName}
        label="姓名"
        onChangeText={(value) => {
          setDisplayName(value);
          setFieldErrors((current) => ({ ...current, displayName: "" }));
        }}
        placeholder="请输入姓名"
        value={displayName}
      />

      <View style={styles.codeRow}>
        <View style={styles.codeField}>
          <AuthField
            autoComplete="tel"
            error={fieldErrors.phone}
            keyboardType="phone-pad"
            label="手机号"
            maxLength={11}
            onChangeText={(value) => {
              setPhone(normalizePhone(value));
              setFieldErrors((current) => ({ ...current, phone: "" }));
            }}
            placeholder="请输入 11 位手机号"
            value={phone}
          />
        </View>
        <Pressable
          disabled={sendingCode || cooldown > 0}
          onPress={() => void sendCode()}
          style={({ pressed }) => [
            styles.codeButton,
            (sendingCode || cooldown > 0) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {sendingCode ? (
            <ActivityIndicator color={studentTheme.color.primary} size="small" />
          ) : (
            <Text style={styles.codeButtonText}>
              {cooldown > 0 ? `重新发送 ${cooldown}s` : "获取验证码"}
            </Text>
          )}
        </Pressable>
      </View>

      <AuthField
        autoComplete="one-time-code"
        error={fieldErrors.code}
        keyboardType="number-pad"
        label="验证码"
        maxLength={8}
        onChangeText={(value) => {
          setCode(value.replace(/\s/g, ""));
          setFieldErrors((current) => ({ ...current, code: "" }));
        }}
        placeholder="请输入验证码"
        value={code}
      />

      <AuthField
        autoCapitalize="none"
        autoComplete="email"
        error={fieldErrors.email}
        keyboardType="email-address"
        label="邮箱（选填）"
        onChangeText={(value) => {
          setEmail(value);
          setFieldErrors((current) => ({ ...current, email: "" }));
        }}
        placeholder="用于后续账号找回"
        value={email}
      />

      <PasswordField
        autoComplete="new-password"
        error={fieldErrors.password}
        label="设置密码"
        onChangeText={(value) => {
          setPassword(value);
          setFieldErrors((current) => ({ ...current, password: "" }));
        }}
        placeholder="至少 8 位，包含字母和数字"
        value={password}
      />

      <PasswordField
        autoComplete="new-password"
        error={fieldErrors.confirmPassword}
        label="确认密码"
        onChangeText={(value) => {
          setConfirmPassword(value);
          setFieldErrors((current) => ({ ...current, confirmPassword: "" }));
        }}
        placeholder="请再次输入密码"
        value={confirmPassword}
      />

      <AuthButton
        disabled={!phone || !code || !password || !confirmPassword}
        label={pending ? "注册中..." : "注册并进入 ECHO"}
        loading={pending}
        onPress={() => void submit()}
      />

      <AuthLink
        action="返回登录"
        onPress={() => router.replace("/login")}
        prompt="已有账号？"
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  codeRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  codeField: {
    flex: 1,
  },
  codeButton: {
    alignItems: "center",
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 39,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  codeButtonText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
