import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join, dirname, basename } from "node:path"
import { redact } from "./redact"
import type { EvidenceRecord } from "./types"

const SKIP_NAMES = new Set(["_header.json", "_watchdog-drill.json", "_preflight.json"])

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

const lines = records.map((r) => {
  const out: EvidenceRecord = {
    ...r,
    // defense-in-depth redaction
    stdin_preview: redact(r.stdin_preview),
    // strip full path to basename only
    stdin_content_path: basename(r.stdin_content_path),
    // remove user_email from env_cursor if present
    env_cursor: Object.fromEntries(
      Object.entries(r.env_cursor).filter(([k]) => k !== "user_email")
    ),
  }
  return JSON.stringify(out)
})

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8")
