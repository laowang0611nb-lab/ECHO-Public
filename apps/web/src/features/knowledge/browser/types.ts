import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";

export type BranchedMenuIcon = ReactNode | IconSvgElement;

export interface BranchedMenuLeaf {
  value: string;
  label: string;
  meta?: string;
  icon?: BranchedMenuIcon;
}

export interface BranchedMenuSection {
  value: string;
  label: string;
  meta?: string;
  icon?: BranchedMenuIcon;
  emptyLabel?: ReactNode;
  children: BranchedMenuLeaf[];
}

export interface KnowledgeBrowserSelection {
  resourceId: string | null;
  chapterId: string | null;
  pointId: string | null;
  page: number | null;
  chunkId: string | null;
}

export interface KnowledgeBrowserSelectionState
  extends KnowledgeBrowserSelection {
  conflicts: string[];
  invalid: string[];
  shouldNormalize: boolean;
}
