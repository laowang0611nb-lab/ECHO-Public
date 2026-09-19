"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthPanel } from "@/features/auth/components/auth-panel";
import { PhoneVerificationFields } from "@/features/auth/components/phone-verification-fields";
import { passwordValidationMessage } from "@/features/auth/validation";
import { useSmsCodeFlow } from "@/features/auth/use-sms-code-flow";

export function RegisterPage() {
  const sms = useSmsCodeFlow();
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState("");
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

  function nextStep() {
    if (!sms.codeSent) {
      setFormError("请先发送短信验证码。");
      return;
    }
    setFormError(null);
    setStep(2);
  }

  async function verifyCode() {
    const verified = await sms.verifyCode();
    if (verified) {
      setFormError(null);
    }
  }

  function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sms.verified) {
      setFormError("请先完成手机号验证。");
      return;
    }
    if (!displayName.trim()) {
      setFormError("请输入显示名称。");
      return;
    }
    const passwordError = passwordValidationMessage(password);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setFormError("两次输入的密码不一致。");
      return;
    }
    setFormError("注册接口待后端补齐，当前不会创建账号或建立教师会话。");
  }

  return (
    <AuthPanel
      description="注册教师账号需要先验证中国大陆手机号。验证码通过不会自动登录，账号创建必须等真实注册接口返回用户和会话。"
      title="注册教师账号"
    >
      <div className="mb-5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={step === 1 ? "text-primary" : ""}>1 验证手机号</span>
        <span>/</span>
        <span className={step === 2 ? "text-primary" : ""}>2 设置账号</span>
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
            showCode={false}
            verified={sms.verified}
            verifying={sms.verifying}
          />
          {sms.error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{sms.error}</p> : null}
          {sms.notice ? <p className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sms.notice}</p> : null}
          {formError ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p> : null}
          <Button className="h-10 w-full" disabled={!sms.codeSent || sms.sending} onClick={nextStep} type="button">
            下一步
            <ArrowRight data-icon="inline-end" />
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            已有教师账号？<Link className="font-medium text-primary hover:underline" href="/login">返回登录</Link>
          </p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submitRegistration}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-border bg-muted/35 px-3 py-2 text-sm">
            <span className="font-medium">{sms.phone}</span>
            <Button onClick={() => setStep(1)} size="sm" type="button" variant="ghost">
              <ArrowLeft data-icon="inline-start" />修改手机号
            </Button>
          </div>

          <PhoneVerificationFields
            code={sms.code}
            cooldown={sms.cooldown}
            onCodeChange={sms.setCode}
            onPhoneChange={changePhone}
            onSend={() => void sendCode()}
            onVerify={() => void verifyCode()}
            phone={sms.phone}
            phoneDisabled
            sending={sms.sending}
            verified={sms.verified}
            verifying={sms.verifying}
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">显示名称</span>
            <Input maxLength={120} onChange={(event) => setDisplayName(event.target.value)} placeholder="请输入教师显示名称" value={displayName} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">设置密码</span>
            <Input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位，包含字母和数字" type="password" value={password} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">确认密码</span>
            <Input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" type="password" value={confirmPassword} />
          </label>

          {sms.error ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{sms.error}</p> : null}
          {formError ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p> : null}

          {sms.verified ? (
            <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" />手机号验证已通过</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">验证票据只保留在当前注册流程内存中，不会写入浏览器存储，也不代表已经登录。</p>
            </div>
          ) : null}

          <div className="rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 size-4 shrink-0" />注册接口待后端补齐</p>
            <p className="mt-1.5 pl-6 text-xs leading-5 text-amber-800">当前不会创建用户、写入手机号或进入工作台。后端完成 `register/sms` 后才能提交真实注册请求。</p>
          </div>
          <Button className="h-10 w-full" type="submit" variant="outline">
            {sms.verified ? <UserPlus /> : null}
            注册接口待接入
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            已有教师账号？<Link className="font-medium text-primary hover:underline" href="/login">返回登录</Link>
          </p>
        </form>
      )}
    </AuthPanel>
  );
}
