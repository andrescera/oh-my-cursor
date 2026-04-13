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

      let additional_context: string | undefined
      const recentOutcomes = session.subagentOutcomes.slice(-5)
      for (let i = recentOutcomes.length - 1; i >= 0; i--) {
        const o = recentOutcomes[i]
        if (o.agentType === agentType && o.status === "failed") {
          const errorContext = o.errorContext || ""
          additional_context = `[task-resume-info] Previous ${agentType} dispatch failed: ${errorContext}. Avoid repeating the same mistake.`
          break
        }
      }

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

      return additional_context ? { additional_context } : {}
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

      const summary = (input.summary as string) || ""
      const duration_ms = typeof input.duration_ms === "number" ? input.duration_ms : undefined
      const modified_files = Array.isArray(input.modified_files) ? (input.modified_files as string[]) : []
      const agent_transcript_path = (input.agent_transcript_path as string) || ""
      const message_count = typeof input.message_count === "number" ? input.message_count : 0
      const tool_call_count = typeof input.tool_call_count === "number" ? input.tool_call_count : 0
      void modified_files
      void agent_transcript_path
      void message_count
      void tool_call_count
      const output = (input.output as string) || ""
      const isSuccess = status === "completed" || status === ""
      const typeKey = subagentType || "unknown"
      session.subagentOutcomes.push({
        agentId,
        agentType: typeKey,
        description: (input.description as string) || "",
        status: isSuccess ? "completed" : "failed",
        errorContext: isSuccess ? undefined : (summary || output).slice(0, 500),
        completedAt: new Date().toISOString(),
        durationMs: duration_ms,
      })
      if (session.subagentOutcomes.length > 20) {
        session.subagentOutcomes = session.subagentOutcomes.slice(-20)
      }
      if (isSuccess) {
        session.subagentFailureCounts[typeKey] = 0
      } else {
        session.subagentFailureCounts[typeKey] = (session.subagentFailureCounts[typeKey] || 0) + 1
      }

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
        output,
        status: (input.status as string) || "",
      })
    },
  }
}
