import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  createKeywordDetectorHandler,
  resetKeywordDetectorState,
  getKeywordFlag,
  purgeExpiredKeywordFlags,
  KEYWORD_DETECTOR_KEYWORDS,
  KEYWORD_FLAG_TTL_MS,
  type KeywordDetectorDeps,
} from "./keyword-detector"
import { conversations } from "../shared"
import { contextCollector } from "../context-collector"

function makeConvId(): string {
  return `kw-test-${randomUUID()}`
}

// Default test deps: handler enabled, all keywords active, fixed clock.
function deps(overrides: Partial<KeywordDetectorDeps> = {}): KeywordDetectorDeps {
  return {
    isEnabled: () => true,
    getEnabledExpansions: () => [...KEYWORD_DETECTOR_KEYWORDS],
    now: () => 1_000_000,
    ...overrides,
  }
}

function bsp(convId: string, prompt: string, d: KeywordDetectorDeps) {
  const handler = createKeywordDetectorHandler(new Map(), d)
  return handler["/beforeSubmitPrompt"]!({ conversation_id: convId, prompt })
}

describe("keyword-detector", () => {
  beforeEach(() => {
    resetKeywordDetectorState()
    contextCollector.clearAll()
  })

  afterEach(() => {
    resetKeywordDetectorState()
    contextCollector.clearAll()
    for (const id of [...conversations.keys()]) {
      if (id.startsWith("kw-test-")) conversations.delete(id)
    }
  })

  describe("keyword detection -> mode flag", () => {
    it("sets a per-conversation flag when 'ultrawork' is present", () => {
      const convId = makeConvId()
      bsp(convId, "please ultrawork on this", deps())
      const flag = getKeywordFlag(convId)
      expect(flag).toBeDefined()
      expect(flag!.keyword).toBe("ultrawork")
      expect(flag!.armedAt).toBe(1_000_000)
    })

    it("detects 'ulw' as the ultrawork family", () => {
      const convId = makeConvId()
      bsp(convId, "ulw now", deps())
      expect(getKeywordFlag(convId)!.keyword).toBe("ulw")
    })

    it("detects 'boulder'", () => {
      const convId = makeConvId()
      bsp(convId, "start the boulder", deps())
      expect(getKeywordFlag(convId)!.keyword).toBe("boulder")
    })

    it("is case-insensitive", () => {
      const convId = makeConvId()
      bsp(convId, "ULTRAWORK please", deps())
      expect(getKeywordFlag(convId)!.keyword).toBe("ultrawork")
    })

    it("prefers the longest keyword: '/ralph-loop' -> 'ralph-loop' not 'ralph'", () => {
      const convId = makeConvId()
      bsp(convId, "/ralph-loop go", deps())
      expect(getKeywordFlag(convId)!.keyword).toBe("ralph-loop")
    })

    it("matches whole words only: 'ralphie' does NOT trigger 'ralph'", () => {
      const convId = makeConvId()
      bsp(convId, "ralphie is a name", deps())
      expect(getKeywordFlag(convId)).toBeUndefined()
    })

    it("does nothing when no keyword is present", () => {
      const convId = makeConvId()
      const result = bsp(convId, "just a normal prompt", deps())
      expect(getKeywordFlag(convId)).toBeUndefined()
      expect(result).toEqual({})
      expect(contextCollector.getPending(convId).hasContent).toBe(false)
    })
  })

  describe("preamble registration (piggyback delivery)", () => {
    it("registers a HIGH-priority preamble for the matched conversation", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps())
      const pending = contextCollector.getPending(convId)
      const entry = pending.entries.find((e) => e.source === "keyword-detector")
      expect(entry).toBeDefined()
      expect(entry!.priority).toBe("high")
      expect(entry!.content.toLowerCase()).toContain("ultrawork")
    })

    it("does NOT mutate the prompt or return additional_context/permission/followup", () => {
      const convId = makeConvId()
      const result = bsp(convId, "ralph please", deps()) as Record<string, unknown>
      expect(result).not.toHaveProperty("permission")
      expect(result).not.toHaveProperty("followup_message")
      expect(result).not.toHaveProperty("additional_context")
      expect(result).not.toHaveProperty("updated_input")
    })

    it("overwrites (stable id) rather than accumulating across prompts", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps())
      bsp(convId, "ultrawork again", deps())
      const entries = contextCollector
        .getPending(convId)
        .entries.filter((e) => e.source === "keyword-detector")
      expect(entries.length).toBe(1)
    })
  })

  describe("EC5 strict conversation scoping (no cross-conversation leak)", () => {
    it("preamble for conv-A never appears in conv-B", () => {
      const convA = makeConvId()
      const convB = makeConvId()
      bsp(convA, "ultrawork on A", deps())
      bsp(convB, "a normal prompt with no keyword", deps())
      expect(contextCollector.getPending(convA).hasContent).toBe(true)
      expect(contextCollector.getPending(convB).hasContent).toBe(false)
      expect(getKeywordFlag(convA)).toBeDefined()
      expect(getKeywordFlag(convB)).toBeUndefined()
    })

    it("each conversation keeps its own keyword flag", () => {
      const convA = makeConvId()
      const convB = makeConvId()
      bsp(convA, "ultrawork", deps())
      bsp(convB, "boulder", deps())
      expect(getKeywordFlag(convA)!.keyword).toBe("ultrawork")
      expect(getKeywordFlag(convB)!.keyword).toBe("boulder")
    })
  })

  describe("loop arming (reuses existing ralph/boulder state machines)", () => {
    it("arms ralphState for ultrawork (rides the ralph machine)", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps())
      const conv = conversations.get(convId)
      expect(conv?.ralphState?.active).toBe(true)
    })

    it("arms ralphState for ralph-loop", () => {
      const convId = makeConvId()
      bsp(convId, "/ralph-loop", deps())
      expect(conversations.get(convId)?.ralphState?.active).toBe(true)
    })

    it("arms boulderState for boulder", () => {
      const convId = makeConvId()
      bsp(convId, "boulder", deps())
      const conv = conversations.get(convId)
      expect(conv?.boulderState?.active).toBe(true)
    })
  })

  describe("TTL expiry (300s)", () => {
    it("exposes a 300s TTL constant", () => {
      expect(KEYWORD_FLAG_TTL_MS).toBe(300_000)
    })

    it("purges a flag older than the TTL", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps({ now: () => 1_000_000 }))
      expect(getKeywordFlag(convId)).toBeDefined()
      purgeExpiredKeywordFlags(1_000_000 + KEYWORD_FLAG_TTL_MS + 1)
      expect(getKeywordFlag(convId)).toBeUndefined()
    })

    it("keeps a flag within the TTL window", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps({ now: () => 1_000_000 }))
      purgeExpiredKeywordFlags(1_000_000 + KEYWORD_FLAG_TTL_MS - 1)
      expect(getKeywordFlag(convId)).toBeDefined()
    })

    it("purges expired flags on the next handler invocation", () => {
      const convId = makeConvId()
      const other = makeConvId()
      bsp(convId, "ultrawork", deps({ now: () => 1_000_000 }))
      // a later, non-matching prompt advances the clock and triggers purge
      bsp(other, "nothing here", deps({ now: () => 1_000_000 + KEYWORD_FLAG_TTL_MS + 5 }))
      expect(getKeywordFlag(convId)).toBeUndefined()
    })
  })

  describe("session-end cleanup", () => {
    it("clears the flag for the ended conversation", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps())
      expect(getKeywordFlag(convId)).toBeDefined()
      const handler = createKeywordDetectorHandler(new Map(), deps())
      handler["/sessionEnd"]!({ conversation_id: convId })
      expect(getKeywordFlag(convId)).toBeUndefined()
    })
  })

  describe("enabled_expansions allowlist", () => {
    it("does not trigger for a keyword removed from the allowlist", () => {
      const convId = makeConvId()
      bsp(convId, "boulder", deps({ getEnabledExpansions: () => ["ultrawork", "ulw", "ralph-loop", "ralph"] }))
      expect(getKeywordFlag(convId)).toBeUndefined()
    })

    it("still triggers for keywords kept in the allowlist", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps({ getEnabledExpansions: () => ["ultrawork"] }))
      expect(getKeywordFlag(convId)!.keyword).toBe("ultrawork")
    })
  })

  describe("disable switches", () => {
    it("returns {} and sets no flag when disabled via config", () => {
      const convId = makeConvId()
      const result = bsp(convId, "ultrawork", deps({ isEnabled: () => false }))
      expect(result).toEqual({})
      expect(getKeywordFlag(convId)).toBeUndefined()
    })

    it("returns {} when OH_MY_CURSOR_DISABLED_HOOKS includes keyword-detector", () => {
      const convId = makeConvId()
      const old = process.env.OH_MY_CURSOR_DISABLED_HOOKS
      process.env.OH_MY_CURSOR_DISABLED_HOOKS = "foo,keyword-detector,bar"
      try {
        const result = bsp(convId, "ultrawork", deps())
        expect(result).toEqual({})
        expect(getKeywordFlag(convId)).toBeUndefined()
      } finally {
        if (old) process.env.OH_MY_CURSOR_DISABLED_HOOKS = old
        else delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
      }
    })
  })

  describe("conversation id resolution", () => {
    it("falls back to session_id when conversation_id is absent", () => {
      const sid = makeConvId()
      const handler = createKeywordDetectorHandler(new Map(), deps())
      handler["/beforeSubmitPrompt"]!({ session_id: sid, prompt: "ultrawork" })
      expect(getKeywordFlag(sid)!.keyword).toBe("ultrawork")
    })
  })

  describe("resetKeywordDetectorState", () => {
    it("clears all flags for test isolation", () => {
      const convId = makeConvId()
      bsp(convId, "ultrawork", deps())
      expect(getKeywordFlag(convId)).toBeDefined()
      resetKeywordDetectorState()
      expect(getKeywordFlag(convId)).toBeUndefined()
    })
  })

  describe("default config path (no injected deps)", () => {
    it("is enabled by default and detects keywords", () => {
      const convId = makeConvId()
      const handler = createKeywordDetectorHandler(new Map())
      handler["/beforeSubmitPrompt"]!({ conversation_id: convId, prompt: "ultrawork" })
      expect(getKeywordFlag(convId)!.keyword).toBe("ultrawork")
    })
  })
})
