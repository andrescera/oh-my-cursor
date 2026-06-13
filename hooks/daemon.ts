import { type Server } from "bun"
import { writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs"
import { dirname, isAbsolute, join, relative as pathRelative } from "node:path"
import { fileURLToPath } from "node:url"
import { getStatusHTML } from "./mcp-app"
import { logEvent, getEvents, getConversationSummary, getLogPath, clearLog, onEvent, offEvent, flushEventLog, flushNow, drainPendingRotations, drainCleanup } from "./event-logger"
import type { EventEntry } from "./event-logger"
import { bindWithRetry, flushOnCrash } from "./bind-with-retry"
import { conversations, parseInput, extractMeta, classifyAction, setPersistence } from "./shared"
import { isHookEnabled, getHookConfig, resetHookConfigCache } from "./hook-config"
import { createConversationHandlers } from "./handlers/conversation-handlers"
import { createToolGuardHandlers, refreshPlanModeAllowedAgents } from "./handlers/tool-guard-handlers"
import { createContinuationHandlers } from "./handlers/continuation-handlers"
import { createSafetyHandlers } from "./handlers/safety-handlers"
import { createSubagentHandlers } from "./handlers/subagent-handlers"
import { createQuestionLabelTruncatorHandler } from "./handlers/question-label-truncator"
import { createPlanFormatValidatorHandler } from "./handlers/plan-format-validator"
import { createNotepadWriteGuardHandler } from "./handlers/notepad-write-guard"
import { createKeywordDetectorHandler } from "./handlers/keyword-detector"
import { createFsyncSkipWarningHandlerMap } from "./handlers/fsync-skip-warning"
import { createToolPairValidatorHandler } from "./handlers/tool-pair-validator"
import { createConversationHistoryHandler } from "./handlers/conversation-history"
import { BackgroundTracker, createBackgroundTasksHandler } from "./handlers/background-tracker"
import { createAgentHistoryHandler } from "./handlers/agent-history"
import { extractAgentTypeFromLogInputs, extractAgentIdFromLogInputs } from "./handlers/extract-agent-fields"
import { composeTaskUpdatedInput } from "./handlers/task-input-composer"
import "./handlers/context-piggyback-mutation"
import "./handlers/model-routing-mutation"
import "./handlers/delegate-task-retry-rotation"
import "./handlers/question-label-truncator"
import { StatePersistence, type ConversationMetadata } from "./state-persistence"
import { createHeartbeatHandler, startHeartbeatWriter, HEARTBEAT_FILE } from "./handlers/heartbeat"
import { loadConfig, resetConfigCache } from "./config"
import { OhMyCursorConfigSchema } from "./schemas/config"
import { writeAgentOverrides, isWriteFailure } from "./lib/agent-overrides-write"
import { cleanupStaleProcess, killPortSquatter } from "./process-guard"
import { writePortCoordination } from "./port-manager"
import type { HandlerFn, HandlerMap } from "./types"
import { getDefaultAgentHistoryStore } from "./agent-history-store"
import { createBudgetMiddleware } from "./lib/budget-middleware"
import { createBackgroundWorker } from "./lib/background-worker"
import { createMetrics } from "./lib/metrics"
import { acquireStartupLock, releaseStartupLock } from "./lib/startup-lock"
import { getOrCreateToken, extractProvidedToken, tokensMatch } from "./lib/daemon-token"
import { introspectionRuntime } from "./lib/introspection-runtime"
import { CHANNEL_STATUS_TABLE } from "./lib/channel-status"

const HOT_PATHS = new Set([
  "/preToolUse",
  "/beforeShellExecution",
  "/beforeMCPExecution",
  "/beforeReadFile",
  "/beforeSubmitPrompt",
])

const FAIL_OPEN_OBSERVE_ROUTES = new Set([
  "/postToolUse",
  "/postToolUseFailure",
  "/afterShellExecution",
  "/afterMCPExecution",
  "/afterFileEdit",
  "/afterAgentResponse",
  "/afterAgentThought",
  "/subagentStop",
  "/sessionStart",
  "/sessionEnd",
  "/preCompact",
  "/beforeSubmitPrompt",
  "/stop",
  "/workspaceOpen",
])
const DIAGNOSTIC_PATHS = new Set([
  "/health",
  "/heartbeat",
  "/status",
  "/backgroundTasks",
  "/agentHistory",
  "/metrics",
  "/dashboard",
  "/dashboard/index.html",
  "/config",
  "/config/full",
  "/introspection",
  "/channel-status",
])

const OBSERVE_INTROSPECTION_ROUTES = new Set([
  "/preToolUse",
  "/postToolUse",
  "/subagentStart",
])

function budgetForRoute(route: string): number {
  if (HOT_PATHS.has(route)) return 50
  // Config write does file IO + a bounded (cached, timeout-capped) introspector
  // scan for the advisory enum check — give it the larger diagnostic budget.
  if (route === "/config/agent-overrides") return 500
  if (DIAGNOSTIC_PATHS.has(route)) return 500
  if (route.startsWith("/dashboard/assets/")) return 500
  return 250
}

function isDeferredResult(r: unknown): r is { deferred: true } {
  return (
    typeof r === "object" &&
    r !== null &&
    (r as Record<string, unknown>).deferred === true &&
    Object.keys(r as object).length === 1
  )
}

function deferredJsonResponse(): Response {
  return new Response(JSON.stringify({}), {
    headers: { "Content-Type": "application/json" },
  })
}

const metrics = createMetrics()

const budgetMiddleware = createBudgetMiddleware({
  onSlowHandler: (ev) => {
    console.warn(
      `[oh-my-cursor][slow-handler] route=${ev.route} budgetMs=${ev.budgetMs} observedMs=${ev.observedMs}`,
    )
    metrics.recordSlowHandler({
      route: ev.route,
      budgetMs: ev.budgetMs,
      observedMs: ev.observedMs,
      ts: ev.ts,
    })
    logEvent({
      ts: ev.ts,
      event: "slow_handler",
      sessionId: "",
      action: "slow_handler",
      durationMs: ev.observedMs,
      meta: { route: ev.route, budgetMs: ev.budgetMs, deferred: true },
    })
  },
})

const config = loadConfig()
const tracker = new BackgroundTracker()
const historyStore = getDefaultAgentHistoryStore()
const persistence = new StatePersistence(config.state_persistence.path)
setPersistence(persistence)

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const backgroundWorker = createBackgroundWorker(
  {
    pruneStale: () => { persistence.pruneStale(TWO_HOURS_MS) },
    rotateIfNeeded: drainPendingRotations,
    cleanupOldConversationFiles: drainCleanup,
  },
  {
    onTickComplete: (durationMs) => { metrics.recordWorkerTick(durationMs) },
  },
)

const DAEMON_BOOT_ID = crypto.randomUUID()
const DAEMON_PROJECT_ROOT = process.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()
persistence.setIdentity(DAEMON_PROJECT_ROOT, DAEMON_BOOT_ID)

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST_ASSETS_DIR = join(HERE, "dashboard-ui", "dist", "assets")

function contentTypeForAsset(filename: string): string {
  if (filename.endsWith(".js") || filename.endsWith(".mjs")) return "application/javascript; charset=utf-8"
  if (filename.endsWith(".css")) return "text/css; charset=utf-8"
  if (filename.endsWith(".woff2")) return "font/woff2"
  if (filename.endsWith(".woff")) return "font/woff"
  if (filename.endsWith(".ttf")) return "font/ttf"
  if (filename.endsWith(".otf")) return "font/otf"
  if (filename.endsWith(".png")) return "image/png"
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg"
  if (filename.endsWith(".gif")) return "image/gif"
  if (filename.endsWith(".svg")) return "image/svg+xml"
  if (filename.endsWith(".webp")) return "image/webp"
  if (filename.endsWith(".ico")) return "image/x-icon"
  if (filename.endsWith(".map") || filename.endsWith(".json")) return "application/json; charset=utf-8"
  return "application/octet-stream"
}

const DASHBOARD_ASSETS_NOT_BUILT_BODY = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Dashboard assets not built</title></head><body style="font-family:system-ui;padding:2rem;max-width:40rem;margin:0 auto"><h1>Dashboard assets not built</h1><p>Run <code>install.sh</code> / <code>install.ps1</code>, or invoke install with <code>--skip-dashboard-build</code> to acknowledge.</p></body></html>`

const DAEMON_AUTH_TOKEN = getOrCreateToken()

// Routes that expose session data, config, control, or the token-bearing
// dashboard shell require the shared-secret token. /health, /heartbeat, hook
// event routes, and the static dashboard asset bundle stay open so Cursor's
// header-less hook scripts and browser subresource loads keep working.
function requiresToken(path: string): boolean {
  if (path === "/health" || path === "/heartbeat") return false
  if (path.startsWith("/dashboard/assets/")) return false
  return (
    path === "/session-log" || path.startsWith("/session-log/") ||
    path === "/conversation-log" || path.startsWith("/conversation-log/") ||
    path === "/config" || path === "/config/full" || path === "/config/agent-overrides" ||
    path === "/status" || path === "/shutdown" || path === "/metrics" ||
    path === "/dashboard" || path === "/dashboard/index.html" ||
    path === "/agentHistory" || path === "/backgroundTasks" ||
    path === "/introspection" || path === "/channel-status"
  )
}

function isAuthorized(req: Request, url: URL): boolean {
  if (!DAEMON_AUTH_TOKEN) return true
  return tokensMatch(extractProvidedToken(req, url), DAEMON_AUTH_TOKEN)
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
  })
}

export function getDaemonBootId(): string {
  return DAEMON_BOOT_ID
}

function mergedConversationIndex(): Map<string, ConversationMetadata> {
  const index = persistence.loadIndex()
  for (const [id, conv] of conversations) {
    if (!index.has(id)) {
      index.set(id, {
        id,
        startedAt: conv.startedAt,
        composerMode: conv.composerMode,
        displayTitle: conv.displayTitle,
        toolCallCount: conv.toolCallCount,
        errorCount: conv.errorCount,
        stoppedAt: conv.stoppedAt,
      })
    }
  }
  return index
}

function conversationRowsForStream(): Array<{
  id: string
  startedAt: string
  toolCallCount: number
  errorCount: number
  composerMode: string | null
  displayTitle: string | null
  dispatchCounts?: Record<string, number>
}> {
  const index = mergedConversationIndex()
  return Array.from(index.values()).map((meta) => {
    const s = conversations.get(meta.id)
    if (s) {
      return {
        id: meta.id,
        startedAt: s.startedAt,
        toolCallCount: s.toolCallCount,
        errorCount: s.errorCount,
        composerMode: s.composerMode,
        displayTitle: s.displayTitle,
        dispatchCounts: s.dispatchCounts,
      }
    }
    return {
      id: meta.id,
      startedAt: meta.startedAt,
      toolCallCount: meta.toolCallCount,
      errorCount: meta.errorCount,
      composerMode: meta.composerMode,
      displayTitle: meta.displayTitle ?? null,
    }
  })
}

try {
  const mdcPath = join(process.cwd(), ".cursor", "rules", "oh-my-cursor-context.mdc")
  if (existsSync(mdcPath)) {
    unlinkSync(mdcPath)
    console.log("[oh-my-cursor] Cleaned up stale oh-my-cursor-context.mdc")
  }
} catch (err) {
  console.error('[daemon] MDC cleanup failed:', err)
}

const ENV_PORT = process.env.OH_MY_CURSOR_PORT
const DEFAULT_PORT = config.daemon.port
const PID_FILE = "/tmp/oh-my-cursor-daemon.pid"
const PORT_FILE = "/tmp/oh-my-cursor-daemon.port"

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


let server: Server | null = null
let isShuttingDown = false
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let persistenceInterval: ReturnType<typeof setInterval> | null = null
const activeStreams = new Set<ReadableStreamDefaultController>()

function emitConfigChanged(detail: Record<string, unknown>): void {
  const encoder = new TextEncoder()
  const payload = JSON.stringify({ ...detail, ts: new Date().toISOString() })
  for (const controller of [...activeStreams]) {
    try {
      controller.enqueue(encoder.encode(`event: config-changed\ndata: ${payload}\n\n`))
    } catch {
      // Dead stream: its own keepalive/send path performs cleanup.
    }
  }
}

async function gracefulShutdown(reason: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[oh-my-cursor] Shutting down: ${reason}`)

  backgroundWorker.stop().catch(() => { /* drain errors are non-fatal */ })

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  if (persistenceInterval) {
    clearInterval(persistenceInterval)
    persistenceInterval = null
  }

  const encoder = new TextEncoder()
  for (const controller of [...activeStreams]) {
    try {
      controller.enqueue(encoder.encode(`event: shutdown\ndata: {}\n\n`))
      controller.close()
    } catch {}
  }
  activeStreams.clear()

  await persistence.forceFlushAll(conversations)

  try {
    await flushNow()
  } catch (err) {
    console.error("[oh-my-cursor] Event log flush failed during shutdown:", err instanceof Error ? err.message : String(err))
  }

  if (server) {
    server.stop(true)
    console.log("[oh-my-cursor] HTTP server closed")
  }

  removePidFile()
  removePortFile()
  removeHeartbeatFile()
  releaseStartupLock(DAEMON_PROJECT_ROOT)

  console.log("[oh-my-cursor] Shutdown complete")
  process.exit(0)
}

const startTime = Date.now()

// Multiple factories register /preToolUse and /postToolUse. An object spread is
// LAST-WINS, so every registrant but the final one is silently dropped. Capture
// each competing map so the routes can be CHAINED (not clobbered) below.
const toolGuardHandlers = createToolGuardHandlers(conversations, tracker)
const planFormatValidatorHandlers = createPlanFormatValidatorHandler(conversations)
const notepadWriteGuardHandlers = createNotepadWriteGuardHandler(conversations)
const fsyncSkipWarningHandlers = createFsyncSkipWarningHandlerMap()

const handlers: HandlerMap = {
  ...createConversationHandlers(conversations, () => actualPort, tracker, persistence),
  ...toolGuardHandlers,
  ...createContinuationHandlers(conversations),
  ...createSafetyHandlers(),
  ...createSubagentHandlers(conversations, tracker),
  ...planFormatValidatorHandlers,
  ...notepadWriteGuardHandlers,
  ...fsyncSkipWarningHandlers,
  // workspaceOpen is registered in hooks.json (canonical event 21, OBSERVE-ONLY/binary-only per
  // docs/cursor/03-hooks.md). No-op route prevents a 404 on POST; no response field is enforced.
  "/workspaceOpen": () => ({}),
  "/sessionHistory": createConversationHistoryHandler(conversations),
  "/backgroundTasks": createBackgroundTasksHandler(tracker),
  "/agentHistory": createAgentHistoryHandler(historyStore),
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

// Chain the multi-registrant /preToolUse and /postToolUse routes. The spread
// above is last-wins and dropped every registrant but the final one. Run each in
// registration order and return the FIRST non-empty response; a permission:"deny"
// is non-empty so deny still short-circuits. Mirrors the tool-pair-validator chain.
const chainHandlers = (chain: Array<HandlerFn | undefined>): HandlerFn => {
  const live = chain.filter((fn): fn is HandlerFn => typeof fn === "function")
  return (input) => {
    for (const handler of live) {
      const result = handler(input)
      if (result && typeof result === "object" && Object.keys(result).length > 0) {
        return result
      }
    }
    return {}
  }
}
handlers["/preToolUse"] = chainHandlers([
  toolGuardHandlers["/preToolUse"],
  planFormatValidatorHandlers["/preToolUse"],
  notepadWriteGuardHandlers["/preToolUse"],
])
handlers["/postToolUse"] = chainHandlers([
  toolGuardHandlers["/postToolUse"],
  fsyncSkipWarningHandlers["/postToolUse"],
])

// Explicit wrapper, NOT a spread: a spread would clobber continuation-handlers'
// /beforeSubmitPrompt (last-wins). keyword-detector runs first; a throw never
// blocks the original handler.
const keywordDetectorHandlers = createKeywordDetectorHandler(conversations)
const keywordBeforeSubmitPrompt = keywordDetectorHandlers["/beforeSubmitPrompt"]
const baseBeforeSubmitPrompt = handlers["/beforeSubmitPrompt"]
if (keywordBeforeSubmitPrompt) {
  handlers["/beforeSubmitPrompt"] = (input) => {
    try {
      keywordBeforeSubmitPrompt(input)
    } catch (err) {
      console.error("[oh-my-cursor][keyword-detector] /beforeSubmitPrompt error:", err instanceof Error ? err.message : String(err))
    }
    return baseBeforeSubmitPrompt ? baseBeforeSubmitPrompt(input) : {}
  }
}
const keywordSessionEnd = keywordDetectorHandlers["/sessionEnd"]
const baseSessionEnd = handlers["/sessionEnd"]
if (keywordSessionEnd) {
  handlers["/sessionEnd"] = (input) => {
    try {
      keywordSessionEnd(input)
    } catch (err) {
      console.error("[oh-my-cursor][keyword-detector] /sessionEnd error:", err instanceof Error ? err.message : String(err))
    }
    return baseSessionEnd ? baseSessionEnd(input) : {}
  }
}

// tool-pair-validator (read-before-edit enforcement). Routes are composed via
// object spread where the LAST spread wins a key, so the validator is CHAINED
// onto the existing live winners instead of overwriting them: the current
// winner runs first (exact behavior preserved), then the validator runs.
{
  const toolPair = createToolPairValidatorHandler(conversations)
  const livePreToolUse = handlers["/preToolUse"]
  const livePostToolUse = handlers["/postToolUse"]
  const validateEdit = toolPair["/preToolUse"]
  const trackRead = toolPair["/postToolUse"]
  if (validateEdit) {
    handlers["/preToolUse"] = (input) => {
      if (livePreToolUse) {
        const upstream = livePreToolUse(input)
        if (upstream && typeof upstream === "object" && Object.keys(upstream).length > 0) return upstream
      }
      return validateEdit(input)
    }
  }
  if (trackRead) {
    handlers["/postToolUse"] = (input) => {
      const upstream = livePostToolUse ? livePostToolUse(input) : {}
      trackRead(input)
      return upstream
    }
  }
}

const fetchHandler = async (req: Request) => {
  const url = new URL(req.url)
  const path = url.pathname

  if (requiresToken(path) && !isAuthorized(req, url)) {
    return unauthorizedResponse()
  }

  if (path === "/dashboard" || path === "/dashboard/index.html") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const html = await getStatusHTML(actualPort)
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path.startsWith("/dashboard/assets/")) {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const requestedRaw = path.slice("/dashboard/assets/".length)
      let requested: string
      try {
        requested = decodeURIComponent(requestedRaw)
      } catch {
        return new Response("Bad Request", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      }
      if (
        requested.length === 0 ||
        requested.includes("\0") ||
        requested.startsWith("/") ||
        requested.startsWith("\\") ||
        requested.split(/[/\\]/).some((seg) => seg === "..")
      ) {
        return new Response("Bad Request", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      }
      const resolved = join(DIST_ASSETS_DIR, requested)
      const rel = pathRelative(DIST_ASSETS_DIR, resolved)
      if (rel.length === 0 || rel.startsWith("..") || isAbsolute(rel)) {
        return new Response("Bad Request", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      }
      const file = Bun.file(resolved)
      if (!(await file.exists())) {
        return new Response(DASHBOARD_ASSETS_NOT_BUILT_BODY, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }
      const etag = `W/"${file.size.toString(16)}-${file.lastModified.toString(16)}"`
      const ifNoneMatch = req.headers.get("if-none-match")
      if (ifNoneMatch === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } })
      }
      const data = await file.arrayBuffer()
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": contentTypeForAsset(requested),
          "Cache-Control": "public, max-age=60, must-revalidate",
          "ETag": etag,
        },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/session-log" || path === "/conversation-log") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const rawLimit = parseInt(url.searchParams.get("limit") || "100")
      const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 100 : rawLimit
      const sessionId = url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
      const event = url.searchParams.get("event") || undefined
      const action = url.searchParams.get("action") || undefined
      const events = getEvents({ limit, sessionId, event, action })
      return new Response(JSON.stringify(events), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/session-log/summary" || path === "/conversation-log/summary") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
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
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/session-log/download" || path === "/conversation-log/download") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
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
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if ((path === "/session-log/clear" || path === "/conversation-log/clear") && req.method === "POST") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const clearBody = await req.json().catch(() => ({})) as Record<string, unknown>
      const sessionId = (clearBody.sessionId as string) || (clearBody.conversationId as string) || url.searchParams.get("session") || url.searchParams.get("conversation") || undefined
      clearLog(sessionId)
      return new Response(JSON.stringify({ status: "cleared" }), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/config/agent-overrides" && req.method === "POST") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }
      const cfg = loadConfig()
      const result = await writeAgentOverrides(body, { enumOptions: { introspection: cfg.introspection } })
      if (isWriteFailure(result)) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: result.status,
          headers: { "Content-Type": "application/json" },
        })
      }
      resetConfigCache()
      resetHookConfigCache()
      loadConfig()
      emitConfigChanged({ target: (body as { target?: unknown }).target, path: result.path })
      return new Response(JSON.stringify({ status: "saved", path: result.path, warnings: result.warnings }), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/config" && req.method === "POST") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
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
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/config/full") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      return new Response(JSON.stringify(loadConfig()), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/config") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      return new Response(JSON.stringify(getHookConfig()), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }


  if (path === "/webhook/cloud-agent" && req.method === "POST") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
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
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/metrics") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const snapshot = metrics.getSnapshot()
      snapshot.circuitState = budgetMiddleware.getCircuitState()
      return new Response(JSON.stringify(snapshot), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/introspection") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      return new Response(JSON.stringify(introspectionRuntime.getSnapshot()), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/channel-status") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      return new Response(JSON.stringify({ table: CHANNEL_STATUS_TABLE }), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
  }

  if (path === "/events/stream") {
    // SSE streaming — exempt from budget middleware
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
            const snapshot = conversationRowsForStream()
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
      },
    })
  }

  if (path === "/sessions/stream" || path === "/conversations/stream") {
    // SSE streaming — exempt from budget middleware
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
            const conversationData = conversationRowsForStream()
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
      },
    })
  }

  if ((path === "/sessions" || path === "/conversations") && req.method === "GET") {
    const budgeted = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      const index = mergedConversationIndex()
      const list = Array.from(index.keys()).map((id) => {
        const s = conversations.get(id)
        const meta = index.get(id)!
        if (s) {
          return {
            id,
            startedAt: s.startedAt,
            toolCallCount: s.toolCallCount,
            dispatchCounts: { ...s.dispatchCounts },
            errorCount: s.errorCount,
            composerMode: s.composerMode,
            ralphState: s.ralphState,
            stoppedAt: s.stoppedAt,
            recentToolTrail: s.recentToolTrail,
          }
        }
        return {
          id: meta.id,
          startedAt: meta.startedAt,
          toolCallCount: meta.toolCallCount,
          dispatchCounts: {},
          errorCount: meta.errorCount,
          composerMode: meta.composerMode,
          ralphState: null,
          stoppedAt: meta.stoppedAt,
          recentToolTrail: [],
        }
      })
      return new Response(JSON.stringify(list), {
        headers: { "Content-Type": "application/json" },
      })
    })
    if (isDeferredResult(budgeted)) return deferredJsonResponse()
    return budgeted
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

  const GET_ALLOWED_ROUTES = new Set(["/health", "/heartbeat", "/status", "/backgroundTasks", "/agentHistory"])
  if (req.method !== "POST" && !GET_ALLOWED_ROUTES.has(path)) {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: "POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "POST" },
    })
  }

  let errorSessionId = ""
  try {
    let body: Record<string, unknown> = {}
    if (req.method === "POST") {
      const raw = await req.text()
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw)
        } catch {
          logEvent({
            ts: new Date().toISOString(),
            event: path,
            sessionId: "",
            action: "error",
            error: "Invalid JSON body",
            meta: { rawBody: raw.slice(0, 2048) },
          })
          return new Response(
            JSON.stringify({ error: "Invalid JSON body", hook: path }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          )
        }
      }
    }
    const parsed = parseInput(body)
    errorSessionId = (parsed.conversation_id as string) || (parsed.session_id as string) || ""
    if (OBSERVE_INTROSPECTION_ROUTES.has(path)) {
      introspectionRuntime.observe(parsed)
    }
    if (req.method !== "POST") {
      for (const [key, value] of url.searchParams) {
        parsed[key] = value
      }
    }
    if (path !== "/health" && path !== "/heartbeat" && path !== "/status") {
      console.log(`[oh-my-cursor][daemon] ${path} | inputKeys=${Object.keys(parsed).join(",")}`)
    }
    const handlerStart = Date.now()
    let handlerThrew = false
    let handlerErrorMessage = ""
    // The handler is wrapped here (not in the outer catch) because budgetMiddleware
    // swallows handler throws into a deferred sentinel — the outer catch never sees them.
    // Catch-and-return (instead of re-throw) keeps the middleware's timeout/circuit logic intact.
    const result = await budgetMiddleware.withBudget(path, budgetForRoute(path), async () => {
      try {
        const handlerResult = await Promise.resolve(handler(parsed))
        // Sole producer of `updated_input` for Task preToolUse; runs after the
        // handler so permission/deny short-circuits take precedence.
        return composeTaskUpdatedInput(path, parsed, handlerResult)
      } catch (handlerErr) {
        handlerThrew = true
        handlerErrorMessage = handlerErr instanceof Error ? handlerErr.message : String(handlerErr)
        console.error(`[oh-my-cursor] Hook handler error on ${path}:`, handlerErr instanceof Error ? handlerErr.stack : handlerErr)
        return {}
      }
    })
    const handlerDurationMs = Date.now() - handlerStart

    if (handlerThrew) {
      logEvent({
        ts: new Date().toISOString(),
        event: path,
        sessionId: errorSessionId,
        action: "error",
        error: handlerErrorMessage,
      })
      if (!FAIL_OPEN_OBSERVE_ROUTES.has(path)) {
        return new Response(
          JSON.stringify({ error: handlerErrorMessage, hook: path }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (path !== "/health" && path !== "/heartbeat" && path !== "/status") {
      const toolInput = (parsed.tool_input as Record<string, unknown>) || {}
      logEvent({
        ts: new Date().toISOString(),
        event: path,
        sessionId: (parsed.conversation_id as string) || (parsed.session_id as string) || "",
        tool: (parsed.tool_name as string) || undefined,
        agentType: extractAgentTypeFromLogInputs(parsed, toolInput),
        agentId: extractAgentIdFromLogInputs(parsed, toolInput),
        action: classifyAction(path, result),
        durationMs: handlerDurationMs,
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
      sessionId: errorSessionId,
      action: "error",
      error: message,
      meta: err instanceof Error && err.stack ? { stack: err.stack } : undefined,
    })
    // Observe-only hook routes fail open: a handler crash must not surface an error
    // payload to Cursor (it cannot block anyway). Guard routes (preToolUse,
    // beforeShellExecution, beforeMCPExecution, beforeReadFile, subagentStart) and
    // internal routes keep the explicit 500 so blocking/diagnostic intent is preserved.
    if (FAIL_OPEN_OBSERVE_ROUTES.has(path)) {
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }
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

// Per-project singleton gate. Three concurrent `bun daemon.ts` invocations are
// three OS processes racing the same PID/port files; O_EXCL on a project-scoped
// lock makes exactly one of them the winner. Losers defer to a healthy daemon
// and exit cleanly instead of killing it.
const lockOutcome = await acquireStartupLock(DAEMON_PROJECT_ROOT, actualPort)
if (!lockOutcome.acquired) {
  if (lockOutcome.reason === "already-running") {
    console.log(
      `[oh-my-cursor] Daemon already running for project ${DAEMON_PROJECT_ROOT} (PID ${lockOutcome.holder.pid}); exiting cleanly.`,
    )
  } else {
    console.log(
      `[oh-my-cursor] Lost startup race for project ${DAEMON_PROJECT_ROOT}; another daemon is starting. Exiting cleanly.`,
    )
  }
  process.exit(0)
}
if (lockOutcome.reason === "stale-takeover") {
  console.warn(`[oh-my-cursor] Took over stale daemon lock at ${lockOutcome.path}`)
}
process.on("exit", () => releaseStartupLock(DAEMON_PROJECT_ROOT))

if (ENV_PORT) {
  console.log(`[oh-my-cursor] Hook daemon starting on port ${actualPort} (env override)...`)
  try {
    server = bindWithRetry({ port: actualPort, fetch: fetchHandler })
  } catch (err) {
    console.error(`[oh-my-cursor] Failed to bind daemon on port ${actualPort} (env override):`, err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
} else {
  console.log(`[oh-my-cursor] Hook daemon starting on port ${actualPort}...`)
  const killResult = await killPortSquatter(DEFAULT_PORT, "daemon")
  if (killResult === "not_us") {
    console.error(`[oh-my-cursor] Daemon canonical port ${DEFAULT_PORT} is held by a foreign process; aborting.`)
    process.exit(1)
  }
  try {
    server = bindWithRetry({ port: DEFAULT_PORT, fetch: fetchHandler })
    actualPort = DEFAULT_PORT
  } catch (err) {
    console.error(
      `[oh-my-cursor] Failed to bind daemon on canonical port ${DEFAULT_PORT} (squatter kill returned "${killResult}"):`,
      err instanceof Error ? err.message : String(err),
    )
    process.exit(1)
  }
}

await cleanupStaleProcess(PID_FILE, PORT_FILE, "daemon")

writePidFile()
writePortFile(actualPort)
writePortCoordination({
  daemon: actualPort,
  sidecar: actualPort + 1,
  updatedAt: new Date().toISOString(),
})
setTimeout(() => { getStatusHTML(actualPort).catch(() => {}) }, 0)
heartbeatInterval = startHeartbeatWriter()
persistenceInterval = setInterval(async () => {
  await persistence.save(conversations)
}, 30_000)
backgroundWorker.start()

// Fire-and-forget: the daemon serves /introspection from the fallback floor
// immediately; the bundle scan resolves the snapshot in the background and must
// never block startup or any hook response.
introspectionRuntime.init().catch((err) => {
  console.error("[oh-my-cursor] Introspection init failed:", err instanceof Error ? err.message : String(err))
})

refreshPlanModeAllowedAgents()

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM") })
process.on("SIGINT", () => { void gracefulShutdown("SIGINT") })

process.on("beforeExit", () => {
  void flushNow().catch((err) => {
    console.error("[oh-my-cursor] beforeExit event log flush failed:", err instanceof Error ? err.message : String(err))
  })
})

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

process.on("uncaughtException", (err) => {
  console.error("[oh-my-cursor] Uncaught exception:", err.stack || err.message || String(err))
  flushOnCrash({
    flushEventLog,
    forceFlush: () => persistence.forceFlush(conversations),
  })
  process.exit(1)
})

console.log(`[oh-my-cursor] Hook daemon ready on http://localhost:${actualPort}`)
