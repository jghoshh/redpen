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

  const handleSelection = () => {
    if (!isAnnotateMode || !contentRef.current) return;

    const run = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const rawRange = selection.getRangeAt(0);
      if (selection.isCollapsed || rawRange.collapsed) {
        onClearSelection();
        return;
      }

      const offsets = getOffsetsFromRange(contentRef.current!, rawRange);
      if (!offsets || offsets.start === offsets.end) {
        return;
      }

      let rect: DOMRect;
      try {
        const focusRange = document.createRange();
        const focusNode = selection.focusNode;
        const focusOffset = selection.focusOffset;
        if (focusNode) {
          focusRange.setStart(focusNode, focusOffset);
          focusRange.collapse(true);
          const focusRects = focusRange.getClientRects();
          rect = focusRects.length ? focusRects[focusRects.length - 1] : focusRange.getBoundingClientRect();
        } else {
          throw new Error("No focus node");
        }
      } catch {
        const clientRects = rawRange.getClientRects();
        rect = clientRects.length
          ? clientRects[clientRects.length - 1]
          : rawRange.getBoundingClientRect();
      }
      const position = {
        top: rect.bottom + window.scrollY + 6,
        left: rect.right + window.scrollX + 6,
      };

      const selectedText = rawRange.toString();
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.log("Selection debug", {
          selectedText,
          anchor: rect,
          offsets,
        });
      }

      onSelectRange(offsets, position, selectedText);
    };

    // Defer to allow selection to settle on mobile/backwards drags
    requestAnimationFrame(run);
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
          onMouseUp={handleSelection}
          onPointerUp={handleSelection}
          onTouchEnd={() => setTimeout(handleSelection, 0)}
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
                {segment.text}
              </span>
            ) : (
              <span key={`plain-${index}`}>{segment.text}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function getOffsetsFromRange(
  container: HTMLElement,
  range: Range
): { start: number; end: number } | null {
  try {
    const measure = (node: Node, offset: number) => {
      const r = document.createRange();
      r.setStart(container, 0);
      try {
        r.setEnd(node, offset);
        return r.toString().length;
      } catch {
        const full = container.textContent?.length ?? 0;
        return offset <= 0 ? 0 : full;
      }
    };

    const start = measure(range.startContainer, range.startOffset);
    const end = measure(range.endContainer, range.endOffset);

    return start <= end ? { start, end } : { start: end, end: start };
  } catch {
    return null;
  }
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
