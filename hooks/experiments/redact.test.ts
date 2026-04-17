import { describe, test, expect } from "bun:test"
import { redact } from "./redact"

describe("redact", () => {
  test("masks email addresses", () => {
    expect(redact("contact me at user@example.com please")).toBe(
      "contact me at <email> please"
    )
  })

  test("masks Stripe-like secret keys", () => {
    expect(redact("key=sk-AbCdEfGhIjKlMnOpQrSt123456")).toBe(
      "key=<sk-redacted>"
    )
  })

  test("masks GitHub PATs (ghp_, ghs_, gho_)", () => {
    expect(redact("token: ghp_AbCdEfGhIjKlMnOpQrSt1234567890")).toBe(
      "token: <gh-redacted>"
    )
    expect(redact("secret: ghs_AbCdEfGhIjKlMnOpQrSt1234567890")).toBe(
      "secret: <gh-redacted>"
    )
    expect(redact("oauth: gho_AbCdEfGhIjKlMnOpQrSt1234567890")).toBe(
      "oauth: <gh-redacted>"
    )
  })

  test("masks AWS access key IDs", () => {
    expect(redact("aws key: AKIAIOSFODNN7EXAMPLE")).toBe(
      "aws key: <aws-redacted>"
    )
  })

  test("masks user home path", () => {
    const home = process.env.HOME ?? "/home/user"
    expect(redact(`path: ${home}/projects/foo`)).toBe(
      "path: <home>/projects/foo"
    )
  })

  test("is idempotent (double-redact same as single)", () => {
    const input = "user@example.com sk-AbCdEfGhIjKlMnOpQrSt123456"
    expect(redact(redact(input))).toBe(redact(input))
  })
})
