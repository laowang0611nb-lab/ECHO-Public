import type { Chapter, Course, CourseDocument } from "@echo/shared-types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type AnalysisStage =
  | "idle"
  | "parsing"
  | "structuring"
  | "chunking"
  | "embedding"
  | "done"
  | "error";

export interface CourseAnalysisState {
  stage: AnalysisStage;
  chapters: Chapter[];
  chunkCount: number;
  embeddingCount: number;
  error: string | null;
}

export interface CourseWizardState {
  basicInfo: import("./schema").CourseBasicInfo;
  course: Course | null;
  document: CourseDocument | null;
  analysis: CourseAnalysisState;
  policy: string;
}

export const initialAnalysisState: CourseAnalysisState = {
  stage: "idle",
  chapters: [],
  chunkCount: 0,
  embeddingCount: 0,
  error: null,
};
