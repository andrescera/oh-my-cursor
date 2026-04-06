import { serve, type Server } from "bun"
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs"
import { STATUS_HTML } from "./mcp-app"
import { logEvent, getEvents, getSessionSummary, getLogPath, clearLog } from "./event-logger"
import { sessions, parseInput, extractMeta } from "./shared"
import { isHookEnabled, getHookConfig } from "./hook-config"
import { createSessionHandlers } from "./handlers/session-handlers"
import { createToolGuardHandlers } from "./handlers/tool-guard-handlers"
import { createContinuationHandlers } from "./handlers/continuation-handlers"
import { createSafetyHandlers } from "./handlers/safety-handlers"
import { createSubagentHandlers } from "./handlers/subagent-handlers"
import type { HandlerMap } from "./types"

const PORT = parseInt(process.env.OH_MY_CURSOR_PORT || "47847")
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "EPERM") {
      return true
    }
    return false
  }
}

function handleStaleProcess(): void {
  if (!existsSync(PID_FILE)) return
  try {
    const pidStr = readFileSync(PID_FILE, "utf-8").trim()
    const pid = parseInt(pidStr, 10)
    if (isNaN(pid)) {
      console.log("[oh-my-cursor] Removing invalid PID file")
      unlinkSync(PID_FILE)
      return
    }
    if (isProcessAlive(pid)) {
      console.log(`[oh-my-cursor] Killing stale daemon process (PID ${pid})`)
      try {
        process.kill(pid, "SIGTERM")
      } catch (killErr) {
        console.error("[oh-my-cursor] Failed to kill stale process:", killErr instanceof Error ? killErr.message : String(killErr))
      }
    }
    unlinkSync(PID_FILE)
  } catch (readErr) {
    console.error("[oh-my-cursor] Error handling stale PID file:", readErr instanceof Error ? readErr.message : String(readErr))
  }
}

function writePidFile(): void {
  writeFileSync(PID_FILE, String(process.pid), "utf-8")
  console.log(`[oh-my-cursor] PID file written: ${PID_FILE} (PID ${process.pid})`)
}

function removePidFile(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE)
      console.log("[oh-my-cursor] PID file removed")
    }
  } catch (err) {
    console.error("[oh-my-cursor] Failed to remove PID file:", err instanceof Error ? err.message : String(err))
  }
}

let server: Server | null = null
let isShuttingDown = false

function gracefulShutdown(reason: string): void {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[oh-my-cursor] Shutting down: ${reason}`)
  removePidFile()

  if (server) {
    server.stop(true)
    console.log("[oh-my-cursor] HTTP server closed")
  }

  console.log("[oh-my-cursor] Shutdown complete")
  process.exit(0)
}

const handlers: HandlerMap = {
  ...createSessionHandlers(sessions, PORT),
  ...createToolGuardHandlers(sessions),
  ...createContinuationHandlers(sessions),
  ...createSafetyHandlers(),
  ...createSubagentHandlers(sessions),
  "/shutdown": () => {
    setTimeout(() => gracefulShutdown("shutdown endpoint"), 100)
    return { status: "shutting_down" }
  },
}

handleStaleProcess()

console.log(`[oh-my-cursor] Hook daemon starting on port ${PORT}...`)

server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === "/dashboard") {
      return new Response(STATUS_HTML, {
        headers: { "Content-Type": "text/html" },
      })
    }

    if (path === "/session-log") {
      const limit = parseInt(url.searchParams.get("limit") || "100")
      const sessionId = url.searchParams.get("session") || undefined
      const event = url.searchParams.get("event") || undefined
      const action = url.searchParams.get("action") || undefined
      const events = getEvents({ limit, sessionId, event, action })
      return new Response(JSON.stringify(events), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (path === "/session-log/summary") {
      const sessionId = url.searchParams.get("session") || undefined
      const summary = getSessionSummary(sessionId)
      return new Response(JSON.stringify(summary), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (path === "/session-log/download") {
      const filePath = getLogPath()
      try {
        const file = Bun.file(filePath)
        if (await file.exists()) {
          const text = await file.text()
          return new Response(text, {
            headers: {
              "Content-Type": "application/x-ndjson",
              "Content-Disposition": 'attachment; filename="session-log.jsonl"',
            },
          })
        }
        return new Response("No log file found", { status: 404 })
      } catch (err) {
        return new Response("Failed to read log: " + (err instanceof Error ? err.message : String(err)), { status: 500 })
      }
    }

    if (path === "/session-log/clear" && req.method === "POST") {
      clearLog()
      return new Response(JSON.stringify({ status: "cleared" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (path === "/config") {
      return new Response(JSON.stringify(getHookConfig()), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const handler = handlers[path]
    if (!handler) {
      return new Response(JSON.stringify({ error: "unknown hook event" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!isHookEnabled(path)) {
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }

    try {
      const body = req.method === "POST" ? await req.json() : {}
      const parsed = parseInput(body)
      const result = handler(parsed)

      if (path !== "/health") {
        const toolInput = (parsed.tool_input as Record<string, unknown>) || {}
        logEvent({
          ts: new Date().toISOString(),
          event: path,
          sessionId: (parsed.conversation_id as string) || (parsed.session_id as string) || "",
          tool: (parsed.tool_name as string) || undefined,
          agentType: (toolInput.subagent_type as string) || (toolInput.agent_type as string) || (parsed.agent_type as string) || undefined,
          action: path === "/postToolUseFailure" ? "error" : (result.permission as string) || (result.decision === "block" ? "block" : result.followup_message ? "continue" : "noop"),
          durationMs: (parsed.duration_ms as number) || undefined,
          error: (parsed.error as string) || (parsed.error_message as string) || ((parsed.tool_response as Record<string, unknown>)?.error as string) || undefined,
          meta: extractMeta(path, parsed, toolInput, result),
        })
      }

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err) {
      console.error(`[oh-my-cursor] Hook error on ${path}:`, err)
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }
  },
})

writePidFile()

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

console.log(`[oh-my-cursor] Hook daemon ready on http://localhost:${PORT}`)
