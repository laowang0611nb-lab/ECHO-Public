"use client";

import { CheckCircle2, LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PhoneVerificationFields({
  phone,
  onPhoneChange,
  code,
  onCodeChange,
  cooldown,
  sending,
  verifying,
  verified,
  onSend,
  onVerify,
  sendLabel = "发送验证码",
  verifyLabel = "验证手机号",
  phoneDisabled = false,
  showPhone = true,
  showCode = true,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  cooldown: number;
  sending: boolean;
  verifying: boolean;
  verified: boolean;
  onSend: () => void;
  onVerify: () => void;
  sendLabel?: string;
  verifyLabel?: string;
  phoneDisabled?: boolean;
  showPhone?: boolean;
  showCode?: boolean;
}) {
  const resendDisabled = sending || verifying || cooldown > 0 || verified;

  return (
    <div className="space-y-4">
      {showPhone ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">手机号</span>
          <div className="flex min-w-0 gap-2">
            <Input
              autoComplete="tel"
              className="min-w-0 flex-1"
              disabled={phoneDisabled}
              inputMode="numeric"
              maxLength={11}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="13800138000"
              value={phone}
            />
            <Button className="shrink-0" disabled={resendDisabled} onClick={onSend} type="button" variant="outline">
              {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
              {cooldown > 0 ? `${cooldown}s 后重发` : sendLabel}
            </Button>
          </div>
          <span className="mt-1.5 block text-xs text-muted-foreground">中国大陆手机号，11 位数字</span>
        </label>
      ) : null}

      {showCode ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">验证码</span>
          <div className="flex min-w-0 gap-2">
            <Input
              autoComplete="one-time-code"
              className="min-w-0 flex-1"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="请输入短信验证码"
              value={code}
            />
            <Button className="shrink-0" disabled={verifying || verified || !code.trim()} onClick={onVerify} type="button">
              {verifying ? <LoaderCircle className="animate-spin" /> : verified ? <CheckCircle2 /> : null}
              {verified ? "已验证" : verifyLabel}
            </Button>
          </div>
        </label>
      ) : null}
    </div>
  );
}
