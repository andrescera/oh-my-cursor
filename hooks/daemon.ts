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
import { createSessionHistoryHandler } from "./handlers/session-history"
import { BackgroundTracker, createBackgroundTasksHandler } from "./handlers/background-tracker"
import { StatePersistence } from "./state-persistence"
import { createHeartbeatHandler, startHeartbeatWriter, HEARTBEAT_FILE } from "./handlers/heartbeat"
import { loadConfig } from "./config"
import type { HandlerMap } from "./types"

const config = loadConfig()
const tracker = new BackgroundTracker()
const persistence = new StatePersistence(config.state_persistence.path)

const restored = persistence.load()
if (restored) {
  for (const [id, state] of restored) {
    sessions.set(id, state)
  }
}

const ENV_PORT = process.env.OH_MY_CURSOR_PORT
const DEFAULT_PORT = config.daemon.port
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"
const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"
const MAX_PORT_ATTEMPTS = 11

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

function writePortFile(port: number): void {
  writeFileSync(PORT_FILE, String(port), "utf-8")
  console.log(`[oh-my-cursor] Port file written: ${PORT_FILE} (port ${port})`)
}

function removePortFile(): void {
  try {
    if (existsSync(PORT_FILE)) {
      unlinkSync(PORT_FILE)
    }
  } catch (err) {
    console.error("[oh-my-cursor] Failed to remove port file:", err instanceof Error ? err.message : String(err))
  }
}

function removeHeartbeatFile(): void {
  try {
    if (existsSync(HEARTBEAT_FILE)) {
      unlinkSync(HEARTBEAT_FILE)
    }
  } catch (err) {
    console.error("[oh-my-cursor] Failed to remove heartbeat file:", err instanceof Error ? err.message : String(err))
  }
}

function isPortInUseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("eaddrinuse") || msg.includes("address already in use")
}

let server: Server | null = null
let isShuttingDown = false
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let persistenceInterval: ReturnType<typeof setInterval> | null = null

function gracefulShutdown(reason: string): void {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[oh-my-cursor] Shutting down: ${reason}`)

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  if (persistenceInterval) {
    clearInterval(persistenceInterval)
    persistenceInterval = null
  }

  persistence.forceFlush(sessions)

  removePidFile()
  removePortFile()
  removeHeartbeatFile()

  if (server) {
    server.stop(true)
    console.log("[oh-my-cursor] HTTP server closed")
  }

  console.log("[oh-my-cursor] Shutdown complete")
  process.exit(0)
}

const startTime = Date.now()

const handlers: HandlerMap = {
  ...createSessionHandlers(sessions, DEFAULT_PORT),
  ...createToolGuardHandlers(sessions),
  ...createContinuationHandlers(sessions),
  ...createSafetyHandlers(),
  ...createSubagentHandlers(sessions, tracker),
  "/sessionHistory": createSessionHistoryHandler(sessions),
  "/backgroundTasks": createBackgroundTasksHandler(tracker),
  "/heartbeat": createHeartbeatHandler(startTime),
  "/shutdown": () => {
    setTimeout(() => gracefulShutdown("shutdown endpoint"), 100)
    return { status: "shutting_down" }
  },
}

handleStaleProcess()

const fetchHandler = async (req: Request) => {
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

    if (path !== "/health" && path !== "/heartbeat") {
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
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[oh-my-cursor] Hook error on ${path}:`, err instanceof Error ? err.stack : err)
    logEvent({
      ts: new Date().toISOString(),
      event: path,
      sessionId: "",
      action: "error",
      error: message,
      meta: err instanceof Error && err.stack ? { stack: err.stack } : undefined,
    })
    return new Response(
      JSON.stringify({ error: message, hook: path }),
      {
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}

let actualPort = ENV_PORT ? parseInt(ENV_PORT) : DEFAULT_PORT

if (ENV_PORT) {
  console.log(`[oh-my-cursor] Hook daemon starting on port ${actualPort} (env override)...`)
  server = serve({ port: actualPort, fetch: fetchHandler })
} else {
  console.log(`[oh-my-cursor] Hook daemon starting on port ${actualPort}...`)
  let started = false
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
    const tryPort = DEFAULT_PORT + offset
    try {
      server = serve({ port: tryPort, fetch: fetchHandler })
      actualPort = tryPort
      started = true
      if (offset > 0) {
        console.log(`[oh-my-cursor] Default port ${DEFAULT_PORT} in use, using port ${actualPort}`)
      }
      break
    } catch (err) {
      if (isPortInUseError(err)) {
        console.log(`[oh-my-cursor] Port ${tryPort} in use, trying next...`)
        continue
      }
      throw err
    }
  }
  if (!started) {
    console.error(`[oh-my-cursor] Could not find available port in range ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS - 1}`)
    process.exit(1)
  }
}

writePidFile()
writePortFile(actualPort)
heartbeatInterval = startHeartbeatWriter()
persistenceInterval = setInterval(() => {
  persistence.save(sessions)
}, 30_000)

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

process.on("unhandledRejection", (reason) => {
  console.error("[oh-my-cursor] Unhandled rejection:", reason instanceof Error ? reason.stack : reason)
  logEvent({
    ts: new Date().toISOString(),
    event: "/unhandledRejection",
    sessionId: "",
    action: "error",
    error: reason instanceof Error ? reason.message : String(reason),
  })
})

console.log(`[oh-my-cursor] Hook daemon ready on http://localhost:${actualPort}`)
