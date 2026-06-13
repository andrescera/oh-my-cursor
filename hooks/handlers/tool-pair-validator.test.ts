import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { resolve } from "node:path"
import { contextCollector } from "../context-collector"
import { createToolPairValidatorHandler, resetToolPairState, TOOL_PAIR_READ_SET_CAP } from "./tool-pair-validator"

const A = resolve("/tmp/tool-pair/a.ts")

function postRead(handler: ReturnType<typeof createToolPairValidatorHandler>, convId: string, file: string, tool = "Read") {
  return handler["/postToolUse"]?.({
    tool_name: tool,
    tool_input: { file_path: file },
    conversation_id: convId,
    tool_response: "ok",
  }) || {}
}

function preEdit(handler: ReturnType<typeof createToolPairValidatorHandler>, convId: string, file: string, tool = "Edit", extra: Record<string, unknown> = {}) {
  return handler["/preToolUse"]?.({
    tool_name: tool,
    tool_input: { file_path: file, ...extra },
    conversation_id: convId,
  }) || {}
}

describe("tool-pair-validator", () => {
  beforeEach(() => {
    resetToolPairState()
    contextCollector.clearAll()
    delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
  })
  afterEach(() => {
    resetToolPairState()
    contextCollector.clearAll()
    delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
  })

  describe("read-then-edit pairing", () => {
    it("allows Edit on a file that was read this conversation", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "c1", A)
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBeUndefined()
    })

    it("denies Edit on a file never read this conversation", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBe("deny")
      expect(typeof result.userMessage).toBe("string")
      expect(result.userMessage as string).toContain(A)
    })

    it("emits a Cursor PreToolUse deny shape on violation", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = preEdit(h, "c1", A) as Record<string, unknown>
      const hso = result.hookSpecificOutput as Record<string, unknown>
      expect(hso.hookEventName).toBe("PreToolUse")
      expect(hso.permissionDecision).toBe("deny")
      expect(typeof hso.permissionDecisionReason).toBe("string")
    })

    it("registers a CRITICAL advisory via contextCollector on violation (fallback channel)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      preEdit(h, "c1", A)
      const pending = contextCollector.getPending("c1")
      expect(pending.hasContent).toBe(true)
      expect(pending.merged).toContain("tool-pair-validator")
    })

    it("validates MultiEdit like Edit", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const denied = preEdit(h, "c1", A, "MultiEdit")
      expect(denied.permission).toBe("deny")
      postRead(h, "c1", A)
      const allowed = preEdit(h, "c1", A, "MultiEdit")
      expect(allowed.permission).toBeUndefined()
    })
  })

  describe("read tracking sources", () => {
    it("treats a Write as establishing file awareness (subsequent Edit allowed)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "c1", A, "Write")
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBeUndefined()
    })

    it("ignores postToolUse for non-read/write tools", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "c1", A, "Grep")
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBe("deny")
    })
  })

  describe("exempt tools (do NOT flag — unreliable hook coverage / new-content tools)", () => {
    it("never denies a Write to an unread file (full-content / new-file tool)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = preEdit(h, "c1", A, "Write")
      expect(result.permission).toBeUndefined()
    })

    it("never denies a StrReplace (unreliable postToolUse coverage; exempt)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = preEdit(h, "c1", A, "StrReplace")
      expect(result.permission).toBeUndefined()
    })

    it("ignores Edit with no file_path", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = h["/preToolUse"]?.({ tool_name: "Edit", tool_input: {}, conversation_id: "c1" }) || {}
      expect(result.permission).toBeUndefined()
    })
  })

  describe("per-conversation isolation", () => {
    it("does not leak read-state across conversations", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "convA", A)
      const otherConv = preEdit(h, "convB", A)
      expect(otherConv.permission).toBe("deny")
      const sameConv = preEdit(h, "convA", A)
      expect(sameConv.permission).toBeUndefined()
    })
  })

  describe("LRU cap", () => {
    it("bounds the read-set per conversation and evicts the oldest entry", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const oldest = resolve("/tmp/tool-pair/lru-0.ts")
      postRead(h, "c1", oldest)
      // Fill to exactly the cap with distinct paths AFTER the oldest one.
      // (Do NOT probe `oldest` via preEdit here — an allowed edit refreshes
      // recency, which would defeat the eviction we are testing.)
      for (let i = 1; i < TOOL_PAIR_READ_SET_CAP; i++) {
        postRead(h, "c1", resolve(`/tmp/tool-pair/lru-${i}.ts`))
      }
      // One more distinct read pushes size over cap → evict the oldest (lru-0).
      postRead(h, "c1", resolve(`/tmp/tool-pair/lru-${TOOL_PAIR_READ_SET_CAP}.ts`))
      // A denied edit does not mutate recency, so this probe is side-effect-free.
      expect(preEdit(h, "c1", oldest).permission).toBe("deny")
      // The most-recent entry is retained.
      expect(preEdit(h, "c1", resolve(`/tmp/tool-pair/lru-${TOOL_PAIR_READ_SET_CAP}.ts`)).permission).toBeUndefined()
    })

    it("re-reading a path bumps it to most-recent (not evicted prematurely)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const bumped = resolve("/tmp/tool-pair/bump.ts")
      postRead(h, "c1", bumped)
      // Fill near cap, then re-read `bumped` to refresh its recency.
      for (let i = 1; i < TOOL_PAIR_READ_SET_CAP; i++) {
        postRead(h, "c1", resolve(`/tmp/tool-pair/x-${i}.ts`))
      }
      postRead(h, "c1", bumped) // bump to most-recent
      // Now add one more distinct path → evicts the actual oldest (x-1), not `bumped`.
      postRead(h, "c1", resolve(`/tmp/tool-pair/x-${TOOL_PAIR_READ_SET_CAP}.ts`))
      expect(preEdit(h, "c1", bumped).permission).toBeUndefined()
    })
  })

  describe("path normalization", () => {
    it("matches a relative read against an absolute edit (and vice versa)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "c1", "./rel-file.ts")
      const result = preEdit(h, "c1", resolve("rel-file.ts"))
      expect(result.permission).toBeUndefined()
    })
  })

  describe("toggles", () => {
    it("is a no-op when disabled via config (isEnabled=false)", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => false })
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBeUndefined()
    })

    it("is a no-op when disabled via OH_MY_CURSOR_DISABLED_HOOKS", () => {
      process.env.OH_MY_CURSOR_DISABLED_HOOKS = "foo,tool-pair-validator,bar"
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      const result = preEdit(h, "c1", A)
      expect(result.permission).toBeUndefined()
      // It must also skip read tracking while disabled.
      postRead(h, "c1", A)
      delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
    })
  })

  describe("test isolation", () => {
    it("resetToolPairState clears all per-conversation read-sets", () => {
      const h = createToolPairValidatorHandler(new Map(), { isEnabled: () => true })
      postRead(h, "c1", A)
      expect(preEdit(h, "c1", A).permission).toBeUndefined()
      resetToolPairState()
      expect(preEdit(h, "c1", A).permission).toBe("deny")
    })
  })
})
