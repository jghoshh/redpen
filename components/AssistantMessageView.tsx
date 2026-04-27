import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { marked, Renderer } from "marked";
import { AssistantMessage } from "./types";

interface AssistantMessageViewProps {
  message: AssistantMessage;
  messagePlainText: string;
  isAnnotateMode: boolean;
  pendingRange?: { start: number; end: number } | null;
  selectionRestoreKey?: number;
  onSelectRange: (
    range: { start: number; end: number },
    position: { top: number; left: number },
    selectedText: string
  ) => void;
  onClearSelection: () => void;
}

export function AssistantMessageView({
  message,
  messagePlainText,
  isAnnotateMode,
  pendingRange = null,
  selectionRestoreKey = 0,
  onSelectRange,
  onClearSelection,
}: AssistantMessageViewProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const markdownRenderer = useMemo(() => createInlineRenderer(), []);
  const selectionProcessedRef = useRef(false);

  useLayoutEffect(() => {
    if (!pendingRange || !contentRef.current) return;

    const range = getRangeFromOffsets(contentRef.current, pendingRange);
    if (!range) return;

    const selection = window.getSelection();
    if (!selection) return;

    selection.removeAllRanges();
    selection.addRange(range);
  }, [pendingRange, selectionRestoreKey]);

  const handleSelectionStart = () => {
    selectionProcessedRef.current = false;
  };

  const handleSelection = useCallback(() => {
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
      if (!rangeIntersectsNode(rawRange, contentRef.current!)) {
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
  }, [isAnnotateMode, onClearSelection, onSelectRange]);

  useLayoutEffect(() => {
    if (!isAnnotateMode) return;

    const resetSelectionProcessing = () => {
      selectionProcessedRef.current = false;
    };

    document.addEventListener("mousedown", resetSelectionProcessing);
    document.addEventListener("pointerup", handleSelection);
    document.addEventListener("mouseup", handleSelection);

    return () => {
      document.removeEventListener("mousedown", resetSelectionProcessing);
      document.removeEventListener("pointerup", handleSelection);
      document.removeEventListener("mouseup", handleSelection);
    };
  }, [handleSelection, isAnnotateMode]);

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
          data-message-id={message.id}
        >
          <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(messagePlainText, markdownRenderer) }} />
        </div>
      </div>
    </div>
  );
}

function rangeIntersectsNode(range: Range, node: Node) {
  if (typeof range.intersectsNode === "function") {
    return range.intersectsNode(node);
  }

  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
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

function getRangeFromOffsets(
  container: HTMLElement,
  offsets: { start: number; end: number }
): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let currentOffset = 0;
  let startSet = false;
  let endSet = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    const nextOffset = currentOffset + length;

    if (!startSet && offsets.start <= nextOffset) {
      range.setStart(node, Math.max(0, offsets.start - currentOffset));
      startSet = true;
    }

    if (!endSet && offsets.end <= nextOffset) {
      range.setEnd(node, Math.max(0, offsets.end - currentOffset));
      endSet = true;
      break;
    }

    currentOffset = nextOffset;
  }

  return startSet && endSet ? range : null;
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
