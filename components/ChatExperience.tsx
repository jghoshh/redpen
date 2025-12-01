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

const SAMPLE_MESSAGE: AssistantMessage = {
  id: "m1",
  html: `
  <p>Welcome to the RedPen demo.</p>
  <p>Select text, tap “Ask ChatGPT”, and add a quick note. Each highlight shows up above the Ask box.</p>
  <p>Click a highlight to edit or delete it. When you send, your prompt and all notes are bundled together.</p>
  `,
};

const HELLO_TEXT = "hello, is this the chat redpen demo?";

export function ChatExperience() {
  const [message, setMessage] = useState<AssistantMessage>(SAMPLE_MESSAGE);
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
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState<string>("");
  const [pulseAnnotationId, setPulseAnnotationId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
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
  const [showMobileModal, setShowMobileModal] = useState(false);

  const messagePlainText = useMemo(() => stripHtmlToPlainText(message.html), [message.html]);
  const isAnnotateMode = true;
  const activeAnnotations = annotationsByMessage[activeMessageId] ?? [];
  const allAnnotations = useMemo(
    () => Object.values(annotationsByMessage).flat(),
    [annotationsByMessage]
  );

  const clearSelection = () => {
    setPendingRange(null);
    setToolbarPosition(null);
    setToolbarNoteText("");
    setSelectionError(null);
    setEditingAnnotationId(null);
    setToolbarMode("cta");
    setSelectedText("");
    setShowMobileModal(false);
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
    const targetAnnotations = annotationsByMessage[targetMessageId] ?? [];
    const overlapping = targetAnnotations.find(
      (ann) => range.start < ann.end && range.end > ann.start
    );

    setSelectionError(null);
    setPendingRange(range);
    setToolbarPosition(position);
    setActiveMessageId(targetMessageId);
    setActiveMessagePlainText(targetPlainText);
    setToolbarMode(overlapping ? "note" : "cta");
    setEditingAnnotationId(overlapping ? overlapping.id : null);
    setToolbarNoteText(overlapping ? overlapping.noteText : "");
    setSelectedText(overlapping?.snippet ?? selected);
    setShowMobileModal(false);
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
      if (editingAnnotationId) {
        return {
          ...current,
          [activeMessageId]: existing.map((annotation) =>
            annotation.id === editingAnnotationId
              ? {
                  ...annotation,
                  noteText: trimmed,
                  snippet: snippet || annotation.snippet || snippetFromRange,
                }
              : annotation
          ),
        };
      }
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
    setShowMobileModal(isMobile);
    setToolbarMode("note");
  };

  const deleteAnnotation = (id: string) => {
    deleteAnnotationForMessage(activeMessageId, id);
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

  const focusAnnotation = (id: string) => {
    const element = document.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
    if (element) {
      const rect = element.getBoundingClientRect();
      const container = element.closest(".message-content");
      const containerRect = container?.getBoundingClientRect();
      const startAttr = element.getAttribute("data-char-start");
      const endAttr = element.getAttribute("data-char-end");
      if (!startAttr || !endAttr) return;
      const start = Number(startAttr);
      const end = Number(endAttr);
      if (Number.isNaN(start) || Number.isNaN(end)) return;
      const top =
        rect.bottom - (containerRect?.top ?? 0) + (container?.scrollTop ?? 0) + 8;
      const left =
        rect.left - (containerRect?.left ?? 0) + (container?.scrollLeft ?? 0) + rect.width / 2;
      setToolbarPosition({ top, left });
      setPendingRange({
        start,
        end,
      });
      const annotation =
        annotationsByMessage[activeMessageId]?.find((a) => a.id === id) ?? null;
      setToolbarNoteText(annotation?.noteText ?? "");
      setEditingAnnotationId(id);
      setToolbarMode("note");
      setSelectedText(annotation?.snippet ?? "");
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setPulseAnnotationId(id);
    }
  };

  const sendPrompt = () => {
    if (isSending) return;
    const userText = composerValue.trim();
    const allNoteContext =
      allAnnotations.length > 0
        ? allAnnotations
            .slice()
            .map((ann, idx) => {
              const snippet = ann.snippet && ann.snippet.length ? ann.snippet : "";
              const note = ann.noteText.trim();
              const label = note ? `${note}` : "";
              return `${idx + 1}) "${snippet}"${label ? ` — ${label}` : ""}`;
            })
            .join("\n")
        : "";

    const fullUserMessage = [userText, allNoteContext ? `Notes:\n${allNoteContext}` : ""]
      .filter(Boolean)
      .join("\n\n");

    if (!fullUserMessage) return;

    // Clear all existing annotations once we send a prompt so the next turn starts fresh.
    setAnnotationsByMessage({});
    setSelectedText("");
    setPendingRange(null);
    setToolbarPosition(null);
    setToolbarNoteText("");
    setEditingAnnotationId(null);
    setSelectionError(null);
    setShowMobileModal(false);

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
          setMessage(newMessage);
          setActiveMessageId(newMessage.id);
          setActiveMessagePlainText(stripHtmlToPlainText(newMessage.html));
          setAnnotationsByMessage((current) => ({
            [newMessage.id]: [],
          }));
          setToolbarMode("cta");
          setSelectedText("");
          setPendingRange(null);
          setToolbarPosition(null);
          setToolbarNoteText("");
          setEditingAnnotationId(null);
          setSelectionError(null);
          setShowMobileModal(false);
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
          setMessage({ id: pendingAssistant.id, html: textToHtml(fallback) });
          setActiveMessageId(pendingAssistant.id);
          setActiveMessagePlainText(fallback);
          setAnnotationsByMessage((current) => ({
            [pendingAssistant.id]: [],
          }));
          setPendingRange(null);
          setToolbarPosition(null);
          setToolbarNoteText("");
          setEditingAnnotationId(null);
          setSelectionError(null);
          setShowMobileModal(false);
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

  return (
    <main>
      <h1 style={{ display: "none" }}>Ask ChatGPT with highlights</h1>
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
          const annotations = annotationsByMessage[entry.id] ?? [];

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
              annotations={annotations}
              messagePlainText={plainText}
              isAnnotateMode={isAnnotateMode}
              onSelectRange={(range, pos, selected) =>
                handleSelectRange(range, pos, selected, entry.id, plainText)
              }
              onClearSelection={clearSelection}
              onAnnotationClick={focusAnnotation}
              pulseAnnotationId={pulseAnnotationId}
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
          onDelete={editingAnnotationId ? () => deleteAnnotation(editingAnnotationId) : undefined}
          isEditing={Boolean(editingAnnotationId)}
          disabled={!pendingRange}
          tooltip={selectionError}
          isMobile={isMobile}
        previewSnippet={selectedText}
        forceModal={showMobileModal}
        onCancel={() => {
          clearSelection();
        }}
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
