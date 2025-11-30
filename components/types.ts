export interface AssistantMessage {
  id: string;
  html: string;
  annotations?: Annotation[];
}

export type AnnotationId = string;

export interface Annotation {
  id: AnnotationId;
  messageId: string;
  start: number;
  end: number;
  noteText: string;
  snippet?: string;
  kind?: "rewrite" | "question" | "source" | "fact_check" | "style" | "other";
  createdAt: number;
}

export interface AnnotationUiState {
  activeMessageId: string | null;
  pendingSelectionRange: { start: number; end: number } | null;
}
