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
          lastProcessedIndex: 0,
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
          lastProcessedIndex: 0,
        }
        conversation.contextHistory = ["done <promise>DONE</promise>"]

        const result = handlers["/stop"](baseStopInput(convId))

        expect(conversation.ralphState).toBeNull()
        expect(result).toEqual({})
      })

      it("continues ralph when context has DONE only as accidental substring (not <promise>DONE</promise>)", () => {
        const startedAt = "2026-01-01T00:00:00.000Z"
        const conversation = getOrCreateConversation(convId)
        conversation.contextHistory = ["[12:00] Read /tmp/TODO.md completed", "follow-up: UNDONE"]
        conversation.ralphState = {
          active: true,
          iteration: 5,
          maxIterations: 100,
          startedAt,
          lastProcessedIndex: 0,
        }

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
          decision?: string
        }

        expect(result.followup_message).toBeDefined()
        expect(result.followup_message).toContain("Continue working")
        expect(result.decision).toBe("block")
        expect(conversation.ralphState).not.toBeNull()
        expect(conversation.ralphState?.iteration).toBe(6)
      })

      it("clears ralph when context includes exact <promise>DONE</promise> token", () => {
        const startedAt = "2026-01-01T00:00:00.000Z"
        const conversation = getOrCreateConversation(convId)
        conversation.contextHistory = ["<promise>DONE</promise>"]
        conversation.ralphState = {
          active: true,
          iteration: 5,
          maxIterations: 100,
          startedAt,
          lastProcessedIndex: 0,
        }

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
          lastProcessedIndex: 0,
        }
        conversation.contextHistory = []

        const result = handlers["/stop"](baseStopInput(convId))

        expect(conversation.ralphState).toBeNull()
        expect(result).toEqual({})
      })
    })

    describe("tool-call delta and activePlan gating", () => {
      it("does not continue when only todoStates are pending and there is no activePlan", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
        expect(conversation.consecutiveZeroDeltas).toBe(1)
      })

      it("continues when activePlan is set and toolCallDelta allows (first zero-delta stop)", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")
        conversation.activePlan = { path: "/plans/foo.md", phase: "P1", completedTasks: [] }
        conversation.toolCallCount = 0
        conversation.toolCallCountAtLastStop = 0
        conversation.consecutiveZeroDeltas = 0

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("Continue executing plan")
        expect(result.followup_message).toContain("/plans/foo.md")
        expect(conversation.boulderState?.active).toBe(true)
        expect(conversation.consecutiveZeroDeltas).toBe(1)
      })

      it("does not trigger from todoStates when all items are completed and no activePlan", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "completed")

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
      })

      it("resets consecutiveZeroDeltas when tool calls occurred between stops", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.activePlan = { path: "/p.md", phase: "A", completedTasks: [] }
        conversation.toolCallCount = 0
        conversation.toolCallCountAtLastStop = 0
        handlers["/stop"](baseStopInput(convId))
        expect(conversation.consecutiveZeroDeltas).toBe(1)

        conversation.toolCallCount = 3
        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(conversation.consecutiveZeroDeltas).toBe(0)
        expect(result.followup_message).toContain("Continue executing plan")
      })

      it("clears activePlan after two consecutive zero tool-call deltas (idle deactivation)", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.activePlan = { path: "/p.md", phase: "A", completedTasks: [] }
        conversation.toolCallCount = 1
        conversation.toolCallCountAtLastStop = 1
        conversation.consecutiveZeroDeltas = 1

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
        expect(conversation.activePlan).toBeNull()
        expect(conversation.boulderState).toBeNull()
        expect(conversation.consecutiveContinuationFailures).toBe(0)
        expect(conversation.continuationCooldownUntil).toBeNull()
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
      it("uses execute-plan wording when activePlan is present in agent mode", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.todoStates.set("t1", "pending")
        conversation.activePlan = { path: "/plans/foo.md", phase: "Phase 2", completedTasks: [] }
        conversation.composerMode = "agent"

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("Continue executing plan")
        expect(result.followup_message).toContain("Phase 2")
      })
    })

    describe("plan mode continuation", () => {
      it("triggers continuation when composerMode is plan, activePlan set, and todos are incomplete", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.activePlan = { path: ".cursor/plans/x.md", phase: "draft", completedTasks: [] }
        conversation.todoStates.set("plan-write", "completed")
        conversation.todoStates.set("plan-review", "pending")
        conversation.todoStates.set("plan-decisions", "pending")

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
        conversation.activePlan = { path: ".cursor/plans/x.md", phase: "draft", completedTasks: [] }
        conversation.todoStates.set("plan-draft", "completed")
        conversation.todoStates.set("plan-explore", "completed")
        conversation.todoStates.set("plan-interview", "completed")
        conversation.todoStates.set("plan-metis", "completed")
        conversation.todoStates.set("plan-write", "completed")
        conversation.todoStates.set("plan-review", "pending")

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
        }

        expect(result.followup_message).toContain("plan-review")
      })

      it("allows agent type plan when composerMode is plan, activePlan set, and todos are pending", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "plan"
        conversation.activePlan = { path: ".cursor/plans/x.md", phase: "draft", completedTasks: [] }
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

    it("initializes ralph lastProcessedIndex to 0 for /ralph-loop", () => {
      const conversation = getOrCreateConversation(convId)

      handlers["/beforeSubmitPrompt"]({
        prompt: "/ralph-loop --max-iterations 50",
        conversation_id: convId,
      })

      expect(conversation.ralphState?.lastProcessedIndex).toBe(0)
    })

    it("clears continuation state for /stop-continuation", () => {
      const conversation = getOrCreateConversation(convId)
      conversation.ralphState = {
        active: true,
        iteration: 2,
        maxIterations: 0,
        startedAt: new Date().toISOString(),
        lastProcessedIndex: 0,
      }
      conversation.boulderState = { active: true, failureCount: 1, lastContinuationAt: "x" }
      conversation.activePlan = { path: "/p.md", phase: "x", completedTasks: [] }
      conversation.consecutiveZeroDeltas = 2

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/stop-continuation",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(conversation.ralphState).toBeNull()
      expect(conversation.boulderState).toBeNull()
      expect(conversation.activePlan).toBeNull()
      expect(conversation.consecutiveZeroDeltas).toBe(0)
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
      conversation.env.OH_MY_CURSOR_PROJECT_DIR = "/tmp/oh-my-cursor-test-empty-workspace"

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/start-work",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[start-work:discover]")
      expect(result.additional_context).toContain("[command:start-work]")
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

    describe("detectPlanMode hardening", () => {
      it("does not re-stick to plan when composerMode is agent despite plan-phase context and todos", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = "agent"
        conversation.contextHistory = ["plan-draft", "plan-write"]
        conversation.todoStates.set("plan-write", "completed")

        const result = handlers["/beforeSubmitPrompt"]({
          prompt: "do something",
          conversation_id: convId,
        }) as { additional_context?: string }

        expect(conversation.composerMode).toBe("agent")
        expect(result.additional_context).not.toContain("[mode:plan]")
      })

      it("applies contextHistory heuristic when composerMode is null", () => {
        const conversation = getOrCreateConversation(convId)
        conversation.composerMode = null
        conversation.contextHistory = ["plan-draft"]

        const result = handlers["/beforeSubmitPrompt"]({
          prompt: "do something",
          conversation_id: convId,
        }) as { additional_context?: string }

        expect(conversation.composerMode).toBe("plan")
        expect(result.additional_context).toContain("[mode:plan]")
      })
    })
  })
})
