import type { ConversationState, HandlerMap } from "../types"
import { getOrCreateConversation, resolveConversationId, PLAN_PHASE_IDS, transitionFromPlanMode } from "../shared"
import { loadConfig } from "../config"
import { resolve } from "node:path"
import { existsSync } from "node:fs"

function sendOsNotification(title: string, message: string, urgency: "low" | "normal" | "critical") {
  const config = loadConfig()
  if (!config.notifications.enabled) return
  const notifyScript = resolve(import.meta.dir, "../scripts", "notify.sh")
  try {
    Bun.spawn(["bash", notifyScript, title, message, urgency])
  } catch {
    void 0
  }
}

const ABORT_WINDOW_MS = 3000
const SKIP_AGENTS = new Set(["prometheus", "compaction"])

const slashCommands: Record<string, string> = {
  "/plan": "[command:plan] Planning workflow. Follow commands/plan.md step sequence.",
  "/start-work": "[command:start-work] Plan execution. Follow commands/start-work.md.",
  "/status": "[command:status] Show current conversation status and active tasks.",
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

function detectPlanMode(input: Record<string, unknown>, conversation: ConversationState, userMessage: string): boolean {
  const inputMode = (input.mode as string) || (input.composer_mode as string) || (input.composerMode as string) || ""
  if (inputMode && inputMode !== "plan") {
    console.log(`[oh-my-cursor][detectPlanMode] branch=inputModeBlocks | inputMode="${inputMode}" | RESULT=false`)
    return false
  }

  if (inputMode === "plan") {
    console.log(`[oh-my-cursor][detectPlanMode] branch=inputModePlan | RESULT=true`)
    return true
  }

  const lowerMsg = userMessage.toLowerCase().trimStart()
  const cursorCommands = (input.cursor_commands as string) || (input.system_instructions as string) || ""
  if (lowerMsg.startsWith("/plan")) {
    console.log(`[oh-my-cursor][detectPlanMode] branch=msgStartsPlan | RESULT=true`)
    return true
  }

  const planTodosPresent = PLAN_PHASE_IDS.some((id) => conversation.todoStates.has(id))
  if (planTodosPresent) {
    const allDone = PLAN_PHASE_IDS.every((id) => {
      const status = conversation.todoStates.get(id)
      return !status || status === "completed" || status === "cancelled"
    })
    if (allDone) {
      console.log(`[oh-my-cursor][detectPlanMode] branch=planTodosAllDone | RESULT=false`)
      return false
    }
  }

  if (conversation.composerMode === "plan") {
    console.log(`[oh-my-cursor][detectPlanMode] branch=composerModeSticky | RESULT=true`)
    return true
  }

  if (cursorCommands.toLowerCase().includes("/plan") || cursorCommands.toLowerCase().includes("plan mode")) {
    console.log(`[oh-my-cursor][detectPlanMode] branch=cursorCommandsPlan | RESULT=true`)
    return true
  }

  if (!conversation.composerMode) {
    for (const phaseId of PLAN_PHASE_IDS) {
      if (conversation.todoStates.has(phaseId)) {
        console.log(`[oh-my-cursor][detectPlanMode] branch=planPhaseTodoFallback | composerMode=null | phaseId=${phaseId} | RESULT=true`)
        return true
      }
    }
  }

  if (!conversation.composerMode && conversation.contextHistory.some(e => /plan-draft|plan-explore|plan-interview|plan-metis|plan-write|plan-review|plan-decisions|plan-momus|plan-handoff/i.test(e))) {
    console.log(`[oh-my-cursor][detectPlanMode] branch=contextHistoryFallback | composerMode=null | RESULT=true`)
    return true
  }

  console.log(`[oh-my-cursor][detectPlanMode] inputMode="${inputMode}" | msgStartsPlan=${lowerMsg.startsWith("/plan")} | composerModeSticky=${conversation.composerMode === "plan"} | cursorCommandsPlan=${cursorCommands.toLowerCase().includes("/plan")} | planTodosPresent=${planTodosPresent} | contextHistoryFallback=${!conversation.composerMode && conversation.contextHistory.some(e => /plan-draft|plan-explore|plan-interview|plan-metis|plan-write|plan-review|plan-decisions|plan-momus|plan-handoff/i.test(e))} | RESULT=false`)
  return false
}

export function createContinuationHandlers(
  _conversations: Map<string, ConversationState>,
): HandlerMap {
  return {
    "/stop": (input) => {
      const status = (input.status as string) || ""
      const stopHookActive = Boolean(input.stop_hook_active)
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId)

      const isAbort = status === "aborted" || Boolean(input.aborted) || Boolean(input.abort_signal)
      if (isAbort) {
        conversation.abortDetectedAt = Date.now()
      }

      if (conversation.stoppedAt || stopHookActive || (status && status !== "completed")) {
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=stoppedOrHookOrStatus`)
        return {}
      }

      if (conversation.abortDetectedAt && Date.now() - conversation.abortDetectedAt < ABORT_WINDOW_MS) {
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=abortWindow`)
        return {}
      }

      const agentType = (input.agent_type as string) || (input.agentType as string) || ""
      if (SKIP_AGENTS.has(agentType)) {
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=skipAgent`)
        return {}
      }

      if (conversation.ralphState?.active) {
        const ralph = conversation.ralphState
        const contextStr = conversation.contextHistory.join(" ")

        if (contextStr.includes("<promise>DONE</promise>") || contextStr.includes("DONE")) {
          conversation.ralphState = null
          console.log(`[oh-my-cursor][/stop] RESULT=noop reason=ralphDone`)
          return {}
        }

        ralph.iteration++
        if (ralph.maxIterations > 0 && ralph.iteration >= ralph.maxIterations) {
          conversation.ralphState = null
          console.log(`[oh-my-cursor][/stop] RESULT=noop reason=ralphMaxIter`)
          return {}
        }

        const message = "Continue working. Iteration " + ralph.iteration + "/" + (ralph.maxIterations || "unlimited") + ". When fully done, output <promise>DONE</promise>."
        console.log(`[oh-my-cursor][/stop] RESULT=continue msg="${message.slice(0, 80)}"`)
        return {
          followup_message: message,
          decision: "block",
          reason: message,
        }
      }

      const loopCount = typeof input.loop_count === "number" ? input.loop_count : 0
      if (loopCount > 10) {
        if (conversation.boulderState) conversation.boulderState.active = false
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=loopLimit`)
        return {}
      }

      if (conversation.continuationCooldownUntil && Date.now() < conversation.continuationCooldownUntil) {
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=cooldown`)
        return {}
      }

      const delta = conversation.toolCallCount - conversation.toolCallCountAtLastStop
      conversation.toolCallCountAtLastStop = conversation.toolCallCount

      if (delta === 0) {
        conversation.consecutiveZeroDeltas++
      } else {
        conversation.consecutiveZeroDeltas = 0
      }

      console.log(`[oh-my-cursor][/stop] conversation=${convId} | composerMode=${conversation.composerMode} | activePlan=${!!conversation.activePlan} | toolCallDelta=${delta} | consecutiveZeroDeltas=${conversation.consecutiveZeroDeltas}`)

      if (conversation.consecutiveZeroDeltas >= 2) {
        if (conversation.activePlan) {
          sendOsNotification("Plan Complete", "Agent idle — continuation deactivated.", "normal")
          conversation.activePlan = null
          conversation.boulderState = null
          conversation.consecutiveContinuationFailures = 0
          conversation.continuationCooldownUntil = null
        }
        console.log(`[oh-my-cursor][/stop] RESULT=noop reason=idleDeactivation`)
        return {}
      }

      if (conversation.activePlan) {
        if (!conversation.boulderState) {
          conversation.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }
        }
        if (!conversation.boulderState.active) {
          console.log(`[oh-my-cursor][/stop] RESULT=noop reason=boulderInactive`)
          return {}
        }
        conversation.boulderState.lastContinuationAt = new Date().toISOString()

        let message: string
        if (conversation.composerMode === "plan") {
          const nextPhase = PLAN_PHASE_IDS.find(p => {
            const s = conversation.todoStates.get(p)
            return s === "pending" || s === "in_progress"
          })
          message = "Continue the Prometheus planning workflow. " +
            (nextPhase ? "Next phase: " + nextPhase + ". " : "") +
            "Auto-continue between steps -- do not ask 'should I continue?'. " +
            "Follow commands/plan.md step sequence. Complete all remaining todos."
        } else {
          message = "Continue executing plan: " + conversation.activePlan.path +
            ". Current phase: " + (conversation.activePlan.phase || "unknown") +
            ". Do not stop until all plan tasks are complete."
        }

        console.log(`[oh-my-cursor][/stop] RESULT=continue msg="${message.slice(0, 80)}"`)
        return {
          followup_message: message,
          decision: "block",
          reason: message,
        }
      }

      console.log(`[oh-my-cursor][/stop] RESULT=noop reason=default`)
      return {}
    },

    "/beforeSubmitPrompt": (input) => {
      const userMessage = (input.prompt as string) || (input.user_message as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId)

      let additionalContext = [
        "[oh-my-cursor] Identity: Plan=Prometheus | Agent=Orchestrator/Atlas | Debug=Diagnostic | Ask=Advisor",
        "[oh-my-cursor] FORBIDDEN per mode: Plan(Shell,Delete,StrReplace,impl-Tasks) Agent(direct Write/Shell) Debug/Ask(Write,Shell,Task)",
        "[oh-my-cursor] Agent mode: NEVER edit directly, delegate ALL via Task",
      ].join("\n")

      console.log(`[oh-my-cursor][beforeSubmitPrompt] convId=${convId} | inputKeys=${Object.keys(input).join(",")} | hasMode=${!!input.mode} | hasComposerMode=${!!input.composerMode} | hasCursorCommands=${!!input.cursor_commands} | hasSystemInstructions=${!!input.system_instructions} | msgLen=${userMessage.length} | msgHead=${userMessage.slice(0, 50)}`)

      if (conversation.stoppedAt) {
        conversation.stoppedAt = null
      }

      conversation.dispatchCountsThisTurn = {}

      const lowerMsg = userMessage.toLowerCase()

      const isPlanMode = detectPlanMode(input, conversation, userMessage)
      const inputMode = (input.mode as string) || (input.composer_mode as string) || (input.composerMode as string) || ""
      const isAgentMode =
        inputMode === "agent" || conversation.composerMode === "agent" || (!conversation.composerMode && !inputMode && !isPlanMode)

      if (isPlanMode) {
        conversation.composerMode = "plan"
      } else if (inputMode) {
        conversation.composerMode = inputMode
      }

      console.log(`[oh-my-cursor][beforeSubmitPrompt] isPlanMode=${isPlanMode} | isAgentMode=${isAgentMode} | composerModeAfter=${conversation.composerMode}`)

      if (conversation.composerMode === "plan") {
        additionalContext += "\n[mode:plan] Prometheus planning mode active." +
          " Use /plan command to start the structured planning workflow."
      }

      if (isAgentMode && conversation.activePlan) {
        additionalContext += "\n[mode:agent+plan] Atlas coordination active." +
          " Active plan: " + conversation.activePlan.path +
          (conversation.activePlan.phase ? " | Phase: " + conversation.activePlan.phase : "") +
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
        if (conversation.composerMode === "plan") {
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
        conversation.ralphState = {
          active: true,
          iteration: 0,
          maxIterations: maxIter,
          startedAt: new Date().toISOString(),
        }
        additionalContext += "\n[ralph-loop] Ralph loop activated. Work until done, then output <promise>DONE</promise>."
      }

      if (userMessage.startsWith("/stop-continuation") || userMessage.startsWith("/cancel-ralph")) {
        conversation.stoppedAt = new Date().toISOString()
        conversation.ralphState = null
        conversation.boulderState = null
        conversation.activePlan = null
        conversation.consecutiveZeroDeltas = 0
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
        transitionFromPlanMode(conversation)

        if (!conversation.activePlan) {
          const projectDir = conversation.env.OH_MY_CURSOR_PROJECT_DIR ?? process.env.OH_MY_CURSOR_PROJECT_DIR ?? process.cwd()
          const perConvFile = resolve(projectDir, `.cursor/state/active-plan-${convId}.json`)
          try {
            if (existsSync(perConvFile)) {
              const state = JSON.parse(Bun.file(perConvFile).textSync())
              if (state.path) {
                conversation.activePlan = {
                  path: state.path,
                  phase: state.currentWave ? `wave-${state.currentWave}` : "wave-0",
                  completedTasks: state.completedTasks || [],
                }
              }
            } else {
              console.log(`[oh-my-cursor] No per-conversation plan state for ${convId}, falling through to discover`)
            }
          } catch { /* state file missing or corrupt, continue without */ }
        }

        const ap = conversation.activePlan
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
