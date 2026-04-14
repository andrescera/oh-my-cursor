import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession, resolveConversationId } from "../shared"

const ABORT_WINDOW_MS = 3000
const CONTINUATION_COOLDOWN_BASE_MS = 30000
const MAX_CONSECUTIVE_FAILURES = 5
const SKIP_AGENTS = new Set(["prometheus", "compaction", "plan"])

const slashCommands: Record<string, string> = {
  "/plan": "[command:plan] Planning workflow. Follow commands/plan.md step sequence.",
  "/start-work": "[command:start-work] Plan execution. Follow commands/start-work.md.",
  "/status": "[command:status] Show current session status and active tasks.",
  "/help": "[command:help] Show available commands.",
  "/agents": "[command:agents] List available agent types and their purposes.",
  "/config": "[command:config] Show or update oh-my-cursor configuration.",
  "/refactor": "[command:refactor] Structured refactoring workflow.",
  "/ulw-loop": "[command:ulw-loop] Ultrawork loop — deep sustained autonomous work.",
  "/handoff": "[command:handoff] Hand off work to another agent or mode.",
  "/briareus": "[command:briareus] Multi-agent parallel execution.",
  "/remove-ai-slops": "[command:remove-ai-slops] Remove AI-generated code smells.",
  "/init-deep": "[command:init-deep] Initialize deep work session.",
  "/cloud-agents": "[command:cloud-agents] Cloud agent management.",
}

const UNKNOWN_SLASH_COMMAND_HINT =
  "[command:unknown] Unknown command. Available: /plan, /start-work, /status, /help, /agents, /config, /refactor, /ulw-loop, /ralph-loop, /stop-continuation, /handoff, /briareus, /remove-ai-slops, /init-deep, /cloud-agents"

export function createContinuationHandlers(
  _sessions: Map<string, SessionState>,
): HandlerMap {
  return {
    "/stop": (input) => {
      const status = (input.status as string) || ""
      const stopHookActive = Boolean(input.stop_hook_active)
      const convId = resolveConversationId(input)
      const session = getOrCreateSession(convId)

      const isAbort = status === "aborted" || Boolean(input.aborted) || Boolean(input.abort_signal)
      if (isAbort) {
        session.abortDetectedAt = Date.now()
      }

      if (session.stoppedAt || stopHookActive || (status && status !== "completed")) {
        return {}
      }

      if (session.abortDetectedAt && Date.now() - session.abortDetectedAt < ABORT_WINDOW_MS) {
        return {}
      }

      const agentType = (input.agent_type as string) || (input.agentType as string) || ""
      if (SKIP_AGENTS.has(agentType) || session.composerMode === "plan") {
        return {}
      }

      if (session.ralphState?.active) {
        const ralph = session.ralphState
        const contextStr = session.contextHistory.join(" ")

        if (contextStr.includes("<promise>DONE</promise>") || contextStr.includes("DONE")) {
          session.ralphState = null
          return {}
        }

        ralph.iteration++
        if (ralph.maxIterations > 0 && ralph.iteration >= ralph.maxIterations) {
          session.ralphState = null
          return {}
        }

        const message = "Continue working. Iteration " + ralph.iteration + "/" + (ralph.maxIterations || "unlimited") + ". When fully done, output <promise>DONE</promise>."
        return {
          followup_message: message,
          decision: "block",
          reason: message,
        }
      }

      const loopCount = typeof input.loop_count === "number" ? input.loop_count : 0
      if (loopCount > 10) {
        if (session.boulderState) session.boulderState.active = false
        return {}
      }

      if (session.continuationCooldownUntil && Date.now() < session.continuationCooldownUntil) {
        return {}
      }

      let hasIncompleteTodos = false
      if (session.todoStates.size > 0) {
        for (const s of session.todoStates.values()) {
          if (s === "pending" || s === "in_progress") {
            hasIncompleteTodos = true
            break
          }
        }
      } else if (session.contextHistory.some((e) => /TodoWrite/i.test(e))) {
        hasIncompleteTodos = true
      }

      if (hasIncompleteTodos) {
        if (!session.boulderState) {
          session.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }
        }

        if (!session.boulderState.active) {
          return {}
        }

        const snapshot = JSON.stringify(
          [...session.todoStates.entries()].sort(([a], [b]) => a.localeCompare(b)),
        )

        if (snapshot === session.lastTodoSnapshot) {
          session.consecutiveContinuationFailures++
        } else {
          session.consecutiveContinuationFailures = 0
          session.lastTodoSnapshot = snapshot
        }

        if (session.consecutiveContinuationFailures >= MAX_CONSECUTIVE_FAILURES) {
          session.boulderState.active = false
          return {}
        }

        if (session.consecutiveContinuationFailures > 0) {
          const backoffMs = CONTINUATION_COOLDOWN_BASE_MS * Math.pow(2, session.consecutiveContinuationFailures)
          session.continuationCooldownUntil = Date.now() + backoffMs
        }

        session.boulderState.failureCount = session.consecutiveContinuationFailures
        session.boulderState.lastContinuationAt = new Date().toISOString()

        let message = "You have incomplete todos. Continue working on them until all are completed or cancelled."
        if (session.activePlan) {
          message = "Continue to the next plan phase" +
            (session.activePlan.phase ? ": " + session.activePlan.phase : "") +
            ". Complete remaining todos before moving on."
        }
        if (session.consecutiveContinuationFailures > 0) {
          message += " (stagnation detected: attempt " + (session.consecutiveContinuationFailures + 1) + "/" + MAX_CONSECUTIVE_FAILURES + ")"
        }

        return {
          followup_message: message,
          decision: "block",
          reason: message,
        }
      }

      return {}
    },

    "/beforeSubmitPrompt": (input) => {
      const userMessage = (input.prompt as string) || (input.user_message as string) || ""
      const convId = resolveConversationId(input)
      const session = getOrCreateSession(convId)

      let additionalContext = [
        "[oh-my-cursor] Identity: Plan=Prometheus | Agent=Orchestrator/Atlas | Debug=Diagnostic | Ask=Advisor",
        "[oh-my-cursor] FORBIDDEN per mode: Plan(Shell,Delete,StrReplace,impl-Tasks) Agent(direct Write/Shell) Debug/Ask(Write,Shell,Task)",
        "[oh-my-cursor] Agent mode: NEVER edit directly, delegate ALL via Task",
      ].join("\n")

      if (session.stoppedAt) {
        session.stoppedAt = null
      }

      const lowerMsg = userMessage.toLowerCase()

      const isPlanMode = lowerMsg.includes("/plan") || session.composerMode === "plan"
      const isAgentMode = session.composerMode === "agent" || (!session.composerMode && !isPlanMode)

      if (isPlanMode) {
        session.composerMode = "plan"
        additionalContext += "\n[mode:plan] Prometheus execution loop active." +
          " Clearance checklist triggers: 3+ files, migrations, public API, security, cross-module." +
          " Auto-transition: once plan approved, switch to Agent mode for execution."
        if (!userMessage.startsWith("/plan")) {
          additionalContext += "\n[command:plan] Planning workflow. Follow commands/plan.md step sequence. Register plan-phase todos if not already present."
        }
      }

      if (isAgentMode && session.activePlan) {
        additionalContext += "\n[mode:agent+plan] Atlas coordination active." +
          " Active plan: " + session.activePlan.path +
          (session.activePlan.phase ? " | Phase: " + session.activePlan.phase : "") +
          ". Follow plan phases sequentially. Mark completed tasks."
      }

      if (/\b(analyze|investigate|examine|research)\b/i.test(userMessage)) {
        additionalContext +=
          "\n[mode:analysis] Deep analysis mode. Gather evidence systematically before drawing conclusions. Use multiple explore agents for different angles. Cite specific code references."
      }

      if (/\b(search|find|where is|how does)\b/i.test(userMessage)) {
        additionalContext +=
          "\n[mode:search] Parallel search mode. Fire Task(explore) agents for codebase searches. Batch related queries. Report file paths and line numbers. Cross-reference findings."
      }

      if (lowerMsg.includes("ultrawork") || lowerMsg.includes("ulw")) {
        if (session.composerMode === "plan") {
          additionalContext +=
            "\n[mode:ultrawork-filtered] Ultrawork keyword detected but Plan mode is active. Focus on planning, not execution."
        } else {
          additionalContext +=
            "\n[mode:ultrawork] Deep sustained autonomous work mode active. Work relentlessly until fully complete. Use parallel agents aggressively — fire explore/librarian for context, delegate via Task for implementation. Do not stop mid-task. Do not ask permission between steps. Self-verify with ReadLints and tests. When fully done, output <promise>DONE</promise>."
        }
      }

      if (
        /\breason\s+through\b|\bthink\s+step\s+by\s+step\b|\bthink\s+harder\b|\bthink\s+deeply\b|\bthink\b/i.test(
          userMessage,
        )
      ) {
        additionalContext +=
          "\n[mode:think] Extended reasoning requested. Take extra time for step-by-step analysis. Consider edge cases, failure modes, and alternative approaches before acting."
      }

      if (userMessage.startsWith("/ralph-loop") || userMessage.startsWith("/ralph")) {
        const maxMatch = userMessage.match(/--max-iterations\s+(\d+)/)
        const maxIter = maxMatch ? parseInt(maxMatch[1]) : 0
        session.ralphState = {
          active: true,
          iteration: 0,
          maxIterations: maxIter,
          startedAt: new Date().toISOString(),
        }
        additionalContext += "\n[ralph-loop] Ralph loop activated. Work until done, then output <promise>DONE</promise>."
      }

      if (userMessage.startsWith("/stop-continuation") || userMessage.startsWith("/cancel-ralph")) {
        session.stoppedAt = new Date().toISOString()
        session.ralphState = null
        session.boulderState = null
        additionalContext += "\n[stop] Continuation loops stopped. Returning to normal chat."
      }

      let matchedMappedSlashCommand = false
      for (const [cmd, ctx] of Object.entries(slashCommands)) {
        if (userMessage.startsWith(cmd)) {
          additionalContext += "\n" + ctx
          matchedMappedSlashCommand = true
        }
      }

      if (userMessage.startsWith("/start-work")) {
        const ap = session.activePlan
        if (ap && ap.completedTasks.length > 0) {
          const phaseLabel = ap.phase || "(none)"
          additionalContext +=
            "\n[start-work:resume] Resuming plan: " +
            ap.path +
            ". Completed tasks: " +
            ap.completedTasks.join(", ") +
            ". Current phase: " +
            phaseLabel +
            ". Continue from where you left off — do not redo completed tasks."
        } else if (ap) {
          additionalContext +=
            "\n[start-work:fresh] Starting plan: " +
            ap.path +
            ". No tasks completed yet. Begin from Wave 1."
        } else {
          additionalContext +=
            "\n[start-work:discover] No active plan in session. Read .cursor/plans/ to find the most recent plan, then begin execution."
        }
      }

      if (
        userMessage.startsWith("/") &&
        !userMessage.startsWith("/ralph-loop") &&
        !userMessage.startsWith("/ralph") &&
        !userMessage.startsWith("/stop-continuation") &&
        !userMessage.startsWith("/cancel-ralph") &&
        !matchedMappedSlashCommand
      ) {
        additionalContext += "\n" + UNKNOWN_SLASH_COMMAND_HINT
      }

      if (additionalContext) {
        const trimmed = additionalContext.trim()
        return {
          continue: true,
          user_message: userMessage + "\n\n" + trimmed,
          additional_context: trimmed,
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: trimmed,
          },
        }
      }

      return {}
    },
  }
}
