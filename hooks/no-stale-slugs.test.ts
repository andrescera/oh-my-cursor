import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..")

/** Pathspec excludes — omit forbidden slug literals from this module where feasible. */
const GIT_GREP_BASE_PATHSPECS = [
  ".",
  ":(exclude)docs/internal/hooks-evidence-v2.jsonl",
  ":(exclude)docs/cursor/16-binary-analysis.md",
  ":(exclude)CHANGELOG.md",
  ":(exclude)hooks/no-stale-slugs.test.ts",
  ":(exclude)agent-transcripts",
  ":(exclude)node_modules",
  ":(exclude)dist",
  ":(exclude).git",
] as const

function gitGrep(pattern: string, extraExcludePaths: string[] = []): {
  exitCode: number | null
  output: string
} {
  const extra = extraExcludePaths.map((p) => `:(exclude)${p}`)
  const result = Bun.spawnSync(
    [
      "git",
      "grep",
      "-nE",
      pattern,
      "--",
      ...GIT_GREP_BASE_PATHSPECS,
      ...extra,
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const output =
    result.stdout.toString("utf8") + result.stderr.toString("utf8")
  return { exitCode: result.exitCode, output }
}

describe("no stale Cursor model slugs (git grep lint)", () => {
  test("pattern 1: opus 4.7 thinking tier without xhigh suffix", () => {
    const pattern =
      "claude-opus-4-7-thinking-" + "high" + "($|[^-])"
    const r = gitGrep(pattern)
    expect(r.exitCode, `Found stale slug references:\n${r.output}`).toBe(1)
  })

  test("pattern 2: codex high-fast variant", () => {
    const pattern = "gpt-5" + "\\." + "3-codex-high-fast"
    const r = gitGrep(pattern)
    expect(r.exitCode, `Found stale slug references:\n${r.output}`).toBe(1)
  })

  test("pattern 3: legacy haiku slug outside translation map files", () => {
    const pattern = "claude-" + "haiku-" + "4-5"
    const r = gitGrep(pattern, [
      "scripts/config-generator.ts",
      "scripts/config-generator.test.ts",
    ])
    expect(r.exitCode, `Found stale slug references:\n${r.output}`).toBe(1)
  })

  test('pattern 4: quoted "composer-2" without -fast suffix', () => {
    const pattern = '"composer-' + '2"' + "($|[^-])"
    const r = gitGrep(pattern)
    expect(r.exitCode, `Found stale slug references:\n${r.output}`).toBe(1)
  })
})
