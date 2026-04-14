import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { createContinuationHandlers } from "./continuation-handlers"
import { getOrCreateConversation, conversations } from "../shared"

function makeConvId(): string {
  return `continuation-test-${randomUUID()}`
}

function baseStopInput(convId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    conversation_id: convId,
    status: "completed",
    stop_hook_active: false,
    loop_count: 0,
    ...overrides,
  }
}

describe("createContinuationHandlers", () => {
  const unusedConversations = new Map()
  let handlers: ReturnType<typeof createContinuationHandlers>
  let convId: string

  beforeEach(() => {
    handlers = createContinuationHandlers(unusedConversations)
    convId = makeConvId()
  })

  afterEach(() => {
    conversations.delete(convId)
  })

  describe("/stop handler", () => {
    describe("ralph-loop continuation", () => {
      it("continues with iteration message when ralph is active and context has no DONE", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.ralphState = {
          active: true,
          iteration: 0,
          maxIterations: 0,
          startedAt: new Date().toISOString(),
        }
        conversation.contextHistory = ["some work"]

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
          decision?: string
        }

        expect(conversation.ralphState?.iteration).toBe(1)
        expect(result.followup_message).toContain("Continue working")
        expect(result.followup_message).toContain("Iteration 1/unlimited")
        expect(result.decision).toBe("block")
      })

      it("clears ralph and returns empty when context includes DONE", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.ralphState = {
          active: true,
          iteration: 1,
          maxIterations: 0,
          startedAt: new Date().toISOString(),
        }
        conversation.contextHistory = ["done <promise>DONE</promise>"]

        const result = handlers["/stop"](baseStopInput(convId))

        expect(conversation.ralphState).toBeNull()
        expect(result).toEqual({})
      })

      it("stops ralph when max iterations reached", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.ralphState = {
          active: true,
          iteration: 1,
          maxIterations: 2,
          startedAt: new Date().toISOString(),
        }
        conversation.contextHistory = []

        const result = handlers["/stop"](baseStopInput(convId))

        expect(conversation.ralphState).toBeNull()
        expect(result).toEqual({})
      })
    })

    describe("state-based todo detection", () => {
      it("triggers continuation when todoStates has pending items", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
        expect(conversation.boulderState?.active).toBe(true)
      })

      it("triggers continuation when todoStates has in_progress items", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "in_progress")

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
      })

      it("does not trigger from todoStates when all items are completed", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "completed")

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
      })

      it("falls back to TodoWrite in contextHistory when todoStates is empty", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.contextHistory = ["called TodoWrite"]

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
      })
    })

    describe("cooldown gate", () => {
      it("returns empty object when conversation is in continuation cooldown", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")
        conversation.continuationCooldownUntil = Date.now() + 86_400_000

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
      })
    })

    describe("stagnation and failure escalation", () => {
      it("increments consecutive failures when todo snapshot unchanged", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("a", "pending")
        const snap = JSON.stringify([["a", "pending"]])
        conversation.lastTodoSnapshot = snap
        conversation.consecutiveContinuationFailures = 0

        handlers["/stop"](baseStopInput(convId))

        expect(conversation.consecutiveContinuationFailures).toBe(1)
      })

      it("resets consecutive failures when todo snapshot changes", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("a", "pending")
        conversation.lastTodoSnapshot = JSON.stringify([["b", "pending"]])
        conversation.consecutiveContinuationFailures = 3

        handlers["/stop"](baseStopInput(convId))

        expect(conversation.consecutiveContinuationFailures).toBe(0)
        expect(conversation.lastTodoSnapshot).toBe(JSON.stringify([["a", "pending"]]))
      })

      it("appends stagnation attempt text when failures are non-zero", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("a", "pending")
        conversation.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        conversation.consecutiveContinuationFailures = 1

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("stagnation detected")
        expect(result.followup_message).toContain("attempt 3/5")
      })

      it("deactivates boulder after five stagnation failures", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("a", "pending")
        conversation.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        conversation.consecutiveContinuationFailures = 4
        conversation.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }
        conversation.continuationCooldownUntil = null

        const result = handlers["/stop"](baseStopInput(convId))

        expect(conversation.consecutiveContinuationFailures).toBe(5)
        expect(conversation.boulderState?.active).toBe(false)
        expect(result).toEqual({})
      })

      it("sets continuation cooldown when failures reach three", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("a", "pending")
        conversation.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        conversation.consecutiveContinuationFailures = 2
        conversation.continuationCooldownUntil = null

        handlers["/stop"](baseStopInput(convId))

        expect(conversation.consecutiveContinuationFailures).toBe(3)
        expect(conversation.continuationCooldownUntil).not.toBeNull()
        expect(conversation.continuationCooldownUntil!).toBeGreaterThan(Date.now())
      })
    })

    describe("loop count runaway protection", () => {
      it("deactivates boulder and returns empty when loop_count exceeds 10", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")
        conversation.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }

        const result = handlers["/stop"](baseStopInput(convId, { loop_count: 11 }))

        expect(conversation.boulderState?.active).toBe(false)
        expect(result).toEqual({})
      })
    })

    describe("plan-phase-aware message", () => {
      it("uses plan-phase wording when activePlan is present", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")
        conversation.activePlan = { path: "/plans/foo.md", phase: "Phase 2", completedTasks: [] }

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("Continue to the next plan phase")
        expect(result.followup_message).toContain("Phase 2")
      })
    })

    describe("plan mode continuation", () => {
      it("triggers continuation when composerMode is plan and todos are incomplete", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.todoStates.set("plan-write", "completed")
        conversation.todoStates.set("plan-selfreview", "pending")
        conversation.todoStates.set("plan-review", "pending")

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
          decision?: string
        }

        expect(result.followup_message).toContain("Continue the Prometheus planning workflow")
        expect(result.decision).toBe("block")
      })

      it("continuation message references correct next phase from todoStates", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.todoStates.set("plan-switchmode", "completed")
        conversation.todoStates.set("plan-interview", "completed")
        conversation.todoStates.set("plan-explore", "completed")
        conversation.todoStates.set("plan-metis", "completed")
        conversation.todoStates.set("plan-write", "completed")
        conversation.todoStates.set("plan-selfreview", "pending")

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
        }

        expect(result.followup_message).toContain("plan-selfreview")
      })

      it("allows agent type plan when composerMode is plan and todos are pending", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.todoStates.set("plan-write", "pending")

        const result = handlers["/stop"](baseStopInput(convId, { agent_type: "plan" })) as {
          followup_message?: string
        }

        expect(result.followup_message).toContain("Prometheus planning workflow")
      })
    })

    describe("early exits", () => {
      it("returns empty when stop_hook_active is true", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId, { stop_hook_active: true }))

        expect(result).toEqual({})
      })

      it("returns empty when status is not completed", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId, { status: "running" }))

        expect(result).toEqual({})
      })
    })
  })

  describe("/beforeSubmitPrompt handler", () => {
    it("always injects base persona and orchestration context", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "hello",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("Identity: Plan=Prometheus")
      expect(result.additional_context).toContain("FORBIDDEN per mode")
      expect(result.additional_context).toContain("delegate ALL via Task")
    })

    it("detects plan mode from /plan keyword and adds Prometheus context", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/plan add auth",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:plan]")
      expect(result.additional_context).toContain("Prometheus planning mode active")
    })

    it("detects plan mode from conversation composerMode", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.composerMode = "plan"

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "no slash plan token here",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:plan]")
    })

    it("adds analysis mode context for analyze keyword", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "Please analyze the module",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:analysis]")
    })

    it("adds search mode context for search phrasing", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "find where is the handler",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:search]")
    })

    it("adds ultrawork context for ultrawork and ulw", () => {
      const r1 = handlers["/beforeSubmitPrompt"]({
        prompt: "ultrawork on this",
        conversation_id: convId,
      }) as { additional_context?: string }
      expect(r1.additional_context).toContain("[mode:ultrawork]")

      const conv2 = makeConvId()
      try {
        const r2 = handlers["/beforeSubmitPrompt"]({
          prompt: "ulw mode",
          conversation_id: conv2,
        }) as { additional_context?: string }
        expect(r2.additional_context).toContain("[mode:ultrawork]")
      } finally {
        conversations.delete(conv2)
      }
    })

    it("adds think mode context for think phrasing", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "think harder about edge cases",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:think]")
    })

    it("activates ralph state for /ralph-loop with optional max iterations", () => {
      const conversation = getOrCreateConversation(convId)

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/ralph-loop --max-iterations 5",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(conversation.ralphState?.active).toBe(true)
      expect(conversation.ralphState?.maxIterations).toBe(5)
      expect(result.additional_context).toContain("[ralph-loop]")
    })

    it("clears continuation state for /stop-continuation", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.ralphState = {
        active: true,
        iteration: 2,
        maxIterations: 0,
        startedAt: new Date().toISOString(),
      }
      conversation.boulderState = { active: true, failureCount: 1, lastContinuationAt: "x" }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/stop-continuation",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(conversation.ralphState).toBeNull()
      expect(conversation.boulderState).toBeNull()
      expect(conversation.stoppedAt).not.toBeNull()
      expect(result.additional_context).toContain("Continuation loops stopped")
    })

    it("maps /plan slash command to command context", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/plan my feature",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[command:plan]")
    })

    it("hints unknown slash commands with available list", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/unknown-cmd",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[command:unknown]")
      expect(result.additional_context).toContain("Available:")
    })

    it("adds agent+plan context when in agent mode with activePlan", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.composerMode = "agent"
      conversation.activePlan = { path: "/p.md", phase: "P1", completedTasks: [] }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "continue",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:agent+plan]")
      expect(result.additional_context).toContain("/p.md")
    })

    it("injects [start-work:discover] when /start-work and no activePlan", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.activePlan = null

      const origProjectDir = process.env.OH_MY_CURSOR_PROJECT_DIR
      process.env.OH_MY_CURSOR_PROJECT_DIR = "/tmp/oh-my-cursor-test-empty-workspace"

      try {
        const result = handlers["/beforeSubmitPrompt"]({
          prompt: "/start-work",
          conversation_id: convId,
        }) as { additional_context?: string }

        expect(result.additional_context).toContain("[start-work:discover]")
        expect(result.additional_context).toContain("[command:start-work]")
      } finally {
        if (origProjectDir !== undefined) {
          process.env.OH_MY_CURSOR_PROJECT_DIR = origProjectDir
        } else {
          delete process.env.OH_MY_CURSOR_PROJECT_DIR
        }
      }
    })

    it("injects [start-work:fresh] when /start-work and activePlan with no completed tasks", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.activePlan = { path: "plans/a.plan.md", phase: "Wave 0", completedTasks: [] }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/start-work",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[start-work:fresh]")
      expect(result.additional_context).toContain("plans/a.plan.md")
    })

    it("injects [start-work:resume] when /start-work and activePlan has completed tasks", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.activePlan = {
        path: "plans/b.plan.md",
        phase: "Wave 2",
        completedTasks: ["t1", "t2"],
      }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/start-work",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[start-work:resume]")
      expect(result.additional_context).toContain("t1, t2")
      expect(result.additional_context).toContain("Wave 2")
    })

    it("updates composerMode from plan to agent when inputMode changes", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.composerMode = "plan"

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "continue working",
        mode: "agent",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(conversation.composerMode).toBe("agent")
      expect(result.additional_context).not.toContain("[mode:plan]")
    })

    it("does not re-trigger plan mode from /plan substring in injected context", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "working on the explain/planning feature",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).not.toContain("[mode:plan]")
    })

    it("detects plan mode only when message starts with /plan", () => {
      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/plan add auth",
        conversation_id: convId,
      }) as { additional_context?: string }

      const conversation = getOrCreateConversation(convId)
      expect(conversation.composerMode).toBe("plan")
      expect(result.additional_context).toContain("[mode:plan]")
    })

    describe("mode transition and per-turn dispatch reset", () => {
      it("transitions composerMode from plan to agent on /start-work and clears plan-phase todos", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.todoStates.set("plan-write", "completed")
        conversation.todoStates.set("plan-handoff", "completed")

        handlers["/beforeSubmitPrompt"]({
          user_message: "/start-work",
          conversation_id: convId,
        })

        expect(conversation.composerMode).toBe("agent")
        expect(conversation.todoStates.has("plan-write")).toBe(false)
        expect(conversation.todoStates.has("plan-handoff")).toBe(false)
      })

      it("keeps plan mode when plan-phase todos are incomplete and message is not /start-work", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.todoStates.set("plan-explore", "in_progress")

        handlers["/beforeSubmitPrompt"]({
          prompt: "continue with the design",
          conversation_id: convId,
        })

        expect(conversation.composerMode).toBe("plan")
      })

      it("resets dispatchCountsThisTurn on each beforeSubmitPrompt", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.dispatchCountsThisTurn = { Task: 5, "subagent:explore": 3 }

        handlers["/beforeSubmitPrompt"]({
          prompt: "hello",
          conversation_id: convId,
        })

        expect(conversation.dispatchCountsThisTurn).toEqual({})
      })
    })
  })
})
