import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceRecord } from "./types"

const EVIDENCE_DIR = "/tmp/cursor-hooks-evidence-test"
const SCRIPT = join(import.meta.dir, "logger-v2.ts")

async function runLogger(
  stdin: string,
  args: string[],
  extraEnv: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number; record: EvidenceRecord | null }> {
  const proc = Bun.spawn(["bun", SCRIPT, ...args], {
    stdin: Buffer.from(stdin),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      CURSOR_HOOKS_EVIDENCE_DIR: EVIDENCE_DIR,
      ...extraEnv,
    },
  })
  const [stdoutBuf, stderrBuf] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited

  // find the latest uuid.json in EVIDENCE_DIR
  let record: EvidenceRecord | null = null
  if (existsSync(EVIDENCE_DIR)) {
    const { readdirSync } = await import("node:fs")
    const files = readdirSync(EVIDENCE_DIR)
      .filter((f) => /^[0-9a-f-]{36}\.json$/.test(f))
      .map((f) => ({
        name: f,
        mtime: Bun.file(join(EVIDENCE_DIR, f)).size, // use as proxy
        path: join(EVIDENCE_DIR, f),
      }))
    // sort by name (UUID + timestamp embedded via started_at inside the record)
    // simpler: just pick newest by mtime via stat
    const { statSync } = await import("node:fs")
    const sorted = files.sort(
      (a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs
    )
    if (sorted.length > 0) {
      record = JSON.parse(readFileSync(sorted[0].path, "utf8")) as EvidenceRecord
    }
  }

  return { stdout: stdoutBuf, stderr: stderrBuf, exitCode: proc.exitCode ?? 0, record }
}

describe("logger-v2", () => {
  beforeEach(() => {
    if (existsSync(EVIDENCE_DIR)) rmSync(EVIDENCE_DIR, { recursive: true })
    mkdirSync(EVIDENCE_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(EVIDENCE_DIR)) rmSync(EVIDENCE_DIR, { recursive: true })
  })

  test("record has correct schema_version, event, experiment_id", async () => {
    const { record } = await runLogger(
      '{"hook_event_name":"preToolUse","conversation_id":"c-abc","session_id":"s-xyz"}',
      ["preToolUse", "--experiment-id", "W-TEST-001"]
    )
    expect(record).not.toBeNull()
    expect(record!.schema_version).toBe("v2")
    expect(record!.event).toBe("preToolUse")
    expect(record!.experiment_id).toBe("W-TEST-001")
    expect(record!.hook_event_name).toBe("preToolUse")
    expect(record!.conversation_id).toBe("c-abc")
    expect(record!.session_id).toBe("s-xyz")
    expect(typeof record!.pid).toBe("number")
    expect(typeof record!.ppid).toBe("number")
    expect(typeof record!.duration_ms).toBe("number")
    expect(record!.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(record!.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("redaction applied to stdin_preview (email masked)", async () => {
    const { record } = await runLogger(
      '{"user_email":"secret@corp.com","hook_event_name":"postToolUse"}',
      ["postToolUse", "--experiment-id", "W-TEST-002"]
    )
    expect(record).not.toBeNull()
    expect(record!.stdin_preview).not.toContain("secret@corp.com")
    expect(record!.stdin_preview).toContain("<email>")
  })

  test("malformed JSON stdin does not crash and fills empty string fields", async () => {
    const { exitCode, record } = await runLogger("not-valid-json-at-all", [
      "preToolUse",
      "--experiment-id",
      "W-TEST-003",
    ])
    expect(exitCode).toBe(0)
    expect(record).not.toBeNull()
    expect(record!.conversation_id).toBe("")
    expect(record!.session_id).toBe("")
    expect(record!.hook_event_name).toBe("")
  })

  test("content-addressed file created; second identical payload reuses it", async () => {
    const payload = '{"hook_event_name":"test","conversation_id":"c-1"}'
    await runLogger(payload, ["test", "--experiment-id", "W-TEST-004a"])
    await runLogger(payload, ["test", "--experiment-id", "W-TEST-004b"])

    const { readdirSync } = await import("node:fs")
    const contentFiles = readdirSync(EVIDENCE_DIR).filter((f) =>
      f.startsWith("content-")
    )
    // same payload → same hash → only one content file
    expect(contentFiles.length).toBe(1)
  })

  test("UUID is unique across two invocations", async () => {
    const payload = '{"hook_event_name":"test"}'
    await runLogger(payload, ["test", "--experiment-id", "W-TEST-005a"])
    await runLogger(payload, ["test", "--experiment-id", "W-TEST-005b"])

    const { readdirSync } = await import("node:fs")
    const uuidFiles = readdirSync(EVIDENCE_DIR).filter((f) =>
      /^[0-9a-f-]{36}\.json$/.test(f)
    )
    expect(uuidFiles.length).toBe(2)
    expect(uuidFiles[0]).not.toBe(uuidFiles[1])
  })

  test("env_cursor contains only CURSOR_* and CLAUDE_PROJECT_DIR keys", async () => {
    const { record } = await runLogger('{"hook_event_name":"test"}', [
      "test",
      "--experiment-id",
      "W-TEST-006",
    ], {
      CURSOR_WORKSPACE_HASH: "abc123",
      CLAUDE_PROJECT_DIR: "/tmp/proj",
      HOME: process.env.HOME ?? "/home/user",
    })
    expect(record).not.toBeNull()
    const keys = Object.keys(record!.env_cursor)
    for (const k of keys) {
      expect(k.startsWith("CURSOR_") || k === "CLAUDE_PROJECT_DIR").toBe(true)
    }
    expect(record!.env_cursor["CURSOR_WORKSPACE_HASH"]).toBe("abc123")
    expect(record!.env_cursor["CLAUDE_PROJECT_DIR"]).toBe("/tmp/proj")
  })

  test("stdout is byte-equal to stdin (logger is transparent)", async () => {
    const payload = '{"hook_event_name":"preToolUse","data":"hello world"}'
    const { stdout } = await runLogger(payload, ["preToolUse", "--experiment-id", "W-TEST-007"])
    expect(stdout).toBe(payload)
  })
})
