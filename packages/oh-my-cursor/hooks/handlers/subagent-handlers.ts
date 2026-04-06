import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession } from "../shared"
import { writeContextRule } from "../scripts/context-injector"

export function createSubagentHandlers(
  _sessions: Map<string, SessionState>,
): HandlerMap {
  return {
    "/subagentStart": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      const projectDir = session.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()
      writeContextRule(projectDir, {
        sessionId: convId,
        projectDir,
        activeAgents: Object.keys(session.dispatchCounts).filter(k => k.startsWith("subagent:")),
        recentTools: session.contextHistory.slice(-5).map(e => e.split(" ").pop() || ""),
        lastUpdated: new Date().toISOString(),
      }).catch((err) => console.error("[oh-my-cursor] Failed to update context rule:", err))

      return {}
    },

    "/subagentStop": (input) => {
      const subagentType = (input.agent_type as string) || (input.subagent_type as string) || ""
      const status = (input.status as string) || ""
      const stopHookActive = Boolean(input.stop_hook_active)
      const loopCount = (input.loop_count as number) || 0
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      if (!stopHookActive) {
        const stopKey = `stop:${subagentType.toLowerCase()}`
        session.dispatchCounts[stopKey] = (session.dispatchCounts[stopKey] || 0) + 1
      }

      if (loopCount > 0) {
        console.log(`[oh-my-cursor] Subagent ${subagentType} stopped after ${loopCount} loops (status: ${status})`)
      }

      return {}
    },
  }
}
