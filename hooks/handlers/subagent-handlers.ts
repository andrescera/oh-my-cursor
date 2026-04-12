import type { SessionState, HandlerMap } from "../types"
import type { BackgroundTracker } from "./background-tracker"
import { getOrCreateSession } from "../shared"
import { writeContextRule } from "../scripts/context-injector"
import { createEmptyTaskDetector } from "./empty-task-detector"
import { loadConfig } from "../config"
import { logEvent } from "../event-logger"
import { resolve } from "node:path"

export function createSubagentHandlers(
  _sessions: Map<string, SessionState>,
  tracker: BackgroundTracker,
): HandlerMap {
  const emptyTaskDetector = createEmptyTaskDetector()

  return {
    "/subagentStart": (input) => {
      const agentType = (input.agent_type as string) || (input.subagent_type as string) || "unknown"
      const agentId = (input.agent_id as string) || agentType + "-" + Date.now()
      const description = (input.description as string) || ""
      tracker.track(agentId, agentType, description)

      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      const projectDir = session.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()
      writeContextRule(projectDir, {
        sessionId: convId,
        projectDir,
        activeAgents: Object.keys(session.dispatchCounts).filter(k => k.startsWith("subagent:")),
        recentTools: session.contextHistory.slice(-5).map(e => e.split(" ").pop() || ""),
        lastUpdated: new Date().toISOString(),
        toolCallCount: session.toolCallCount,
        errorCount: session.errorCount,
        compactionEpoch: session.lastCompactionEpoch,
        dispatchSummary: session.dispatchCounts,
      }).catch((err) => console.error("[oh-my-cursor] Failed to update context rule:", err))

      return {}
    },

    "/subagentStop": (input) => {
      const agentId = (input.agent_id as string) || ""
      if (agentId) {
        tracker.complete(agentId)
      }

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

      const isBackground = Boolean(input.is_background) || ["explore", "librarian"].includes(subagentType.toLowerCase())
      if (isBackground) {
        const config = loadConfig()
        if (config.notifications.enabled) {
          const scriptDir = resolve(import.meta.dir, "../scripts")
          const notifyScript = resolve(scriptDir, "notify.sh")
          try {
            Bun.spawn(["bash", notifyScript, "oh-my-cursor", `Background task completed: ${subagentType}`])
          } catch {}
          logEvent({
            ts: new Date().toISOString(),
            event: "/subagentStop",
            sessionId: convId,
            agentType: subagentType,
            action: "notify",
          })
        }
      }

      return emptyTaskDetector({
        output: (input.output as string) || "",
        status: (input.status as string) || "",
      })
    },
  }
}
