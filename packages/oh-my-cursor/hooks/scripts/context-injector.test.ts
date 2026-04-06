import { describe, test, expect, afterEach } from "bun:test"
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { writeContextRule, readContextState, clearContextRule, matchSkills } from "./context-injector"

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

  describe("#given readContextState", () => {
    describe("#when file exists with valid content", () => {
      test("#then returns ContextState with correct session ID", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-read-test",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        const state = await readContextState(dir)
        expect(state).not.toBeNull()
        expect(state!.sessionId).toBe("sess-read-test")
        expect(state!.projectDir).toBe(dir)
      })

      test("#then returns fresh lastUpdated timestamp", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-ts-read",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-01-01T00:00:00.000Z",
        })

        const state = await readContextState(dir)
        expect(state).not.toBeNull()
        const parsed = Date.parse(state!.lastUpdated)
        expect(Number.isNaN(parsed)).toBe(false)
      })
    })

    describe("#when file does not exist", () => {
      test("#then returns null", async () => {
        const dir = makeTmpDir()

        const state = await readContextState(dir)
        expect(state).toBeNull()
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

    describe("#when clearing then reading", () => {
      test("#then readContextState returns null", async () => {
        const dir = makeTmpDir()

        await writeContextRule(dir, {
          sessionId: "sess-clear-read",
          projectDir: dir,
          activeAgents: [],
          recentTools: [],
          lastUpdated: "2026-04-06T00:00:00.000Z",
        })

        await clearContextRule(dir)
        const state = await readContextState(dir)
        expect(state).toBeNull()
      })
    })
  })

  describe("#given matchSkills", () => {
    describe("#when context contains git keywords", () => {
      test("#then returns git-master", () => {
        expect(matchSkills("I need to commit my changes")).toEqual(["git-master"])
        expect(matchSkills("rebase the branch onto main")).toEqual(["git-master"])
        expect(matchSkills("cherry-pick that fix")).toEqual(["git-master"])
        expect(matchSkills("stash my work")).toEqual(["git-master"])
      })
    })

    describe("#when context contains browser keywords", () => {
      test("#then returns dev-browser", () => {
        expect(matchSkills("open the browser and navigate")).toEqual(["dev-browser"])
        expect(matchSkills("scrape the webpage for data")).toContain("dev-browser")
        expect(matchSkills("take a screenshot of the page")).toEqual(["dev-browser"])
      })
    })

    describe("#when context contains multiple keyword matches", () => {
      test("#then returns multiple skills", () => {
        const result = matchSkills("commit the frontend component changes")
        expect(result).toContain("git-master")
        expect(result).toContain("frontend-ui-ux")
        expect(result.length).toBe(2)
      })

      test("#then returns deduplicated results", () => {
        const result = matchSkills("git commit and rebase and merge")
        expect(result).toEqual(["git-master"])
      })
    })

    describe("#when context has no matching keywords", () => {
      test("#then returns empty array", () => {
        expect(matchSkills("hello world")).toEqual([])
        expect(matchSkills("")).toEqual([])
        expect(matchSkills("calculate the sum of two numbers")).toEqual([])
      })
    })

    describe("#when context has mixed case keywords", () => {
      test("#then matches case-insensitively", () => {
        expect(matchSkills("GIT commit")).toEqual(["git-master"])
        expect(matchSkills("BROWSER automation")).toEqual(["dev-browser"])
        expect(matchSkills("Review the code for Quality")).toEqual(["review-work"])
        expect(matchSkills("Frontend UI Design")).toEqual(["frontend-ui-ux"])
        expect(matchSkills("run Playwright E2E tests")).toContain("playwright")
      })
    })

    describe("#when context matches review keywords", () => {
      test("#then returns review-work", () => {
        expect(matchSkills("review the pull request")).toEqual(["review-work"])
        expect(matchSkills("run an audit on the codebase")).toEqual(["review-work"])
      })
    })

    describe("#when context matches ai-slop keywords", () => {
      test("#then returns ai-slop-remover", () => {
        expect(matchSkills("remove AI slop from the file")).toEqual(["ai-slop-remover"])
        expect(matchSkills("clean comments in the module")).toEqual(["ai-slop-remover"])
      })
    })

    describe("#when context matches create-rule keywords", () => {
      test("#then returns create-rule", () => {
        expect(matchSkills("create a new cursor rule")).toContain("create-rule")
        expect(matchSkills("edit .cursor/rules file")).toEqual(["create-rule"])
      })
    })
  })
})
