type RedactionRule = {
  pattern: RegExp
  replacement: string
}

const REDACTION_RULES: RedactionRule[] = [
  { pattern: /sk-[A-Za-z0-9]{20,}/g, replacement: "[REDACTED:openai]" },
  { pattern: /ghp_[A-Za-z0-9]{30,}/g, replacement: "[REDACTED:github-pat]" },
  { pattern: /ghs_[A-Za-z0-9]{30,}/g, replacement: "[REDACTED:github-server]" },
  { pattern: /pat_[A-Za-z0-9]{20,}/g, replacement: "[REDACTED:pat]" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED:aws-akid]" },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    replacement: "[REDACTED:jwt]",
  },
  { pattern: /https?:\/\/[^\s:/]+:[^\s@]+@/g, replacement: "[REDACTED:basic-auth]" },
]

export function redactSecrets(s: string): string {
  let redacted = s
  for (const rule of REDACTION_RULES) {
    redacted = redacted.replace(rule.pattern, rule.replacement)
  }
  return redacted
}
