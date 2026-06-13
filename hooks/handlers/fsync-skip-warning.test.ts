import { describe, it, expect } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createFsyncSkipWarningHandler } from "./fsync-skip-warning"

type RegisterCall = { conversationId: string; options: RegisterContextOptions }

function fakeCollector() {
  const calls: RegisterCall[] = []
  return {
    calls,
    register(conversationId: string, options: RegisterContextOptions) {
      calls.push({ conversationId, options })
    },
  }
}

describe("createFsyncSkipWarningHandler", () => {
  describe("#given a fresh handler", () => {
    it("returns a handler function", () => {
      const handler = createFsyncSkipWarningHandler()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#when tool_output contains partial write indicators", () => {
    it("registers a high-priority finding for 'partial write'", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      const result = handler({
        tool_name: "Write",
        tool_output: "Error: partial write detected",
        conversationId: "c1",
      })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].conversationId).toBe("c1")
      expect(collector.calls[0].options.priority).toBe("high")
      expect(collector.calls[0].options.source).toBe("fsync-skip-warning")
      expect(collector.calls[0].options.content).toContain("partial write")
    })

    it("registers for 'incomplete' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Write incomplete: file truncated",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("incomplete")
    })

    it("registers for 'truncated' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Edit",
        tool_output: "File was truncated during write",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("truncated")
    })

    it("registers for 'disk full' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Error: disk full",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("disk full")
    })

    it("registers for 'no space left' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "ENOSPC: no space left on device",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("no space left")
    })

    it("registers for 'ENOSPC' error code", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Edit",
        tool_output: "Error code ENOSPC",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("ENOSPC")
    })

    it("registers for 'EDQUOT' error code", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "EDQUOT: quota exceeded",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("EDQUOT")
    })

    it("registers for 'write failed' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Write failed: I/O error",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("write failed")
    })

    it("registers for 'fsync' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Edit",
        tool_output: "fsync failed: device not ready",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("fsync")
    })

    it("registers for 'flush' indicator", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Flush operation failed",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("flush")
    })
  })

  describe("#when tool_output is clean", () => {
    it("returns empty result and does not register", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      const result = handler({
        tool_name: "Write",
        tool_output: "File written successfully",
        conversationId: "c1",
      })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    it("does not register for unrelated errors", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Error: file not found",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when tool_name is not Write or Edit", () => {
    it("returns empty result and does not register", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      const result = handler({
        tool_name: "Read",
        tool_output: "partial write detected",
        conversationId: "c1",
      })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when tool_output is missing", () => {
    it("returns empty result and does not register", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      const result = handler({
        tool_name: "Write",
        conversationId: "c1",
      })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when conversationId is missing", () => {
    it("returns empty result and does not register", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      const result = handler({
        tool_name: "Write",
        tool_output: "partial write detected",
      })

      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when handler is disabled via config", () => {
    it("returns empty result and does not register", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({
        collector,
        isEnabled: () => false,
      })

      handler({
        tool_name: "Write",
        tool_output: "partial write detected",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(0)
    })
  })

  describe("#when multiple risk signatures are present", () => {
    it("registers once with all detected signatures mentioned", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "partial write: disk full, fsync failed",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
      expect(collector.calls[0].options.content).toContain("partial write")
      expect(collector.calls[0].options.content).toContain("disk full")
      expect(collector.calls[0].options.content).toContain("fsync")
    })
  })

  describe("#when case-insensitive matching is needed", () => {
    it("detects 'Partial Write' with capital P", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Write",
        tool_output: "Partial Write detected",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
    })

    it("detects 'FSYNC' in all caps", () => {
      const collector = fakeCollector()
      const handler = createFsyncSkipWarningHandler({ collector })

      handler({
        tool_name: "Edit",
        tool_output: "FSYNC operation failed",
        conversationId: "c1",
      })

      expect(collector.calls).toHaveLength(1)
    })
  })
})
