import { describe, test, expect } from "bun:test"
import { HookTier, HOOK_TIER_ASSIGNMENTS, getHookTier } from "./hook-tiers"

describe("hook-tiers", () => {
  describe("#given the HookTier enum", () => {
    describe("#when tier values are accessed", () => {
      test("#then they have ascending numeric values", () => {
        expect(HookTier.SESSION).toBe(0)
        expect(HookTier.TOOL_GUARD).toBe(1)
        expect(HookTier.TRANSFORM).toBe(2)
        expect(HookTier.CONTINUATION).toBe(3)
        expect(HookTier.SKILL).toBe(4)
      })
    })
  })

  describe("#given session-tier hooks", () => {
    describe("#when their tier assignments are checked", () => {
      test("#then they all map to SESSION tier", () => {
        const sessionHooks = [
          "/health", "/sessionStart", "/sessionEnd", "/preCompact",
          "/heartbeat", "/config", "/sessionHistory", "/backgroundTasks",
        ]
        for (const hook of sessionHooks) {
          expect(HOOK_TIER_ASSIGNMENTS[hook]).toBe(HookTier.SESSION)
        }
      })
    })
  })

  describe("#given tool-guard-tier hooks", () => {
    describe("#when their tier assignments are checked", () => {
      test("#then they all map to TOOL_GUARD tier", () => {
        const toolGuardHooks = [
          "/preToolUse", "/postToolUse", "/postToolUseFailure",
          "/beforeShellExecution", "/afterShellExecution",
          "/beforeReadFile", "/afterFileEdit",
          "/beforeMCPExecution", "/afterMCPExecution",
        ]
        for (const hook of toolGuardHooks) {
          expect(HOOK_TIER_ASSIGNMENTS[hook]).toBe(HookTier.TOOL_GUARD)
        }
      })
    })
  })

  describe("#given continuation-tier hooks", () => {
    describe("#when their tier assignments are checked", () => {
      test("#then they all map to CONTINUATION tier", () => {
        expect(HOOK_TIER_ASSIGNMENTS["/stop"]).toBe(HookTier.CONTINUATION)
        expect(HOOK_TIER_ASSIGNMENTS["/beforeSubmitPrompt"]).toBe(HookTier.CONTINUATION)
      })
    })
  })

  describe("#given getHookTier with a known hook", () => {
    describe("#when called with leading slash", () => {
      test("#then it returns the correct tier", () => {
        expect(getHookTier("/health")).toBe(HookTier.SESSION)
        expect(getHookTier("/preToolUse")).toBe(HookTier.TOOL_GUARD)
        expect(getHookTier("/stop")).toBe(HookTier.CONTINUATION)
      })
    })
  })

  describe("#given getHookTier with a hook name without leading slash", () => {
    describe("#when called", () => {
      test("#then it normalizes and returns the correct tier", () => {
        expect(getHookTier("health")).toBe(HookTier.SESSION)
        expect(getHookTier("preToolUse")).toBe(HookTier.TOOL_GUARD)
        expect(getHookTier("stop")).toBe(HookTier.CONTINUATION)
      })
    })
  })

  describe("#given getHookTier with an unknown hook name", () => {
    describe("#when called", () => {
      test("#then it returns -1", () => {
        expect(getHookTier("/nonexistent")).toBe(-1)
        expect(getHookTier("fakeHook")).toBe(-1)
      })
    })
  })
})
