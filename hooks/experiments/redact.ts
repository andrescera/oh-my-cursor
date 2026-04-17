const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const STRIPE_RE = /sk-[A-Za-z0-9]{20,}/g
const GITHUB_RE = /gh[pso]_[A-Za-z0-9]{20,}/g
const AWS_RE = /AKIA[A-Z0-9]{16}/g

const HOME = process.env.HOME ?? ""

export function redact(text: string): string {
  let out = text
  out = out.replace(EMAIL_RE, "<email>")
  out = out.replace(STRIPE_RE, "<sk-redacted>")
  out = out.replace(GITHUB_RE, "<gh-redacted>")
  out = out.replace(AWS_RE, "<aws-redacted>")
  if (HOME) {
    // escape special regex chars in HOME before using as pattern
    const escapedHome = HOME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    out = out.replace(new RegExp(escapedHome, "g"), "<home>")
  }
  return out
}
