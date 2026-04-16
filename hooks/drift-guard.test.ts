import { describe, it, expect } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(import.meta.dir, "..")

/**
 * Extracts a markdown h2 section from a brief, fence-aware so that headings
 * inside fenced code blocks (```...```) do not terminate the section early.
 * Returns the section body lines from the heading to (but not including)
 * the next h2/h1 heading at column 0 outside any fenced block.
 */
function extractSection(markdown: string, h2Title: string): string {
  const lines = markdown.split("\n")
  let startLine = -1
  let endLine = lines.length
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trimStart().startsWith("```")) inFence = !inFence
    if (startLine < 0) {
      if (!inFence && line.startsWith(`## ${h2Title}`)) startLine = i
    } else {
      if (!inFence && /^#{1,2} /.test(line)) {
        endLine = i
        break
      }
    }
  }

  if (startLine < 0) return ""
  return lines.slice(startLine, endLine).join("\n")
}

describe("drift guard: prometheus-plan-brief vs commands/plan.md", () => {
  it("test-strategy script in commands/plan.md contains all significant lines from rules/prometheus-plan-brief.mdc (fence-aware)", () => {
    const brief = readFileSync(path.join(REPO_ROOT, "rules/prometheus-plan-brief.mdc"), "utf-8")
    const planMd = readFileSync(path.join(REPO_ROOT, "commands/plan.md"), "utf-8")

    const briefSection = extractSection(brief, "Test Strategy Elicitation")
    expect(briefSection.length).toBeGreaterThan(0)
    expect(briefSection).toContain("Test Strategy Decision")
    expect(briefSection).toContain("Trivial/Standard/Collaborative")

    const significantLines = briefSection
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 15 && !l.startsWith("#"))

    expect(significantLines.length).toBeGreaterThan(5)

    const missing: string[] = []
    for (const line of significantLines) {
      if (!planMd.includes(line)) missing.push(line)
    }

    expect(missing).toEqual([])
  })

  it("clearance checklist in commands/plan.md contains 'Test strategy confirmed?' inlined", () => {
    const planMd = readFileSync(path.join(REPO_ROOT, "commands/plan.md"), "utf-8")
    expect(planMd).toContain("Test strategy confirmed?")
  })

  it("rules/prometheus-plan-brief.mdc has alwaysApply: true frontmatter", () => {
    const brief = readFileSync(path.join(REPO_ROOT, "rules/prometheus-plan-brief.mdc"), "utf-8")
    expect(brief).toMatch(/^---[\s\S]*alwaysApply:\s*true[\s\S]*?---/m)
  })
})
