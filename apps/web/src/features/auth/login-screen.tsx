"use client";

import { ApiClientError } from "@echo/api-client";
import { AlertTriangle, ArrowRight, KeyRound, LoaderCircle, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthPanel } from "@/features/auth/components/auth-panel";
import { PhoneVerificationFields } from "@/features/auth/components/phone-verification-fields";
import { mapSmsError } from "@/features/auth/sms-error";
import { useSmsCodeFlow } from "@/features/auth/use-sms-code-flow";
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
  const { login } = useTeacherSession();
  const sms = useSmsCodeFlow();
  const [mode, setMode] = useState<"password" | "sms">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [developmentEmail, setDevelopmentEmail] = useState("teacher@example.com");
  const [developmentName, setDevelopmentName] = useState("演示教师");
  const [developmentPending, setDevelopmentPending] = useState(false);
  const [developmentError, setDevelopmentError] = useState<string | null>(null);

  function submitPasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setPasswordError("请输入有效的登录邮箱。");
      return;
    }
    if (!password) {
      setPasswordError("请输入密码。");
      return;
    }
    setPasswordError("账号密码登录接口待接入，当前不会建立教师会话。");
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
      description="使用教师账号登录 ECHO。当前后端只开放开发登录和短信验证码服务，正式账号密码与手机号登录 Contract 正在补齐。"
      title="登录教师工作台"
    >
      <Tabs onValueChange={(value) => setMode(value === "sms" ? "sms" : "password")} value={mode}>
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="password"><KeyRound />账号密码</TabsTrigger>
          <TabsTrigger value="sms"><Smartphone />手机号验证码</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-5" value="password">
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              账号密码登录接口待接入
            </p>
            <p className="mt-1.5 pl-6 text-xs leading-5 text-amber-800">
              当前表单不会伪造登录结果，也不会写入教师 Session。后端提供真实密码登录接口后即可接入。
            </p>
          </div>
          <form className="mt-5 space-y-4" onSubmit={submitPasswordLogin}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">登录邮箱</span>
              <Input
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teacher@example.com"
                type="email"
                value={email}
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
            <Button className="h-10 w-full" type="submit" variant="outline">
              登录
              <ArrowRight data-icon="inline-end" />
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
              短信可真实发送和验证，手机号登录接口待接入
            </p>
            <p className="mt-1.5 pl-6 text-xs leading-5 text-amber-800">
              验证码通过后只会得到短期验证票据，不会建立教师会话，也不会进入工作台。
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
          {sms.error ? <p className="mt-4 rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{mapSmsError(sms.error)}</p> : null}
          {sms.notice ? <p className="mt-4 rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sms.notice}</p> : null}
          {sms.verified ? (
            <div className="mt-4 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-medium">手机号验证已通过</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                手机号登录接口待后端补齐，当前不会创建教师会话，也不会跳转 Dashboard。
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
