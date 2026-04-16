import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { register as registerLookAt } from "./tools/look-at"
import { register as registerInteractiveBash } from "./tools/interactive-bash"
import { register as registerSkillMcp } from "./tools/skill-mcp"
import { register as registerGetDispatchStats } from "./tools/get-dispatch-stats"
import { register as registerSessionTranscripts } from "./tools/session-transcripts"
import { register as registerDaemonLogs } from "./tools/daemon-logs"
import { register as registerSessionLog } from "./tools/session-log"
import { register as registerOhMyCursorStatus } from "./tools/oh-my-cursor-status"
import { register as registerDashboard } from "./resources/dashboard"

export function registerAll(server: McpServer): void {
  registerLookAt(server)
  registerInteractiveBash(server)
  registerSkillMcp(server)
  registerGetDispatchStats(server)
  registerSessionTranscripts(server)
  registerDaemonLogs(server)
  registerSessionLog(server)
  registerOhMyCursorStatus(server)
  registerDashboard(server)
}
