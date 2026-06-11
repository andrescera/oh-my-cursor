import { describe, it, expect } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
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

describe("drift guard: rule-surface consistency", () => {
  const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf-8")

  it("Write-over-CreatePlan enforcement present on all 5 surfaces", () => {
    const surfaces: Array<[string, string]> = [
      // prometheus-plan-brief.mdc anchor 1 — substring lives on the CreatePlan-prohibition line (locks the mutation check).
      [
        "rules/prometheus-plan-brief.mdc",
        "stores plans at virtual `cursor-plan://plan/{uuid}.plan.md` URIs that `/start-work` and Atlas cannot read",
      ],
      ["rules/agent-tool-restrictions.mdc", "Task(worker/coordinator agents), CreatePlan"],
      ["commands/plan.md", "**DO NOT** use `CreatePlan` / `cursor.create_plan` / the native plan tool"],
      ["commands/start-work.md", "it likely used Cursor's native `CreatePlan`"],
      ["docs/cursor/19-known-sharp-edges.md", "A `preToolUse` deny for `CreatePlan` was considered and rejected"],
    ]
    for (const [file, phrase] of surfaces) {
      expect(read(file).includes(phrase), `${file} missing enforcement phrase`).toBe(true)
    }
  })

  it("atlas auto-continue passages are Final-Wave scoped", () => {
    const atlas = read("agents/atlas.md")

    // Each "Do NOT auto-continue" must scope to the Final Wave within a 260-char window, else it reads as a blanket ban.
    const negations = [...atlas.matchAll(/[Dd]o NOT auto-continue/g)]
    expect(negations.length).toBeGreaterThan(0)
    for (const m of negations) {
      const start = m.index ?? 0
      const windowText = atlas.slice(start, start + 260)
      expect(
        /Final (Verification )?Wave/.test(windowText),
        "a 'Do NOT auto-continue' passage lacks a Final-Wave scoping qualifier",
      ).toBe(true)
    }

    expect(
      atlas.includes(
        "only exception to the Auto-Continue Policy — it applies exclusively to the Final Verification Wave",
      ),
      "atlas gate paragraph missing only-exception Final-Wave qualifier",
    ).toBe(true)

    expect(
      atlas.includes("**Single exception:** the Final Wave Approval Gate"),
      "atlas Auto-Continue Policy section does not name the Final Wave Approval Gate exception",
    ).toBe(true)
  })

  it("Momus standardized sentence identical in plan.md and prometheus.md", () => {
    const sentence = "Adds review loop but guarantees precision."
    expect(read("commands/plan.md").includes(sentence), "plan.md missing Momus sentence").toBe(true)
    expect(read("agents/prometheus.md").includes(sentence), "prometheus.md missing Momus sentence").toBe(true)
  })

  it("every subagent_type reference resolves to an agents/<name>.md", () => {
    const sources = [
      ...new Bun.Glob("commands/*.md").scanSync(REPO_ROOT),
      ...new Bun.Glob("rules/*.mdc").scanSync(REPO_ROOT),
    ]
    const referenced = new Set<string>()
    for (const rel of sources) {
      const text = read(rel)
      for (const m of text.matchAll(/subagent_type="([^"]+)"/g)) referenced.add(m[1])
    }
    expect(referenced.size).toBeGreaterThan(0)
    const missing = [...referenced].filter(name => !existsSync(path.join(REPO_ROOT, "agents", `${name}.md`)))
    expect(missing, `subagent_type(s) without matching agents/<name>.md: ${missing.join(", ")}`).toEqual([])
  })

  it("explicit-todos enforcement anchors present", () => {
    expect(
      read("rules/orchestrator-reference.mdc").includes(
        "2+ steps → TodoWrite immediately. Mark in_progress on dispatch, completed on success.",
      ),
      "orchestrator-reference.mdc missing TodoWrite anchor",
    ).toBe(true)
    expect(
      read("commands/start-work.md").includes(
        "**Task breakdown (MANDATORY)** — Decompose every plan task into granular, implementation-level sub-steps and register **ALL** of them as todos",
      ),
      "start-work.md missing Task-breakdown MANDATORY anchor",
    ).toBe(true)
  })

  // 6. Doc counts: README hook-event number equals hooks/hooks.json key count.
  it("README hook-event count matches hooks.json key count (Task 19 lock)", () => {
    const readme = read("README.md")
    const m = readme.match(/(\d+) wired hook events/)
    expect(m, "README missing 'N wired hook events' claim").not.toBeNull()
    const documented = Number(m![1])

    const hooks = JSON.parse(read("hooks/hooks.json"))
    const keyCount = Object.keys(hooks.hooks).length

    expect(
      documented,
      `README claims ${documented} wired hook events but hooks.json has ${keyCount} keys`,
    ).toBe(keyCount)
  })
})
