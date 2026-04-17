import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { EvidenceRecord } from "./types"

const SOURCE_DIR = "/tmp/cursor-hooks-evidence-consolidate-test"
const OUT_DIR = "/tmp/cursor-hooks-evidence-consolidate-out"
const OUT_FILE = join(OUT_DIR, "hooks-evidence-v2.jsonl")
const SCRIPT = join(import.meta.dir, "consolidate.ts")

function makeRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    experiment_id: "W-TEST",
    event: "test",
    hook_event_name: "",
    conversation_id: "",
    session_id: "",
    pid: 1234,
    ppid: 1,
    cwd: "/tmp",
    env_cursor: { CURSOR_FOO: "bar" },
    stdin_hash: "abc123",
    stdin_content_path: "/tmp/cursor-hooks-evidence/content-abc123.json",
    stdin_preview: "hello",
    stdout: "",
    stderr: "",
    exit_code: 0,
    started_at: "2024-01-01T00:00:00.000Z",
    finished_at: "2024-01-01T00:00:01.000Z",
    duration_ms: 1000,
    schema_version: "v2",
    ...overrides,
  }
}

async function runConsolidator(extraArgs: string[] = []): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(
    [
      "bun",
      SCRIPT,
      "--source",
      SOURCE_DIR,
      "--out",
      OUT_FILE,
      ...extraArgs,
    ],
    { stdout: "pipe", stderr: "pipe" }
  )
  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  return { exitCode: proc.exitCode ?? 0, stderr }
}

describe("consolidate", () => {
  beforeEach(() => {
    if (existsSync(SOURCE_DIR)) rmSync(SOURCE_DIR, { recursive: true })
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true })
    mkdirSync(SOURCE_DIR, { recursive: true })
    mkdirSync(OUT_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(SOURCE_DIR)) rmSync(SOURCE_DIR, { recursive: true })
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true })
  })

  test("merges 3 fixture files in chronological order (by started_at)", async () => {
    const r1 = makeRecord({ started_at: "2024-01-01T00:00:01.000Z", event: "first" })
    const r2 = makeRecord({ started_at: "2024-01-01T00:00:03.000Z", event: "third" })
    const r3 = makeRecord({ started_at: "2024-01-01T00:00:02.000Z", event: "second" })

    writeFileSync(join(SOURCE_DIR, "aaaaaaaa-0001-0000-0000-000000000001.json"), JSON.stringify(r1))
    writeFileSync(join(SOURCE_DIR, "aaaaaaaa-0003-0000-0000-000000000003.json"), JSON.stringify(r2))
    writeFileSync(join(SOURCE_DIR, "aaaaaaaa-0002-0000-0000-000000000002.json"), JSON.stringify(r3))

    const { exitCode } = await runConsolidator()
    expect(exitCode).toBe(0)
    expect(existsSync(OUT_FILE)).toBe(true)

    const lines = readFileSync(OUT_FILE, "utf8").trim().split("\n")
    expect(lines.length).toBe(3)
    const events = lines.map((l) => (JSON.parse(l) as EvidenceRecord).event)
    expect(events).toEqual(["first", "second", "third"])
  })

  test("applies redaction to stdin_preview in output", async () => {
    const r = makeRecord({ stdin_preview: "email: user@example.com payload" })
    writeFileSync(join(SOURCE_DIR, "aaaaaaaa-0001-0000-0000-000000000001.json"), JSON.stringify(r))

    await runConsolidator()
    const lines = readFileSync(OUT_FILE, "utf8").trim().split("\n")
    const out = JSON.parse(lines[0]) as EvidenceRecord
    expect(out.stdin_preview).not.toContain("user@example.com")
    expect(out.stdin_preview).toContain("<email>")
  })

  test("skips _header.json, _watchdog-drill.json, _preflight.json, content-*.json", async () => {
    const r = makeRecord({ event: "real" })
    writeFileSync(join(SOURCE_DIR, "aaaaaaaa-0001-0000-0000-000000000001.json"), JSON.stringify(r))
    writeFileSync(join(SOURCE_DIR, "_header.json"), JSON.stringify({ version: "v2" }))
    writeFileSync(join(SOURCE_DIR, "_watchdog-drill.json"), JSON.stringify({ drill: true }))
    writeFileSync(join(SOURCE_DIR, "_preflight.json"), JSON.stringify({ preflight: true }))
    writeFileSync(join(SOURCE_DIR, "content-abc123.json"), '{"raw":"data"}')

    await runConsolidator()
    const lines = readFileSync(OUT_FILE, "utf8").trim().split("\n")
    expect(lines.length).toBe(1)
    expect((JSON.parse(lines[0]) as EvidenceRecord).event).toBe("real")
  })

  test("produces valid JSONL (each line parses with JSON.parse)", async () => {
    for (let i = 1; i <= 5; i++) {
      const r = makeRecord({
        started_at: `2024-01-01T00:00:0${i}.000Z`,
        event: `event-${i}`,
      })
      writeFileSync(
        join(SOURCE_DIR, `aaaaaaaa-000${i}-0000-0000-00000000000${i}.json`),
        JSON.stringify(r)
      )
    }

    await runConsolidator()
    const content = readFileSync(OUT_FILE, "utf8").trim()
    const lines = content.split("\n")
    expect(lines.length).toBe(5)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })
})
