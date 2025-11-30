import React from "react";

interface InlineNoteToolbarProps {
  noteText: string;
  position: { top: number; left: number } | null;
  mode: "cta" | "note";
  onBeginNote: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onDelete?: () => void;
  disabled?: boolean;
  tooltip?: string | null;
  isEditing?: boolean;
  isMobile?: boolean;
  previewSnippet?: string;
  onCancel?: () => void;
}

export function InlineNoteToolbar({
  noteText,
  position,
  mode,
  onBeginNote,
  onChange,
  onConfirm,
  onDelete,
  disabled = false,
  tooltip = null,
  isEditing = false,
  isMobile = false,
  previewSnippet = "",
  onCancel,
}: InlineNoteToolbarProps) {
  const showToolbar = position || (isMobile && mode === "note");
  if (!showToolbar) return null;

  const className = `inline-toolbar${mode === "cta" ? " toolbar-cta" : ""}${isMobile ? " toolbar-modal" : ""}`;

  const content = isMobile ? (
    <>
      <div className="toolbar-head">
        <span className="toolbar-label">Ask ChatGPT</span>
      </div>
      {previewSnippet ? (
        <div className="toolbar-preview">
          <div className="toolbar-preview-label">Selected text</div>
          <div className="toolbar-preview-body">{previewSnippet}</div>
        </div>
      ) : null}
      <textarea
        placeholder="Add a note for this selection…"
        value={noteText}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
      />
      <div className="toolbar-actions">
        {isEditing && onDelete ? (
          <button className="toolbar-button ghost" onClick={onDelete} type="button">
            Delete
          </button>
        ) : null}
        <button className="toolbar-button primary" onClick={onConfirm} disabled={disabled} type="button">
          {isEditing ? "Update" : "Add Note"}
        </button>
        {onCancel ? (
          <button className="toolbar-button ghost" onClick={onCancel} type="button">
            Close
          </button>
        ) : null}
      </div>
    </>
  ) : mode === "cta" ? (
    <button className="toolbar-button primary" onClick={onBeginNote} type="button">
      Ask ChatGPT
    </button>
  ) : (
    <>
      <div className="toolbar-head">
        <span className="toolbar-label">Ask ChatGPT</span>
      </div>
      <textarea
        placeholder="Add a note for this selection…"
        value={noteText}
        onChange={(event) => onChange(event.target.value)}
        autoFocus
      />
      <div className="toolbar-actions">
        {isEditing && onDelete ? (
          <button className="toolbar-button ghost" onClick={onDelete} type="button">
            Delete
          </button>
        ) : null}
        <button className="toolbar-button primary" onClick={onConfirm} disabled={disabled} type="button">
          {isEditing ? "Update" : "Add Note"}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <>
        <div className="toolbar-overlay" onClick={onCancel} />
        <div className={className} role="dialog" aria-label="Add inline note" onClick={(e) => e.stopPropagation()}>
          <div className="toolbar-modal-content">{content}</div>
          {tooltip ? <div className="toolbar-tooltip">{tooltip}</div> : null}
        </div>
      </>
    );
  }

  return (
    <div
      className={className}
      style={position ? { top: position.top, left: position.left } : undefined}
      role="dialog"
      aria-label="Add inline note"
      onClick={(event) => event.stopPropagation()}
    >
      {content}
      {tooltip ? <div className="toolbar-tooltip">{tooltip}</div> : null}
    </div>
  );
}
