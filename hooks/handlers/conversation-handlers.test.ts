import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createConversationHandlers } from "./conversation-handlers"
import type { BackgroundTracker } from "./background-tracker"
import type { StatePersistence } from "../state-persistence"
import {
  conversations,
  setPersistence,
  getOrCreateConversation,
  getFallbackConversationsCreatedSinceBoot,
} from "../shared"
import { contextCollector } from "../context-collector"
import { resetConfigCache } from "../config"

// Isolated, non-live port (never 27847/27848). sessionStart derives daemon/sidecar
// ports from this; pinning it keeps the test off the user's live daemon.
const TEST_PORT = 28900
const getPort = () => TEST_PORT

// An inert global persistence whose every method is a no-op. Used to restore the
// shared module-level persistence after each test so a partial stub can never
// leak into sibling test files (per Task 8 learnings about cross-test bleed).
const PERSISTENCE_PROXY = new Proxy({}, { get: () => () => undefined }) as unknown as StatePersistence

// A concrete inert persistence with all known methods, optionally overridden.
// Passed to the handler factory (separate from the module-global persistence).
function inertPersistence(overrides: Partial<Record<string, unknown>> = {}): StatePersistence {
  return {
    pruneStale: () => [],
    removeConversation: () => {},
    setIdentity: () => {},
    markDirty: () => {},
    save: () => Promise.resolve(),
    forceFlush: () => {},
    loadOne: () => null,
    loadIndex: () => new Map(),
    ...overrides,
  } as unknown as StatePersistence
}

function makeTracker(): { tracker: BackgroundTracker; clearedConvs: string[] } {
  const clearedConvs: string[] = []
  const tracker = {
    clearConversation: (id: string) => {
      clearedConvs.push(id)
    },
    getActiveTasksForConversation: () => [],
    getActiveTasks: () => [],
    track: () => {},
    complete: () => {},
    cleanup: () => {},
  } as unknown as BackgroundTracker
  return { tracker, clearedConvs }
}

const CONV = "conversation-handlers-test-conv"

describe("createConversationHandlers", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
    setPersistence(PERSISTENCE_PROXY)
    resetConfigCache()
  })

  afterEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
    // Restore a safe global persistence so no partial stub leaks into other files.
    setPersistence(PERSISTENCE_PROXY)
    resetConfigCache()
  })

  describe("#sessionStart lifecycle", () => {
    test("creates the conversation and returns identity context + ports from getPort", () => {
      const { tracker } = makeTracker()
      const handlers = createConversationHandlers(conversations, getPort, tracker, inertPersistence())

      const result = handlers["/sessionStart"]({
        conversation_id: CONV,
        workspace_roots: ["/tmp/example-project"],
      }) as Record<string, unknown>

      expect(conversations.has(CONV)).toBe(true)

      const env = result.env as Record<string, string>
      expect(env.OH_MY_CURSOR_SESSION_ID).toBe(CONV)
      expect(env.OH_MY_CURSOR_PROJECT_DIR).toBe("/tmp/example-project")
      expect(env.OH_MY_CURSOR_DAEMON_PORT).toBe(String(TEST_PORT))
      expect(env.OH_MY_CURSOR_SIDECAR_PORT).toBe(String(TEST_PORT + 1))

      expect(String(result.additional_context)).toContain(CONV)
      const hookSpecific = result.hookSpecificOutput as Record<string, unknown>
      expect(hookSpecific.hookEventName).toBe("SessionStart")
    })
  })

  describe("#sessionEnd lifecycle", () => {
    test("deletes the conversation and clears collector, tracker, and persistence", () => {
      const { tracker, clearedConvs } = makeTracker()
      const removeConversation = mock((_id: string) => {})
      const handlers = createConversationHandlers(
        conversations,
        getPort,
        tracker,
        inertPersistence({ removeConversation }),
      )

      // Warm the conversation and stash a collector advisory tied to it.
      getOrCreateConversation(CONV)
      contextCollector.register(CONV, {
        id: "advisory",
        source: "test",
        content: "pending advisory",
        priority: "normal",
      })
      expect(contextCollector.hasPending(CONV)).toBe(true)

      const result = handlers["/sessionEnd"]({ conversation_id: CONV }) as Record<string, unknown>

      expect(result).toEqual({})
      expect(conversations.has(CONV)).toBe(false)
      expect(contextCollector.hasPending(CONV)).toBe(false)
      expect(clearedConvs).toContain(CONV)
      expect(removeConversation).toHaveBeenCalledWith(CONV)
    })
  })

  describe("#health snapshot/status reporting", () => {
    test("aggregates tool calls and dispatch counts across conversations", () => {
      const { tracker } = makeTracker()
      const handlers = createConversationHandlers(conversations, getPort, tracker, inertPersistence())

      const conversation = getOrCreateConversation(CONV)
      conversation.toolCallCount = 7
      conversation.dispatchCounts["subagent:explore"] = 2
      conversation.dispatchCounts["subagent:sisyphus"] = 3

      const result = handlers["/health"]({ conversation: "" }) as Record<string, unknown>

      expect(result.status).toBe("ok")
      expect(result.toolCalls).toBe(7)
      expect(result.exploreCounts).toBe(2)
      expect(result.workerCounts).toBe(3)
      const allDispatch = result.allDispatchCounts as Record<string, number>
      expect(allDispatch["subagent:explore"]).toBe(2)
      expect(allDispatch["subagent:sisyphus"]).toBe(3)
    })

    test("scopes the snapshot to a single conversation when filter provided", () => {
      const { tracker } = makeTracker()
      const handlers = createConversationHandlers(conversations, getPort, tracker, inertPersistence())

      const conversation = getOrCreateConversation(CONV)
      conversation.toolCallCount = 4

      const result = handlers["/health"]({ conversation: CONV }) as Record<string, unknown>
      expect(result.conversationCount).toBe(1)
      expect(result.toolCalls).toBe(4)
    })
  })

  describe("#preCompact snapshot reporting", () => {
    let projectDir: string

    beforeEach(() => {
      projectDir = mkdtempSync(join(tmpdir(), "conv-precompact-"))
    })

    afterEach(() => {
      rmSync(projectDir, { recursive: true, force: true })
    })

    test("increments the compaction epoch and records a snapshot", () => {
      const { tracker } = makeTracker()
      const handlers = createConversationHandlers(conversations, getPort, tracker, inertPersistence())

      const conversation = getOrCreateConversation(CONV)
      conversation.env.OH_MY_CURSOR_PROJECT_DIR = projectDir
      conversation.toolCallCount = 5
      conversation.dispatchCounts["subagent:explore"] = 1
      conversation.injectedPaths.add("/tmp/already-injected")
      conversation.reminderInjected = true

      handlers["/preCompact"]({ conversation_id: CONV })

      const after = conversations.get(CONV)!
      expect(after.lastCompactionEpoch).toBe(1)
      expect(after.compactionSnapshot).not.toBeNull()
      expect(after.compactionSnapshot!.toolCallCount).toBe(5)
      // preCompact resets per-turn injection bookkeeping.
      expect(after.injectedPaths.size).toBe(0)
      expect(after.reminderInjected).toBe(false)
    })
  })

  describe("#rehydration interaction (Task 8 Fix C)", () => {
    test("clears stale collector advisories when a conversation is rehydrated", () => {
      // Build a real ConversationState via the create path, then evict it so the
      // next lookup must rehydrate from persistence.loadOne.
      const loaded = getOrCreateConversation(CONV)
      conversations.delete(CONV)
      contextCollector.clear(CONV)

      // A stale advisory from a prior daemon lifecycle still sits in the collector.
      contextCollector.register(CONV, {
        id: "stale",
        source: "prior-lifecycle",
        content: "stale advisory that must not replay",
        priority: "normal",
      })
      expect(contextCollector.hasPending(CONV)).toBe(true)

      setPersistence(inertPersistence({ loadOne: () => loaded }))
      getOrCreateConversation(CONV)

      expect(conversations.has(CONV)).toBe(true)
      // Fix C: rehydration drops in-memory advisories so they never replay.
      expect(contextCollector.hasPending(CONV)).toBe(false)
    })
  })

  describe("#fallback conversation-id path", () => {
    test("generates a UUID conversation when no id is supplied and marks it as fallback", () => {
      const { tracker } = makeTracker()
      const handlers = createConversationHandlers(conversations, getPort, tracker, inertPersistence())

      const before = getFallbackConversationsCreatedSinceBoot()

      const result = handlers["/sessionStart"]({
        workspace_roots: ["/tmp/fallback-project"],
      }) as Record<string, unknown>

      const env = result.env as Record<string, string>
      const fallbackId = env.OH_MY_CURSOR_SESSION_ID
      expect(fallbackId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      expect(conversations.has(fallbackId)).toBe(true)
      expect(conversations.get(fallbackId)!.createdViaFallback).toBe(true)
      expect(getFallbackConversationsCreatedSinceBoot()).toBe(before + 1)

      conversations.delete(fallbackId)
      contextCollector.clear(fallbackId)
    })
  })
})
