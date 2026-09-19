"use client";

import { ApiClientError } from "@echo/api-client";
import { AlertTriangle, ArrowRight, KeyRound, LoaderCircle, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mapAuthError } from "@/features/auth/auth-error";
import { AuthPanel } from "@/features/auth/components/auth-panel";
import { PhoneVerificationFields } from "@/features/auth/components/phone-verification-fields";
import { useSmsCodeFlow } from "@/features/auth/use-sms-code-flow";
import { isValidMainlandPhone, normalizeMainlandPhone } from "@/features/auth/validation";
import { useTeacherSession } from "@/providers/teacher-session-provider";

function developmentLoginError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 409) return "该邮箱已绑定其他教师角色，请更换邮箱。";
    if (error.status === 403) return "开发登录已关闭，当前环境不能建立教师会话。";
    if (error.status === 503) return "认证服务暂时不可用，请稍后重试。";
  }
  if (error instanceof TypeError) return "无法连接认证服务，请检查网络后重试。";
  return error instanceof Error ? error.message : "登录失败，请稍后重试。";
}

export function LoginScreen() {
  const router = useRouter();
  const { login, loginWithPassword } = useTeacherSession();
  const sms = useSmsCodeFlow("login");
  const [mode, setMode] = useState<"password" | "sms">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [developmentEmail, setDevelopmentEmail] = useState("teacher@example.com");
  const [developmentName, setDevelopmentName] = useState("演示教师");
  const [developmentPending, setDevelopmentPending] = useState(false);
  const [developmentError, setDevelopmentError] = useState<string | null>(null);

  async function submitPasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawIdentifier = identifier.trim();
    if (!rawIdentifier) {
      setPasswordError("请输入手机号或邮箱。");
      return;
    }
    if (!password) {
      setPasswordError("请输入密码。");
      return;
    }

    const phone = normalizeMainlandPhone(rawIdentifier);
    const payload = rawIdentifier.includes("@")
      ? { email: rawIdentifier.toLowerCase(), password, device_name: "ECHO Teacher Web" }
      : { phone, password, device_name: "ECHO Teacher Web" };
    if (!rawIdentifier.includes("@") && !isValidMainlandPhone(phone)) {
      setPasswordError("请输入有效的中国大陆手机号或登录邮箱。");
      return;
    }

    setPasswordPending(true);
    setPasswordError(null);
    try {
      await loginWithPassword(payload);
      router.replace("/dashboard");
    } catch (requestError) {
      setPasswordError(mapAuthError(requestError));
    } finally {
      setPasswordPending(false);
    }
  }

  async function submitDevelopmentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDevelopmentPending(true);
    setDevelopmentError(null);
    try {
      await login({
        email: developmentEmail.trim(),
        display_name: developmentName.trim(),
        role: "teacher",
      });
      router.replace("/dashboard");
    } catch (requestError) {
      setDevelopmentError(developmentLoginError(requestError));
    } finally {
      setDevelopmentPending(false);
    }
  }

  return (
    <AuthPanel
      description="使用教师账号登录 ECHO。账号密码登录已接入正式接口；短信验证码可以真实校验，但短信登录换会话接口仍需后端补齐。"
      title="登录教师工作台"
    >
      <Tabs onValueChange={(value) => setMode(value === "sms" ? "sms" : "password")} value={mode}>
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="password"><KeyRound />账号密码</TabsTrigger>
          <TabsTrigger value="sms"><Smartphone />手机号验证码</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-5" value="password">
          <form className="space-y-4" onSubmit={submitPasswordLogin}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">手机号或邮箱</span>
              <Input
                autoComplete="username"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="13800138000 或 teacher@example.com"
                value={identifier}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">密码</span>
              <Input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                type="password"
                value={password}
              />
            </label>
            {passwordError ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{passwordError}</p> : null}
            <Button className="h-10 w-full" disabled={passwordPending} type="submit">
              {passwordPending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
              {passwordPending ? "正在登录..." : "登录"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link className="font-medium text-primary hover:underline" href="/forgot-password">忘记密码</Link>
            <Link className="font-medium text-primary hover:underline" href="/register">注册教师账号</Link>
          </div>
        </TabsContent>

        <TabsContent className="mt-5" value="sms">
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              手机号验证码登录接口待接入
            </p>
            <p className="mt-1.5 pl-6 text-xs leading-5 text-amber-800">
              短信发送和验证码校验是真实请求；验证码通过后不会建立教师会话，也不会进入工作台。
            </p>
          </div>
          <div className="mt-5">
            <PhoneVerificationFields
              code={sms.code}
              cooldown={sms.cooldown}
              onCodeChange={sms.setCode}
              onPhoneChange={sms.setPhone}
              onSend={() => void sms.sendCode()}
              onVerify={() => void sms.verifyCode()}
              phone={sms.phone}
              sending={sms.sending}
              verified={sms.verified}
              verifying={sms.verifying}
            />
          </div>
          {sms.error ? <p className="mt-4 rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{sms.error}</p> : null}
          {sms.notice ? <p className="mt-4 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sms.notice}</p> : null}
          {sms.verified ? (
            <div className="mt-4 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <p className="font-medium">手机号验证已通过</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                当前只有登录用途验证票据，后端尚未提供消费该票据的手机号登录接口。
              </p>
            </div>
          ) : null}
          <Button className="mt-5 h-10 w-full" disabled type="button" variant="outline">
            手机号登录接口待接入
          </Button>
        </TabsContent>
      </Tabs>

      {process.env.NODE_ENV !== "production" ? (
        <details className="mt-6 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">开发环境调试入口</summary>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            仅调用后端真实开发登录接口，不使用密码或模拟用户，仅在本地开发环境显示。
          </p>
          <form className="mt-4 space-y-3" onSubmit={submitDevelopmentLogin}>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">开发邮箱</span>
              <Input onChange={(event) => setDevelopmentEmail(event.target.value)} required type="email" value={developmentEmail} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted-foreground">显示名称</span>
              <Input onChange={(event) => setDevelopmentName(event.target.value)} required value={developmentName} />
            </label>
            {developmentError ? <p className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{developmentError}</p> : null}
            <Button className="h-10 w-full" disabled={developmentPending} type="submit" variant="secondary">
              {developmentPending ? <LoaderCircle className="animate-spin" /> : <Mail />}
              {developmentPending ? "正在建立开发会话..." : "使用真实开发接口进入"}
            </Button>
          </form>
        </details>
      ) : null}
    </AuthPanel>
  );
}
