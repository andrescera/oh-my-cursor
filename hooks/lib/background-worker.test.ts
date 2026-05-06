import { describe, test, expect, mock } from "bun:test"

import { createBackgroundWorker } from "./background-worker"
import { createConversationHandlers } from "../handlers/conversation-handlers"
import { BackgroundTracker } from "../handlers/background-tracker"
import type { ConversationState } from "../types"

describe("createBackgroundWorker", () => {
  test("runOnceForTesting calls all three jobs in order", async () => {
    const calls: string[] = []
    const worker = createBackgroundWorker({
      pruneStale: () => { calls.push("pruneStale") },
      rotateIfNeeded: () => { calls.push("rotateIfNeeded") },
      cleanupOldConversationFiles: () => { calls.push("cleanupOldConversationFiles") },
    })

    await worker.runOnceForTesting()

    expect(calls).toEqual([
      "pruneStale",
      "rotateIfNeeded",
      "cleanupOldConversationFiles",
    ])
  })

  test("a throwing job does not prevent next job from running", async () => {
    const rotate = mock(() => {})
    const cleanup = mock(() => {})
    const worker = createBackgroundWorker({
      pruneStale: () => { throw new Error("boom") },
      rotateIfNeeded: rotate,
      cleanupOldConversationFiles: cleanup,
    })

    const originalError = console.error
    console.error = () => {}
    try {
      await worker.runOnceForTesting()
    } finally {
      console.error = originalError
    }

    expect(rotate).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test("worker stops cleanly before first tick fires", async () => {
    const prune = mock(() => {})
    const rotate = mock(() => {})
    const cleanup = mock(() => {})
    const worker = createBackgroundWorker(
      {
        pruneStale: prune,
        rotateIfNeeded: rotate,
        cleanupOldConversationFiles: cleanup,
      },
      { intervalMs: 100, jitterMs: 0 },
    )

    worker.start()
    await Bun.sleep(50)
    await worker.stop()
    await Bun.sleep(200)

    expect(prune).toHaveBeenCalledTimes(0)
    expect(rotate).toHaveBeenCalledTimes(0)
    expect(cleanup).toHaveBeenCalledTimes(0)
  })

  test("/health handler does not call persistence.pruneStale", () => {
    const conversations = new Map<string, ConversationState>()
    const tracker = new BackgroundTracker()
    const pruneStale = mock(() => [] as string[])
    const persistence = {
      pruneStale,
      removeConversation: () => {},
      setIdentity: () => {},
      markDirty: () => {},
      save: () => Promise.resolve(),
      forceFlush: () => {},
      loadOne: () => null,
      loadIndex: () => new Map(),
    }

    const handlers = createConversationHandlers(
      conversations,
      () => 8765,
      tracker,
      persistence as unknown as Parameters<typeof createConversationHandlers>[3],
    )

    handlers["/health"]({ conversation: "" })

    expect(pruneStale).toHaveBeenCalledTimes(0)
  })
})
