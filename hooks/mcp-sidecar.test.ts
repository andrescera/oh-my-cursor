import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test"

const PORT = 47850
const BASE = `http://localhost:${PORT}`

function jsonrpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }).then((r) => r.json())
}

beforeAll(async () => {
  process.env.OH_MY_CURSOR_MCP_PORT = String(PORT)
  await import("./mcp-sidecar.ts")
  await Bun.sleep(500)
})

afterAll(() => {
  process.exit(0)
})

describe("mcp-sidecar", () => {
  describe("#given /health endpoint", () => {
    describe("#when GET /health", () => {
      test("#then returns ok status and tool names", async () => {
        const res = await fetch(`${BASE}/health`)
        const data = await res.json()

        expect(data.status).toBe("ok")
        expect(Array.isArray(data.tools)).toBe(true)
        expect(data.tools.length).toBeGreaterThan(0)
        expect(data.tools).toContain("look_at")
        expect(data.tools).toContain("interactive_bash")
        expect(data.tools).toContain("skill_mcp")
        expect(data.tools).toContain("get_dispatch_stats")
        expect(data.tools).toContain("session_transcripts")
        expect(data.tools).toContain("daemon_logs")
        expect(data.tools).toContain("session_log")
        expect(data.tools).toContain("oh_my_cursor_status")
      })
    })
  })

  describe("#given unknown route", () => {
    describe("#when GET /nonexistent", () => {
      test("#then returns 404", async () => {
        const res = await fetch(`${BASE}/nonexistent`)
        expect(res.status).toBe(404)
      })
    })
  })

  describe("#given JSON-RPC initialize", () => {
    describe("#when sending initialize request", () => {
      test("#then returns protocol version and server info", async () => {
        const result = await jsonrpc("initialize")

        expect(result.jsonrpc).toBe("2.0")
        expect(result.id).toBe(1)
        expect(result.result.protocolVersion).toBe("2024-11-05")
        expect(result.result.capabilities).toBeDefined()
        expect(result.result.capabilities.tools).toBeDefined()
        expect(result.result.capabilities.resources).toBeDefined()
        expect(result.result.serverInfo.name).toBe("oh-my-cursor")
        expect(result.result.serverInfo.version).toBe("0.1.0")
      })
    })
  })

  describe("#given JSON-RPC tools/list", () => {
    describe("#when requesting tool list", () => {
      test("#then returns all registered tools", async () => {
        const result = await jsonrpc("tools/list")

        expect(result.jsonrpc).toBe("2.0")
        expect(result.result.tools).toBeArray()
        expect(result.result.tools.length).toBeGreaterThanOrEqual(8)
      })

      test("#then each tool has name, description, and inputSchema", async () => {
        const result = await jsonrpc("tools/list")

        for (const tool of result.result.tools) {
          expect(typeof tool.name).toBe("string")
          expect(tool.name.length).toBeGreaterThan(0)
          expect(typeof tool.description).toBe("string")
          expect(tool.description.length).toBeGreaterThan(0)
          expect(tool.inputSchema).toBeDefined()
          expect(tool.inputSchema.type).toBe("object")
          expect(tool.inputSchema.properties).toBeDefined()
        }
      })

      test("#then includes the oh_my_cursor_status tool with _meta", async () => {
        const result = await jsonrpc("tools/list")
        const statusTool = result.result.tools.find(
          (t: { name: string }) => t.name === "oh_my_cursor_status",
        )

        expect(statusTool).toBeDefined()
        expect(statusTool._meta).toBeDefined()
        expect(statusTool._meta.ui.resourceUri).toBe("ui://oh-my-cursor/dashboard")
      })

      test("#then look_at tool requires 'goal' parameter", async () => {
        const result = await jsonrpc("tools/list")
        const lookAt = result.result.tools.find(
          (t: { name: string }) => t.name === "look_at",
        )

        expect(lookAt).toBeDefined()
        expect(lookAt.inputSchema.required).toContain("goal")
      })

      test("#then interactive_bash tool requires 'command' parameter", async () => {
        const result = await jsonrpc("tools/list")
        const bash = result.result.tools.find(
          (t: { name: string }) => t.name === "interactive_bash",
        )

        expect(bash).toBeDefined()
        expect(bash.inputSchema.required).toContain("command")
      })
    })
  })

  describe("#given JSON-RPC resources/list", () => {
    describe("#when requesting resource list", () => {
      test("#then returns the status dashboard resource", async () => {
        const result = await jsonrpc("resources/list")

        expect(result.jsonrpc).toBe("2.0")
        const resources = result.result
        expect(Array.isArray(resources)).toBe(true)
        expect(resources.length).toBeGreaterThanOrEqual(1)

        const statusResource = resources.find(
          (r: { uri: string }) => r.uri === "ui://oh-my-cursor/dashboard",
        )
        expect(statusResource).toBeDefined()
        expect(statusResource.mimeType).toBe("text/html")
      })
    })
  })

  describe("#given JSON-RPC resources/read", () => {
    describe("#when reading the status resource", () => {
      test("#then returns HTML content", async () => {
        const result = await jsonrpc("resources/read", {
          uri: "ui://oh-my-cursor/dashboard",
        })

        expect(result.jsonrpc).toBe("2.0")
        expect(result.result.contents).toBeArray()
        expect(result.result.contents[0].uri).toBe("ui://oh-my-cursor/dashboard")
        expect(result.result.contents[0].mimeType).toBe("text/html")
        expect(result.result.contents[0].text).toContain("<!DOCTYPE html>")
      })
    })
  })

  describe("#given JSON-RPC tools/call", () => {
    describe("#when calling oh_my_cursor_status", () => {
      test("#then returns dashboard content with _meta", async () => {
        const result = await jsonrpc("tools/call", {
          name: "oh_my_cursor_status",
          arguments: {},
        })

        expect(result.jsonrpc).toBe("2.0")
        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        expect(result.result.content[0].text).toContain("dashboard")
        expect(result.result._meta.ui.resourceUri).toBe("ui://oh-my-cursor/dashboard")
      })
    })

    describe("#when calling look_at without file_path", () => {
      test("#then returns guidance message", async () => {
        const result = await jsonrpc("tools/call", {
          name: "look_at",
          arguments: { goal: "test" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        expect(result.result.content[0].text).toContain("No file_path provided")
      })
    })

    describe("#when calling look_at with nonexistent image file", () => {
      test("#then returns file not found", async () => {
        const result = await jsonrpc("tools/call", {
          name: "look_at",
          arguments: { file_path: "/tmp/nonexistent-test-image.png", goal: "analyze" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        expect(result.result.content[0].text).toContain("not found")
      })
    })

    describe("#when calling look_at with non-image file", () => {
      test("#then returns guidance to use Read tool", async () => {
        const result = await jsonrpc("tools/call", {
          name: "look_at",
          arguments: { file_path: "/tmp/some-file.txt", goal: "read" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].text).toContain("Read tool")
      })
    })

    describe("#when calling look_at with PDF file", () => {
      test("#then returns PDF guidance", async () => {
        const result = await jsonrpc("tools/call", {
          name: "look_at",
          arguments: { file_path: "/tmp/document.pdf", goal: "extract text" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].text).toContain("PDF")
      })
    })

    describe("#when calling skill_mcp with empty skill_name", () => {
      test("#then returns available skills list", async () => {
        const result = await jsonrpc("tools/call", {
          name: "skill_mcp",
          arguments: { skill_name: "" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        expect(result.result.content[0].text).toContain("Available skills")
      })
    })

    describe("#when calling skill_mcp with status action", () => {
      test("#then returns status for the skill", async () => {
        const result = await jsonrpc("tools/call", {
          name: "skill_mcp",
          arguments: { action: "status", skill_name: "dev-browser" },
        })

        expect(result.result.content[0].text).toContain("dev-browser")
      })
    })

    describe("#when calling skill_mcp with nonexistent skill", () => {
      test("#then returns not found with available skills", async () => {
        const result = await jsonrpc("tools/call", {
          name: "skill_mcp",
          arguments: { skill_name: "nonexistent-skill" },
        })

        expect(result.result.content[0].text).toContain("not found")
        expect(result.result.content[0].text).toContain("Available skills")
      })
    })

    describe("#when calling interactive_bash", () => {
      test("#then returns tmux output or error", async () => {
        const result = await jsonrpc("tools/call", {
          name: "interactive_bash",
          arguments: { command: "echo test-from-mcp-sidecar" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        // Either succeeds with session output or fails with tmux error
        const text = result.result.content[0].text
        expect(
          text.includes("Session:") || text.includes("tmux error"),
        ).toBe(true)
      })
    })

    describe("#when calling get_dispatch_stats", () => {
      test("#then returns daemon health or error", async () => {
        const result = await jsonrpc("tools/call", {
          name: "get_dispatch_stats",
          arguments: {},
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
      })
    })

    describe("#when calling daemon_logs", () => {
      test("#then returns log content or not-found message", async () => {
        const result = await jsonrpc("tools/call", {
          name: "daemon_logs",
          arguments: { lines: 10 },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
      })
    })

    describe("#when calling session_log with unknown action", () => {
      test("#then returns unknown action message", async () => {
        const result = await jsonrpc("tools/call", {
          name: "session_log",
          arguments: { action: "bogus" },
        })

        expect(result.result.content[0].text).toContain("Unknown session_log action")
      })
    })

    describe("#when calling session_log with export action", () => {
      test("#then returns log file path or daemon offline message", async () => {
        const result = await jsonrpc("tools/call", {
          name: "session_log",
          arguments: { action: "export" },
        })

        expect(result.result.content).toBeArray()
        expect(result.result.content[0].type).toBe("text")
        const text = result.result.content[0].text
        expect(
          text.includes("Session log file") || text.includes("Daemon offline"),
        ).toBe(true)
      })
    })

    describe("#when calling an unknown tool", () => {
      test("#then returns unknown tool error", async () => {
        const result = await jsonrpc("tools/call", {
          name: "nonexistent_tool",
          arguments: {},
        })

        expect(result.result.content[0].text).toContain("Unknown tool")
      })
    })
  })

  describe("#given unknown JSON-RPC method", () => {
    describe("#when sending unrecognized method", () => {
      test("#then returns method not found error", async () => {
        const result = await jsonrpc("unknown/method")

        expect(result.jsonrpc).toBe("2.0")
        expect(result.error).toBeDefined()
        expect(result.error.code).toBe(-32601)
        expect(result.error.message).toBe("Method not found")
      })
    })
  })

  describe("#given JSON-RPC preserves request id", () => {
    describe("#when sending request with custom id", () => {
      test("#then response echoes the same id", async () => {
        const result = await jsonrpc("initialize", {}, 42)

        expect(result.id).toBe(42)
      })
    })
  })
})
