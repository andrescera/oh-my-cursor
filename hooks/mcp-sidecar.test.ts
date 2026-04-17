import { describe, test, expect, beforeAll } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { buildServer } from "./mcp/server"

const PORT = 47850
const BASE = `http://localhost:${PORT}`

async function harness() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  const server = buildServer()
  const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} })
  await Promise.all([server.connect(serverT), client.connect(clientT)])
  return { client, server }
}

beforeAll(async () => {
  process.env.OH_MY_CURSOR_MCP_PORT = String(PORT)
  await import("./mcp-sidecar.ts")
  await Bun.sleep(500)
})

describe("mcp-sidecar via SDK Client", () => {
  describe("tools/list", () => {
    test("returns all 8 tools", async () => {
      const { client } = await harness()
      const result = await client.listTools()
      expect(Array.isArray(result.tools)).toBe(true)
      const names = result.tools.map((t) => t.name).sort()
      expect(names).toEqual([
        "daemon_logs",
        "get_dispatch_stats",
        "interactive_bash",
        "look_at",
        "oh_my_cursor_status",
        "session_log",
        "session_transcripts",
        "skill_mcp",
      ])
    })

    test("oh_my_cursor_status has outputSchema with daemon_healthy", async () => {
      const { client } = await harness()
      const result = await client.listTools()
      const status = result.tools.find((t) => t.name === "oh_my_cursor_status")
      expect(status).toBeDefined()
      expect(status!.outputSchema).toBeDefined()
      const props = (status!.outputSchema as any).properties
      expect(props.daemon_healthy).toBeDefined()
    })

    test("look_at requires 'goal' parameter", async () => {
      const { client } = await harness()
      const result = await client.listTools()
      const lookAt = result.tools.find((t) => t.name === "look_at")
      expect(lookAt).toBeDefined()
      expect(lookAt!.inputSchema.required).toContain("goal")
    })

    test("interactive_bash requires 'command' parameter", async () => {
      const { client } = await harness()
      const result = await client.listTools()
      const bash = result.tools.find((t) => t.name === "interactive_bash")
      expect(bash).toBeDefined()
      expect(bash!.inputSchema.required).toContain("command")
    })

    test("result root has only spec-allowed keys", async () => {
      const { client } = await harness()
      const result = await client.listTools()
      const keys = Object.keys(result).sort()
      const allowed = new Set(["tools", "nextCursor", "_meta"])
      for (const k of keys) expect(allowed.has(k)).toBe(true)
    })
  })

  describe("resources/list", () => {
    test("returns dashboard resource without stray text field", async () => {
      const { client } = await harness()
      const result = await client.listResources()
      expect(Array.isArray(result.resources)).toBe(true)
      const dash = result.resources.find((r) => r.uri === "ui://oh-my-cursor/dashboard")
      expect(dash).toBeDefined()
      expect("text" in dash!).toBe(false)
      expect(dash!.mimeType).toBe("text/html")
    })

    test("result root has only spec-allowed keys", async () => {
      const { client } = await harness()
      const result = await client.listResources()
      const keys = Object.keys(result).sort()
      const allowed = new Set(["resources", "nextCursor", "_meta"])
      for (const k of keys) expect(allowed.has(k)).toBe(true)
    })
  })

  describe("resources/read", () => {
    test("returns HTML contents for the dashboard URI", async () => {
      const { client } = await harness()
      const result = await client.readResource({ uri: "ui://oh-my-cursor/dashboard" })
      expect(Array.isArray(result.contents)).toBe(true)
      const c = result.contents[0] as any
      expect(c.uri).toBe("ui://oh-my-cursor/dashboard")
      expect(c.mimeType).toBe("text/html")
      expect(typeof c.text).toBe("string")
      expect(c.text).toContain("<!DOCTYPE html>")
    })
  })

  describe("tools/call oh_my_cursor_status", () => {
    test("returns content + structuredContent.daemon_healthy (not at root)", async () => {
      const { client } = await harness()
      const result = await client.callTool({ name: "oh_my_cursor_status", arguments: {} })
      expect(Array.isArray(result.content)).toBe(true)
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].type).toBe("text")
      expect(content[0].text).toContain("dashboard")
      const sc = result.structuredContent as { daemon_healthy: boolean } | undefined
      expect(sc).toBeDefined()
      expect(typeof sc!.daemon_healthy).toBe("boolean")
      expect("daemon_healthy" in result).toBe(false)
      const meta = (result as any)._meta
      expect(meta?.ui?.resourceUri).toBe("ui://oh-my-cursor/dashboard")
    })
  })

  describe("tools/call look_at", () => {
    test("without file_path returns guidance message", async () => {
      const { client } = await harness()
      const result = await client.callTool({ name: "look_at", arguments: { goal: "test" } })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("No file_path provided")
    })

    test("with nonexistent image returns file not found", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "look_at",
        arguments: { file_path: "/tmp/nonexistent-test-image.png", goal: "analyze" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("not found")
    })

    test("with non-image file returns guidance to use Read tool", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "look_at",
        arguments: { file_path: "/tmp/some-file.txt", goal: "read" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("Read tool")
    })

    test("with PDF file returns PDF guidance", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "look_at",
        arguments: { file_path: "/tmp/document.pdf", goal: "extract text" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("PDF")
    })
  })

  describe("tools/call skill_mcp", () => {
    test("with empty skill_name returns available skills list", async () => {
      const { client } = await harness()
      const result = await client.callTool({ name: "skill_mcp", arguments: { skill_name: "" } })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("Available skills")
    })

    test("with nonexistent skill returns not found", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "skill_mcp",
        arguments: { skill_name: "nonexistent-skill" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("not found")
    })

    test("with status action returns skill status", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "skill_mcp",
        arguments: { action: "status", skill_name: "dev-browser" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("dev-browser")
    })
  })

  describe("tools/call interactive_bash", () => {
    test("returns tmux output or error", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "interactive_bash",
        arguments: { command: "echo test-from-mcp-sidecar" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(
        content[0].text.includes("Session:") || content[0].text.includes("tmux error"),
      ).toBe(true)
    })
  })

  describe("tools/call get_dispatch_stats", () => {
    test("returns daemon health or error text", async () => {
      const { client } = await harness()
      const result = await client.callTool({ name: "get_dispatch_stats", arguments: {} })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].type).toBe("text")
      expect(typeof content[0].text).toBe("string")
    })
  })

  describe("tools/call daemon_logs", () => {
    test("returns log content or not-found", async () => {
      const { client } = await harness()
      const result = await client.callTool({ name: "daemon_logs", arguments: { lines: 10 } })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].type).toBe("text")
    })
  })

  describe("tools/call session_log", () => {
    test("with export action returns log file path or daemon offline", async () => {
      const { client } = await harness()
      const result = await client.callTool({
        name: "session_log",
        arguments: { action: "export" },
      })
      const content = result.content as Array<{ type: string; text: string }>
      expect(
        content[0].text.includes("Session log file") ||
          content[0].text.includes("Daemon offline") ||
          content[0].text.includes("not reachable"),
      ).toBe(true)
    })

    test("with invalid action value is rejected by input validation", async () => {
      const { client } = await harness()
      // The SDK validates enum values via Zod before the handler runs;
      // "bogus" is not in the allowed set, so the MCP layer returns -32602 wrapped in content.
      const result = await client.callTool({ name: "session_log", arguments: { action: "bogus" } })
      const content = result.content as Array<{ type: string; text: string }>
      expect(content[0].text).toContain("Input validation error")
    })
  })
})

describe("envelope validation", () => {
  test("malformed CallToolResult is rejected by wrapToolHandler", async () => {
    const { wrapToolHandler } = await import("./mcp/validate")
    const bad = wrapToolHandler("test_tool", async () => ({ content: "not_an_array" }))
    let threw = false
    try {
      await bad({})
    } catch (e) {
      threw = true
      expect(String(e)).toMatch(/invalid CallToolResult shape|content/i)
    }
    expect(threw).toBe(true)
  })

  test("valid CallToolResult passes through wrapToolHandler unchanged", async () => {
    const { wrapToolHandler } = await import("./mcp/validate")
    const good = wrapToolHandler("test_tool", async () => ({
      content: [{ type: "text", text: "ok" }],
    }))
    const result = await good({})
    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] })
  })
})

describe("mcp-sidecar HTTP layer", () => {
  describe("/health", () => {
    test("returns ok status and tool names", async () => {
      const res = await fetch(`${BASE}/health`)
      const data: any = await res.json()
      expect(data.status).toBe("ok")
      expect(Array.isArray(data.tools)).toBe(true)
      expect(data.tools).toContain("oh_my_cursor_status")
      expect(data.tools).toContain("look_at")
      expect(data.tools).toContain("interactive_bash")
      expect(data.tools).toContain("skill_mcp")
      expect(typeof data.daemonHealthy).toBe("boolean")
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`)
      expect(res.status).toBe(404)
    })
  })

  describe("notifications/initialized", () => {
    test("after initialize handshake, server returns 202 with empty body", async () => {
      const initBody = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      })
      const initRes = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: initBody,
      })
      const sessionId = initRes.headers.get("mcp-session-id")
      expect(sessionId).toBeTruthy()

      const notifBody = JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      })
      const notifRes = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId!,
        },
        body: notifBody,
      })
      expect(notifRes.status).toBe(202)
      expect(await notifRes.text()).toBe("")
    })
  })

  describe("stateful session", () => {
    test("session id issued on initialize is reused on follow-up", async () => {
      const initBody = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-2", version: "0" },
        },
      })
      const initRes = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: initBody,
      })
      const sid = initRes.headers.get("mcp-session-id")
      expect(sid).toMatch(/^[0-9a-f-]{36}$/i)

      await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sid!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      })

      const listRes = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sid!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      })
      expect(listRes.status).toBe(200)
    })

    test("request without session id is rejected", async () => {
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
      })
      expect([400, 404]).toContain(res.status)
    })

    test("POST /mcp with unknown mcp-session-id returns HTTP 404 with JSON-RPC error", async () => {
      const stranger = crypto.randomUUID()
      const res = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": stranger,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session not found" },
        id: null,
      })
    })
  })
})
