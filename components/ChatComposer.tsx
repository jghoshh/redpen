import React from "react";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  annotations?: { id: string; start: number; end: number; noteText: string; snippet?: string }[];
  messagePlainText?: string;
  onDeleteAnnotation?: (id: string) => void;
  isSending?: boolean;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  textareaRef,
  annotations = [],
  messagePlainText = "",
  onDeleteAnnotation,
  isSending = false,
}: ChatComposerProps) {
  const truncate = (text: string, limit: number) =>
    text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;

  const buildPreview = (annotation: {
    start: number;
    end: number;
    noteText: string;
    snippet?: string;
  }): { snippet: string; note: string } => {
    const noteRaw = annotation.noteText.trim();
    const snippetRaw =
      annotation.snippet && annotation.snippet.length
        ? annotation.snippet
        : messagePlainText.slice(annotation.start, annotation.end);

    const snippet = truncate(snippetRaw, 90);
    const note = truncate(noteRaw || "", 60);

    return { snippet, note };
  };

  return (
    <div className="composer">
      {annotations.length ? (
        <div className="composer-previews">
          {annotations
            .slice()
            .sort((a, b) => a.start - b.start)
            .map((annotation) => (
              <div className="composer-chip" key={annotation.id}>
                <span aria-hidden className="chip-icon">↩</span>
                {(() => {
                  const preview = buildPreview(annotation);
                  return (
                    <div className="chip-content">
                      <span className="chip-snippet">{preview.snippet}</span>
                      {preview.note ? <span className="chip-note">{preview.note}</span> : null}
                    </div>
                  );
                })()}
                {onDeleteAnnotation ? (
                  <button
                    className="chip-close"
                    type="button"
                    aria-label="Remove note"
                    onClick={() => onDeleteAnnotation(annotation.id)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask anything"
      />
      <div className="composer-actions">
        <div className="composer-actions-right">
          <button
            className="send-circle"
            onClick={onSend}
            type="button"
            aria-label="Send"
            disabled={isSending}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
