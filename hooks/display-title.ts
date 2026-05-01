import { redactSecrets } from "./secret-redactor"

const MAX_LEN = 80

// Extracts a single-line, secret-redacted display title from a raw user
// message. Used by /beforeSubmitPrompt to seed `ConversationState.displayTitle`
// the first time a session is touched. Subsequent messages do NOT overwrite
// the title (handled at the call site by checking `displayTitle === null`).
export function extractDisplayTitle(rawMessage: string): string {
  if (!rawMessage) return ""
  // Strip fenced code blocks entirely so titles don't end up showing
  // ``` or partial code snippets.
  const noFences = rawMessage.replace(/```[\s\S]*?```/g, " ")
  // Collapse all whitespace (newlines, tabs) to single spaces; trim.
  const oneLine = noFences.replace(/\s+/g, " ").trim()
  if (!oneLine) return ""
  const redacted = redactSecrets(oneLine)
  if (redacted.length <= MAX_LEN) return redacted
  return redacted.slice(0, MAX_LEN - 1).trimEnd() + "\u2026"
}
