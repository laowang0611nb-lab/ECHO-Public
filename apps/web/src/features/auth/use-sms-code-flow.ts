"use client";

import type { PhoneVerificationPurpose } from "@echo/shared-types";
import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/lib/api";
import { mapSmsError } from "@/features/auth/sms-error";
import { isValidMainlandPhone, normalizeMainlandPhone } from "@/features/auth/validation";

export function useSmsCodeFlow(purpose: PhoneVerificationPurpose) {
  const [phone, setPhoneState] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const setPhone = useCallback((value: string) => {
    const normalized = normalizeMainlandPhone(value);
    setPhoneState(normalized);
    setCode("");
    setCooldown(0);
    setCodeSent(false);
    setVerified(false);
    setVerificationToken(null);
    setExpiresInSeconds(null);
    setNotice(null);
    setError(null);
  }, []);

  const sendCode = useCallback(async () => {
    if (!isValidMainlandPhone(phone)) {
      setError("请输入有效的中国大陆手机号。");
      return false;
    }

    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiClient.sendSmsCode({ phone, purpose });
      setCooldown(Math.max(1, response.cooldown_seconds || 60));
      setCodeSent(true);
      setCode("");
      setVerified(false);
      setVerificationToken(null);
      setExpiresInSeconds(null);
      setNotice(response.message || "验证码已发送。");
      return true;
    } catch (requestError) {
      setError(mapSmsError(requestError));
      return false;
    } finally {
      setSending(false);
    }
  }, [phone, purpose]);

  const verifyCode = useCallback(async () => {
    if (!isValidMainlandPhone(phone)) {
      setError("请输入有效的中国大陆手机号。");
      return false;
    }
    if (!code.trim()) {
      setError("请输入验证码。");
      return false;
    }

    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiClient.verifySmsCode({ purpose, phone, code: code.trim() });
      setVerificationToken(response.verification_token);
      setExpiresInSeconds(response.expires_in_seconds);
      setVerified(true);
      setNotice("手机号验证通过。");
      return true;
    } catch (requestError) {
      setCode("");
      setVerified(false);
      setVerificationToken(null);
      setExpiresInSeconds(null);
      setError(mapSmsError(requestError));
      return false;
    } finally {
      setVerifying(false);
    }
  }, [code, phone, purpose]);

  const clearVerification = useCallback(() => {
    setCode("");
    setVerified(false);
    setVerificationToken(null);
    setExpiresInSeconds(null);
    setNotice(null);
    setError(null);
  }, []);

  return {
    phone,
    setPhone,
    code,
    setCode,
    cooldown,
    sending,
    verifying,
    codeSent,
    verified,
    verificationToken,
    expiresInSeconds,
    notice,
    error,
    sendCode,
    verifyCode,
    clearVerification,
  };
}
