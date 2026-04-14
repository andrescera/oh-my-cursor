import type { ConversationState, HandlerMap } from "../types"
import type { BackgroundTracker } from "./background-tracker"
import type { WisdomTracker } from "./wisdom-tracker"
import { getOrCreateConversation, resolveConversationId } from "../shared"
import { createEmptyTaskDetector } from "./empty-task-detector"
import { contextCollector } from "../context-collector"
import { loadConfig } from "../config"
import { logEvent } from "../event-logger"
import { appendFileSync } from "node:fs"
import { resolve } from "node:path"

const SUBAGENT_TIMING_LOG = "/tmp/oh-my-cursor-timing.jsonl"

export function createSubagentHandlers(
  _conversations: Map<string, ConversationState>,
  tracker: BackgroundTracker,
  wisdom: WisdomTracker,
): HandlerMap {
  const emptyTaskDetector = createEmptyTaskDetector()

  return {
    "/subagentStart": (input) => {
      const entryMs = Date.now()
      const agentType = ((input.agent_type as string) || (input.subagent_type as string) || "unknown").toLowerCase()
      const agentId = (input.agent_id as string) || agentType + "-" + Date.now()
      const description = (input.description as string) || ""
      const convId = resolveConversationId(input)
      tracker.track(agentId, agentType, description, convId)
      const conversation = getOrCreateConversation(convId)

      let additional_context: string | undefined
      const recentOutcomes = conversation.subagentOutcomes.slice(-5)
      for (let i = recentOutcomes.length - 1; i >= 0; i--) {
        const o = recentOutcomes[i]
        if (o.agentType === agentType && o.status === "failed") {
          const errorContext = o.errorContext || ""
          additional_context = `[task-resume-info] Previous ${agentType} dispatch failed: ${errorContext}. Avoid repeating the same mistake.`
          break
        }
      }

      if (conversation.activePlan) {
        const wisdomContext = wisdom.formatForInjection(conversation.activePlan.path)
        if (wisdomContext) {
          additional_context = additional_context
            ? `${additional_context}\n\n${wisdomContext}`
            : wisdomContext
        }
      }

      const exitMs = Date.now()
      try {
        appendFileSync(
          SUBAGENT_TIMING_LOG,
          JSON.stringify({
            event: "subagentStart",
            agentType,
            agentId,
            entryMs,
            exitMs,
            durationMs: exitMs - entryMs,
            hadAdditionalContext: Boolean(additional_context),
            timestamp: new Date(exitMs).toISOString(),
          }) + "\n",
        )
      } catch {
        void 0
      }

      return additional_context ? { additional_context } : {}
    },

    "/subagentStop": (input) => {
      const entryMs = Date.now()
      const agentId = (input.agent_id as string) || ""
      const convId = resolveConversationId(input)

      if (agentId) {
        tracker.complete(agentId)
      } else {
        const stopType = ((input.agent_type as string) || (input.subagent_type as string) || "").toLowerCase()
        if (stopType) {
          tracker.completeOldestByType(convId, stopType)
        }
      }

      const subagentType = (input.agent_type as string) || (input.subagent_type as string) || ""
      const status = (input.status as string) || ""
      const stopHookActive = Boolean(input.stop_hook_active)
      const loopCount = (input.loop_count as number) || 0
      const conversation = getOrCreateConversation(convId)

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
      conversation.subagentOutcomes.push({
        agentId,
        agentType: typeKey,
        description: (input.description as string) || "",
        status: isSuccess ? "completed" : "failed",
        errorContext: isSuccess ? undefined : (summary || output).slice(0, 500),
        completedAt: new Date().toISOString(),
        durationMs: duration_ms,
      })
      if (conversation.subagentOutcomes.length > 20) {
        conversation.subagentOutcomes = conversation.subagentOutcomes.slice(-20)
      }
      if (isSuccess && conversation.activePlan && output) {
        wisdom.addLearning(conversation.activePlan.path, {
          source: typeKey,
          learning: output.slice(-200).trim(),
          timestamp: new Date().toISOString(),
        })
      }
      if (isSuccess) {
        conversation.subagentFailureCounts[typeKey] = 0
      } else {
        conversation.subagentFailureCounts[typeKey] = (conversation.subagentFailureCounts[typeKey] || 0) + 1
      }

      if ((conversation.subagentFailureCounts[typeKey] || 0) >= 3) {
        const fc = conversation.subagentFailureCounts[typeKey] || 0
        console.warn(
          `[oh-my-cursor/unstable-agent-babysitter] Agent type '${typeKey}' has failed ${fc} times consecutively. Consider using a different agent type or model.`,
        )
        contextCollector.register(convId, {
          id: "unstable-agent",
          source: "unstable-agent-babysitter",
          content: `[unstable-agent] Agent type '${typeKey}' has failed ${fc} times consecutively. Consider using a different agent type or model.`,
          priority: "critical",
        })
        if (fc === 3) {
          const config = loadConfig()
          if (config.notifications.enabled) {
            const scriptDir = resolve(import.meta.dir, "../scripts")
            const notifyScript = resolve(scriptDir, "notify.sh")
            try {
              Bun.spawn([
                "bash",
                notifyScript,
                "oh-my-cursor",
                `Agent type '${typeKey}' failed 3 times in a row. Try another agent or model.`,
                "critical",
              ])
            } catch {
              void 0
            }
          }
        }
      }

      const outputLooksLikeError = /(?:\berror\b|exception|traceback|Error:|\bfailed?\b)/i.test(
        `${output}\n${summary}`,
      )
      if (
        duration_ms !== undefined &&
        duration_ms < 2000 &&
        !isSuccess &&
        outputLooksLikeError
      ) {
        console.warn(
          `[oh-my-cursor/unstable-agent-babysitter] Agent ${typeKey} completed in ${duration_ms}ms with failure status. This may indicate a model or configuration issue.`,
        )
        contextCollector.register(convId, {
          id: "fast-failure",
          source: "unstable-agent-babysitter",
          content: `[fast-failure] Agent ${typeKey} completed in ${duration_ms}ms with failure status. This may indicate a model or configuration issue.`,
          priority: "high",
        })
      }

      if (!stopHookActive) {
        const stopKey = `stop:${subagentType.toLowerCase()}`
        conversation.dispatchCounts[stopKey] = (conversation.dispatchCounts[stopKey] || 0) + 1
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
            Bun.spawn([
              "bash",
              notifyScript,
              "oh-my-cursor",
              `Background task completed: ${subagentType}`,
              "normal",
            ])
          } catch {
            void 0
          }
          logEvent({
            ts: new Date().toISOString(),
            event: "/subagentStop",
            sessionId: convId,
            agentType: subagentType,
            action: "notify",
          })
        }
      }

      const exitMs = Date.now()
      try {
        appendFileSync(
          SUBAGENT_TIMING_LOG,
          JSON.stringify({
            event: "subagentStop",
            agentType: typeKey,
            agentId,
            entryMs,
            exitMs,
            durationMs: exitMs - entryMs,
            subagentDurationMs: duration_ms,
            status,
            timestamp: new Date(exitMs).toISOString(),
          }) + "\n",
        )
      } catch {
        void 0
      }

      return emptyTaskDetector({
        output,
        status: (input.status as string) || "",
      })
    },
  }
}
