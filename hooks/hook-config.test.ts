import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { isHookEnabled, getHookConfig, resetHookConfigCache } from "./hook-config"

/** Canonical 21 Cursor hook event paths (3.6.21; +workspaceOpen) (leading slash). Order matches docs/internal/hooks-v1-vs-v2-claim-diff.md Claim 21. */
const CANONICAL_CURSOR_HOOKS = [
  "/sessionStart",
  "/sessionEnd",
  "/preToolUse",
  "/postToolUse",
  "/postToolUseFailure",
  "/subagentStart",
  "/subagentStop",
  "/beforeShellExecution",
  "/afterShellExecution",
  "/beforeMCPExecution",
  "/afterMCPExecution",
  "/beforeReadFile",
  "/afterFileEdit",
  "/afterAgentResponse",
  "/afterAgentThought",
  "/preCompact",
  "/stop",
  "/beforeSubmitPrompt",
  "/beforeTabFileRead",
  "/afterTabFileEdit",
  "/workspaceOpen",
] as const

let originalEnv: string | undefined

describe("hook-config", () => {
  beforeEach(() => {
    originalEnv = process.env.OH_MY_CURSOR_DISABLED_HOOKS
    delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
    resetHookConfigCache()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.OH_MY_CURSOR_DISABLED_HOOKS = originalEnv
    } else {
      delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
    }
    resetHookConfigCache()
  })

  describe("#given no disabled hooks configured", () => {
    describe("#when isHookEnabled is called", () => {
      test("#then all hooks are enabled", () => {
        expect(isHookEnabled("/health")).toBe(true)
        expect(isHookEnabled("/preToolUse")).toBe(true)
        expect(isHookEnabled("/stop")).toBe(true)
        expect(isHookEnabled("/subagentStart")).toBe(true)
      })
    })

    describe("#when getHookConfig is called", () => {
      test("#then enabled includes all 21 canonical Cursor hooks and Tab hooks; excludes daemon-only routes", () => {
        const { enabled } = getHookConfig()

        for (const hook of CANONICAL_CURSOR_HOOKS) {
          expect(enabled).toContain(hook)
        }
        expect(enabled).not.toContain("/sessionHistory")
        expect(enabled).not.toContain("/backgroundTasks")
        expect(enabled).toContain("/beforeTabFileRead")
        expect(enabled).toContain("/afterTabFileEdit")
      })
    })
  })

  describe("#given hooks disabled via env var", () => {
    describe("#when isHookEnabled is called for a disabled hook", () => {
      test("#then it returns false", () => {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = "/preToolUse,/afterShellExecution"
        resetHookConfigCache()

        expect(isHookEnabled("/preToolUse")).toBe(false)
        expect(isHookEnabled("/afterShellExecution")).toBe(false)
        expect(isHookEnabled("/health")).toBe(true)
      })
    })
  })

  describe("#given hooks disabled without leading slash", () => {
    describe("#when isHookEnabled is called", () => {
      test("#then it normalizes and matches correctly", () => {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = "preToolUse,stop"
        resetHookConfigCache()

        expect(isHookEnabled("/preToolUse")).toBe(false)
        expect(isHookEnabled("/stop")).toBe(false)
        expect(isHookEnabled("/health")).toBe(true)
      })
    })
  })

  describe("#given getHookConfig is called", () => {
    describe("#when some hooks are disabled", () => {
      test("#then it returns correct enabled and disabled lists", () => {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = "/health,/stop"
        resetHookConfigCache()

        const config = getHookConfig()
        expect(config.disabled).toContain("/health")
        expect(config.disabled).toContain("/stop")
        expect(config.enabled).not.toContain("/health")
        expect(config.enabled).not.toContain("/stop")
        expect(config.enabled).toContain("/preToolUse")
      })
    })
  })

  describe("#given hookName without leading slash", () => {
    describe("#when isHookEnabled is called", () => {
      test("#then it normalizes the input and checks correctly", () => {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = "/preToolUse"
        resetHookConfigCache()

        expect(isHookEnabled("preToolUse")).toBe(false)
        expect(isHookEnabled("health")).toBe(true)
      })
    })
  })
})
