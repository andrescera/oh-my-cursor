import { startSidecar } from "./mcp/runtime"
import { startDaemonHealthMonitor, getDaemonHealthy } from "./mcp/daemon-health"
import { getOrCreateSession, isUnknownSession } from "./mcp/server"

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

startDaemonHealthMonitor()

const fetchHandler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url)

  if (url.pathname === "/health") {
    return Response.json({
      status: "ok",
      tools: TOOL_NAMES,
      daemonHealthy: getDaemonHealthy(),
    })
  }

  if (url.pathname === "/mcp") {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined
    const reqClone = req.clone()
    const result = await getOrCreateSession(sessionId)
    if (isUnknownSession(result)) {
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
    return result.transport.handleRequest(req)
  }

  return new Response("Not Found", { status: 404 })
}

await startSidecar(fetchHandler)
