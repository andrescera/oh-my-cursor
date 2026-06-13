import { describe, it, expect, beforeEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSisyphusJuniorNotepadHandler } from "./sisyphus-junior-notepad"
import { contextCollector } from "../context-collector"
import { conversations, getOrCreateConversation } from "../shared"

const CONV = "sisyphus-junior-notepad-test-conv"

function task(subagentType: string, projectRoot?: string) {
  return {
    tool_name: "Task",
    conversation_id: CONV,
    ...(projectRoot ? { workspace_roots: [projectRoot] } : {}),
    tool_input: { subagent_type: subagentType, prompt: "do work" },
  }
}

describe("sisyphus-junior-notepad", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("registers advisory for sisyphus-junior Task when activePlan exists", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = {
      path: ".cursor/plans/my-feature.plan.md",
      phase: "plan-execute",
      completedTasks: [],
    }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("sisyphus-junior"))

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[sisyphus-junior-notepad]")
    expect(pending.merged).toContain(".cursor/notepads/my-feature/")
    expect(pending.merged).toContain("sisyphus-junior")
  })

  it("does not register advisory when activePlan is missing", () => {
    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("sisyphus-junior"))

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does not register advisory for explore agent type", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = { path: "plan.md", phase: "x", completedTasks: [] }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("explore"))

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("delivers the advisory via the collector, never additional_context (dead channel)", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = {
      path: ".cursor/plans/my-feature.plan.md",
      phase: "plan-execute",
      completedTasks: [],
    }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    const result = handler(task("sisyphus-junior"))

    expect(result).not.toHaveProperty("additional_context")
    expect(contextCollector.getPending(CONV).hasContent).toBe(true)
  })

  it("collapses repeated dispatches onto one keyed entry", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.activePlan = {
      path: ".cursor/plans/my-feature.plan.md",
      phase: "plan-execute",
      completedTasks: [],
    }

    const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
    handler(task("sisyphus-junior"))
    handler(task("sisyphus-junior"))

    const pending = contextCollector.getPending(CONV)
    expect(pending.entries).toHaveLength(1)
    expect(pending.entries[0].id).toBe("sisyphus-junior-notepad")
  })

  it("skips advisory and warns when activePlan.path does not exist under project root", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "omc-notepad-"))
    try {
      getOrCreateConversation(CONV)
      const conv = conversations.get(CONV)!
      conv.activePlan = {
        path: ".cursor/plans/phantom.plan.md",
        phase: "plan-execute",
        completedTasks: [],
      }

      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "))
      }

      try {
        const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
        handler(task("sisyphus-junior", projectRoot))
      } finally {
        console.warn = originalWarn
      }

      expect(contextCollector.getPending(CONV).hasContent).toBe(false)
      expect(warnings.some((w) => w.includes("activePlan.path does not exist"))).toBe(true)
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it("registers advisory when activePlan.path exists under project root", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "omc-notepad-"))
    try {
      const planRel = "real.plan.md"
      writeFileSync(join(projectRoot, planRel), "# plan")

      getOrCreateConversation(CONV)
      const conv = conversations.get(CONV)!
      conv.activePlan = { path: planRel, phase: "plan-execute", completedTasks: [] }

      const handler = createSisyphusJuniorNotepadHandler(conversations)["/preToolUse"]!
      handler(task("sisyphus-junior", projectRoot))

      const pending = contextCollector.getPending(CONV)
      expect(pending.hasContent).toBe(true)
      expect(pending.merged).toContain(".cursor/notepads/real/")
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
