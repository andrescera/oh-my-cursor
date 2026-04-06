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

      if (session.contextHistory.length > 0) {
        const hasIncompleteTodos = session.contextHistory.some(
          (entry) => /TodoWrite|in_progress|pending/i.test(entry),
        )
        if (hasIncompleteTodos) {
          if (!session.boulderState) {
            session.boulderState = { active: true, failureCount: 0, lastContinuationAt: null, stagnationCount: 0 }
          }
          session.boulderState.lastContinuationAt = new Date().toISOString()
          const message = "You have incomplete todos. Continue working on them until all are completed or cancelled."
          return {
            followup_message: message,
            decision: "block",
            reason: message,
          }
        }
      }

      return {}
    },

    "/beforeSubmitPrompt": (input) => {
      const userMessage = (input.prompt as string) || (input.user_message as string) || ""
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      let additionalContext = ""

      if (session.stoppedAt) {
        session.stoppedAt = null
      }

      const lowerMsg = userMessage.toLowerCase()
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
        return {
          continue: true,
          additional_context: additionalContext.trim(),
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: additionalContext.trim(),
          },
        }
      }

      return {}
    },
  }
}
