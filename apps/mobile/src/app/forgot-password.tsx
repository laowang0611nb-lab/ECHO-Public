import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  AuthButton,
  AuthErrorBanner,
  AuthField,
  AuthLink,
  AuthScreen,
} from "@/components/student/auth-ui";
import { studentTheme } from "@/constants/student-theme";
import { savePasswordResetChallenge } from "@/services/password-reset-storage";
import {
  isMainlandPhone,
  normalizePhone,
  studentAuthService,
  studentReadableAuthError,
} from "@/services/student-auth";

export default function ForgotPasswordScreen() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const verifyLockRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode() {
    const normalized = normalizePhone(phone);
    if (!isMainlandPhone(normalized) || sending || cooldown > 0) {
      setFieldError("请输入正确的 11 位手机号。");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await studentAuthService.sendSmsCode(
        normalized,
        "password_reset",
      );
      setCooldown(response.cooldown_seconds);
      setFieldError(null);
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setSending(false);
    }
  }

  async function verifyAndContinue() {
    if (pending || verifyLockRef.current) return;
    const normalized = normalizePhone(phone);
    if (!isMainlandPhone(normalized)) {
      setFieldError("请输入正确的 11 位手机号。");
      return;
    }
    if (!/^[A-Za-z0-9]{4,8}$/.test(code.trim())) {
      setError("请输入正确的验证码。");
      return;
    }
    setPending(true);
    verifyLockRef.current = true;
    setError(null);
    try {
      const verification = await studentAuthService.verifySmsCode(
        normalized,
        code.trim(),
        "password_reset",
      );
      await savePasswordResetChallenge({
        phone: normalized,
        verificationToken: verification.verification_token,
        expiresAt: new Date(
          Date.now() + verification.expires_in_seconds * 1000,
        ).toISOString(),
      });
      router.push("/reset-password");
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      verifyLockRef.current = false;
      setPending(false);
    }
  }

  return (
    <AuthScreen
      description="验证手机号后，设置一个新的登录密码。"
      eyebrow="找回密码"
      title="验证你的账号"
    >
      <AuthErrorBanner message={error} />

      <View style={styles.codeRow}>
        <View style={styles.codeField}>
          <AuthField
            autoComplete="tel"
            error={fieldError}
            keyboardType="phone-pad"
            label="手机号"
            maxLength={11}
            onChangeText={(value) => {
              setPhone(normalizePhone(value));
              setFieldError(null);
            }}
            placeholder="请输入注册手机号"
            value={phone}
          />
        </View>
        <Pressable
          disabled={sending || cooldown > 0}
          onPress={() => void sendCode()}
          style={({ pressed }) => [
            styles.codeButton,
            (sending || cooldown > 0) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {sending ? (
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
        keyboardType="number-pad"
        label="验证码"
        maxLength={8}
        onChangeText={(value) => setCode(value.replace(/\s/g, ""))}
        placeholder="请输入验证码"
        value={code}
      />

      <AuthButton
        disabled={!phone || !code}
        label={pending ? "验证中..." : "验证并继续"}
        loading={pending}
        onPress={() => void verifyAndContinue()}
      />

      <AuthLink
        action="返回登录"
        onPress={() => router.replace("/login")}
        prompt="想起密码了？"
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
