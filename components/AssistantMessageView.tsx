import React, { useEffect, useRef } from "react";
import { Annotation, AssistantMessage } from "./types";

interface SelectionPosition {
  top: number;
  left: number;
}

interface AssistantMessageViewProps {
  message: AssistantMessage;
  annotations: Annotation[];
  messagePlainText: string;
  isAnnotateMode: boolean;
  onSelectRange: (
    range: { start: number; end: number },
    position: SelectionPosition,
    selectedText: string
  ) => void;
  onClearSelection: () => void;
  onAnnotationClick: (id: string) => void;
  pulseAnnotationId?: string | null;
}

export function AssistantMessageView({
  message,
  annotations,
  messagePlainText,
  isAnnotateMode,
  onSelectRange,
  onClearSelection,
  onAnnotationClick,
  pulseAnnotationId = null,
}: AssistantMessageViewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pulseAnnotationId || !contentRef.current) return;
    const target = contentRef.current.querySelector<HTMLElement>(
      `[data-annotation-id="${pulseAnnotationId}"]`
    );
    if (!target) return;
    target.classList.add("pulse");
    const timeout = setTimeout(() => target.classList.remove("pulse"), 1200);
    return () => clearTimeout(timeout);
  }, [pulseAnnotationId]);

  const handleMouseUp = () => {
    if (!isAnnotateMode || !contentRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    if (selection.isCollapsed) {
      onClearSelection();
      return;
    }

    if (
      !contentRef.current.contains(range.startContainer) ||
      !contentRef.current.contains(range.endContainer)
    ) {
      onClearSelection();
      return;
    }

    const offsets = getOffsetsFromRange(contentRef.current, range);
    if (!offsets || offsets.start === offsets.end) {
      onClearSelection();
      return;
    }

    const rect = range.getBoundingClientRect();
    const position = {
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX + rect.width / 2,
    };

    const selectedText = selection.toString();

    onSelectRange(offsets, position, selectedText);
  };

  const segments = buildSegments(messagePlainText, annotations);

  return (
    <div
      className={`chat-message ${isAnnotateMode ? "annotate-mode" : ""}`}
      aria-live="polite"
    >
      <div className="message-bubble">
        <div
          ref={contentRef}
          className="message-content assistant-content"
          onMouseUp={handleMouseUp}
          data-message-id={message.id}
        >
          {segments.map((segment, index) =>
            segment.annotation ? (
              <span
                key={`${segment.annotation.id}-${index}`}
                data-annotation-id={segment.annotation.id}
                data-char-start={segment.annotation.start}
                data-char-end={segment.annotation.end}
                onClick={() => onAnnotationClick(segment.annotation!.id)}
              >
                {renderTextWithBreaks(segment.text)}
              </span>
            ) : (
              <span key={`plain-${index}`}>{renderTextWithBreaks(segment.text)}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function renderTextWithBreaks(text: string) {
  const paragraphs = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs.flatMap((para, pIndex) => {
    const lines = para.split("\n");
    const content = lines.flatMap((line, lIndex) =>
      lIndex === 0 ? [line] : [<br key={`br-${pIndex}-${lIndex}`} />, line]
    );
    const spacer =
      pIndex < paragraphs.length - 1 ? (
        <span aria-hidden="true" className="paragraph-spacer" key={`spacer-${pIndex}`} />
      ) : null;
    return [
      <span key={`para-${pIndex}`} className="message-paragraph">
        {content}
      </span>,
      spacer,
    ].filter(Boolean);
  });
}

function getOffsetsFromRange(
  container: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let current: Node | null = walker.currentNode;
  let index = 0;
  let start: number | null = null;
  let end: number | null = null;

  while (current) {
    const length = current.textContent?.length ?? 0;

    if (current === range.startContainer) {
      start = index + range.startOffset;
    }

    if (current === range.endContainer) {
      end = index + range.endOffset;
      if (start !== null) break;
    }

    index += length;
    current = walker.nextNode();
  }

  if (start === null || end === null) {
    return null;
  }

  return start <= end ? { start, end } : { start: end, end: start };
}

function buildSegments(
  text: string,
  annotations: Annotation[]
): { text: string; annotation?: Annotation }[] {
  const sorted = annotations.slice().sort((a, b) => a.start - b.start);
  const segments: { text: string; annotation?: Annotation }[] = [];
  let cursor = 0;

  for (const annotation of sorted) {
    if (annotation.start > cursor) {
      segments.push({ text: text.slice(cursor, annotation.start) });
    }
    segments.push({ text: text.slice(annotation.start, annotation.end), annotation });
    cursor = annotation.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}
