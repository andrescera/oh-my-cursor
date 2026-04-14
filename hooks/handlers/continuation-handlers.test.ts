import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { createContinuationHandlers } from "./continuation-handlers"
import { getOrCreateSession, sessions } from "../shared"

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
  const unusedSessions = new Map()
  let handlers: ReturnType<typeof createContinuationHandlers>
  let convId: string

  beforeEach(() => {
    handlers = createContinuationHandlers(unusedSessions)
    convId = makeConvId()
  })

  afterEach(() => {
    sessions.delete(convId)
  })

  describe("/stop handler", () => {
    describe("ralph-loop continuation", () => {
      it("continues with iteration message when ralph is active and context has no DONE", () => {
        const session = getOrCreateSession(convId)
        session.ralphState = {
          active: true,
          iteration: 0,
          maxIterations: 0,
          startedAt: new Date().toISOString(),
        }
        session.contextHistory = ["some work"]

        const result = handlers["/stop"](baseStopInput(convId)) as {
          followup_message?: string
          decision?: string
        }

        expect(session.ralphState?.iteration).toBe(1)
        expect(result.followup_message).toContain("Continue working")
        expect(result.followup_message).toContain("Iteration 1/unlimited")
        expect(result.decision).toBe("block")
      })

      it("clears ralph and returns empty when context includes DONE", () => {
        const session = getOrCreateSession(convId)
        session.ralphState = {
          active: true,
          iteration: 1,
          maxIterations: 0,
          startedAt: new Date().toISOString(),
        }
        session.contextHistory = ["done <promise>DONE</promise>"]

        const result = handlers["/stop"](baseStopInput(convId))

        expect(session.ralphState).toBeNull()
        expect(result).toEqual({})
      })

      it("stops ralph when max iterations reached", () => {
        const session = getOrCreateSession(convId)
        session.ralphState = {
          active: true,
          iteration: 1,
          maxIterations: 2,
          startedAt: new Date().toISOString(),
        }
        session.contextHistory = []

        const result = handlers["/stop"](baseStopInput(convId))

        expect(session.ralphState).toBeNull()
        expect(result).toEqual({})
      })
    })

    describe("state-based todo detection", () => {
      it("triggers continuation when todoStates has pending items", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
        expect(session.boulderState?.active).toBe(true)
      })

      it("triggers continuation when todoStates has in_progress items", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "in_progress")

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
      })

      it("does not trigger from todoStates when all items are completed", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "completed")

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
      })

      it("falls back to TodoWrite in contextHistory when todoStates is empty", () => {
        const session = getOrCreateSession(convId)
        session.contextHistory = ["called TodoWrite"]

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("incomplete todos")
      })
    })

    describe("cooldown gate", () => {
      it("returns empty object when session is in continuation cooldown", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")
        session.continuationCooldownUntil = Date.now() + 86_400_000

        const result = handlers["/stop"](baseStopInput(convId))

        expect(result).toEqual({})
      })
    })

    describe("stagnation and failure escalation", () => {
      it("increments consecutive failures when todo snapshot unchanged", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("a", "pending")
        const snap = JSON.stringify([["a", "pending"]])
        session.lastTodoSnapshot = snap
        session.consecutiveContinuationFailures = 0

        handlers["/stop"](baseStopInput(convId))

        expect(session.consecutiveContinuationFailures).toBe(1)
      })

      it("resets consecutive failures when todo snapshot changes", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("a", "pending")
        session.lastTodoSnapshot = JSON.stringify([["b", "pending"]])
        session.consecutiveContinuationFailures = 3

        handlers["/stop"](baseStopInput(convId))

        expect(session.consecutiveContinuationFailures).toBe(0)
        expect(session.lastTodoSnapshot).toBe(JSON.stringify([["a", "pending"]]))
      })

      it("appends stagnation attempt text when failures are non-zero", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("a", "pending")
        session.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        session.consecutiveContinuationFailures = 1

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("stagnation detected")
        expect(result.followup_message).toContain("attempt 3/5")
      })

      it("deactivates boulder after five stagnation failures", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("a", "pending")
        session.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        session.consecutiveContinuationFailures = 4
        session.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }
        session.continuationCooldownUntil = null

        const result = handlers["/stop"](baseStopInput(convId))

        expect(session.consecutiveContinuationFailures).toBe(5)
        expect(session.boulderState?.active).toBe(false)
        expect(result).toEqual({})
      })

      it("sets continuation cooldown when failures reach three", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("a", "pending")
        session.lastTodoSnapshot = JSON.stringify([["a", "pending"]])
        session.consecutiveContinuationFailures = 2
        session.continuationCooldownUntil = null

        handlers["/stop"](baseStopInput(convId))

        expect(session.consecutiveContinuationFailures).toBe(3)
        expect(session.continuationCooldownUntil).not.toBeNull()
        expect(session.continuationCooldownUntil!).toBeGreaterThan(Date.now())
      })
    })

    describe("loop count runaway protection", () => {
      it("deactivates boulder and returns empty when loop_count exceeds 10", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")
        session.boulderState = { active: true, failureCount: 0, lastContinuationAt: null }

        const result = handlers["/stop"](baseStopInput(convId, { loop_count: 11 }))

        expect(session.boulderState?.active).toBe(false)
        expect(result).toEqual({})
      })
    })

    describe("plan-phase-aware message", () => {
      it("uses plan-phase wording when activePlan is present", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")
        session.activePlan = { path: "/plans/foo.md", phase: "Phase 2", completedTasks: [] }

        const result = handlers["/stop"](baseStopInput(convId)) as { followup_message?: string }

        expect(result.followup_message).toContain("Continue to the next plan phase")
        expect(result.followup_message).toContain("Phase 2")
      })
    })

    describe("early exits", () => {
      it("returns empty when stop_hook_active is true", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")

        const result = handlers["/stop"](baseStopInput(convId, { stop_hook_active: true }))

        expect(result).toEqual({})
      })

      it("returns empty when status is not completed", () => {
        const session = getOrCreateSession(convId)
        session.todoStates.set("t1", "pending")

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
        prompt: "Use /plan for this",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:plan]")
      expect(result.additional_context).toContain("Prometheus planning mode active")
    })

    it("detects plan mode from session composerMode", () => {
      const session = getOrCreateSession(convId)
      session.composerMode = "plan"

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
        sessions.delete(conv2)
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
      const session = getOrCreateSession(convId)

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/ralph-loop --max-iterations 5",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(session.ralphState?.active).toBe(true)
      expect(session.ralphState?.maxIterations).toBe(5)
      expect(result.additional_context).toContain("[ralph-loop]")
    })

    it("clears continuation state for /stop-continuation", () => {
      const session = getOrCreateSession(convId)
      session.ralphState = {
        active: true,
        iteration: 2,
        maxIterations: 0,
        startedAt: new Date().toISOString(),
      }
      session.boulderState = { active: true, failureCount: 1, lastContinuationAt: "x" }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/stop-continuation",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(session.ralphState).toBeNull()
      expect(session.boulderState).toBeNull()
      expect(session.stoppedAt).not.toBeNull()
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
      const session = getOrCreateSession(convId)
      session.composerMode = "agent"
      session.activePlan = { path: "/p.md", phase: "P1", completedTasks: [] }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "continue",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[mode:agent+plan]")
      expect(result.additional_context).toContain("/p.md")
    })

    it("injects [start-work:discover] when /start-work and no activePlan", () => {
      const session = getOrCreateSession(convId)
      session.activePlan = null

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/start-work",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[start-work:discover]")
      expect(result.additional_context).toContain("[command:start-work]")
    })

    it("injects [start-work:fresh] when /start-work and activePlan with no completed tasks", () => {
      const session = getOrCreateSession(convId)
      session.activePlan = { path: "plans/a.plan.md", phase: "Wave 0", completedTasks: [] }

      const result = handlers["/beforeSubmitPrompt"]({
        prompt: "/start-work",
        conversation_id: convId,
      }) as { additional_context?: string }

      expect(result.additional_context).toContain("[start-work:fresh]")
      expect(result.additional_context).toContain("plans/a.plan.md")
    })

    it("injects [start-work:resume] when /start-work and activePlan has completed tasks", () => {
      const session = getOrCreateSession(convId)
      session.activePlan = {
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
  })
})
