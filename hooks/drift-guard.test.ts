import { describe, it, expect } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(import.meta.dir, "..")

describe("drift guard: prometheus-plan-brief vs commands/plan.md", () => {
  it("test-strategy script in commands/plan.md contains all significant lines from rules/prometheus-plan-brief.mdc", () => {
    const brief = readFileSync(path.join(REPO_ROOT, "rules/prometheus-plan-brief.mdc"), "utf-8")
    const planMd = readFileSync(path.join(REPO_ROOT, "commands/plan.md"), "utf-8")

    const sectionMatch = brief.match(/##\s+Test Strategy Elicitation[\s\S]*?(?=\n##\s|\n#\s|$)/)
    expect(sectionMatch).toBeTruthy()
    const briefSection = sectionMatch![0]

    const significantLines = briefSection
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 15 && !l.startsWith("#"))

    expect(significantLines.length).toBeGreaterThan(3)

    const missing: string[] = []
    for (const line of significantLines) {
      if (!planMd.includes(line)) missing.push(line)
    }

    expect(missing).toEqual([])
  })

  it("clearance checklist in commands/plan.md contains 'Test strategy confirmed?' inlined", () => {
    const planMd = readFileSync(path.join(REPO_ROOT, "commands/plan.md"), "utf-8")
    expect(planMd).toContain("Test strategy confirmed")
  })

  it("rules/prometheus-plan-brief.mdc has alwaysApply: true frontmatter", () => {
    const brief = readFileSync(path.join(REPO_ROOT, "rules/prometheus-plan-brief.mdc"), "utf-8")
    expect(brief).toMatch(/^---[\s\S]*alwaysApply:\s*true[\s\S]*?---/m)
  })
})
