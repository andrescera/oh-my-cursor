import { describe, test, expect, beforeEach } from "bun:test"
import { ContextCollector } from "./context-collector"

describe("ContextCollector", () => {
  let collector: ContextCollector

  beforeEach(() => {
    collector = new ContextCollector()
  })

  describe("#given a fresh collector", () => {
    describe("#when hasPending is checked", () => {
      test("#then returns false for unknown conversation", () => {
        expect(collector.hasPending("unknown")).toBe(false)
      })
    })

    describe("#when getPending is called", () => {
      test("#then returns empty result", () => {
        const result = collector.getPending("unknown")
        expect(result.merged).toBe("")
        expect(result.entries).toHaveLength(0)
        expect(result.hasContent).toBe(false)
      })
    })
  })

  describe("#given entries are registered", () => {
    describe("#when a single entry is registered", () => {
      test("#then hasPending returns true", () => {
        collector.register("s1", {
          id: "test",
          source: "test-source",
          content: "test content",
        })
        expect(collector.hasPending("s1")).toBe(true)
      })

      test("#then getPending returns the entry", () => {
        collector.register("s1", {
          id: "test",
          source: "test-source",
          content: "test content",
        })
        const result = collector.getPending("s1")
        expect(result.hasContent).toBe(true)
        expect(result.merged).toBe("test content")
        expect(result.entries).toHaveLength(1)
        expect(result.entries[0].id).toBe("test")
      })
    })

    describe("#when entries with different priorities are registered", () => {
      test("#then they are sorted critical > high > normal > low", () => {
        collector.register("s1", {
          id: "low-entry",
          source: "src",
          content: "low",
          priority: "low",
        })
        collector.register("s1", {
          id: "critical-entry",
          source: "src",
          content: "critical",
          priority: "critical",
        })
        collector.register("s1", {
          id: "normal-entry",
          source: "src",
          content: "normal",
          priority: "normal",
        })
        collector.register("s1", {
          id: "high-entry",
          source: "src",
          content: "high",
          priority: "high",
        })

        const result = collector.getPending("s1")
        expect(result.entries[0].content).toBe("critical")
        expect(result.entries[1].content).toBe("high")
        expect(result.entries[2].content).toBe("normal")
        expect(result.entries[3].content).toBe("low")
      })
    })

    describe("#when entries have the same priority", () => {
      test("#then they are sorted by registration order", () => {
        collector.register("s1", {
          id: "first",
          source: "src",
          content: "first",
          priority: "normal",
        })
        collector.register("s1", {
          id: "second",
          source: "src",
          content: "second",
          priority: "normal",
        })
        collector.register("s1", {
          id: "third",
          source: "src",
          content: "third",
          priority: "normal",
        })

        const result = collector.getPending("s1")
        expect(result.entries[0].content).toBe("first")
        expect(result.entries[1].content).toBe("second")
        expect(result.entries[2].content).toBe("third")
      })
    })

    describe("#when the same key is re-registered", () => {
      test("#then it upserts the entry", () => {
        collector.register("s1", {
          id: "test",
          source: "src",
          content: "original",
        })
        collector.register("s1", {
          id: "test",
          source: "src",
          content: "updated",
        })

        const result = collector.getPending("s1")
        expect(result.entries).toHaveLength(1)
        expect(result.entries[0].content).toBe("updated")
      })
    })

    describe("#when default priority is used", () => {
      test("#then it defaults to normal", () => {
        collector.register("s1", {
          id: "test",
          source: "src",
          content: "content",
        })

        const result = collector.getPending("s1")
        expect(result.entries[0].priority).toBe("normal")
      })
    })
  })

  describe("#given consume is called", () => {
    describe("#when entries exist", () => {
      test("#then it returns merged content and clears", () => {
        collector.register("s1", {
          id: "a",
          source: "src",
          content: "alpha",
          priority: "high",
        })
        collector.register("s1", {
          id: "b",
          source: "src",
          content: "beta",
          priority: "low",
        })

        const result = collector.consume("s1")
        expect(result.hasContent).toBe(true)
        expect(result.merged).toContain("alpha")
        expect(result.merged).toContain("beta")
        expect(result.merged).toContain("---")

        expect(collector.hasPending("s1")).toBe(false)
      })
    })

    describe("#when no entries exist", () => {
      test("#then it returns empty result", () => {
        const result = collector.consume("unknown")
        expect(result.hasContent).toBe(false)
        expect(result.merged).toBe("")
      })
    })
  })

  describe("#given multiple conversations", () => {
    describe("#when entries are registered for different conversations", () => {
      test("#then conversations are isolated", () => {
        collector.register("s1", { id: "a", source: "src", content: "s1-content" })
        collector.register("s2", { id: "b", source: "src", content: "s2-content" })

        const r1 = collector.getPending("s1")
        const r2 = collector.getPending("s2")

        expect(r1.entries).toHaveLength(1)
        expect(r1.entries[0].content).toBe("s1-content")
        expect(r2.entries).toHaveLength(1)
        expect(r2.entries[0].content).toBe("s2-content")
      })
    })

    describe("#when clear is called for one conversation", () => {
      test("#then other conversations are unaffected", () => {
        collector.register("s1", { id: "a", source: "src", content: "s1" })
        collector.register("s2", { id: "b", source: "src", content: "s2" })

        collector.clear("s1")

        expect(collector.hasPending("s1")).toBe(false)
        expect(collector.hasPending("s2")).toBe(true)
      })
    })

    describe("#when clearAll is called", () => {
      test("#then all conversations are cleared", () => {
        collector.register("s1", { id: "a", source: "src", content: "s1" })
        collector.register("s2", { id: "b", source: "src", content: "s2" })

        collector.clearAll()

        expect(collector.hasPending("s1")).toBe(false)
        expect(collector.hasPending("s2")).toBe(false)
      })
    })
  })

  describe("#given merged output format", () => {
    describe("#when multiple entries are consumed", () => {
      test("#then entries are joined with separator", () => {
        collector.register("s1", { id: "a", source: "src", content: "first", priority: "high" })
        collector.register("s1", { id: "b", source: "src", content: "second", priority: "normal" })

        const result = collector.consume("s1")
        expect(result.merged).toBe("first\n\n---\n\nsecond")
      })
    })
  })
})
