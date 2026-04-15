import type { ConversationState, HandlerMap } from "../types"
import { getOrCreateConversation, resolveConversationId } from "../shared"
import { loadConfig } from "../config"
import { contextCollector } from "../context-collector"
import { buildCompactionContextPrompt } from "../compaction-context-prompt"

function buildCompactionTodoPreservation(conversation: ConversationState): string {
  const lines: string[] = [
    "[todo-preservation] Preserved todo states from before compaction:",
  ]
  for (const [id, status] of [...conversation.todoStates.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push("- " + id + ": " + status)
  }
  if (conversation.activePlan) {
    const p = conversation.activePlan
    let planLine =
      "[active-plan] path: " +
      p.path +
      " | phase: " +
      p.phase
    if (p.completedTasks.length > 0) {
      planLine += " | completedTasks: " + p.completedTasks.join(", ")
    }
    lines.push(planLine)
  }
  if (conversation.composerMode) {
    lines.push("[composer-mode] " + conversation.composerMode)
  }
  return lines.join("\n")
}

export function createConversationHandlers(
  conversations: Map<string, ConversationState>,
  getPort: () => number,
  tracker: BackgroundTracker,
): HandlerMap {
  return {
    "/health": (input) => {
      const TWO_HOURS = 2 * 60 * 60 * 1000
      const now = Date.now()
      for (const [id, conversation] of conversations) {
        const age = now - new Date(conversation.startedAt).getTime()
        if (age > TWO_HOURS) {
          conversations.delete(id)
        }
      }

      const filterConvId = (input.conversation as string) || ""
      const scope = filterConvId
        ? (conversations.has(filterConvId) ? [[filterConvId, conversations.get(filterConvId)!]] as [string, ConversationState][] : [])
        : Array.from(conversations.entries())

      let totalToolCalls = 0
      let exploreCounts = 0
      let workerCounts = 0
      let ralphActive = false

      for (const [, conversation] of scope) {
        totalToolCalls += conversation.toolCallCount
        exploreCounts += conversation.dispatchCounts["subagent:explore"] || 0
        workerCounts +=
          (conversation.dispatchCounts["subagent:general-purpose"] || 0) +
          (conversation.dispatchCounts["subagent:generalpurpose"] || 0) +
          (conversation.dispatchCounts["subagent:sisyphus"] || 0) +
          (conversation.dispatchCounts["subagent:sisyphus-junior"] || 0) +
          (conversation.dispatchCounts["subagent:hephaestus"] || 0) +
          (conversation.dispatchCounts["subagent:atlas"] || 0) +
          (conversation.dispatchCounts["subagent:oracle"] || 0) +
          (conversation.dispatchCounts["subagent:prometheus"] || 0) +
          (conversation.dispatchCounts["subagent:metis"] || 0) +
          (conversation.dispatchCounts["subagent:momus"] || 0) +
          (conversation.dispatchCounts["subagent:librarian"] || 0) +
          (conversation.dispatchCounts["subagent:multimodal-looker"] || 0)
        if (conversation.ralphState?.active) ralphActive = true
      }

      const allDispatchCounts: Record<string, number> = {}
      for (const [, conversation] of scope) {
        for (const [key, val] of Object.entries(conversation.dispatchCounts)) {
          allDispatchCounts[key] = (allDispatchCounts[key] || 0) + val
        }
      }

      return {
        status: "ok",
        conversations: conversations.size,
        conversationCount: scope.length,
        uptime: process.uptime(),
        toolCalls: totalToolCalls,
        exploreCounts,
        workerCounts,
        ralphActive,
        allDispatchCounts,
      }
    },

    "/sessionStart": (input) => {
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId)
      const projectDir = ((input.workspace_roots as string[])?.[0]) || (input.cwd as string) || process.cwd()

      conversation.env.OH_MY_CURSOR_SESSION_ID = convId
      conversation.env.OH_MY_CURSOR_PROJECT_DIR = projectDir

      const contextStr = [
        "## oh-my-cursor Context",
        "",
        `Session: ${convId}`,
        `Project: ${projectDir}`,
        `Started: ${conversation.startedAt}`,
        "",
        "**Identity (mandatory, by Cursor mode):** Plan→Prometheus (strategic planner; say \"I am Prometheus\" if asked). Agent→Orchestrator/Atlas when a plan exists (pure dispatcher). Debug→diagnose; suggest fixes, do not apply. Ask→advisor; read-only.",
        "**Forbidden tools:** Plan→Shell, Delete, StrReplace, Task(sisyphus/hephaestus/sisyphus-junior/atlas). Agent→direct Write/StrReplace/Delete/Shell (delegate all implementation via Task). Debug→Write, Shell, StrReplace, Delete, Task(non-explore). Ask→Write, Shell, StrReplace, Delete, Task.",
        "**Agent mode:** Never edit files directly; all implementation via Task using the 6-section brief. Routing, limits, workflows: `orchestrator.mdc` + `orchestrator-reference.mdc`.",
      ].join("\n")

      const currentPort = getPort()
      const daemonPort = String(currentPort)
      const sidecarPort = String(currentPort + 1)

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
      const convId = resolveConversationId(input)
      if (!conversations.has(convId)) {
        console.warn(`[oh-my-cursor][sessionEnd] Cleanup for unknown conversation ${convId} — possible ID mismatch`)
      }
      contextCollector.clear(convId)
      tracker.clearConversation(convId)
      conversations.delete(convId)

      return {}
    },

    "/preCompact": (input) => {
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId)

      conversation.lastCompactionEpoch++
      conversation.compactionSnapshot = {
        epoch: conversation.lastCompactionEpoch,
        toolCallCount: conversation.toolCallCount,
        dispatchCounts: { ...conversation.dispatchCounts },
        timestamp: new Date().toISOString(),
      }
      conversation.injectedPaths.clear()
      conversation.reminderInjected = false
      conversation.recentToolTrail = []
      conversation.toolCallsSinceTaskDispatch = 0

      contextCollector.clear(convId)

      const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
      if (config.compaction.prompt_enabled) {
        contextCollector.register(convId, {
          id: "compaction-prompt",
          source: "compaction-context-injector",
          content: buildCompactionContextPrompt(conversation),
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
          `Tool calls: ${conversation.toolCallCount}`,
          `Errors: ${conversation.errorCount}`,
          `Compaction epoch: ${conversation.lastCompactionEpoch}`,
          `Dispatches: ${JSON.stringify(conversation.dispatchCounts)}`,
        ]
        if (conversation.ralphState?.active) {
          snapshotLines.push(`Ralph loop: active (iteration ${conversation.ralphState.iteration})`)
        }
        if (conversation.boulderState?.active) {
          snapshotLines.push(`Boulder: active (failures ${conversation.boulderState.failureCount})`)
        }

        contextCollector.register(convId, {
          id: "conversation-snapshot",
          source: "conversation-snapshot",
          content: snapshotLines.join("\n"),
          priority: "high",
        })

        contextCollector.register(convId, {
          id: "todo-preservation",
          source: "compaction-todo-preserver",
          content: buildCompactionTodoPreservation(conversation),
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
