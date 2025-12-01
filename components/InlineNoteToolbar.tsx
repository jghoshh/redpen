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
  forceModal?: boolean;
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
  forceModal = false,
}: InlineNoteToolbarProps) {
  const isModal = forceModal;
  const showToolbar = position || isModal;
  if (!showToolbar) return null;

  const className = `inline-toolbar${mode === "cta" ? " toolbar-cta" : ""}${isModal ? " toolbar-modal" : ""}`;

  const noteForm = (
    <>
      <div className="toolbar-head">
        <span className="toolbar-label">Ask ChatGPT</span>
      </div>
      {previewSnippet && isModal ? (
        <div className="toolbar-preview">
          <div className="toolbar-preview-label">Selected text</div>
          <div className="toolbar-preview-body">{previewSnippet}</div>
        </div>
      ) : null}
      <textarea
        placeholder="Add a note for this selection…"
        value={noteText}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={!isMobile}
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
        {isModal && onCancel ? (
          <button className="toolbar-button ghost" onClick={onCancel} type="button">
            Close
          </button>
        ) : null}
      </div>
    </>
  );

  const content =
    mode === "cta" && !isModal ? (
      <button className="toolbar-button primary" onClick={onBeginNote} type="button">
        Ask ChatGPT
      </button>
    ) : (
      noteForm
    );

  if (isMobile) {
    return (
      <>
        {isModal ? <div className="toolbar-overlay" onClick={onCancel} /> : null}
        <div
          className={className}
          role="dialog"
          aria-label="Add inline note"
          style={!isModal && position ? { top: position.top, left: position.left } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {isModal ? <div className="toolbar-modal-content">{content}</div> : content}
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
