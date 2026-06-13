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

    describe("#when many same-priority entries are consumed repeatedly", () => {
      test("#then the order is identical across 5 runs", () => {
        const orderings: string[][] = []
        for (let run = 0; run < 5; run++) {
          const c = new ContextCollector()
          for (let i = 0; i < 10; i++) {
            c.register("s1", {
              id: `entry-${i}`,
              source: "src",
              content: `content-${i}`,
              priority: "normal",
            })
          }
          orderings.push(c.consume("s1").entries.map((e) => e.id))
        }

        const expected = Array.from({ length: 10 }, (_, i) => `entry-${i}`)
        for (const ordering of orderings) {
          expect(ordering).toEqual(expected)
        }
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

describe("ContextCollector budget enforcement", () => {
  const SUPPRESSION_RE = /\[oh-my-cursor: \d+ advisories suppressed \(budget exceeded\)\]/

  describe("#given a tight total budget", () => {
    test("#then merged output never exceeds max_context_chars", () => {
      const collector = new ContextCollector({
        maxEntryChars: 1000,
        maxContextChars: 1500,
        priorityBudgets: { critical: 5000, high: 5000, normal: 5000, low: 5000 },
      })
      for (let i = 0; i < 20; i++) {
        collector.register("s1", {
          id: `e${i}`,
          source: "src",
          content: "x".repeat(300),
          priority: i % 2 === 0 ? "high" : "low",
        })
      }

      const result = collector.consume("s1")
      expect(result.merged.length).toBeLessThanOrEqual(1500)
    })
  })

  describe("#given entries are skipped because budgets overflow", () => {
    test("#then a suppression footer reports the skipped count", () => {
      const collector = new ContextCollector({
        maxEntryChars: 1000,
        maxContextChars: 50000,
        priorityBudgets: { critical: 5000, high: 5000, normal: 5000, low: 250 },
      })
      collector.register("s1", { id: "k", source: "src", content: "keep", priority: "critical" })
      collector.register("s1", { id: "a", source: "src", content: "y".repeat(200), priority: "low" })
      collector.register("s1", { id: "b", source: "src", content: "z".repeat(200), priority: "low" })

      const result = collector.consume("s1")
      expect(result.merged).toMatch(SUPPRESSION_RE)
      expect(result.merged).toContain("1 advisories suppressed")
      expect(result.merged).toContain("keep")
    })
  })

  describe("#given an entry larger than max_entry_chars", () => {
    test("#then its content is capped at max_entry_chars", () => {
      const maxEntryChars = 500
      const collector = new ContextCollector({
        maxEntryChars,
        maxContextChars: 50000,
        priorityBudgets: { critical: 50000, high: 50000, normal: 50000, low: 50000 },
      })
      collector.register("s1", {
        id: "big",
        source: "src",
        content: "a".repeat(5000),
        priority: "normal",
      })

      const result = collector.consume("s1")
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].content.length).toBeLessThanOrEqual(maxEntryChars)
      expect(result.entries[0].content).toContain("[truncated]")
    })
  })

  describe("#given low-priority entries overflow but critical fits", () => {
    test("#then critical content survives while low content is suppressed", () => {
      const collector = new ContextCollector({
        maxEntryChars: 1000,
        maxContextChars: 50000,
        priorityBudgets: { critical: 5000, high: 5000, normal: 5000, low: 100 },
      })
      collector.register("s1", {
        id: "crit",
        source: "src",
        content: "CRITICAL-PAYLOAD",
        priority: "critical",
      })
      collector.register("s1", { id: "l1", source: "src", content: "l".repeat(80), priority: "low" })
      collector.register("s1", { id: "l2", source: "src", content: "m".repeat(80), priority: "low" })

      const result = collector.consume("s1")
      expect(result.merged).toContain("CRITICAL-PAYLOAD")
      expect(result.merged).toMatch(SUPPRESSION_RE)
    })
  })

  describe("#given nothing needs to be suppressed", () => {
    test("#then no suppression footer is appended", () => {
      const collector = new ContextCollector({
        maxEntryChars: 1000,
        maxContextChars: 50000,
        priorityBudgets: { critical: 5000, high: 5000, normal: 5000, low: 5000 },
      })
      collector.register("s1", { id: "a", source: "src", content: "alpha", priority: "high" })
      collector.register("s1", { id: "b", source: "src", content: "beta", priority: "low" })

      const result = collector.consume("s1")
      expect(result.merged).toBe("alpha\n\n---\n\nbeta")
      expect(result.merged).not.toMatch(SUPPRESSION_RE)
    })
  })

  describe("#given setConfig is used to inject config", () => {
    test("#then the injected budgets are applied", () => {
      const collector = new ContextCollector()
      collector.setConfig({
        maxEntryChars: 100,
        maxContextChars: 50000,
        priorityBudgets: { critical: 50000, high: 50000, normal: 50000, low: 50000 },
      })
      collector.register("s1", {
        id: "big",
        source: "src",
        content: "a".repeat(5000),
        priority: "normal",
      })

      const result = collector.consume("s1")
      expect(result.entries[0].content.length).toBeLessThanOrEqual(100)
    })
  })
})

describe("ContextCollector.consumeUpTo — peek-then-consume-selected", () => {
  let collector: ContextCollector

  beforeEach(() => {
    collector = new ContextCollector()
  })

  describe("#given no entries exist", () => {
    test("#then it returns an empty result without throwing", () => {
      const result = collector.consumeUpTo("unknown", 8000)
      expect(result.hasContent).toBe(false)
      expect(result.merged).toBe("")
      expect(result.entries).toHaveLength(0)
    })
  })

  describe("#given the selection fits within the budget", () => {
    test("#then all entries are delivered and removed", () => {
      collector.register("s1", { id: "a", source: "src", content: "alpha", priority: "high" })
      collector.register("s1", { id: "b", source: "src", content: "beta", priority: "low" })

      const result = collector.consumeUpTo("s1", 8000)
      expect(result.hasContent).toBe(true)
      expect(result.merged).toContain("alpha")
      expect(result.merged).toContain("beta")
      expect(collector.hasPending("s1")).toBe(false)
    })
  })

  describe("#given a critical entry fits but a low entry overflows the budget", () => {
    test("#then the critical entry is delivered and the low entry REMAINS registered", () => {
      collector.register("s1", { id: "crit", source: "src", content: "C".repeat(6000), priority: "critical" })
      collector.register("s1", { id: "lo", source: "src", content: "L".repeat(6000), priority: "low" })

      const first = collector.consumeUpTo("s1", 8000)
      expect(first.entries).toHaveLength(1)
      expect(first.entries[0].id).toBe("crit")
      expect(first.merged).toContain("C".repeat(6000))
      expect(first.merged).not.toContain("L".repeat(6000))

      // Undelivered low entry stays registered for a later call.
      expect(collector.hasPending("s1")).toBe(true)
      const second = collector.consumeUpTo("s1", 8000)
      expect(second.entries).toHaveLength(1)
      expect(second.entries[0].id).toBe("lo")
      expect(second.merged).toContain("L".repeat(6000))
      expect(collector.hasPending("s1")).toBe(false)
    })
  })

  describe("#given undelivered entries from a budget cut", () => {
    test("#then no suppression footer is added (entries deferred, not dropped)", () => {
      collector.register("s1", { id: "crit", source: "src", content: "KEEP", priority: "critical" })
      collector.register("s1", { id: "lo", source: "src", content: "X".repeat(6000), priority: "low" })

      const result = collector.consumeUpTo("s1", 4000)
      expect(result.merged).toBe("KEEP")
      expect(result.merged).not.toMatch(/advisories suppressed/)
      // The deferred low entry must still be retrievable.
      expect(collector.hasPending("s1")).toBe(true)
    })
  })

  describe("#given a budget of zero", () => {
    test("#then nothing is delivered and all entries remain", () => {
      collector.register("s1", { id: "a", source: "src", content: "alpha", priority: "critical" })
      const result = collector.consumeUpTo("s1", 0)
      expect(result.hasContent).toBe(false)
      expect(collector.hasPending("s1")).toBe(true)
    })
  })

  describe("#given entries across two conversations", () => {
    test("#then consumeUpTo only touches the targeted conversation", () => {
      collector.register("s1", { id: "a", source: "src", content: "s1-content" })
      collector.register("s2", { id: "b", source: "src", content: "s2-content" })

      const r1 = collector.consumeUpTo("s1", 8000)
      expect(r1.merged).toContain("s1-content")
      expect(collector.hasPending("s1")).toBe(false)
      expect(collector.hasPending("s2")).toBe(true)
      expect(collector.getPending("s2").merged).toContain("s2-content")
    })
  })

  describe("#given an entry larger than max_entry_chars", () => {
    test("#then its delivered content is capped (priority-budget machinery reused)", () => {
      const capped = new ContextCollector({
        maxEntryChars: 500,
        maxContextChars: 50000,
        priorityBudgets: { critical: 50000, high: 50000, normal: 50000, low: 50000 },
      })
      capped.register("s1", { id: "big", source: "src", content: "a".repeat(5000), priority: "normal" })

      const result = capped.consumeUpTo("s1", 8000)
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].content.length).toBeLessThanOrEqual(500)
      expect(result.entries[0].content).toContain("[truncated]")
    })
  })

  describe("#given merged output of a multi-entry selection", () => {
    test("#then entries are joined with the standard separator", () => {
      collector.register("s1", { id: "a", source: "src", content: "first", priority: "high" })
      collector.register("s1", { id: "b", source: "src", content: "second", priority: "normal" })

      const result = collector.consumeUpTo("s1", 8000)
      expect(result.merged).toBe("first\n\n---\n\nsecond")
    })
  })
})
