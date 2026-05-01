import { describe, expect, test } from "bun:test"
import { extractDisplayTitle } from "./display-title"

describe("extractDisplayTitle", () => {
  test("captures the first user message", () => {
    expect(extractDisplayTitle("Add user authentication")).toBe("Add user authentication")
  })

  test("collapses newlines into a single line", () => {
    const input = "Add user\n\nauthentication\nplease"
    expect(extractDisplayTitle(input)).toBe("Add user authentication please")
  })

  test("strips fenced code blocks", () => {
    const input = "Look at this:\n```ts\nconst secret = 'sk-abc'\n```\nand fix the bug"
    const out = extractDisplayTitle(input)
    expect(out).not.toContain("```")
    expect(out).not.toContain("const secret")
    expect(out).toContain("Look at this")
    expect(out).toContain("fix the bug")
  })

  test("clamps to 80 characters with ellipsis", () => {
    const long = "a".repeat(120)
    const out = extractDisplayTitle(long)
    expect(out.length).toBeLessThanOrEqual(80)
    expect(out.endsWith("\u2026")).toBe(true)
  })

  test("redacts OpenAI keys", () => {
    const input = "Set OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx in env"
    const out = extractDisplayTitle(input)
    expect(out).toContain("[REDACTED:openai]")
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwx")
  })

  test("redacts GitHub PATs", () => {
    const input = "use ghp_abcdefghijklmnopqrstuvwxyz0123456789 to clone"
    const out = extractDisplayTitle(input)
    expect(out).toContain("[REDACTED:github-pat]")
  })

  test("redacts AWS keys", () => {
    const out = extractDisplayTitle("creds AKIAIOSFODNN7EXAMPLE here")
    expect(out).toContain("[REDACTED:aws-akid]")
  })

  test("redacts basic-auth URLs", () => {
    const out = extractDisplayTitle("clone https://user:pass@example.com/repo.git")
    expect(out).toContain("[REDACTED:basic-auth]")
    expect(out).not.toContain("user:pass@")
  })

  test("returns empty string for empty input", () => {
    expect(extractDisplayTitle("")).toBe("")
  })

  test("returns empty string for whitespace-only input", () => {
    expect(extractDisplayTitle("   \n\n\t  ")).toBe("")
  })

  test("returns empty string when only fenced code remains", () => {
    expect(extractDisplayTitle("```\nfoo\n```")).toBe("")
  })
})
