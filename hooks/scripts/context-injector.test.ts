import { describe, test, expect, afterEach } from "bun:test"
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { writeContextRule, clearContextRule } from "./context-injector"

let tmpDir: string

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true })
  }
})

function makeTmpDir(): string {
  tmpDir = mkdtempSync(join(tmpdir(), "ctx-injector-test-"))
  return tmpDir
}

const CONTEXT_FILE = ".cursor/rules/oh-my-cursor-context.mdc"

describe("context-injector", () => {
  describe("#given writeContextRule", () => {
    describe("#when writing to a directory that does not exist yet", () => {
      test("#then creates the .cursor/rules directory and context file", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-test-1",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const filePath = join(dir, CONTEXT_FILE)
        expect(existsSync(filePath)).toBe(true)
        expect(existsSync(join(dir, ".cursor", "rules"))).toBe(true)
      })
    })

    describe("#when writing with valid state", () => {
      test("#then writes valid MDC frontmatter", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-frontmatter",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T12:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toStartWith("---\n")
        expect(content).toContain('description: "oh-my-cursor dynamic context')
        expect(content).toContain("alwaysApply: true")
        expect(content).toContain("---\n\n#")
      })

      test("#then includes session ID in content", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-abc-123",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T12:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain("Session: sess-abc-123")
      })

      test("#then includes last updated timestamp", async () => {
        const dir = makeTmpDir()
        const ts = "2026-04-06T15:30:00.000Z"

        await writeContextRule(dir, {
          sessionId: "sess-ts",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: ts,
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain(`Last updated: ${ts}`)
      })
    })

    describe("#when active agents are present", () => {
      test("#then lists agents in the content", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-agents",
          projectDir: dir,
          activeAgents: ["explore-1", "worker-2"],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain("Active agents: explore-1, worker-2")
      })
    })

    describe("#when no active agents", () => {
      test("#then shows 'No active agents' message", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-no-agents",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain("No active agents")
      })
    })

    describe("#when recent tools are provided", () => {
      test("#then includes recent tool activity", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-tools",
          projectDir: dir,
          activeAgents: [],
          recentTools: ["Read", "Write", "Shell"],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain("Recent tool activity: Read, Write, Shell")
      })
    })

    describe("#when writing includes orchestration reminders", () => {
      test("#then contains standard reminder lines", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-reminders",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const content = readFileSync(join(dir, CONTEXT_FILE), "utf-8")
        expect(content).toContain("## Orchestration Reminders")
        expect(content).toContain("Follow the orchestrator rule for all delegation")
        expect(content).toContain("6-section task brief format")
        expect(content).toContain("Executors self-verify before reporting done")
      })
    })
  })

  describe("#given clearContextRule", () => {
    describe("#when file exists", () => {
      test("#then removes the context file", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-clear",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const filePath = join(dir, CONTEXT_FILE)
        expect(existsSync(filePath)).toBe(true)

        await clearContextRule(dir)
        expect(existsSync(filePath)).toBe(false)
      })
    })

    describe("#when file does not exist", () => {
      test("#then does not throw", async () => {
        const dir = makeTmpDir()

        await expect(clearContextRule(dir)).resolves.toBeUndefined()
      })
    })

    describe("#when clearing after write", () => {
      test("#then context file no longer exists", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-clear-read",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        await clearContextRule(dir)
        expect(existsSync(join(dir, CONTEXT_FILE))).toBe(false)
      })
    })
  })
})
