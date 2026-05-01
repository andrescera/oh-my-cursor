import { describe, expect, test } from "bun:test"
import { redactSecrets } from "./secret-redactor"

describe("redactSecrets", () => {
  test("redacts OpenAI sk- keys", () => {
    const out = redactSecrets("My key is sk-abcdefghijklmnopqrstuvwx and more text")
    expect(out).toContain("[REDACTED:openai]")
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwx")
  })

  test("does not redact short sk- prefixes", () => {
    expect(redactSecrets("sk-short")).toBe("sk-short")
  })

  test("redacts GitHub PAT (ghp_)", () => {
    const out = redactSecrets("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 here")
    expect(out).toContain("[REDACTED:github-pat]")
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789")
  })

  test("redacts GitHub server token (ghs_)", () => {
    const out = redactSecrets("ghs_abcdefghijklmnopqrstuvwxyz0123456789")
    expect(out).toContain("[REDACTED:github-server]")
  })

  test("redacts generic pat_ tokens", () => {
    const out = redactSecrets("auth=pat_abcdefghijklmnopqrstuvwx")
    expect(out).toContain("[REDACTED:pat]")
  })

  test("redacts AWS access key ids", () => {
    const out = redactSecrets("aws AKIAIOSFODNN7EXAMPLE token")
    expect(out).toContain("[REDACTED:aws-akid]")
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE")
  })

  test("does not match AKIA in a longer alphanumeric blob", () => {
    expect(redactSecrets("xAKIAIOSFODNN7EXAMPLEy")).toBe("xAKIAIOSFODNN7EXAMPLEy")
  })

  test("redacts JWT-like tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456"
    const out = redactSecrets(`Authorization: Bearer ${jwt}`)
    expect(out).toContain("[REDACTED:jwt]")
    expect(out).not.toContain(jwt)
  })

  test("redacts basic-auth in URLs", () => {
    const out = redactSecrets("clone https://user:pass@example.com/repo.git now")
    expect(out).toContain("[REDACTED:basic-auth]")
    expect(out).not.toContain("user:pass@")
  })

  test("redacts multiple kinds in a single pass", () => {
    const input = "sk-abcdefghijklmnopqrstuvwx and ghp_abcdefghijklmnopqrstuvwxyz0123456789"
    const out = redactSecrets(input)
    expect(out).toContain("[REDACTED:openai]")
    expect(out).toContain("[REDACTED:github-pat]")
  })

  test("plain English passes through unchanged", () => {
    const input = "This is a normal sentence with no secrets in it."
    expect(redactSecrets(input)).toBe(input)
  })

  test("empty string returns empty string", () => {
    expect(redactSecrets("")).toBe("")
  })
})
