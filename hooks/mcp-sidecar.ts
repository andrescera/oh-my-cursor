import { startSidecar, isTestMode } from "./mcp/runtime"
import { startDaemonHealthMonitor, getDaemonHealthy } from "./mcp/daemon-health"
import { getOrCreateSession, isUnknownSession } from "./mcp/server"
import { createBudgetMiddleware } from "./lib/budget-middleware"

const TOOL_NAMES = [
  "look_at",
  "interactive_bash",
  "skill_mcp",
  "get_dispatch_stats",
  "session_transcripts",
  "daemon_logs",
  "session_log",
  "oh_my_cursor_status",
] as const

if (!isTestMode()) startDaemonHealthMonitor()

const budgetMiddleware = createBudgetMiddleware({
  onSlowHandler: (ev) => {
    console.warn(
      `[oh-my-cursor][slow-handler] route=${ev.route} budgetMs=${ev.budgetMs} observedMs=${ev.observedMs}`,
    )
  },
})

const SIDECAR_BUDGETS: Record<string, number> = {
  "/health": 500,
  "/mcp": 250,
}

function isDeferred(value: unknown): value is { deferred: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { deferred?: unknown }).deferred === true
  )
}

function deferredResponse(): Response {
  return new Response(JSON.stringify({ deferred: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

const fetchHandler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url)

  if (url.pathname === "/health") {
    const result = await budgetMiddleware.withBudget(
      "/health",
      SIDECAR_BUDGETS["/health"],
      async () =>
        Response.json({
          status: "ok",
          tools: TOOL_NAMES,
          daemonHealthy: getDaemonHealthy(),
        }),
    )
    if (isDeferred(result)) return deferredResponse()
    return result
  }

  if (url.pathname === "/mcp") {
    const result = await budgetMiddleware.withBudget(
      "/mcp",
      SIDECAR_BUDGETS["/mcp"],
      async () => {
        const sessionId = req.headers.get("mcp-session-id") ?? undefined
        const reqClone = req.clone()
        const sessionResult = await getOrCreateSession(sessionId)
        if (isUnknownSession(sessionResult)) {
          let echoedId: unknown = null
          try {
            const body = (await reqClone.json()) as { id?: unknown }
            if (body && typeof body === "object" && "id" in body) {
              echoedId = (body as { id?: unknown }).id ?? null
            }
          } catch {
            // body unparseable; leave id as null
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32000, message: "Session not found" },
              id: echoedId,
            }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          )
        }
        return sessionResult.transport.handleRequest(req)
      },
    )
    if (isDeferred(result)) return deferredResponse()
    return result
  }

  return new Response("Not Found", { status: 404 })
}

await startSidecar(fetchHandler)
