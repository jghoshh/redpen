import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked, Renderer } from "marked";
import { Annotation, AssistantMessage } from "./types";

interface AssistantMessageViewProps {
  message: AssistantMessage;
  annotations: Annotation[];
  messagePlainText: string;
  isAnnotateMode: boolean;
  pendingRange?: { start: number; end: number } | null;
  onSelectRange: (
    range: { start: number; end: number },
    position: { top: number; left: number },
    selectedText: string
  ) => void;
  onClearSelection: () => void;
  pulseAnnotationId?: string | null;
}

export function AssistantMessageView({
  message,
  annotations,
  messagePlainText,
  isAnnotateMode,
  pendingRange = null,
  onSelectRange,
  onClearSelection,
  pulseAnnotationId = null,
}: AssistantMessageViewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const markdownRenderer = useMemo(() => createInlineRenderer(), []);
  const [pendingRects, setPendingRects] = useState<
    { top: number; left: number; width: number; height: number }[]
  >([]);
  const selectionProcessedRef = useRef(false);

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

  useEffect(() => {
    if (!pendingRange) {
      setPendingRects([]);
    }
  }, [pendingRange]);

  // Clear native selection after custom overlay is rendered to avoid double-highlight
  useEffect(() => {
    if (pendingRects.length > 0) {
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        selection?.removeAllRanges();
      });
    }
  }, [pendingRects]);

  const handleSelectionStart = () => {
    selectionProcessedRef.current = false;
  };

  const handleSelection = () => {
    if (!isAnnotateMode || !contentRef.current) return;
    if (selectionProcessedRef.current) return;

    const run = () => {
      if (selectionProcessedRef.current) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const rawRange = selection.getRangeAt(0);
      if (selection.isCollapsed || rawRange.collapsed) {
        // Don't clear if clicking on an annotation (let focusAnnotation handle it)
        return;
      }
      selectionProcessedRef.current = true;

      const offsets = getOffsetsFromRange(contentRef.current!, rawRange);
      if (!offsets || offsets.start === offsets.end) {
        onClearSelection();
        return;
      }

      let rect: DOMRect | null = null;

      // Try to get rect at the focus point (where selection ended)
      try {
        const focusNode = selection.focusNode;
        const focusOffset = selection.focusOffset;
        if (focusNode) {
          const focusRange = document.createRange();
          focusRange.setStart(focusNode, focusOffset);
          focusRange.collapse(true);
          const focusRects = focusRange.getClientRects();
          if (focusRects.length > 0) {
            rect = focusRects[focusRects.length - 1];
          }
        }
      } catch {
        // Ignore and try fallback
      }

      // Fallback: use the last rect from the selection range
      if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
        const clientRects = rawRange.getClientRects();
        if (clientRects.length > 0) {
          rect = clientRects[clientRects.length - 1];
        }
      }

      // Final fallback: use bounding rect of the entire selection
      if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
        rect = rawRange.getBoundingClientRect();
      }

      // If still invalid, bail out
      if (!rect || (rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0)) {
        onClearSelection();
        return;
      }

      const position = {
        top: rect.bottom + window.scrollY + 6,
        left: rect.right + window.scrollX + 6,
      };

      const selectedText = rawRange.toString();
      const containerRect = contentRef.current!.getBoundingClientRect();
      const rects = Array.from(rawRange.getClientRects()).map((r) => ({
        top: r.top - containerRect.top + (contentRef.current?.scrollTop ?? 0),
        left: r.left - containerRect.left + (contentRef.current?.scrollLeft ?? 0),
        width: r.width,
        height: r.height,
      }));
      setPendingRects(rects);
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
          onMouseDown={handleSelectionStart}
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
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(segment.text, markdownRenderer) }}
              />
            ) : (
              <span
                key={`plain-${index}`}
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(segment.text, markdownRenderer) }}
              />
            )
          )}
          {pendingRects.map((r, idx) => (
            <span
              key={`pending-rect-${idx}`}
              className="pending-highlight-rect"
              style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
            />
          ))}
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
    // Skip if this annotation ends before or at the cursor (already fully processed)
    if (annotation.end <= cursor) continue;

    // Calculate effective start (skip any overlapping part)
    const effectiveStart = Math.max(annotation.start, cursor);

    // Add plain text before this annotation (if any)
    if (effectiveStart > cursor) {
      segments.push({ text: text.slice(cursor, effectiveStart) });
    }

    // Add the annotation segment (only the non-overlapping part)
    segments.push({ text: text.slice(effectiveStart, annotation.end), annotation });
    cursor = annotation.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments;
}

function createInlineRenderer(): Renderer {
  const renderer = new marked.Renderer();

  renderer.paragraph = (text) => `<span class="md-p">${text}</span>`;
  renderer.heading = (text, level) => `<span class="md-heading md-h${level}">${text}</span>`;
  renderer.hr = () => `<span class="md-hr"></span>`;
  renderer.strong = (text) => `<strong>${text}</strong>`;
  renderer.em = (text) => `<em>${text}</em>`;
  renderer.codespan = (text) => `<code class="md-code-inline">${escapeHtml(text)}</code>`;
  renderer.code = (code) => `<pre class="md-code-block"><code>${escapeHtml(code)}</code></pre>`;
  renderer.blockquote = (text) => `<span class="md-quote">${text}</span>`;
  renderer.list = (body, ordered) =>
    `<span class="md-list ${ordered ? "md-ol" : "md-ul"}">${body}</span>`;
  renderer.listitem = (text) => `<span class="md-li">${text}</span>`;
  renderer.table = (header, body) =>
    `<span class="md-table"><span class="md-thead">${header}</span><span class="md-tbody">${body}</span></span>`;
  renderer.tablerow = (content) => `<span class="md-tr">${content}</span>`;
  renderer.tablecell = (content, flags) =>
    `<span class="md-td ${flags.header ? "md-th" : ""}">${content}</span>`;

  return renderer;
}

function renderInlineMarkdown(raw: string, renderer: Renderer): string {
  return marked.parse(raw, {
    renderer,
    gfm: true,
    breaks: true,
  }) as string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
