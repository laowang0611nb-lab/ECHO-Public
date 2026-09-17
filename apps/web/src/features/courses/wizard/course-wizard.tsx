"use client";

import { ApiClientError } from "@echo/api-client";
import type { Course, CourseDocument } from "@echo/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AnalysisStep } from "@/features/courses/wizard/analysis-step";
import { BasicInfoStep } from "@/features/courses/wizard/basic-info-step";
import { MaterialsStep } from "@/features/courses/wizard/materials-step";
import { PublishStep } from "@/features/courses/wizard/publish-step";
import {
  courseBasicInfoSchema,
  defaultCourseBasicInfo,
  type CourseBasicInfo,
} from "@/features/courses/wizard/schema";
import { StrategyStep } from "@/features/courses/wizard/strategy-step";
import {
  initialAnalysisState,
  type AnalysisStage,
  type CourseAnalysisState,
  type WizardStep,
} from "@/features/courses/wizard/types";
import { WizardAside } from "@/features/courses/wizard/wizard-aside";
import { WizardStepper } from "@/features/courses/wizard/wizard-stepper";
import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const defaultPolicy =
  "课程知识优先。\n概念问题可以直接讲解。\n习题优先引导，不直接给出最终答案。\n超出课程资料时明确标记为课程外补充。";

export function CourseWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const { setSelectedCourseId } = useCourseWorkspace();
  const [step, setStep] = useState<WizardStep>(1);
  const [basicInfo, setBasicInfo] = useState<CourseBasicInfo>(defaultCourseBasicInfo);
  const [basicErrors, setBasicErrors] = useState<Partial<Record<keyof CourseBasicInfo, string>>>({});
  const [course, setCourse] = useState<Course | null>(null);
  const [document, setDocument] = useState<CourseDocument | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CourseAnalysisState>(initialAnalysisState);
  const [policyDraft, setPolicyDraft] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ["teacher", "course", course?.id, "teaching-policy"],
    queryFn: async () => {
      try {
        return (await apiClient.getTeachingPolicy(user!.id, course!.id)).content;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return defaultPolicy;
        }
        throw error;
      }
    },
    enabled: Boolean(user && course && step >= 4),
  });

  const createCourseMutation = useMutation({
    mutationFn: (info: CourseBasicInfo) =>
      apiClient.createCourse(user!.id, {
        name: info.name,
        description: info.description,
        term: info.term,
      }),
    onSuccess: (created) => {
      setCourse(created);
      setSelectedCourseId(created.id);
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      setStep(2);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!course) throw new Error("课程尚未创建");
      return apiClient.uploadCourseDocument(user!.id, course.id, file, file.name);
    },
    onSuccess: (uploaded) => {
      setDocument(uploaded);
      setUploadError(null);
    },
    onError: (error) => {
      setUploadError(error instanceof Error ? error.message : "教材上传失败");
    },
  });

  const savePolicyMutation = useMutation({
    mutationFn: (content: string) => apiClient.updateTeachingPolicy(user!.id, course!.id, { content }),
    onSuccess: (saved) => {
      setPolicyDraft(saved.content);
      setPolicyError(null);
      setStep(5);
    },
    onError: (error) => {
      setPolicyError(error instanceof Error ? error.message : "教学策略保存失败");
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => apiClient.publishCourse(user!.id, course!.id),
    onSuccess: (published) => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "courses"] });
      void queryClient.invalidateQueries({ queryKey: ["teacher", "course", published.id] });
      router.push(`/courses/${published.id}`);
    },
    onError: (error) => {
      setPublishError(error instanceof Error ? error.message : "课程发布失败");
    },
  });

  const effectivePolicy = policyDraft ?? policyQuery.data ?? defaultPolicy;

  const stepTitle = useMemo(
    () => ["基本信息", "导入教材", "AI 解析", "教学策略", "确认发布"][step - 1],
    [step],
  );

  function updateBasicInfo(next: CourseBasicInfo) {
    setBasicInfo(next);
    setBasicErrors({});
  }

  function handleNext() {
    if (step === 1) {
      const result = courseBasicInfoSchema.safeParse(basicInfo);
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        setBasicErrors(
          Object.fromEntries(
            Object.entries(fieldErrors)
              .map(([key, messages]) => [key, messages?.[0]])
              .filter((entry): entry is [string, string] => Boolean(entry[1])),
          ) as Partial<Record<keyof CourseBasicInfo, string>>,
        );
        return;
      }
      createCourseMutation.mutate(result.data);
      return;
    }

    if (step === 2) {
      if (!document) {
        setUploadError("请先上传一份 PDF 教材");
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (analysis.stage !== "done") return;
      setStep(4);
      return;
    }

    if (step === 4) {
      if (!effectivePolicy.trim()) {
        setPolicyError("教学策略不能为空");
        return;
      }
      savePolicyMutation.mutate(effectivePolicy.trim());
      return;
    }

    publishMutation.mutate();
  }

  async function runAnalysis() {
    if (!user || !course || !document) return;

    const setStage = (stage: AnalysisStage) =>
      setAnalysis((current) => ({ ...current, stage, error: null }));

    try {
      setAnalysis({ ...initialAnalysisState, stage: "parsing" });
      await apiClient.parseCourseDocument(user.id, document.id);
      setStage("structuring");
      const chapters = await apiClient.generateKnowledgeStructure(user.id, document.id);
      setStage("chunking");
      const chunks = await apiClient.createDocumentChunks(user.id, document.id);
      setStage("embedding");
      const embeddings = await apiClient.createDocumentEmbeddings(user.id, document.id);
      setAnalysis({
        stage: "done",
        chapters,
        chunkCount: chunks.length,
        embeddingCount: embeddings.embedded_chunks,
        error: null,
      });
    } catch (error) {
      setAnalysis((current) => ({
        ...current,
        stage: "error",
        error: error instanceof Error ? error.message : "AI 解析失败，请重试。",
      }));
    }
  }

  function handleUpload(file: File) {
    setUploadFile(file);
    setUploadError(null);
    uploadMutation.mutate(file);
  }

  function handleCancel() {
    if (step > 1 || basicInfo.name || basicInfo.description) {
      const confirmed = window.confirm("当前填写内容尚未发布，确定退出新建课程吗？");
      if (!confirmed) return;
    }
    router.push("/courses");
  }

  const nextDisabled =
    createCourseMutation.isPending ||
    uploadMutation.isPending ||
    savePolicyMutation.isPending ||
    publishMutation.isPending ||
    (step === 2 && !document) ||
    (step === 3 && analysis.stage !== "done");

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        breadcrumbs={[{ label: "课程管理", href: "/courses" }, { label: "新建课程" }]}
        description="通过简单的几步，基于教材和教学目标，快速创建一门智能课程。"
        title="新建课程"
      />
      <WizardStepper currentStep={step} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 6 }}
            key={step}
            transition={{ duration: 0.2 }}
          >
            {step === 1 ? (
              <BasicInfoStep errors={basicErrors} onChange={updateBasicInfo} value={basicInfo} />
            ) : step === 2 ? (
              <MaterialsStep
                document={document}
                error={uploadError}
                onRetry={() => uploadFile && uploadMutation.mutate(uploadFile)}
                onUpload={handleUpload}
                pending={uploadMutation.isPending}
              />
            ) : step === 3 ? (
              <AnalysisStep
                analysis={analysis}
                onContinue={() => setStep(4)}
                onStart={() => void runAnalysis()}
              />
            ) : step === 4 ? (
              <StrategyStep
                error={policyError ?? (policyQuery.isError ? "教学策略加载失败" : null)}
                onChange={setPolicyDraft}
                pending={savePolicyMutation.isPending}
                value={effectivePolicy}
              />
            ) : (
              <PublishStep
                analysis={analysis}
                course={course}
                courseName={basicInfo.name}
                error={publishError}
                onBack={() => setStep(4)}
                onPublish={() => publishMutation.mutate()}
                pending={publishMutation.isPending}
                policy={effectivePolicy}
                term={basicInfo.term}
              />
            )}
          </motion.div>
        </AnimatePresence>
        <WizardAside currentStep={step} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:left-[258px]">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3">
          <Button onClick={handleCancel} type="button" variant="ghost">取消</Button>
          <div className="flex items-center gap-2">
            <Button disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} type="button" variant="outline">上一步</Button>
            {step < 5 ? (
              <Button disabled={nextDisabled} onClick={handleNext} type="button">
                {createCourseMutation.isPending ? "正在创建..." : step === 4 ? "保存并继续" : "下一步"}
              </Button>
            ) : (
              <Button disabled={nextDisabled} onClick={handleNext} type="button">
                {publishMutation.isPending ? "正在发布..." : "发布课程"}
              </Button>
            )}
          </div>
        </div>
        <p className="sr-only">{stepTitle}</p>
      </div>
    </div>
  );
}
