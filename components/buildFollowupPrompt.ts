import { Annotation } from "./types";

export function buildFollowupPrompt(
  annotations: Annotation[],
  messagePlainText: string
): string {
  if (!annotations.length) {
    return "Please share your questions or edits about the previous response.";
  }

  const sorted = [...annotations].sort((a, b) => a.start - b.start);
  const items = sorted
    .map((annotation, index) => {
      const passageSource =
        annotation.snippet && annotation.snippet.length
          ? annotation.snippet
          : messagePlainText.slice(annotation.start, annotation.end);
      const passageRaw = passageSource;
      const passage =
        passageRaw.length > 160 ? `${passageRaw.slice(0, 157)}...` : passageRaw;
      const cleanPassage = passage.replace(/\s+/g, " ").trim();
      const noteText = annotation.noteText.trim() || "(no note text)";
      return `${index + 1}) "${cleanPassage}" — ${noteText}`;
    })
    .join("\n");

  return `Please address my highlights from your previous answer:\n${items}\n\nUse the note beside each passage to guide fixes.`;
}
