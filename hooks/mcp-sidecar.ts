import { startSidecar } from "./mcp/runtime"
import { startDaemonHealthMonitor, getDaemonHealthy } from "./mcp/daemon-health"
import { getOrCreateSession } from "./mcp/server"

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
    const { transport } = await getOrCreateSession(sessionId)
    return transport.handleRequest(req)
  }

  return new Response("Not Found", { status: 404 })
}

await startSidecar(fetchHandler)
