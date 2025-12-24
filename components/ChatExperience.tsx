"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AssistantMessage, Annotation } from "./types";
import { AssistantMessageView } from "./AssistantMessageView";
import { InlineNoteToolbar } from "./InlineNoteToolbar";
import { ChatComposer } from "./ChatComposer";

function stripHtmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<(p|div|br)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  return withoutTags
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Formats the user's message with highlighted context using XML-style tags.
 * This follows RAG best practices by:
 * 1. Clearly separating context (highlights) from the user's query
 * 2. Using semantic XML tags that LLMs understand well
 * 3. Preserving the relationship between excerpts and user annotations
 */
function formatMessageWithContext(userText: string, annotations: Annotation[]): string {
  const hasHighlights = annotations.length > 0;
  const hasUserText = userText.length > 0;

  if (!hasHighlights && !hasUserText) {
    return "";
  }

  // If no highlights, just return the user's message directly
  if (!hasHighlights) {
    return userText;
  }

  // Build the highlighted context section
  const highlightEntries = annotations
    .map((ann) => {
      const excerpt = ann.snippet?.trim() || "";
      const note = ann.noteText?.trim() || "";

      if (!excerpt && !note) return null;

      let entry = "<highlight>\n";
      if (excerpt) {
        entry += `<excerpt>${excerpt}</excerpt>\n`;
      }
      if (note) {
        entry += `<annotation>${note}</annotation>\n`;
      }
      entry += "</highlight>";
      return entry;
    })
    .filter(Boolean);

  if (highlightEntries.length === 0 && !hasUserText) {
    return "";
  }

  const parts: string[] = [];

  // Add context section if there are highlights
  if (highlightEntries.length > 0) {
    parts.push(
      `<highlighted_context>\n${highlightEntries.join("\n")}\n</highlighted_context>`
    );
  }

  // Add user query section
  if (hasUserText) {
    parts.push(`<user_query>\n${userText}\n</user_query>`);
  }

  return parts.join("\n\n");
}

const SAMPLE_MESSAGE: AssistantMessage = {
  id: "m1",
  html: `
  <p>Welcome to the RedPen demo.</p>
  <p>Select text, tap "Ask ChatGPT", and add a quick note. Each highlight shows up above the Ask box.</p>
  <p>Click a highlight to edit or delete it. When you send, your prompt and all notes are bundled together.</p>
  `,
};

export function ChatExperience() {
  const [activeMessageId, setActiveMessageId] = useState<string>(SAMPLE_MESSAGE.id);
  const [activeMessagePlainText, setActiveMessagePlainText] = useState<string>(
    stripHtmlToPlainText(SAMPLE_MESSAGE.html)
  );
  const [annotationsByMessage, setAnnotationsByMessage] = useState<Record<string, Annotation[]>>({
    [SAMPLE_MESSAGE.id]: SAMPLE_MESSAGE.annotations ?? [],
  });
  const [pendingRange, setPendingRange] = useState<{ start: number; end: number } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
  const [toolbarNoteText, setToolbarNoteText] = useState("");
  const [composerValue, setComposerValue] = useState<string>("");
  const [toolbarMode, setToolbarMode] = useState<"cta" | "note">("cta");
  const [selectedText, setSelectedText] = useState<string>("");
  type ChatEntry = {
    id: string;
    role: "user" | "assistant";
    content: string;
    html?: string;
    pending?: boolean;
    createdAt?: number;
  };
  const [conversation, setConversation] = useState<ChatEntry[]>([
    {
      id: SAMPLE_MESSAGE.id,
      role: "assistant",
      content: stripHtmlToPlainText(SAMPLE_MESSAGE.html),
      html: SAMPLE_MESSAGE.html,
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  const isAnnotateMode = true;
  const allAnnotations = useMemo(
    () => Object.values(annotationsByMessage).flat(),
    [annotationsByMessage]
  );

  const clearSelection = () => {
    setPendingRange(null);
    setToolbarPosition(null);
    setToolbarNoteText("");
    setToolbarMode("cta");
    setSelectedText("");
    const selection = window.getSelection();
    selection?.removeAllRanges();
  };

  const handleSelectRange = (
    range: { start: number; end: number },
    position: { top: number; left: number },
    selected: string,
    targetMessageId: string,
    targetPlainText: string
  ) => {
    setPendingRange(range);
    setToolbarPosition(position);
    setActiveMessageId(targetMessageId);
    setActiveMessagePlainText(targetPlainText);
    setToolbarMode("cta");
    setToolbarNoteText("");
    setSelectedText(selected);
  };

  const saveAnnotation = () => {
    if (!pendingRange) return;
    const trimmed = toolbarNoteText.trim();
    const snippetFromSelection = selectedText.trim();
    const snippetFromRange =
      pendingRange ? activeMessagePlainText.slice(pendingRange.start, pendingRange.end) : "";
    const snippet =
      snippetFromSelection.length > 0
        ? snippetFromSelection
        : snippetFromRange.length > 0
        ? snippetFromRange
        : "";
    setAnnotationsByMessage((current) => {
      const existing = current[activeMessageId] ?? [];
      const newAnnotation: Annotation = {
        id: generateId(),
        messageId: activeMessageId,
        start: pendingRange.start,
        end: pendingRange.end,
        noteText: trimmed,
        snippet,
        createdAt: Date.now(),
      };
      return { ...current, [activeMessageId]: [...existing, newAnnotation] };
    });

    clearSelection();
  };

  const beginNote = () => {
    setToolbarMode("note");
  };

  const deleteAnnotationForMessage = (messageId: string, id: string) => {
    setAnnotationsByMessage((current) => {
      const existing = current[messageId] ?? [];
      return { ...current, [messageId]: existing.filter((annotation) => annotation.id !== id) };
    });
    if (messageId === activeMessageId) {
      clearSelection();
    }
  };

  const sendPrompt = () => {
    if (isSending) return;
    const userText = composerValue.trim();
    const fullUserMessage = formatMessageWithContext(userText, allAnnotations);

    if (!fullUserMessage) return;

    // Clear all existing annotations once we send a prompt so the next turn starts fresh.
    setAnnotationsByMessage({});
    setSelectedText("");
    setPendingRange(null);
    setToolbarPosition(null);
    setToolbarNoteText("");

    const userEntry: ChatEntry = { id: generateId(), role: "user", content: fullUserMessage };
    const pendingCreatedAt = Date.now();
    const pendingAssistant: ChatEntry = {
      id: generateId(),
      role: "assistant",
      content: "Thinking",
      pending: true,
      createdAt: pendingCreatedAt,
    };

    const nextConversation = [...conversation, userEntry, pendingAssistant];
    setConversation(nextConversation);
    setComposerValue("");
    setIsSending(true);

    const apiConversation = [...conversation, { role: "user" as const, content: fullUserMessage }];

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiConversation }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to reach model");
        const data = await res.json();
        const assistantText: string = data?.message ?? "";
        if (!assistantText) throw new Error("Empty response");

        const assistantHtml = textToHtml(assistantText);
        const newMessage: AssistantMessage = { id: pendingAssistant.id, html: assistantHtml };

        const finalize = () => {
          setConversation((current) =>
            current.map((entry) =>
              entry.id === pendingAssistant.id
                ? { ...entry, content: assistantText, pending: false }
                : entry
            )
          );
          setActiveMessageId(newMessage.id);
          setActiveMessagePlainText(stripHtmlToPlainText(newMessage.html));
          setAnnotationsByMessage(() => ({
            [newMessage.id]: [],
          }));
          setToolbarMode("cta");
          setSelectedText("");
          setPendingRange(null);
          setToolbarPosition(null);
          setToolbarNoteText("");
          setIsSending(false);
        };

        const elapsed = Date.now() - pendingCreatedAt;
        const wait = Math.max(0, 2000 - elapsed);
        setTimeout(finalize, wait);
      })
      .catch(() => {
        const fallback = "I'm rate limited right now, but you can still select this text.";
        const finalize = () => {
          setConversation((current) =>
            current.map((entry) =>
              entry.id === pendingAssistant.id
                ? { ...entry, content: fallback, pending: false }
                : entry
            )
          );
          setActiveMessageId(pendingAssistant.id);
          setActiveMessagePlainText(fallback);
          setAnnotationsByMessage(() => ({
            [pendingAssistant.id]: [],
          }));
          setPendingRange(null);
          setToolbarPosition(null);
          setToolbarNoteText("");
          setIsSending(false);
        };
        const elapsed = Date.now() - pendingCreatedAt;
        const wait = Math.max(0, 2000 - elapsed);
        setTimeout(finalize, wait);
      });
  };

  useEffect(() => {
    if (!toolbarPosition) return;
    const handleOutside = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".inline-toolbar")) return;
      clearSelection();
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [toolbarPosition]);

  useEffect(() => {
    const updateMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 640px)").matches);
    };
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    const el = chatContainerRef.current;
    const sentinel = bottomRef.current;
    if (!el || !sentinel) return;

    const frames: number[] = [];

    const animate = (cb: () => void) => {
      const id = requestAnimationFrame(cb);
      frames.push(id);
    };

    animate(() => smoothScroll(el, el.scrollHeight, 650));

    const scrollingEl = document.scrollingElement;
    if (scrollingEl && "scrollTop" in scrollingEl) {
      const targetEl = scrollingEl as HTMLElement;
      animate(() => smoothScroll(targetEl, targetEl.scrollHeight, 650));
    } else {
      animate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
    }

    return () => frames.forEach(cancelAnimationFrame);
  }, [conversation]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation]);

  if (isMobile) {
    return (
      <main className="mobile-notice-container">
        <div className="mobile-notice">
          <div className="mobile-notice-icon">💻</div>
          <h2>Desktop Only</h2>
          <p>This demo uses text selection features that work best on desktop browsers.</p>
          <p>Please visit on a computer to try the full experience.</p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1 style={{ display: "none" }}>Ask ChatGPT with highlights</h1>
      <header className="page-header">
        built by{" "}
        <a href="https://x.com/jgh0sh" target="_blank" rel="noreferrer">
          jgh0sh
        </a>
      </header>
      <div className="chat-container" ref={chatContainerRef}>
        {conversation.map((entry) => {
          if (entry.role === "user") {
            return (
              <div className="chat-message right-bubble" key={entry.id}>
                <div className="message-bubble bubble-muted">
                  <div className="message-content user-content" style={{ whiteSpace: "pre-line" }}>
                    {entry.content}
                  </div>
                </div>
              </div>
            );
          }

          const assistantHtml = entry.html ?? textToHtml(entry.content);
          const plainText = stripHtmlToPlainText(assistantHtml);

          if (entry.pending) {
            return (
              <div className="chat-message" key={entry.id}>
                <div className="message-bubble">
                  <div className="message-content assistant-content" style={{ whiteSpace: "pre-line" }}>
                    <span className="thinking-text">Thinking</span>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <AssistantMessageView
              key={entry.id}
              message={{ id: entry.id, html: assistantHtml }}
              messagePlainText={plainText}
              isAnnotateMode={isAnnotateMode}
              pendingRange={entry.id === activeMessageId ? pendingRange : null}
              onSelectRange={(range, pos, selected) =>
                handleSelectRange(range, pos, selected, entry.id, plainText)
              }
              onClearSelection={clearSelection}
            />
          );
        })}
        <div ref={bottomRef} />
        <InlineNoteToolbar
          noteText={toolbarNoteText}
          position={toolbarPosition}
          mode={toolbarMode}
          onBeginNote={beginNote}
          onChange={setToolbarNoteText}
          onConfirm={saveAnnotation}
          disabled={!pendingRange}
          onCancel={clearSelection}
        />
        <ChatComposer
          value={composerValue}
          onChange={setComposerValue}
          onSend={sendPrompt}
          textareaRef={composerRef}
          annotations={allAnnotations}
          onDeleteAnnotation={(id, messageId) => deleteAnnotationForMessage(messageId, id)}
          isSending={isSending}
        />
      </div>
    </main>
  );
}

function textToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return `<p>${text}</p>`;
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

function smoothScroll(element: HTMLElement, target: number, duration = 600) {
  const start = element.scrollTop;
  const change = target - start;
  const startTime = performance.now();

  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

  const step = () => {
    const now = performance.now();
    const elapsed = Math.min((now - startTime) / duration, 1);
    const eased = easeInOut(elapsed);
    element.scrollTop = start + change * eased;
    if (elapsed < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}
