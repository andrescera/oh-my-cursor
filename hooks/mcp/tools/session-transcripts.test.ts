import { describe, expect, test } from "bun:test"

import { createTranscriptSearch } from "./session-transcripts"
import type {
  SpawnWithTimeoutOptions,
  SpawnWithTimeoutResult,
} from "../../lib/spawn-with-timeout"

interface SpawnCall {
  args: string[]
  options: SpawnWithTimeoutOptions
}

function fakeSpawnReturning(
  result: SpawnWithTimeoutResult,
): { calls: SpawnCall[]; spawn: (args: string[], opts: SpawnWithTimeoutOptions) => Promise<SpawnWithTimeoutResult> } {
  const calls: SpawnCall[] = []
  return {
    calls,
    spawn: async (args, options) => {
      calls.push({ args, options })
      return result
    },
  }
}

describe("session-transcripts", () => {
  test("returns partial results with timedOut flag when rg exceeds 800ms", async () => {
    const { spawn } = fakeSpawnReturning({
      exitCode: 1,
      stdout: "file:1:match",
      stderr: "",
      timedOut: true,
      durationMs: 850,
    })
    const handle = createTranscriptSearch(spawn, () => ["/tmp/fake-transcripts"])
    const result = await handle({ action: "search", query: "test" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("(results may be truncated — search timed out)")
  })

  test("output beyond cap is truncated", async () => {
    const { spawn } = fakeSpawnReturning({
      exitCode: 0,
      stdout: "x".repeat(600_000),
      stderr: "",
      timedOut: true,
      durationMs: 100,
    })
    const handle = createTranscriptSearch(spawn, () => ["/tmp/fake-transcripts"])
    const result = await handle({ action: "search", query: "test" })
    const text = result.content[0]?.text ?? ""
    expect(text.length).toBeLessThan(600_000)
    expect(text).toContain("output truncated")
  })

  test("empty transcript dir returns immediately without calling spawn", async () => {
    const { spawn, calls } = fakeSpawnReturning({
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      durationMs: 1,
    })
    const handle = createTranscriptSearch(spawn, () => [])
    const result = await handle({ action: "list" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("No agent-transcripts directories found")
    expect(calls.length).toBe(0)
  })

  test("list action calls ls with correct args and timeout", async () => {
    const { spawn, calls } = fakeSpawnReturning({
      exitCode: 0,
      stdout: "total 0\n-rw-r--r-- 1 u u 0 Jan 1 00:00 a.jsonl",
      stderr: "",
      timedOut: false,
      durationMs: 5,
    })
    const dir = "/tmp/fake-transcripts"
    const handle = createTranscriptSearch(spawn, () => [dir])
    await handle({ action: "list" })
    expect(calls.length).toBe(1)
    expect(calls[0].args).toEqual(["ls", "-lt", dir])
    expect(calls[0].options.timeoutMs).toBe(500)
    expect(calls[0].options.maxOutputBytes).toBe(256 * 1024)
  })
})
