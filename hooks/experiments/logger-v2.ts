import { mkdirSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { redact } from "./redact"
import type { EvidenceRecord } from "./types"

const started_at = new Date().toISOString()

const stdinBytes = await new Response(Bun.stdin.stream()).bytes()
const stdinRaw = Buffer.from(stdinBytes).toString("utf8")

// parse args: logger-v2.ts <event> [--experiment-id <id>]
const args = process.argv.slice(2)
const event = args[0] ?? ""
let experiment_id = ""
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--experiment-id" && args[i + 1]) {
    experiment_id = args[i + 1]
    i++
  }
}

const evidenceDir =
  process.env["CURSOR_HOOKS_EVIDENCE_DIR"] ?? "/tmp/cursor-hooks-evidence"
mkdirSync(evidenceDir, { recursive: true })

// sha256 of raw stdin bytes
const hashBytes = new Uint8Array(
  await crypto.subtle.digest("SHA-256", stdinBytes)
)
const stdin_hash = Array.from(hashBytes)
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")

// content-addressed storage (dedup)
const contentPath = join(evidenceDir, `content-${stdin_hash}.json`)
if (!existsSync(contentPath)) {
  writeFileSync(contentPath, stdinRaw, "utf8")
}

// parse stdin JSON (tolerant)
let parsed: Record<string, unknown> = {}
try {
  parsed = JSON.parse(stdinRaw) as Record<string, unknown>
} catch {
  // malformed — leave parsed empty
}

const hook_event_name =
  typeof parsed["hook_event_name"] === "string" ? parsed["hook_event_name"] : ""
const conversation_id =
  typeof parsed["conversation_id"] === "string" ? parsed["conversation_id"] : ""
const session_id =
  typeof parsed["session_id"] === "string" ? parsed["session_id"] : ""

// env_cursor: only CURSOR_* + CLAUDE_PROJECT_DIR
const env_cursor: Record<string, string> = {}
for (const [k, v] of Object.entries(process.env)) {
  if ((k.startsWith("CURSOR_") || k === "CLAUDE_PROJECT_DIR") && v !== undefined) {
    env_cursor[k] = v
  }
}

// stdin_preview: first 4096 chars, redacted
const stdin_preview = redact(stdinRaw.slice(0, 4096))

const finished_at = new Date().toISOString()
const duration_ms =
  new Date(finished_at).getTime() - new Date(started_at).getTime()

const record: EvidenceRecord = {
  experiment_id,
  event,
  hook_event_name,
  conversation_id,
  session_id,
  pid: process.pid,
  ppid: (process as unknown as { ppid: number }).ppid,
  cwd: process.cwd(),
  env_cursor,
  stdin_hash,
  stdin_content_path: contentPath,
  stdin_preview,
  stdout: "",
  stderr: "",
  exit_code: 0,
  started_at,
  finished_at,
  duration_ms,
  schema_version: "v2",
}

const uuid = crypto.randomUUID()
const recordPath = join(evidenceDir, `${uuid}.json`)
writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf8")

// transparent: echo stdin to stdout so callers can chain a responder
process.stdout.write(stdinBytes)
process.exit(0)
