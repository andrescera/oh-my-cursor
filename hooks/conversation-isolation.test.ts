import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { resolveConversationId, getOrCreateConversation, conversations } from "./shared"
import { ContextCollector } from "./context-collector"
import { BackgroundTracker, createBackgroundTasksHandler } from "./handlers/background-tracker"
import { addWisdomLearning, formatWisdomForInjection } from "./handlers/wisdom-tracker"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("conversation isolation", () => {
  beforeEach(() => {
    conversations.clear()
  })

  afterEach(() => {
    conversations.clear()
  })

  describe("resolveConversationId", () => {
    it("returns conversation_id when present", () => {
      expect(
        resolveConversationId({
          conversation_id: "conv-abc",
        }),
      ).toBe("conv-abc")
    })

    it("falls back to session_id when conversation_id is missing", () => {
      expect(
        resolveConversationId({
          session_id: "sess-xyz",
        }),
      ).toBe("sess-xyz")
    })

    it("returns a UUID (not unknown) when both are missing", () => {
      const id = resolveConversationId({})
      expect(id).not.toBe("unknown")
      expect(id).toMatch(UUID_RE)
    })

    it("returns unique UUIDs on each call when both are missing", () => {
      const a = resolveConversationId({})
      const b = resolveConversationId({})
      expect(a).not.toBe(b)
      expect(a).toMatch(UUID_RE)
      expect(b).toMatch(UUID_RE)
    })

    it("prefers conversation_id over session_id when both present", () => {
      expect(
        resolveConversationId({
          conversation_id: "primary",
          session_id: "secondary",
        }),
      ).toBe("primary")
    })
  })

  describe("conversation-scoped readPaths", () => {
    it("does not leak readPaths between conversations", () => {
      const conversationA = getOrCreateConversation("session-a")
      conversationA.readPaths.add("/only-in-a")
      const conversationB = getOrCreateConversation("session-b")
      expect(conversationB.readPaths.has("/only-in-a")).toBe(false)
    })
  })

  describe("conversation-scoped delegateRetryState", () => {
    it("does not share delegateRetryState between conversations", () => {
      const conversationA = getOrCreateConversation("delegate-a")
      conversationA.delegateRetryState["omi.probe"] = 7
      const conversationB = getOrCreateConversation("delegate-b")
      expect(Object.keys(conversationB.delegateRetryState)).toHaveLength(0)
    })
  })

  describe("BackgroundTracker", () => {
    let tracker: BackgroundTracker

    beforeEach(() => {
      tracker = new BackgroundTracker()
    })

    it("getActiveTasksForConversation returns only tasks for the requested conversation", () => {
      tracker.track("agent-1", "explore", "Task one", "conv-1")
      tracker.track("agent-2", "librarian", "Task two", "conv-2")
      tracker.track("agent-3", "explore", "Task three", "conv-1")

      const forOne = tracker.getActiveTasksForConversation("conv-1")
      expect(forOne).toHaveLength(2)
      expect(new Set(forOne.map((t) => t.agentId))).toEqual(new Set(["agent-1", "agent-3"]))
      forOne.forEach((t) => {
        expect(t.conversationId).toBe("conv-1")
      })

      const forTwo = tracker.getActiveTasksForConversation("conv-2")
      expect(forTwo).toHaveLength(1)
      expect(forTwo[0].agentId).toBe("agent-2")
    })

    it("getActiveTasks returns all tasks (backward compatible)", () => {
      tracker.track("a1", "explore", "A", "c1")
      tracker.track("a2", "explore", "B", "c2")
      const all = tracker.getActiveTasks()
      expect(all).toHaveLength(2)
      expect(new Set(all.map((t) => t.agentId))).toEqual(new Set(["a1", "a2"]))
    })
  })

  describe("ContextCollector per-conversation counter", () => {
    let collector: ContextCollector

    beforeEach(() => {
      collector = new ContextCollector()
    })

    it("starts registration order at 1 independently per conversation", () => {
      collector.register("s-one", { id: "e1", source: "src", content: "a" })
      collector.register("s-two", { id: "e1", source: "src", content: "b" })

      const one = collector.getPending("s-one")
      const two = collector.getPending("s-two")
      expect(one.entries[0].registrationOrder).toBe(1)
      expect(two.entries[0].registrationOrder).toBe(1)

      collector.register("s-one", { id: "e2", source: "src", content: "c" })
      collector.register("s-two", { id: "e2", source: "src", content: "d" })

      const oneAfter = collector.getPending("s-one")
      const twoAfter = collector.getPending("s-two")
      const ordersOne = oneAfter.entries.map((e) => e.registrationOrder).sort((a, b) => a - b)
      const ordersTwo = twoAfter.entries.map((e) => e.registrationOrder).sort((a, b) => a - b)
      expect(ordersOne).toEqual([1, 2])
      expect(ordersTwo).toEqual([1, 2])
    })

    it("clear(sessionId) removes entries and counter for that conversation only", () => {
      collector.register("keep", { id: "x", source: "s", content: "k" })
      collector.register("drop", { id: "y", source: "s", content: "d" })
      collector.register("drop", { id: "z", source: "s", content: "d2" })

      collector.clear("drop")

      expect(collector.hasPending("drop")).toBe(false)
      expect(collector.hasPending("keep")).toBe(true)

      collector.register("drop", { id: "fresh", source: "s", content: "new" })
      const pending = collector.getPending("drop")
      expect(pending.entries).toHaveLength(1)
      expect(pending.entries[0].registrationOrder).toBe(1)
    })
  })
})

describe("wisdomLearnings conversation isolation", () => {
  it("should isolate wisdom entries per conversation even with same plan path", () => {
    const convA = getOrCreateConversation("conv-A")
    const convB = getOrCreateConversation("conv-B")
    const entry = { source: "worker", learning: "lesson", timestamp: "2024-01-01" }

    addWisdomLearning(convA, { ...entry, learning: "lesson A" })
    addWisdomLearning(convB, { ...entry, learning: "lesson B" })

    expect(convA.wisdomLearnings).toHaveLength(1)
    expect(convA.wisdomLearnings[0].learning).toBe("lesson A")
    expect(convB.wisdomLearnings).toHaveLength(1)
    expect(convB.wisdomLearnings[0].learning).toBe("lesson B")
  })

  it("should format injection scoped to conversation", () => {
    const convX = getOrCreateConversation("conv-X")
    const convY = getOrCreateConversation("conv-Y")

    addWisdomLearning(convX, { source: "explore", learning: "found pattern", timestamp: "2024-01-01" })

    expect(formatWisdomForInjection(convX)).toContain("found pattern")
    expect(formatWisdomForInjection(convY)).toBe("")
  })

  it("should drop wisdom when conversation is removed from the map", () => {
    const conv1 = getOrCreateConversation("conv-1")
    const conv2 = getOrCreateConversation("conv-2")

    addWisdomLearning(conv1, { source: "w1", learning: "L1", timestamp: "2024-01-01" })
    addWisdomLearning(conv2, { source: "w2", learning: "L2", timestamp: "2024-01-01" })

    conversations.delete("conv-1")
    const fresh1 = getOrCreateConversation("conv-1")

    expect(fresh1.wisdomLearnings).toHaveLength(0)
    expect(conv2.wisdomLearnings).toHaveLength(1)
  })
})

describe("BackgroundTracker empty convId isolation", () => {
  it("should return empty array when convId is missing", () => {
    const tracker = new BackgroundTracker()
    tracker.track("agent-1", "explore", "searching", "conv-A")
    tracker.track("agent-2", "sisyphus", "building", "conv-B")

    const handler = createBackgroundTasksHandler(tracker)
    const result = handler({ conversation_id: "", session_id: "" })

    expect(result.tasks).toHaveLength(0)
    expect(result.count).toBe(0)
  })

  it("should return only that conversation's tasks when convId is present", () => {
    const tracker = new BackgroundTracker()
    tracker.track("agent-1", "explore", "searching", "conv-A")
    tracker.track("agent-2", "sisyphus", "building", "conv-B")
    tracker.track("agent-3", "explore", "more searching", "conv-A")

    const handler = createBackgroundTasksHandler(tracker)
    const result = handler({ conversation_id: "conv-A" })

    expect(result.tasks).toHaveLength(2)
    expect(result.count).toBe(2)
    expect(result.tasks.every((t: { conversationId: string }) => t.conversationId === "conv-A")).toBe(true)
  })
})
