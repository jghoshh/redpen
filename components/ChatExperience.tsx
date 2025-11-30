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
  <p>Yes it is! This is a sample assistant reply. Try selecting text to open the “Ask ChatGPT” bubble, add a short note, and it will be highlighted in-line.</p>
  <p>You can add multiple disjoint selections; they all flow into the chat box at the bottom so you can send a single follow-up with context.</p>
  <p>Click a highlight to jump to it, edit the note, or remove it. Clearing everything resets the chat box too.</p>
  `,
};

const HELLO_TEXT = "hello, is this the chat redpen demo?";

export function ChatExperience() {
  const [message, setMessage] = useState<AssistantMessage>(SAMPLE_MESSAGE);
  const [annotations, setAnnotations] = useState<Annotation[]>(message.annotations ?? []);
  const [pendingRange, setPendingRange] = useState<{ start: number; end: number } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
  const [toolbarNoteText, setToolbarNoteText] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState<string>("");
  const [pulseAnnotationId, setPulseAnnotationId] = useState<string | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [toolbarMode, setToolbarMode] = useState<"cta" | "note">("cta");
  const [selectedText, setSelectedText] = useState<string>("");
  const [conversation, setConversation] = useState<{ role: "user" | "assistant"; content: string }[]>(
    [{ role: "assistant", content: stripHtmlToPlainText(SAMPLE_MESSAGE.html) }]
  );
  const [isSending, setIsSending] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const messagePlainText = useMemo(() => stripHtmlToPlainText(message.html), [message.html]);
  const isAnnotateMode = true;

  const clearSelection = () => {
    setPendingRange(null);
    setToolbarPosition(null);
    setToolbarNoteText("");
    setSelectionError(null);
    setEditingAnnotationId(null);
    setToolbarMode("cta");
    setSelectedText("");
    const selection = window.getSelection();
    selection?.removeAllRanges();
  };

  const handleSelectRange = (
    range: { start: number; end: number },
    position: { top: number; left: number },
    selected: string
  ) => {
    const overlapping = annotations.find(
      (ann) => range.start < ann.end && range.end > ann.start
    );

    setSelectionError(null);
    setPendingRange(range);
    setToolbarPosition(position);
    setToolbarMode(overlapping ? "note" : "cta");
    setEditingAnnotationId(overlapping ? overlapping.id : null);
    setToolbarNoteText(overlapping ? overlapping.noteText : "");
    setSelectedText(overlapping?.snippet ?? selected);
  };

  const saveAnnotation = () => {
    if (!pendingRange) return;
    const trimmed = toolbarNoteText.trim();
    const snippetFromSelection = selectedText.trim();
    const snippetFromRange =
      pendingRange ? messagePlainText.slice(pendingRange.start, pendingRange.end) : "";
    const snippet =
      snippetFromSelection.length > 0
        ? snippetFromSelection
        : snippetFromRange.length > 0
        ? snippetFromRange
        : "";
    if (editingAnnotationId) {
      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === editingAnnotationId
            ? {
                ...annotation,
                noteText: trimmed,
                snippet: snippet || annotation.snippet || snippetFromRange,
              }
            : annotation
        )
      );
    } else {
      const newAnnotation: Annotation = {
        id: generateId(),
        messageId: message.id,
        start: pendingRange.start,
        end: pendingRange.end,
        noteText: trimmed,
        snippet,
        createdAt: Date.now(),
      };
      setAnnotations((current) => [...current, newAnnotation]);
    }
    clearSelection();
  };

  const beginNote = () => {
    setToolbarMode("note");
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== id));
    clearSelection();
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
      const annotation = annotations.find((a) => a.id === id);
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
    const noteContext =
      annotations.length > 0
        ? annotations
            .slice()
            .sort((a, b) => a.start - b.start)
            .map((ann, idx) => {
              const snippet =
                ann.snippet && ann.snippet.length
                  ? ann.snippet
                  : messagePlainText.slice(ann.start, ann.end);
              const note = ann.noteText.trim();
              return `${idx + 1}) "${snippet}"${note ? ` — ${note}` : ""}`;
            })
            .join("\n")
        : "";

    const fullUserMessage = [userText, noteContext ? `Notes:\n${noteContext}` : ""]
      .filter(Boolean)
      .join("\n\n");

    if (!fullUserMessage) return;

    setIsSending(true);
    const nextConversation = [...conversation, { role: "user" as const, content: fullUserMessage }];

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextConversation }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to reach model");
        const data = await res.json();
        const assistantText: string = data?.message ?? "";
        if (!assistantText) throw new Error("Empty response");

        const assistantHtml = textToHtml(assistantText);
        const newMessage: AssistantMessage = { id: generateId(), html: assistantHtml };

        setConversation([...nextConversation, { role: "assistant", content: assistantText }]);
        setMessage(newMessage);
        setAnnotations([]);
        setComposerValue("");
        setToolbarMode("cta");
        setSelectedText("");
      })
      .catch(() => {
        // ignore errors for now
      })
      .finally(() => setIsSending(false));
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

  return (
    <main>
      <h1 style={{ display: "none" }}>Ask ChatGPT with highlights</h1>
      <div className="chat-container">
        <div className="chat-message right-bubble">
          <div className="message-bubble bubble-muted">
            <div className="message-content user-content">
              <p>{HELLO_TEXT}</p>
            </div>
          </div>
        </div>
        <AssistantMessageView
          message={message}
          annotations={annotations}
          messagePlainText={messagePlainText}
          isAnnotateMode={isAnnotateMode}
          onSelectRange={handleSelectRange}
          onClearSelection={clearSelection}
          onAnnotationClick={focusAnnotation}
          pulseAnnotationId={pulseAnnotationId}
        />
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
        />
        <ChatComposer
          value={composerValue}
          onChange={setComposerValue}
          onSend={sendPrompt}
          textareaRef={composerRef}
          annotations={annotations}
          messagePlainText={messagePlainText}
          onDeleteAnnotation={deleteAnnotation}
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
