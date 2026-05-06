import { describe, expect, test } from "bun:test"

import { createInteractiveBash } from "./interactive-bash"
import type {
  SpawnWithTimeoutOptions,
  SpawnWithTimeoutResult,
} from "../../lib/spawn-with-timeout"

interface SpawnCall {
  args: string[]
  options: SpawnWithTimeoutOptions
}

function recordingSpawn(
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

describe("interactive-bash", () => {
  test("returns tmuxUnavailable when has-session spawn throws ENOENT", async () => {
    const spawn = async (): Promise<SpawnWithTimeoutResult> => {
      throw new Error("ENOENT: no such file")
    }
    const handle = createInteractiveBash(spawn)
    const result = await handle({ command: "echo hi" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("tmuxUnavailable")
  })

  test("all four tmux operations honor their per-call timeout", async () => {
    const { spawn, calls } = recordingSpawn({
      exitCode: 0,
      stdout: "output",
      stderr: "",
      timedOut: false,
      durationMs: 10,
    })
    const handle = createInteractiveBash(spawn)
    await handle({ command: "echo hi" })
    const hasSession = calls.find((c) => c.args[1] === "has-session")
    const newSession = calls.find((c) => c.args[1] === "new-session")
    const sendKeys = calls.find((c) => c.args[1] === "send-keys")
    const capture = calls.find((c) => c.args[1] === "capture-pane")
    expect(hasSession?.options.timeoutMs).toBe(200)
    if (newSession) {
      expect(newSession.options.timeoutMs).toBe(500)
    }
    expect(sendKeys?.options.timeoutMs).toBe(200)
    expect(capture?.options.timeoutMs).toBe(500)
    expect(capture?.options.maxOutputBytes).toBe(256 * 1024)
  })

  test("returns tmuxTimeout when has-session times out", async () => {
    const spawn = async (): Promise<SpawnWithTimeoutResult> => ({
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: true,
      durationMs: 210,
    })
    const handle = createInteractiveBash(spawn)
    const result = await handle({ command: "echo hi" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("tmuxTimeout")
  })
})
