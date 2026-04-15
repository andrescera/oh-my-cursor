import { serve, type Server } from "bun"
import { writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs"
import { join } from "node:path"
import { STATUS_HTML } from "./mcp-app"
import { logEvent, getEvents, getConversationSummary, getLogPath, clearLog, onEvent, offEvent } from "./event-logger"
import type { EventEntry } from "./event-logger"
import { conversations, parseInput, extractMeta } from "./shared"
import { isHookEnabled, getHookConfig, resetHookConfigCache } from "./hook-config"
import { createConversationHandlers } from "./handlers/conversation-handlers"
import { createToolGuardHandlers } from "./handlers/tool-guard-handlers"
import { createContinuationHandlers } from "./handlers/continuation-handlers"
import { createSafetyHandlers } from "./handlers/safety-handlers"
import { createSubagentHandlers } from "./handlers/subagent-handlers"
import { createConversationHistoryHandler } from "./handlers/conversation-history"
import { BackgroundTracker, createBackgroundTasksHandler } from "./handlers/background-tracker"
import { StatePersistence } from "./state-persistence"
import { createHeartbeatHandler, startHeartbeatWriter, HEARTBEAT_FILE } from "./handlers/heartbeat"
import { loadConfig, resetConfigCache } from "./config"
import { OhMyCursorConfigSchema } from "./schemas/config"
import { cleanupStaleProcess } from "./process-guard"
import { writePortCoordination } from "./port-manager"
import type { HandlerMap } from "./types"

const config = loadConfig()
const tracker = new BackgroundTracker()
const persistence = new StatePersistence(config.state_persistence.path)

const restored = persistence.load()
if (restored) {
  for (const [id, state] of restored) {
    conversations.set(id, state)
  }
}

try {
  const mdcPath = join(process.cwd(), ".cursor", "rules", "oh-my-cursor-context.mdc")
  if (existsSync(mdcPath)) {
    unlinkSync(mdcPath)
    console.log("[oh-my-cursor] Cleaned up stale oh-my-cursor-context.mdc")
  }
} catch {}

const ENV_PORT = process.env.OH_MY_CURSOR_PORT
const DEFAULT_PORT = config.daemon.port
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"
const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"
const MAX_PORT_ATTEMPTS = 11

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
const activeStreams = new Set<ReadableStreamDefaultController>()

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

  const encoder = new TextEncoder()
  for (const controller of activeStreams) {
    try {
      controller.enqueue(encoder.encode(`event: shutdown\ndata: {}\n\n`))
      controller.close()
    } catch {}
  }
  activeStreams.clear()

  persistence.forceFlush(conversations)

  if (server) {
    server.stop(true)
    console.log("[oh-my-cursor] HTTP server closed")
  }

  removePidFile()
  removePortFile()
  removeHeartbeatFile()

  console.log("[oh-my-cursor] Shutdown complete")
  process.exit(0)
}

const startTime = Date.now()

const handlers: HandlerMap = {
  ...createConversationHandlers(conversations, () => actualPort, tracker),
  ...createToolGuardHandlers(conversations, tracker),
  ...createContinuationHandlers(conversations),
  ...createSafetyHandlers(),
  ...createSubagentHandlers(conversations, tracker),
  "/sessionHistory": createConversationHistoryHandler(conversations),
  "/backgroundTasks": createBackgroundTasksHandler(tracker),
  "/heartbeat": createHeartbeatHandler(startTime),
  "/shutdown": () => {
    setTimeout(() => gracefulShutdown("shutdown endpoint"), 100)
    return { status: "shutting_down" }
  },
  "/status": () => {
    const memUsage = process.memoryUsage()
    return {
      status: "ok",
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      },
      restartCount: parseInt(process.env.OH_MY_CURSOR_RESTART_COUNT || "0", 10),
      lastError: null,
      ports: {
        daemon: actualPort,
        configDefault: DEFAULT_PORT,
      },
      configFiles: {
        user: join(process.env.HOME ?? "/tmp", ".config", "oh-my-cursor", "config.jsonc"),
        project: join(process.cwd(), ".cursor", "oh-my-cursor.jsonc"),
      },
      activeConversations: conversations.size,
      startTime: new Date(startTime).toISOString(),
    }
  },
}

cleanupStaleProcess(PID_FILE, PORT_FILE, "daemon")

const fetchHandler = async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (path === "/dashboard") {
    return new Response(STATUS_HTML, {
      headers: { "Content-Type": "text/html" },
    })
  }

  if (path === "/session-log" || path === "/conversation-log") {
    const rawLimit = parseInt(url.searchParams.get("limit") || "100")
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 100 : rawLimit
    const sessionId = url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
    const event = url.searchParams.get("event") || undefined
    const action = url.searchParams.get("action") || undefined
    const events = getEvents({ limit, sessionId, event, action })
    return new Response(JSON.stringify(events), {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (path === "/session-log/summary" || path === "/conversation-log/summary") {
    const sessionId = url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing required query parameter: session or conversation" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    const summary = getConversationSummary(sessionId)
    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (path === "/session-log/download" || path === "/conversation-log/download") {
    const sessionId = url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
    const filePath = getLogPath(sessionId)
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

  if ((path === "/session-log/clear" || path === "/conversation-log/clear") && req.method === "POST") {
    const clearBody = await req.json().catch(() => ({})) as Record<string, unknown>
    const sessionId = (clearBody.sessionId as string) || (clearBody.conversationId as string) || url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
    clearLog(sessionId)
    return new Response(JSON.stringify({ status: "cleared" }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (path === "/config" && req.method === "POST") {
    try {
      const body = await req.json()
      const result = OhMyCursorConfigSchema.safeParse(body)
      if (!result.success) {
        return new Response(JSON.stringify({ error: "Validation failed", issues: result.error.issues }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const configPath = join(process.cwd(), ".cursor", "oh-my-cursor.jsonc")
      const tmpPath = configPath + ".tmp"
      writeFileSync(tmpPath, JSON.stringify(result.data, null, 2), "utf-8")
      renameSync(tmpPath, configPath)
      resetConfigCache()
      resetHookConfigCache()
      return new Response(JSON.stringify({ status: "saved", path: configPath }), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  if (path === "/config/full") {
    return new Response(JSON.stringify(loadConfig()), {
      headers: { "Content-Type": "application/json" },
    })
  }

  if (path === "/config") {
    return new Response(JSON.stringify(getHookConfig()), {
      headers: { "Content-Type": "application/json" },
    })
  }


  if (path === "/webhook/cloud-agent" && req.method === "POST") {
    const cfg = loadConfig()
    if (!cfg.experimental.webhooks) {
      return new Response(JSON.stringify({ error: "webhooks not enabled" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    try {
      const payload = await req.json()
      const signature = req.headers.get("x-webhook-signature") || ""
      const webhookSecret = (cfg as Record<string, unknown>).webhook_secret as string | undefined

      if (webhookSecret && signature) {
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          "raw", encoder.encode(webhookSecret),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        )
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(payload)))
        const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")
        if (signature !== expected) {
          return new Response(JSON.stringify({ error: "invalid signature" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        }
      }

      logEvent({
        ts: new Date().toISOString(),
        event: "/webhook/cloud-agent",
        sessionId: "",
        action: "webhook",
        meta: { agent_id: payload.agent_id, status: payload.status },
      })

      return new Response(JSON.stringify({ status: "received" }), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  if (path === "/events/stream") {
    const encoder = new TextEncoder()
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null
    let conversationSnapshotTimer: ReturnType<typeof setInterval> | null = null
    let sendFn: ((entry: EventEntry) => void) | null = null

    let streamController: ReadableStreamDefaultController | null = null

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller
        activeStreams.add(controller)
        sendFn = (entry: EventEntry) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`))
          } catch {
            if (sendFn) offEvent(sendFn)
            if (keepaliveTimer) clearInterval(keepaliveTimer)
            if (conversationSnapshotTimer) clearInterval(conversationSnapshotTimer)
            activeStreams.delete(controller)
            controller.close()
          }
        }
        onEvent(sendFn)
        controller.enqueue(encoder.encode(`retry: 3000\n: ok\n\n`))
        keepaliveTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`))
          } catch {
            if (sendFn) offEvent(sendFn)
            if (keepaliveTimer) clearInterval(keepaliveTimer)
            if (conversationSnapshotTimer) clearInterval(conversationSnapshotTimer)
            activeStreams.delete(controller)
            controller.close()
          }
        }, 15_000)
        conversationSnapshotTimer = setInterval(() => {
          try {
            const snapshot = Array.from(conversations.entries()).map(([id, s]) => ({
              id,
              startedAt: s.startedAt,
              toolCallCount: s.toolCallCount,
              errorCount: s.errorCount,
              composerMode: s.composerMode,
              dispatchCounts: s.dispatchCounts,
            }))
            controller.enqueue(encoder.encode(`event: conversation-snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`))
          } catch {
            if (sendFn) offEvent(sendFn)
            if (keepaliveTimer) clearInterval(keepaliveTimer)
            if (conversationSnapshotTimer) clearInterval(conversationSnapshotTimer)
            activeStreams.delete(controller)
            controller.close()
          }
        }, 2_000)
      },
      cancel() {
        if (sendFn) offEvent(sendFn)
        if (keepaliveTimer) clearInterval(keepaliveTimer)
        if (conversationSnapshotTimer) clearInterval(conversationSnapshotTimer)
        if (streamController) activeStreams.delete(streamController)
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  if (path === "/sessions/stream" || path === "/conversations/stream") {
    const encoder = new TextEncoder()
    let interval: ReturnType<typeof setInterval> | null = null

    let sessStreamController: ReadableStreamDefaultController | null = null

    const stream = new ReadableStream({
      start(controller) {
        sessStreamController = controller
        activeStreams.add(controller)
        controller.enqueue(encoder.encode(`retry: 3000\n: ok\n\n`))
        interval = setInterval(() => {
          try {
            const conversationData = Array.from(conversations.entries()).map(([id, s]) => ({
              id,
              startedAt: s.startedAt,
              toolCallCount: s.toolCallCount,
              errorCount: s.errorCount,
              composerMode: s.composerMode,
              dispatchCounts: s.dispatchCounts,
            }))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(conversationData)}\n\n`))
          } catch {
            if (interval) clearInterval(interval)
            activeStreams.delete(controller)
            controller.close()
          }
        }, 2000)
      },
      cancel() {
        if (interval) clearInterval(interval)
        if (sessStreamController) activeStreams.delete(sessStreamController)
      },
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  if ((path === "/sessions" || path === "/conversations") && req.method === "GET") {
    const list = Array.from(conversations.entries()).map(([id, s]) => ({
      id,
      startedAt: s.startedAt,
      toolCallCount: s.toolCallCount,
      dispatchCounts: { ...s.dispatchCounts },
      errorCount: s.errorCount,
      composerMode: s.composerMode,
      ralphState: s.ralphState,
      stoppedAt: s.stoppedAt,
      recentToolTrail: s.recentToolTrail,
    }))
    return new Response(JSON.stringify(list), {
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

  const GET_ALLOWED_ROUTES = new Set(["/health", "/heartbeat", "/status", "/backgroundTasks"])
  if (req.method !== "POST" && !GET_ALLOWED_ROUTES.has(path)) {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: "POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST" },
    })
  }

  try {
    const body = req.method === "POST" ? await req.json() : {}
    const parsed = parseInput(body)
    if (req.method !== "POST") {
      for (const [key, value] of url.searchParams) {
        parsed[key] = value
      }
    }
    if (path !== "/health" && path !== "/heartbeat" && path !== "/status") {
      console.log(`[oh-my-cursor][daemon] ${path} | inputKeys=${Object.keys(parsed).join(",")}`)
    }
    const result = handler(parsed)

    if (path !== "/health" && path !== "/heartbeat" && path !== "/status") {
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
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}

const envPort = ENV_PORT ? parseInt(ENV_PORT) : NaN
let actualPort = Number.isNaN(envPort) ? DEFAULT_PORT : envPort

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
writePortCoordination({
  daemon: actualPort,
  sidecar: actualPort + 1,
  updatedAt: new Date().toISOString(),
})
heartbeatInterval = startHeartbeatWriter()
persistenceInterval = setInterval(() => {
  persistence.save(conversations)
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
