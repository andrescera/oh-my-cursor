import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { redact } from "./redact"
import type { EvidenceRecord } from "./types"

const SKIP_NAMES = new Set(["_header.json", "_watchdog-drill.json", "_preflight.json"])

/** Recursively apply `redact()` to every string in nested objects/arrays. */
export function deepRedact(obj: unknown): unknown {
  if (typeof obj === "string") return redact(obj)
  if (Array.isArray(obj)) return obj.map(deepRedact)
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      out[k] = deepRedact((obj as Record<string, unknown>)[k])
    }
    return out
  }
  return obj
}

function prepareRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const pathForBasename =
    typeof raw.stdin_content_path === "string" ? raw.stdin_content_path : ""
  const env = raw.env_cursor
  if (env && typeof env === "object" && !Array.isArray(env)) {
    const e = env as Record<string, unknown>
    if (e.CURSOR_USER_EMAIL !== undefined) {
      e.CURSOR_USER_EMAIL = "<email>"
    }
    delete e.user_email
  }
  const redacted = deepRedact(raw) as Record<string, unknown>
  redacted.stdin_content_path = basename(pathForBasename)
  return redacted
}

function parseArgs(): { source: string; out: string } {
  const args = process.argv.slice(2)
  let source = "/tmp/cursor-hooks-evidence"
  let out = "docs/internal/hooks-evidence-v2.jsonl"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) source = args[++i]
    else if (args[i] === "--out" && args[i + 1]) out = args[++i]
  }
  return { source, out }
}

const { source, out } = parseArgs()

const files = readdirSync(source).filter((f) => {
  if (SKIP_NAMES.has(f)) return false
  if (f.startsWith("content-")) return false
  if (f.startsWith("_")) return false
  return f.endsWith(".json")
})

const records: EvidenceRecord[] = files
  .map((f) => {
    try {
      return JSON.parse(readFileSync(join(source, f), "utf8")) as EvidenceRecord
    } catch {
      return null
    }
  })
  .filter((r): r is EvidenceRecord => r !== null)
  .sort((a, b) => a.started_at.localeCompare(b.started_at))

const lines = records.map((r) => JSON.stringify(prepareRecord(r as unknown as Record<string, unknown>)))

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8")
