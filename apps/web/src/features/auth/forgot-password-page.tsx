"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPanel } from "@/features/auth/components/auth-panel";
import { PhoneVerificationFields } from "@/features/auth/components/phone-verification-fields";
import { passwordValidationMessage } from "@/features/auth/validation";
import { useSmsCodeFlow } from "@/features/auth/use-sms-code-flow";

export function ForgotPasswordPage() {
  const sms = useSmsCodeFlow();
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function changePhone(value: string) {
    sms.setPhone(value);
    setStep(1);
    setFormError(null);
  }

  async function sendCode() {
    const sent = await sms.sendCode();
    if (sent) {
      setFormError(null);
    }
  }

  async function verifyCode() {
    const verified = await sms.verifyCode();
    if (verified) {
      setFormError(null);
      setStep(2);
    }
  }

  function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sms.verified) {
      setFormError("请先完成手机号验证。");
      return;
    }
    const passwordError = passwordValidationMessage(password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("两次输入的新密码不一致。");
      return;
    }
    setFormError("密码重置接口待后端补齐，当前不会修改任何账号密码。");
  }

  return (
    <AuthPanel
      description="通过手机号验证码确认账号归属后设置新密码。验证码验证与登录修改密码是两个独立流程。"
      title="忘记密码"
    >
      <div className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={step === 1 ? "text-primary" : ""}>1 验证手机号</span>
        <span>/</span>
        <span className={step === 2 ? "text-primary" : ""}>2 设置新密码</span>
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <PhoneVerificationFields
            code={sms.code}
            cooldown={sms.cooldown}
            onCodeChange={sms.setCode}
            onPhoneChange={changePhone}
            onSend={() => void sendCode()}
            onVerify={() => void verifyCode()}
            phone={sms.phone}
            sending={sms.sending}
            verified={sms.verified}
            verifying={sms.verifying}
          />
          {sms.error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{sms.error}</p> : null}
          {sms.notice ? <p className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sms.notice}</p> : null}
          <p className="text-center text-xs text-muted-foreground">
            想起密码了？<Link className="font-medium text-primary hover:underline" href="/login">返回登录</Link>
          </p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submitReset}>
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" />手机号验证已通过</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">{sms.phone} 的验证票据只保留在当前流程内存中。</p>
          </div>
          <Button className="w-fit" onClick={() => { sms.clearVerification(); setStep(1); }} size="sm" type="button" variant="ghost">
            <ArrowLeft data-icon="inline-start" />重新验证手机号
          </Button>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">新密码</span>
            <Input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" type="password" value={password} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">确认新密码</span>
            <Input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入新密码" type="password" value={confirmPassword} />
          </label>
          {formError ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p> : null}
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 size-4 shrink-0" />密码重置接口待后端补齐</p>
            <p className="mt-1.5 pl-6 text-xs leading-5 text-amber-800">当前不会修改密码，也不会把验证码验证当成重置成功。</p>
          </div>
          <Button className="h-10 w-full" type="submit" variant="outline">
            <KeyRound data-icon="inline-start" />
            重置密码（接口待接入）
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            返回<Link className="ml-1 font-medium text-primary hover:underline" href="/login">教师登录</Link>
          </p>
        </form>
      )}
    </AuthPanel>
  );
}
