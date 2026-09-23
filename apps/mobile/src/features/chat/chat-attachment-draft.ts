import type { ChatAttachmentKind } from "@echo/shared-types";

export interface ChatAttachmentDraft {
  localId: string;
  kind: ChatAttachmentKind;
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
}

export function createAttachmentDraftId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
