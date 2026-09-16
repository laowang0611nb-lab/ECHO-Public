"use client";

import { ApiClientError } from "@echo/api-client";
import type { Course, CourseDashboard, User } from "@echo/shared-types";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { KnowledgeEditor } from "@/components/knowledge-editor";
import { ReviewQueue } from "@/components/review-queue";
import { apiClient } from "@/lib/api";
const SESSION_KEY = "echo.teacher.user-id";

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "登录会话已失效，请重新登录。";
    }
    if (error.status === 409) {
      return "该邮箱已绑定其他角色，请更换邮箱。";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function Metric({
  label,
  value,
  supporting,
}: {
  label: string;
  value: string;
  supporting: string;
}) {
  return (
    <div className="min-h-28 border-b border-[#e3e7ed] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-sm font-medium text-[#667085]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#101828]">{value}</p>
      <p className="mt-2 text-sm text-[#7c8799]">{supporting}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-[#cbd3df] bg-white px-6 py-12 text-center text-sm text-[#667085]">
      {children}
    </div>
  );
}

export function TeacherWorkspace() {
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const storedUserId = window.localStorage.getItem(SESSION_KEY);
      if (!storedUserId) {
        setSessionReady(true);
        return;
      }

      try {
        const currentUser = await apiClient.me(storedUserId);
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      } finally {
        if (!cancelled) {
          setSessionReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleAuthenticated(currentUser: User) {
    window.localStorage.setItem(SESSION_KEY, currentUser.id);
    setUser(currentUser);
  }

  const handleLogout = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  if (!sessionReady) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[#667085]">
        正在恢复教师会话...
      </main>
    );
  }

  if (!user) {
    return <LoginPanel onAuthenticated={handleAuthenticated} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

function LoginPanel({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState("teacher@example.com");
  const [displayName, setDisplayName] = useState("演示教师");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const currentUser = await apiClient.login({
        email: email.trim(),
        display_name: displayName.trim(),
        role: "teacher",
      });
      onAuthenticated(currentUser);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md border border-[#d8dee8] bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-[#2563eb]">ECHO</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#101828]">教师工作台</h1>
        <p className="mt-2 text-sm leading-6 text-[#667085]">
          登录后管理课程、教材和学生学习状态。
        </p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="field-label" htmlFor="teacher-email">
              邮箱
            </label>
            <input
              autoComplete="email"
              className="field-input"
              id="teacher-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="teacher-name">
              显示名称
            </label>
            <input
              autoComplete="name"
              className="field-input"
              id="teacher-name"
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
          </div>

          {error ? (
            <p
              aria-live="polite"
              className="border border-[#f2b8b5] bg-[#fff4f3] px-3 py-2 text-sm text-[#b42318]"
            >
              {error}
            </p>
          ) : null}

          <button
            className="w-full bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
            disabled={pending}
            type="submit"
          >
            {pending ? "正在登录..." : "进入工作台"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<CourseDashboard | null>(null);
  const [coursesPending, setCoursesPending] = useState(true);
  const [dashboardPending, setDashboardPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseTerm, setCourseTerm] = useState("");
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCoursesPending(true);
      try {
        const items = await apiClient.listCourses(user.id);
        if (cancelled) {
          return;
        }
        setCourses(items);
        setSelectedCourseId((current) =>
          current && items.some((course) => course.id === current) ? current : (items[0]?.id ?? null),
        );
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        if (requestError instanceof ApiClientError && requestError.status === 401) {
          onLogout();
          return;
        }
        setError(errorMessage(requestError));
      } finally {
        if (!cancelled) {
          setCoursesPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onLogout, user.id]);

  useEffect(() => {
    if (!selectedCourseId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      setDashboardPending(true);
      setError(null);

      try {
        const data = await apiClient.getCourseDashboard(user.id, selectedCourseId);
        if (!cancelled) {
          setDashboard(data);
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        if (requestError instanceof ApiClientError && requestError.status === 401) {
          onLogout();
          return;
        }
        setDashboard(null);
        setError(errorMessage(requestError));
      } finally {
        if (!cancelled) {
          setDashboardPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardReloadKey, onLogout, selectedCourseId, user.id]);

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatePending(true);
    setError(null);
    setNotice(null);

    try {
      const created = await apiClient.createCourse(user.id, {
        name: courseName.trim(),
        description: courseDescription.trim() || undefined,
        term: courseTerm.trim() || undefined,
      });
      setCourses((current) => [created, ...current]);
      setSelectedCourseId(created.id);
      setDashboard(null);
      setCourseName("");
      setCourseDescription("");
      setCourseTerm("");
      setNotice(`课程“${created.name}”已创建。`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setCreatePending(false);
    }
  }

  async function handlePublishCourse() {
    if (!selectedCourse) {
      return;
    }

    setPublishPending(true);
    setError(null);
    setNotice(null);
    try {
      const published = await apiClient.publishCourse(user.id, selectedCourse.id);
      setCourses((current) =>
        current.map((course) => (course.id === published.id ? published : course)),
      );
      setNotice(`课程“${published.name}”已发布，可使用课程码 ${published.code} 加入。`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPublishPending(false);
    }
  }

  async function handleCopyCourseCode() {
    if (!selectedCourse) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedCourse.code);
      setNotice(`课程码 ${selectedCourse.code} 已复制。`);
    } catch {
      setError("浏览器未允许复制，请手动选择课程码。");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#dfe4eb] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#182131] text-sm font-bold text-white">
              E
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#2563eb]">ECHO</p>
              <h1 className="truncate text-lg font-semibold text-[#101828]">教师工作台</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-[#344054]">{user.display_name}</p>
              <p className="text-xs text-[#667085]">{user.email}</p>
            </div>
            <button
              className="border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
              onClick={onLogout}
              type="button"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-5">
          <section className="border border-[#dde3eb] bg-white">
            <div className="border-b border-[#e5e9ef] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#101828]">课程</h2>
            </div>

            <div className="space-y-2 p-3">
              {coursesPending ? (
                <p className="px-2 py-3 text-sm text-[#667085]">正在加载课程...</p>
              ) : null}

              {!coursesPending && courses.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[#667085]">还没有课程。</p>
              ) : null}

              {courses.map((course) => {
                const selected = course.id === selectedCourseId;
                return (
                  <button
                    aria-pressed={selected}
                    className={`w-full border px-3 py-3 text-left ${
                      selected
                        ? "border-[#2563eb] bg-[#eff5ff]"
                        : "border-transparent hover:border-[#d7dde7] hover:bg-[#f8fafc]"
                    }`}
                    key={course.id}
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setDashboard(null);
                      setNotice(null);
                    }}
                    type="button"
                  >
                    <span className="block truncate text-sm font-semibold text-[#1d2939]">
                      {course.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-[#667085]">
                      <span
                        className={`h-1.5 w-1.5 ${
                          course.status === "published" ? "bg-[#15803d]" : "bg-[#b45309]"
                        }`}
                      />
                      {course.status === "published" ? "已发布" : "草稿"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border border-[#dde3eb] bg-white p-4">
            <h2 className="text-sm font-semibold text-[#101828]">新建课程</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreateCourse}>
              <div>
                <label className="field-label" htmlFor="course-name">
                  课程名称
                </label>
                <input
                  className="field-input"
                  id="course-name"
                  onChange={(event) => setCourseName(event.target.value)}
                  placeholder="例如：软件工程"
                  required
                  value={courseName}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="course-term">
                  学期
                </label>
                <input
                  className="field-input"
                  id="course-term"
                  onChange={(event) => setCourseTerm(event.target.value)}
                  placeholder="例如：2026 秋季"
                  value={courseTerm}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="course-description">
                  课程简介
                </label>
                <textarea
                  className="field-input min-h-24 resize-y"
                  id="course-description"
                  onChange={(event) => setCourseDescription(event.target.value)}
                  placeholder="课程范围与教学目标"
                  value={courseDescription}
                />
              </div>

              <button
                className="w-full bg-[#182131] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#273449]"
                disabled={createPending || !courseName.trim()}
                type="submit"
              >
                {createPending ? "正在创建..." : "创建课程"}
              </button>
            </form>
          </section>
        </aside>

        <main className="min-w-0 space-y-4">
          {error ? (
            <p
              aria-live="polite"
              className="border border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-sm text-[#b42318]"
            >
              {error}
            </p>
          ) : null}

          {notice ? (
            <p
              aria-live="polite"
              className="border border-[#b7dfc2] bg-[#f1fbf4] px-4 py-3 text-sm text-[#166534]"
            >
              {notice}
            </p>
          ) : null}

          {!selectedCourse ? (
            <EmptyState>从左侧创建第一门课程后，这里会显示课程概览。</EmptyState>
          ) : (
            <section className="border border-[#dde3eb] bg-white">
              <div className="flex flex-col gap-4 border-b border-[#e5e9ef] px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-semibold text-[#101828]">
                      {selectedCourse.name}
                    </h2>
                    <span
                      className={`border px-2 py-1 text-xs font-medium ${
                        selectedCourse.status === "published"
                          ? "border-[#b7dfc2] bg-[#f1fbf4] text-[#166534]"
                          : "border-[#f2d19a] bg-[#fff8e8] text-[#92400e]"
                      }`}
                    >
                      {selectedCourse.status === "published" ? "已发布" : "草稿"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[#667085]">
                    {selectedCourse.term || "未设置学期"}
                  </p>
                  {selectedCourse.description ? (
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#475467]">
                      {selectedCourse.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
                    onClick={handleCopyCourseCode}
                    type="button"
                  >
                    复制课程码 {selectedCourse.code}
                  </button>
                  {selectedCourse.status === "draft" ? (
                    <button
                      className="bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
                      disabled={publishPending}
                      onClick={handlePublishCourse}
                      type="button"
                    >
                      {publishPending ? "正在发布..." : "发布课程"}
                    </button>
                  ) : null}
                </div>
              </div>

              {dashboardPending ? (
                <p className="px-5 py-12 text-center text-sm text-[#667085]">
                  正在加载课程数据...
                </p>
              ) : dashboard ? (
                <>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                    <Metric
                      label="在课学生"
                      supporting="课程内学生成员"
                      value={dashboard.student_count.toLocaleString("zh-CN")}
                    />
                    <Metric
                      label="近七天活跃"
                      supporting="产生学习事件的学生"
                      value={dashboard.active_student_count.toLocaleString("zh-CN")}
                    />
                    <Metric
                      label="近七天提问"
                      supporting={`累计学习事件 ${dashboard.total_learning_events.toLocaleString("zh-CN")}`}
                      value={dashboard.question_count_7d.toLocaleString("zh-CN")}
                    />
                    <Metric
                      label="综合掌握"
                      supporting="有状态知识点的平均分"
                      value={
                        dashboard.average_mastery === null
                          ? "暂无"
                          : `${Math.round(dashboard.average_mastery)}%`
                      }
                    />
                  </div>

                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-[#101828]">高风险知识点</h3>
                      <p className="text-xs text-[#667085]">
                        {dashboard.high_risk_knowledge_points.length} 项
                      </p>
                    </div>

                    {dashboard.high_risk_knowledge_points.length === 0 ? (
                      <p className="mt-4 border border-dashed border-[#d5dbe5] px-4 py-8 text-center text-sm text-[#667085]">
                        当前没有进入风险阈值范围的知识点。
                      </p>
                    ) : (
                      <div className="mt-4 divide-y divide-[#e5e9ef] border-y border-[#e5e9ef]">
                        {dashboard.high_risk_knowledge_points.map((point) => (
                          <div
                            className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_120px]"
                            key={point.knowledge_point_id}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[#1d2939]">
                                {point.name}
                              </p>
                              <p className="mt-1 text-xs text-[#667085]">
                                {point.affected_students} 名学生需要关注
                              </p>
                              <div className="mt-3 h-1.5 bg-[#edf0f4]">
                                <div
                                  className="h-full bg-[#d97706]"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, point.average_score))}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div className="sm:text-right">
                              <p className="text-2xl font-semibold text-[#9a3412]">
                                {Math.round(point.average_score)}%
                              </p>
                              <p className="mt-1 text-xs text-[#667085]">平均掌握度</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="border-t border-[#e5e9ef] px-5 py-12 text-center text-sm text-[#667085]">
                  暂无法加载课程数据。
                </p>
              )}
            </section>
          )}

          {selectedCourse ? (
            <>
              <ReviewQueue
              courseId={selectedCourse.id}
              onChanged={() => setDashboardReloadKey((current) => current + 1)}
              userId={user.id}
              />
              <KnowledgeEditor courseId={selectedCourse.id} userId={user.id} />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
