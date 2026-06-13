import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  MIN_REPORTED_MODELS,
  MAX_REPORTED_VERSIONS,
  validateReportedSlugs,
  captureReported,
  loadReported,
  loadReportedModels,
} from "./reported-models-store"

// The nine canonical seed slugs from the model-enum-reported-capture plan. All
// must pass SLUG_FULL_RE shape validation unchanged.
const SEED_SLUGS = [
  "claude-4.6-sonnet-high-thinking",
  "claude-fable-5-thinking-xhigh",
  "claude-opus-4-8-thinking-xhigh",
  "composer-2.5",
  "composer-2.5-fast",
  "gemini-3.1-pro",
  "gpt-5.3-codex-xhigh-fast",
  "gpt-5.4-medium",
  "gpt-5.5-high",
]

// Hermetic: every test points the store at a fresh temp file via the
// OH_MY_CURSOR_REPORTED_MODELS_FILE override, so the real
// ~/.config/oh-my-cursor/reported-models.json is NEVER read or written.
let tmpDir: string
let storeFile: string
let envBackup: string | undefined

beforeEach(() => {
  envBackup = process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE
  tmpDir = mkdtempSync(join(tmpdir(), "omo-store-"))
  storeFile = join(tmpDir, "reported-models.json")
  process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE = storeFile
})

afterEach(() => {
  if (envBackup === undefined) delete process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE
  else process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE = envBackup
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("reported-models-store — exported constants", () => {
  it("exposes MIN_REPORTED_MODELS=3 and MAX_REPORTED_VERSIONS=10", () => {
    expect(MIN_REPORTED_MODELS).toBe(3)
    expect(MAX_REPORTED_VERSIONS).toBe(10)
  })
})

describe("captureReported / loadReported — round-trip", () => {
  it("persists all 9 seed slugs and loads them back with an ISO-8601 capturedAt", () => {
    captureReported("3.7.36", SEED_SLUGS)
    const entry = loadReported("3.7.36")
    expect(entry).not.toBeNull()
    expect(entry!.models).toEqual(SEED_SLUGS)
    expect(new Date(entry!.capturedAt).toISOString()).toBe(entry!.capturedAt)
  })

  it("loadReportedModels returns just the captured slug array", () => {
    captureReported("3.7.36", SEED_SLUGS)
    expect(loadReportedModels("3.7.36")).toEqual(SEED_SLUGS)
  })
})

describe("loadReported — failure modes return null (never throw)", () => {
  it("returns null for a corrupt store file", () => {
    writeFileSync(storeFile, "{bad json", "utf-8")
    expect(() => loadReported("3.7.36")).not.toThrow()
    expect(loadReported("3.7.36")).toBeNull()
  })

  it("returns null for a missing store file", () => {
    // beforeEach creates only the temp dir, never the file.
    expect(loadReported("3.7.36")).toBeNull()
  })

  it("returns null for an undefined version (no store read)", () => {
    captureReported("3.7.36", SEED_SLUGS)
    expect(loadReported(undefined)).toBeNull()
    expect(loadReportedModels(undefined)).toBeNull()
  })
})

describe("captureReported — below MIN_REPORTED_MODELS is a no-op", () => {
  it("does not persist when the single slug is shape-rejected", () => {
    captureReported("3.7.36", ["only-one-x"])
    expect(loadReported("3.7.36")).toBeNull()
  })

  it("does not persist when valid slugs are fewer than MIN_REPORTED_MODELS", () => {
    captureReported("3.7.36", ["gpt-5.4-medium", "gpt-5.5-high"])
    expect(loadReported("3.7.36")).toBeNull()
  })
})

describe("captureReported — eviction past MAX_REPORTED_VERSIONS", () => {
  it("evicts the oldest version by capturedAt when the store would exceed the cap", () => {
    // Pre-seed exactly MAX_REPORTED_VERSIONS entries with distinct, ascending
    // capturedAt timestamps. "v0" is the oldest by capturedAt.
    const seed: Record<string, { capturedAt: string; models: string[] }> = {}
    for (let i = 0; i < MAX_REPORTED_VERSIONS; i++) {
      const day = String(i + 1).padStart(2, "0")
      seed[`v${i}`] = {
        capturedAt: `2020-01-${day}T00:00:00.000Z`,
        models: ["gpt-5.4-medium", "gpt-5.5-high", "composer-2.5"],
      }
    }
    writeFileSync(storeFile, JSON.stringify(seed, null, 2), "utf-8")

    // The (MAX+1)-th capture gets capturedAt = now (the newest), so the oldest
    // pre-seeded entry "v0" must be evicted, keeping the store at the cap.
    captureReported("v-new", ["gpt-5.4-medium", "gpt-5.5-high", "composer-2.5"])

    expect(loadReported("v0")).toBeNull() // oldest evicted
    expect(loadReported("v9")).not.toBeNull() // newest pre-seed survives
    expect(loadReported("v-new")).not.toBeNull() // freshly captured survives
  })
})

describe("validateReportedSlugs — shape validation", () => {
  it("accepts all 9 seed slugs with none rejected", () => {
    const { accepted, rejected } = validateReportedSlugs(SEED_SLUGS)
    expect(accepted).toEqual(SEED_SLUGS)
    expect(rejected).toEqual([])
  })

  it("rejects empty string, an over-length string, and non-string entries", () => {
    const longSlug = "x".repeat(61)
    const { accepted, rejected } = validateReportedSlugs([
      "gpt-5.4-medium",
      "",
      longSlug,
      123,
      null,
    ])
    expect(accepted).toEqual(["gpt-5.4-medium"])
    expect(rejected).toContain("")
    expect(rejected).toContain(longSlug)
    expect(rejected).toContain("123")
    expect(rejected).toContain("null")
  })

  it("dedups duplicates while preserving first-seen order (dup lands in rejected)", () => {
    const { accepted, rejected } = validateReportedSlugs([
      "gpt-5.4-medium",
      "gpt-5.5-high",
      "gpt-5.4-medium",
    ])
    expect(accepted).toEqual(["gpt-5.4-medium", "gpt-5.5-high"])
    expect(rejected).toEqual(["gpt-5.4-medium"])
  })

  it("coerces non-array input to empty accepted/rejected", () => {
    expect(validateReportedSlugs(null)).toEqual({ accepted: [], rejected: [] })
    expect(validateReportedSlugs("nope")).toEqual({ accepted: [], rejected: [] })
    expect(validateReportedSlugs(123)).toEqual({ accepted: [], rejected: [] })
  })
})
