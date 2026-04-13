import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession } from "../shared"

export function createContinuationHandlers(
  _sessions: Map<string, SessionState>,
): HandlerMap {
  return {
    "/stop": (input) => {
      const status = (input.status as string) || ""
      const stopHookActive = Boolean(input.stop_hook_active)
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      if (session.stoppedAt || stopHookActive || (status && status !== "completed")) {
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

        if (session.consecutiveContinuationFailures >= 5) {
          session.boulderState.active = false
          return {}
        }

        if (session.consecutiveContinuationFailures >= 3) {
          const backoffMs = 5000 * Math.pow(2, session.consecutiveContinuationFailures)
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
          message += " (stagnation detected: attempt " + (session.consecutiveContinuationFailures + 1) + "/5)"
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
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
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
        additionalContext += "\n[mode:plan] Prometheus execution loop active." +
          " Clearance checklist triggers: 3+ files, migrations, public API, security, cross-module." +
          " Auto-transition: once plan approved, switch to Agent mode for execution."
      }

      if (isAgentMode && session.activePlan) {
        additionalContext += "\n[mode:agent+plan] Atlas coordination active." +
          " Active plan: " + session.activePlan.path +
          (session.activePlan.phase ? " | Phase: " + session.activePlan.phase : "") +
          ". Follow plan phases sequentially. Mark completed tasks."
      }

      if (/\b(analyze|investigate|examine|research)\b/i.test(userMessage)) {
        additionalContext += "\n[mode:analysis] Analysis mode detected. Gather evidence before conclusions. Cite specific files and line numbers. Structure findings systematically."
      }

      if (/\b(search|find|where is|how does)\b/i.test(userMessage)) {
        additionalContext += "\n[mode:search] Search mode detected. Use explore agents for broad searches. Batch related searches. Report file paths and line numbers."
      }

      if (lowerMsg.includes("ultrawork") || lowerMsg.includes("ulw")) {
        additionalContext += "\n[mode:ultrawork] Deep sustained work mode. Work autonomously until fully complete. Use the ralph-loop pattern: iterate, verify, continue until <promise>DONE</promise>."
      }

      if (/\bthink\b|\bthink harder\b|\bthink deeply\b/i.test(userMessage)) {
        additionalContext += "\n[mode:think] Extended reasoning requested. Take extra time to analyze, consider edge cases, and reason step by step before acting."
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
