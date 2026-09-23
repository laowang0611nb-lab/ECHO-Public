import type { ChatAttachmentKind } from "@echo/shared-types";
import { File as ExpoFile } from "expo-file-system";

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

export function createChatAttachmentUploadSource(attachment: ChatAttachmentDraft) {
  const file = new ExpoFile(attachment.uri);
  return {
    uri: attachment.uri,
    name: attachment.fileName,
    type: attachment.mimeType,
    bytes: () => file.bytes(),
  } as unknown as Blob;
}
