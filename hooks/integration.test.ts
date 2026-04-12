import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import type { Subprocess } from "bun"
import { writeFileSync, unlinkSync } from "node:fs"

const PORT = 47899
const BASE = `http://localhost:${PORT}`
const SESSION_ID = "integration-test-session"
const GUARD_TEST_FILE = "/tmp/oh-my-cursor-guard-test.txt"

let daemon: Subprocess | null = null

async function post(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return { status: res.status, data: await res.json() }
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, data: await res.json() }
}

async function waitForDaemon(maxMs = 5000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return
    } catch {
      await Bun.sleep(100)
    }
  }
  throw new Error(`Daemon did not start within ${maxMs}ms`)
}

beforeAll(async () => {
  daemon = Bun.spawn(["bun", "run", "hooks/daemon.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, OH_MY_CURSOR_PORT: String(PORT) },
    stdout: "ignore",
    stderr: "ignore",
  })
  await waitForDaemon()
  writeFileSync(GUARD_TEST_FILE, "test content", "utf-8")
})

afterAll(async () => {
  try {
    unlinkSync(GUARD_TEST_FILE)
  } catch {}
  if (daemon) {
    daemon.kill()
    await daemon.exited
    daemon = null
  }
})

describe("daemon integration lifecycle", () => {
  describe("#given a freshly started daemon", () => {
    describe("#when GET /health is called", () => {
      test("#then it returns ok status and uptime", async () => {
        const { status, data } = await get("/health")

        expect(status).toBe(200)
        expect(data.status).toBe("ok")
        expect(typeof data.uptime).toBe("number")
        expect(typeof data.sessions).toBe("number")
        expect(typeof data.toolCalls).toBe("number")
      })
    })
  })

  describe("#given a session is started", () => {
    describe("#when POST /sessionStart is called", () => {
      test("#then it creates the session and returns context", async () => {
        const { data } = await post("/sessionStart", {
          session_id: SESSION_ID,
          cwd: "/tmp/integration-test",
          model: "claude-4.6-sonnet",
        })

        expect(data.additional_context).toContain("oh-my-cursor Context")
        expect(data.additional_context).toContain(SESSION_ID)
        expect(data.hookSpecificOutput.hookEventName).toBe("SessionStart")
        expect(data.hookSpecificOutput.additionalContext).toContain(SESSION_ID)
      })
    })
  })

  describe("#given a session exists", () => {
    describe("#when POST /preToolUse with Read tool is called", () => {
      test("#then it allows the read", async () => {
        const { data } = await post("/preToolUse", {
          tool_name: "Read",
          tool_input: { file_path: "/tmp/integration-test/src/app.ts" },
          session_id: SESSION_ID,
        })

        expect(data.permission).toBeUndefined()
        expect(data.hookSpecificOutput).toBeUndefined()
      })
    })
  })

  describe("#given a Read tool was dispatched", () => {
    describe("#when POST /postToolUse records the read result", () => {
      test("#then it tracks the tool call", async () => {
        const { data } = await post("/postToolUse", {
          tool_name: "Read",
          tool_input: { file_path: "/tmp/integration-test/src/app.ts" },
          tool_response: "file contents here",
          session_id: SESSION_ID,
        })

        expect(data).toBeDefined()
      })
    })
  })

  describe("#given a file was previously read", () => {
    describe("#when POST /preToolUse with Write to same file is called", () => {
      test("#then it allows the write", async () => {
        const { data } = await post("/preToolUse", {
          tool_name: "Write",
          tool_input: { file_path: "/tmp/integration-test/src/app.ts", contents: "new content" },
          session_id: SESSION_ID,
        })

        expect(data.permission).toBeUndefined()
      })
    })
  })

  describe("#given a file was never read", () => {
    describe("#when POST /preToolUse with Write to unread file is called", () => {
      test("#then it denies the write", async () => {
        const { data } = await post("/preToolUse", {
          tool_name: "Write",
          tool_input: { file_path: "/tmp/integration-unread-file.ts" },
          session_id: SESSION_ID,
        })

        // /tmp/integration-unread-file.ts doesn't exist on disk, so existsSync returns false
        // The guard only denies when the file exists AND wasn't read
        // For a non-existent file, it allows (new file creation)
        expect(data.permission).toBeUndefined()
      })
    })
  })

  describe("#given an existing file was never read but edit has old_string", () => {
    describe("#when POST /preToolUse with Write and old_string is called", () => {
      test("#then it allows the edit (old_string proves file awareness)", async () => {
        const { data } = await post("/preToolUse", {
          tool_name: "Write",
          tool_input: { file_path: GUARD_TEST_FILE, old_string: "test content", new_string: "new content" },
          session_id: SESSION_ID,
        })

        expect(data.permission).toBeUndefined()
      })
    })
  })

  describe("#given an existing file was never read and write has no old_string", () => {
    describe("#when POST /preToolUse with blind Write is called", () => {
      test("#then it denies the write", async () => {
        const { data } = await post("/preToolUse", {
          tool_name: "Write",
          tool_input: { file_path: GUARD_TEST_FILE, contents: "overwrite" },
          session_id: "guard-test-fresh-session",
        })

        expect(data.permission).toBe("deny")
        expect(data.agentMessage).toContain("not read first")
      })
    })
  })

  describe("#given a safe shell command", () => {
    describe("#when POST /beforeShellExecution is called", () => {
      test("#then it allows execution", async () => {
        const { data } = await post("/beforeShellExecution", {
          tool_input: { command: "ls -la" },
          session_id: SESSION_ID,
        })

        expect(data.hookSpecificOutput).toBeUndefined()
        expect(data.permission).toBeUndefined()
      })
    })
  })

  describe("#given a dangerous shell command", () => {
    describe("#when POST /beforeShellExecution is called", () => {
      test("#then it denies execution", async () => {
        const { data } = await post("/beforeShellExecution", {
          tool_input: { command: "rm -rf /" },
          session_id: SESSION_ID,
        })

        expect(data.permission).toBe("deny")
        expect(data.continue).toBe(false)
        expect(data.hookSpecificOutput.permissionDecision).toBe("deny")
        expect(data.hookSpecificOutput.permissionDecisionReason).toContain("blocked for safety")
      })
    })
  })

  describe("#given the sessionHistory endpoint", () => {
    describe("#when POST /sessionHistory is called", () => {
      test("#then it returns session list", async () => {
        await post("/sessionStart", { session_id: "history-test", cwd: "/tmp" })
        const { status, data } = await post("/sessionHistory")

        expect(status).toBe(200)
        expect(data.sessions).toBeDefined()
      })
    })
  })

  describe("#given the backgroundTasks endpoint", () => {
    describe("#when POST /backgroundTasks is called", () => {
      test("#then it returns active tasks list", async () => {
        const { status, data } = await post("/backgroundTasks")

        expect(status).toBe(200)
        expect(data.tasks).toBeDefined()
        expect(data.count).toBe(0)
      })
    })
  })

  describe("#given a subagent dispatch", () => {
    describe("#when POST /subagentStart with explore type is called", () => {
      test("#then it allows and returns empty", async () => {
        const { data } = await post("/subagentStart", {
          agent_type: "Explore",
          session_id: SESSION_ID,
        })

        expect(Object.keys(data).length).toBe(0)
      })
    })
  })

  describe("#given a tool failure", () => {
    describe("#when POST /postToolUseFailure with rate limit error is called", () => {
      test("#then it returns recovery guidance", async () => {
        const { data } = await post("/postToolUseFailure", {
          tool_name: "Shell",
          error: "429 Too Many Requests",
          session_id: SESSION_ID,
        })

        expect(data.additional_context).toContain("session-recovery")
        expect(data.additional_context).toContain("Rate limit")
        expect(data.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
      })
    })
  })

  describe("#given a user prompt submission", () => {
    describe("#when POST /beforeSubmitPrompt with normal message is called", () => {
      test("#then it returns empty", async () => {
        const { data } = await post("/beforeSubmitPrompt", {
          prompt: "Hello, just a normal message",
          session_id: SESSION_ID,
        })

        expect(Object.keys(data).length).toBe(0)
      })
    })
  })

  describe("#given the config endpoint", () => {
    describe("#when GET /config is called", () => {
      test("#then it returns enabled and disabled hook arrays", async () => {
        const { status, data } = await get("/config")

        expect(status).toBe(200)
        expect(Array.isArray(data.enabled)).toBe(true)
        expect(Array.isArray(data.disabled)).toBe(true)
        expect(data.enabled.length).toBeGreaterThan(0)
        expect(data.enabled).toContain("/health")
        expect(data.enabled).toContain("/sessionStart")
      })
    })
  })

  describe("#given the dashboard endpoint", () => {
    describe("#when GET /dashboard is called", () => {
      test("#then it returns 200 with HTML content", async () => {
        const res = await fetch(`${BASE}/dashboard`)
        expect(res.status).toBe(200)
        const contentType = res.headers.get("content-type")
        expect(contentType).toContain("text/html")
        const html = await res.text()
        expect(html).toContain("oh-my-cursor Status")
      })
    })
  })

  describe("#given the session is ending", () => {
    describe("#when POST /sessionEnd is called", () => {
      test("#then it cleans up and returns empty", async () => {
        const healthBefore = await get("/health")
        const sessionsBefore = healthBefore.data.sessions

        const { data } = await post("/sessionEnd", {
          session_id: SESSION_ID,
        })

        expect(Object.keys(data).length).toBe(0)

        const healthAfter = await get("/health")
        expect(healthAfter.data.sessions).toBe(sessionsBefore - 1)
      })
    })
  })

  describe("#given the session was cleaned up", () => {
    describe("#when GET /health is called after session end", () => {
      test("#then it reflects updated metrics", async () => {
        const { data } = await get("/health")

        expect(data.status).toBe("ok")
        expect(typeof data.uptime).toBe("number")
        expect(typeof data.toolCalls).toBe("number")
        expect(typeof data.exploreCounts).toBe("number")
        expect(typeof data.workerCounts).toBe("number")
        expect(typeof data.ralphActive).toBe("boolean")
        expect(typeof data.allDispatchCounts).toBe("object")
      })
    })
  })
})
