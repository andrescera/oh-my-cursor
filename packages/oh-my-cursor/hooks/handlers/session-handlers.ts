import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession } from "../shared"
import { writeContextRule, clearContextRule } from "../scripts/context-injector"

export function createSessionHandlers(
  sessions: Map<string, SessionState>,
  _port: number,
): HandlerMap {
  return {
    "/health": () => {
      const TWO_HOURS = 2 * 60 * 60 * 1000
      const now = Date.now()
      for (const [id, session] of sessions) {
        if (now - new Date(session.startedAt).getTime() > TWO_HOURS && !session.ralphState?.active) {
          sessions.delete(id)
        }
      }

      let totalToolCalls = 0
      let exploreCounts = 0
      let workerCounts = 0
      let ralphActive = false
      let currentSessionId = ""

      for (const [id, session] of sessions) {
        currentSessionId = id
        totalToolCalls += session.toolCallCount
        exploreCounts += session.dispatchCounts["subagent:explore"] || 0
        workerCounts +=
          (session.dispatchCounts["subagent:general-purpose"] || 0) +
          (session.dispatchCounts["subagent:generalpurpose"] || 0) +
          (session.dispatchCounts["subagent:sisyphus"] || 0) +
          (session.dispatchCounts["subagent:sisyphus-junior"] || 0) +
          (session.dispatchCounts["subagent:hephaestus"] || 0) +
          (session.dispatchCounts["subagent:atlas"] || 0) +
          (session.dispatchCounts["subagent:oracle"] || 0) +
          (session.dispatchCounts["subagent:prometheus"] || 0) +
          (session.dispatchCounts["subagent:metis"] || 0) +
          (session.dispatchCounts["subagent:momus"] || 0)
        if (session.ralphState?.active) ralphActive = true
      }

      const allDispatchCounts: Record<string, number> = {}
      for (const [, session] of sessions) {
        for (const [key, val] of Object.entries(session.dispatchCounts)) {
          allDispatchCounts[key] = (allDispatchCounts[key] || 0) + val
        }
      }

      return {
        status: "ok",
        sessions: sessions.size,
        uptime: process.uptime(),
        toolCalls: totalToolCalls,
        exploreCounts,
        workerCounts,
        ralphActive,
        currentSessionId,
        allDispatchCounts,
      }
    },

    "/sessionStart": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)
      const projectDir = ((input.workspace_roots as string[])?.[0]) || (input.cwd as string) || process.cwd()

      session.env.OH_MY_CURSOR_SESSION_ID = convId
      session.env.OH_MY_CURSOR_PROJECT_DIR = projectDir

      writeContextRule(projectDir, {
        sessionId: convId,
        projectDir,
        activeAgents: [],
        recentTools: [],
        lastUpdated: new Date().toISOString(),
      }).catch((err) => console.error("[oh-my-cursor] Failed to write context rule:", err))

      const contextStr = [
        "## oh-my-cursor Context",
        "",
        `Session: ${convId}`,
        `Project: ${projectDir}`,
        `Started: ${session.startedAt}`,
        "",
        "You are operating within the oh-my-cursor multi-agent orchestration system.",
        "Follow the orchestrator rule for all task delegation.",
      ].join("\n")

      return {
        additional_context: contextStr,
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: contextStr,
        },
      }
    },

    "/sessionEnd": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      sessions.delete(convId)

      const projectDir = ((input.workspace_roots as string[])?.[0]) || (input.cwd as string) || process.cwd()
      clearContextRule(projectDir).catch((err) => console.error("[oh-my-cursor] Failed to clear context rule:", err))

      return {}
    },

    "/preCompact": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      session.lastCompactionEpoch++
      session.compactionSnapshot = {
        epoch: session.lastCompactionEpoch,
        toolCallCount: session.toolCallCount,
        dispatchCounts: { ...session.dispatchCounts },
        timestamp: new Date().toISOString(),
      }
      session.injectedPaths.clear()
      session.reminderInjected = false

      return {}
    },
  }
}
