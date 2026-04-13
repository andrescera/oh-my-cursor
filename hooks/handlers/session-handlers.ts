import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession } from "../shared"
import { loadConfig } from "../config"
import { contextCollector } from "../context-collector"
import { COMPACTION_CONTEXT_PROMPT } from "../compaction-context-prompt"
import { cleanupSafetySession } from "./safety-handlers"
import { cleanupToolGuardSession } from "./tool-guard-handlers"

export function createSessionHandlers(
  sessions: Map<string, SessionState>,
  port: number,
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

      const contextStr = [
        "## oh-my-cursor Context",
        "",
        `Session: ${convId}`,
        `Project: ${projectDir}`,
        `Started: ${session.startedAt}`,
        "",
        "## Identity (MANDATORY — overrides default assistant behavior)",
        "",
        "Your identity is set by the active Cursor mode. This is not optional.",
        "- Plan mode: You are Prometheus, the strategic planner. Answer 'I am Prometheus' to identity questions.",
        "- Agent mode: You are the Orchestrator (Atlas when a plan exists). You are a pure dispatcher.",
        "- Debug mode: You are a diagnostic specialist. Suggest fixes, do not apply.",
        "- Ask mode: You are an advisor. Read-only, no modifications.",
        "",
        "## Forbidden Tools (MANDATORY — per active mode)",
        "",
        "- Plan: FORBIDDEN Shell, Delete, StrReplace, Task(sisyphus/hephaestus/sisyphus-junior/atlas)",
        "- Agent: FORBIDDEN direct Write/StrReplace/Delete/Shell — delegate ALL implementation via Task",
        "- Debug/Ask: FORBIDDEN Write, Shell, StrReplace, Delete, Task",
        "",
        "## Delegation (Agent mode)",
        "",
        "NEVER edit files directly. ALL implementation goes through Task dispatches using the 6-section brief format.",
        "Read orchestrator.mdc for routing tables, dispatch limits, and detailed workflows.",
      ].join("\n")

      const daemonPort = String(port)
      const sidecarPort = String(port + 1)

      return {
        additional_context: contextStr,
        env: {
          OH_MY_CURSOR_SESSION_ID: convId,
          OH_MY_CURSOR_PROJECT_DIR: projectDir,
          OH_MY_CURSOR_DAEMON_PORT: daemonPort,
          OH_MY_CURSOR_SIDECAR_PORT: sidecarPort,
        },
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: contextStr,
        },
      }
    },

    "/sessionEnd": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      contextCollector.clear(convId)
      cleanupSafetySession(convId)
      cleanupToolGuardSession(convId)
      sessions.delete(convId)

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
      session.recentToolTrail = []
      session.toolCallsSinceTaskDispatch = 0

      contextCollector.clear(convId)

      const config = loadConfig()
      if (config.compaction.prompt_enabled) {
        contextCollector.register(convId, {
          id: "compaction-prompt",
          source: "compaction-context-injector",
          content: COMPACTION_CONTEXT_PROMPT,
          priority: "critical",
        })

        contextCollector.register(convId, {
          id: "persona-constraints",
          source: "persona-enforcement",
          content: [
            "[persona-constraints] Identity: Plan=Prometheus | Agent=Orchestrator/Atlas | Debug=Diagnostic | Ask=Advisor",
            "[persona-constraints] FORBIDDEN per mode: Plan(Shell,Delete,StrReplace,impl-Tasks) Agent(direct Write/Shell) Debug/Ask(Write,Shell,Task)",
            "[persona-constraints] Agent mode: NEVER edit directly, delegate ALL via Task",
          ].join("\n"),
          priority: "critical",
        })

        const snapshotLines = [
          "[session-snapshot]",
          `Tool calls: ${session.toolCallCount}`,
          `Errors: ${session.errorCount}`,
          `Compaction epoch: ${session.lastCompactionEpoch}`,
          `Dispatches: ${JSON.stringify(session.dispatchCounts)}`,
        ]
        if (session.ralphState?.active) {
          snapshotLines.push(`Ralph loop: active (iteration ${session.ralphState.iteration})`)
        }
        if (session.boulderState?.active) {
          snapshotLines.push(`Boulder: active (failures ${session.boulderState.failureCount})`)
        }

        contextCollector.register(convId, {
          id: "session-snapshot",
          source: "session-snapshot",
          content: snapshotLines.join("\n"),
          priority: "high",
        })
      }

      const pending = contextCollector.consume(convId)
      if (pending.hasContent) {
        const maxChars = config.context_collector.max_context_chars
        const merged =
          pending.merged.length > maxChars
            ? pending.merged.slice(0, maxChars) +
              "\n\n[oh-my-cursor: additional context truncated to max_context_chars]"
            : pending.merged
        return {
          user_message: merged,
          hookSpecificOutput: { hookEventName: "PreCompact", additionalContext: merged },
        }
      }

      return {}
    },
  }
}
