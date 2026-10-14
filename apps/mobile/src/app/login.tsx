import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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

type LoginMode = "password" | "sms";

export default function LoginScreen() {
  const { login, loginWithSms } = useStudentSession();
  const [mode, setMode] = useState<LoginMode>("password");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [smsPending, setSmsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const passwordSubmitLock = useRef(false);
  const smsSubmitLock = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function completeLogin() {
    const pendingCourseCode = await loadPendingCourseCode();
    if (pendingCourseCode) {
      router.replace({
        pathname: "/join-course",
        params: { code: pendingCourseCode },
      });
    } else {
      router.replace("/(tabs)/ai");
    }
  }

  async function handlePasswordSubmit() {
    if (passwordSubmitLock.current || smsPending) return;
    const normalizedAccount = account.trim();
    const nextAccountError = normalizedAccount
      ? null
      : "请输入手机号或邮箱。";
    const nextPasswordError = password ? null : "请输入密码。";
    setAccountError(nextAccountError);
    setPasswordError(nextPasswordError);
    if (nextAccountError || nextPasswordError) return;

    passwordSubmitLock.current = true;
    setPasswordPending(true);
    setError(null);
    try {
      await login({ account: normalizedAccount, password });
      await completeLogin();
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      passwordSubmitLock.current = false;
      setPasswordPending(false);
    }
  }

  async function sendCode() {
    const normalizedPhone = normalizePhone(phone);
    if (!isMainlandPhone(normalizedPhone)) {
      setPhoneError("请输入正确的 11 位手机号。");
      return;
    }
    if (sendingCode || cooldown > 0) return;

    setSendingCode(true);
    setError(null);
    setPhoneError(null);
    try {
      const response = await studentAuthService.sendSmsCode(normalizedPhone);
      setPhone(normalizedPhone);
      setCooldown(Math.max(1, response.cooldown_seconds || 60));
      setCode("");
      setCodeError(null);
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSmsSubmit() {
    if (smsSubmitLock.current || passwordPending) return;
    const normalizedPhone = normalizePhone(phone);
    const nextPhoneError = isMainlandPhone(normalizedPhone)
      ? null
      : "请输入正确的 11 位手机号。";
    const nextCodeError = /^[A-Za-z0-9]{4,8}$/.test(code.trim())
      ? null
      : "请输入正确的验证码。";
    setPhoneError(nextPhoneError);
    setCodeError(nextCodeError);
    if (nextPhoneError || nextCodeError) return;

    smsSubmitLock.current = true;
    setSmsPending(true);
    setError(null);
    try {
      const verification = await studentAuthService.verifySmsCode(
        normalizedPhone,
        code.trim(),
        "login",
      );
      await loginWithSms({
        phone: normalizedPhone,
        verificationToken: verification.verification_token,
      });
      await completeLogin();
    } catch (requestError) {
      setCode("");
      setError(studentReadableAuthError(requestError));
    } finally {
      smsSubmitLock.current = false;
      setSmsPending(false);
    }
  }

  function changeMode(nextMode: LoginMode) {
    if (mode === nextMode) return;
    if (nextMode === "sms") {
      const normalizedAccount = normalizePhone(account);
      if (isMainlandPhone(normalizedAccount)) setPhone(normalizedAccount);
    } else {
      const normalizedPhone = normalizePhone(phone);
      if (isMainlandPhone(normalizedPhone)) setAccount(normalizedPhone);
    }
    setMode(nextMode);
    setError(null);
    setAccountError(null);
    setPasswordError(null);
    setPhoneError(null);
    setCodeError(null);
  }

  const busy = passwordPending || smsPending;

  return (
    <AuthScreen
      description={
        mode === "password"
          ? "使用手机号或邮箱密码登录，继续你的课程学习。"
          : "使用已注册手机号获取验证码，验证后继续你的课程学习。"
      }
      eyebrow="学生登录"
      title="欢迎回来"
    >
      <View style={styles.modeTabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "password" }}
          disabled={busy}
          onPress={() => changeMode("password")}
          style={({ pressed }) => [
            styles.modeTab,
            mode === "password" && styles.modeTabActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              mode === "password" && styles.modeTabTextActive,
            ]}
          >
            密码登录
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "sms" }}
          disabled={busy}
          onPress={() => changeMode("sms")}
          style={({ pressed }) => [
            styles.modeTab,
            mode === "sms" && styles.modeTabActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              mode === "sms" && styles.modeTabTextActive,
            ]}
          >
            短信登录
          </Text>
        </Pressable>
      </View>

      <AuthErrorBanner message={error} />

      {mode === "password" ? (
        <>
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
            onSubmitEditing={() => void handlePasswordSubmit()}
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
            onSubmitEditing={() => void handlePasswordSubmit()}
            placeholder="请输入密码"
            returnKeyType="done"
            value={password}
          />

          <AuthButton
            disabled={!account.trim() || !password || smsPending}
            label={passwordPending ? "登录中..." : "登录"}
            loading={passwordPending}
            onPress={() => void handlePasswordSubmit()}
          />
        </>
      ) : (
        <>
          <View style={styles.codeRow}>
            <View style={styles.codeField}>
              <AuthField
                autoComplete="tel"
                error={phoneError}
                keyboardType="phone-pad"
                label="手机号"
                maxLength={11}
                onChangeText={(value) => {
                  setPhone(normalizePhone(value));
                  setPhoneError(null);
                  setCode("");
                  setCodeError(null);
                }}
                placeholder="请输入注册手机号"
                value={phone}
              />
            </View>
            <Pressable
              accessibilityLabel="获取短信验证码"
              disabled={sendingCode || cooldown > 0 || busy}
              onPress={() => void sendCode()}
              style={({ pressed }) => [
                styles.codeButton,
                (sendingCode || cooldown > 0 || busy) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {sendingCode ? (
                <ActivityIndicator
                  color={studentTheme.color.primary}
                  size="small"
                />
              ) : (
                <Text style={styles.codeButtonText}>
                  {cooldown > 0 ? `重新发送 ${cooldown}s` : "获取验证码"}
                </Text>
              )}
            </Pressable>
          </View>

          <AuthField
            autoComplete="one-time-code"
            error={codeError}
            keyboardType="number-pad"
            label="验证码"
            maxLength={8}
            onChangeText={(value) => {
              setCode(value.replace(/\s/g, ""));
              setCodeError(null);
            }}
            onSubmitEditing={() => void handleSmsSubmit()}
            placeholder="请输入验证码"
            returnKeyType="done"
            value={code}
          />

          <AuthButton
            disabled={!phone || !code || passwordPending}
            label={smsPending ? "登录中..." : "登录"}
            loading={smsPending}
            onPress={() => void handleSmsSubmit()}
          />
        </>
      )}

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

const styles = StyleSheet.create({
  modeTabs: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  modeTab: {
    alignItems: "center",
    borderRadius: studentTheme.radius.small,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  modeTabActive: {
    backgroundColor: studentTheme.color.primary,
  },
  modeTabText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  modeTabTextActive: {
    color: "#ffffff",
  },
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
