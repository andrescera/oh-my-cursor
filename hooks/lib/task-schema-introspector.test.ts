import { describe, it, expect, beforeEach } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KNOWN_CURSOR_MODELS, KNOWN_AGENT_TYPES } from "./known-models"
import {
  getEnum,
  passiveObserve,
  resolveCandidatePaths,
  resetIntrospectorState,
  getIntrospectorScanCount,
} from "./task-schema-introspector"

const UNIQUE_FIXTURE_SLUG = "gpt-9.9-omotest"

function makeBundleFixture(
  slugs: string[] = [
    "composer-2-fast",
    UNIQUE_FIXTURE_SLUG,
    "claude-opus-4-7-thinking-xhigh",
    "gemini-3.1-pro",
  ],
  version = "3.7.27",
): { root: string; appDir: string } {
  const root = mkdtempSync(join(tmpdir(), "omo-introspect-"))
  const appDir = join(root, "resources", "app")
  mkdirSync(join(appDir, "out", "vs", "workbench"), { recursive: true })
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({ name: "cursor", version }),
    "utf-8",
  )
  const arrayLiteral = slugs.map((s) => `"${s}"`).join(",")
  writeFileSync(
    join(appDir, "out", "vs", "workbench", "workbench.desktop.main.js"),
    `const SUPPORTED_MODELS=[${arrayLiteral}];export{SUPPORTED_MODELS};`,
    "utf-8",
  )
  return { root, appDir }
}

describe("known-models constants", () => {
  it("KNOWN_CURSOR_MODELS is a superset of the canonical VALID_CURSOR_SLUGS", () => {
    const canonical = [
      "composer-2-fast",
      "gpt-5.4-medium",
      "gpt-5.5-extra-high",
      "claude-4.6-sonnet-medium-thinking",
      "claude-opus-4-7-thinking-xhigh",
      "gemini-3.1-pro",
    ]
    for (const slug of canonical) {
      expect(KNOWN_CURSOR_MODELS).toContain(slug)
    }
    expect(KNOWN_CURSOR_MODELS.length).toBeGreaterThanOrEqual(6)
    expect(new Set(KNOWN_CURSOR_MODELS).size).toBe(KNOWN_CURSOR_MODELS.length)
  })

  it("KNOWN_AGENT_TYPES enumerates the 11 repo agents", () => {
    const expected = [
      "atlas",
      "explore",
      "hephaestus",
      "librarian",
      "metis",
      "momus",
      "multimodal-looker",
      "oracle",
      "prometheus",
      "sisyphus",
      "sisyphus-junior",
    ]
    for (const agent of expected) {
      expect(KNOWN_AGENT_TYPES).toContain(agent)
    }
    expect(KNOWN_AGENT_TYPES.length).toBe(11)
    expect(new Set(KNOWN_AGENT_TYPES).size).toBe(KNOWN_AGENT_TYPES.length)
  })
})

describe("resolveCandidatePaths — per-OS resolution (3 platforms)", () => {
  it("resolves linux install paths", () => {
    const paths = resolveCandidatePaths({ platform: "linux", homeDir: "/home/user", env: {} })
    expect(paths).toContain("/usr/share/cursor")
    expect(paths.some((p) => p.includes("/home/user/.local/share"))).toBe(true)
    expect(paths.some((p) => p.includes("squashfs-root"))).toBe(true)
  })

  it("resolves darwin install paths", () => {
    const paths = resolveCandidatePaths({ platform: "darwin", homeDir: "/Users/user", env: {} })
    expect(paths).toContain("/Applications/Cursor.app/Contents/Resources/app")
  })

  it("resolves win32 install paths from LOCALAPPDATA", () => {
    const paths = resolveCandidatePaths({
      platform: "win32",
      homeDir: "C:\\Users\\user",
      env: { LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local" },
    })
    expect(paths.some((p) => p.includes("Programs\\cursor\\resources\\app"))).toBe(true)
  })

  it("always appends extra_bundle_paths regardless of platform", () => {
    const paths = resolveCandidatePaths({ platform: "linux", extraPaths: ["/custom/cursor/path"] })
    expect(paths).toContain("/custom/cursor/path")
  })

  it("never throws on empty/odd inputs", () => {
    expect(() => resolveCandidatePaths()).not.toThrow()
    expect(() => resolveCandidatePaths({ platform: "win32", env: {} })).not.toThrow()
    expect(() => resolveCandidatePaths({ extraPaths: [] })).not.toThrow()
  })
})

describe("getEnum — fallback chain", () => {
  beforeEach(() => {
    resetIntrospectorState()
  })

  it("falls back to KNOWN constants when no Cursor bundle exists (never throws)", async () => {
    const result = await getEnum({
      introspection: { enabled: true, scan_timeout_ms: 50 },
      _candidatePaths: ["/nonexistent-xyz-omo"],
    })
    expect(result.source).toBe("fallback")
    expect(result.models).toEqual([...KNOWN_CURSOR_MODELS])
    expect(result.agents).toEqual([...KNOWN_AGENT_TYPES])
    expect(result.models.length).toBeGreaterThanOrEqual(6)
  })

  it("returns an ISO-8601 cachedAt and a valid source token", async () => {
    const result = await getEnum({
      introspection: { enabled: true, scan_timeout_ms: 50 },
      _candidatePaths: ["/nonexistent-xyz-omo"],
    })
    expect(["bundle", "observed", "fallback"]).toContain(result.source)
    expect(new Date(result.cachedAt).toISOString()).toBe(result.cachedAt)
  })

  it("discovers slugs from a real bundle fixture (source=bundle, version read)", async () => {
    const { root, appDir } = makeBundleFixture()
    try {
      const result = await getEnum({
        introspection: { enabled: true, scan_timeout_ms: 2000 },
        _candidatePaths: [appDir],
      })
      expect(result.source).toBe("bundle")
      expect(result.models).toContain(UNIQUE_FIXTURE_SLUG)
      expect(result.models).toContain("gpt-5.4-medium")
      expect(result.cursorVersion).toBe("3.7.27")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("scans bundle fixture across all 3 mocked platforms", async () => {
    for (const platform of ["linux", "darwin", "win32"] as const) {
      resetIntrospectorState()
      const { root, appDir } = makeBundleFixture()
      try {
        const result = await getEnum({
          platform,
          introspection: { enabled: true, scan_timeout_ms: 2000, extra_bundle_paths: [appDir] },
          _candidatePaths: [appDir],
        })
        expect(result.source).toBe("bundle")
        expect(result.models).toContain(UNIQUE_FIXTURE_SLUG)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  it("falls back when the scan strategy throws (error path is silent)", async () => {
    const result = await getEnum({
      introspection: { enabled: true, scan_timeout_ms: 2000 },
      _candidatePaths: ["/whatever"],
      _bundleScan: async () => {
        throw new Error("boom")
      },
    })
    expect(result.source).toBe("fallback")
    expect(result.models).toEqual([...KNOWN_CURSOR_MODELS])
  })

  it("falls back when the scan exceeds the timeout deadline", async () => {
    const { root, appDir } = makeBundleFixture()
    try {
      let call = 0
      const now = () => (call++ === 0 ? 1000 : 9999)
      const result = await getEnum({
        introspection: { enabled: true, scan_timeout_ms: 2000 },
        _candidatePaths: [appDir],
        now,
      })
      expect(result.source).toBe("fallback")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("getEnum — caching and version invalidation", () => {
  beforeEach(() => {
    resetIntrospectorState()
  })

  it("serves a cache hit without rescanning (scan count stable, cachedAt stable)", async () => {
    const { root, appDir } = makeBundleFixture()
    try {
      const opts = {
        introspection: { enabled: true, scan_timeout_ms: 2000 },
        _candidatePaths: [appDir],
      }
      const first = await getEnum(opts)
      const second = await getEnum(opts)
      expect(getIntrospectorScanCount()).toBe(1)
      expect(second.cachedAt).toBe(first.cachedAt)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("invalidates and rescans when cursorVersion changes", async () => {
    const { root, appDir } = makeBundleFixture()
    try {
      const base = {
        introspection: { enabled: true, scan_timeout_ms: 2000 },
        _candidatePaths: [appDir],
      }
      await getEnum({ ...base, cursorVersion: "1.0.0" })
      await getEnum({ ...base, cursorVersion: "1.0.0" })
      expect(getIntrospectorScanCount()).toBe(1)
      await getEnum({ ...base, cursorVersion: "2.0.0" })
      expect(getIntrospectorScanCount()).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("passiveObserve — additive merge", () => {
  beforeEach(() => {
    resetIntrospectorState()
  })

  it("merges observed model + agent without replacing fallback set", async () => {
    passiveObserve({ model: "obs-model-9-x", subagent_type: "obs-agent-y" })
    const result = await getEnum({
      introspection: { enabled: false },
      _candidatePaths: ["/nonexistent-xyz-omo"],
    })
    expect(result.source).toBe("observed")
    expect(result.models).toContain("gpt-5.4-medium")
    expect(result.models).toContain("obs-model-9-x")
    expect(result.agents).toContain("sisyphus")
    expect(result.agents).toContain("obs-agent-y")
  })

  it("observed additions never shrink or replace bundle scan results", async () => {
    const { root, appDir } = makeBundleFixture()
    try {
      passiveObserve({ model: "obs-extra-1-x" })
      const result = await getEnum({
        introspection: { enabled: true, scan_timeout_ms: 2000 },
        _candidatePaths: [appDir],
      })
      expect(result.source).toBe("bundle")
      expect(result.models).toContain(UNIQUE_FIXTURE_SLUG)
      expect(result.models).toContain("obs-extra-1-x")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("ignores empty/invalid observation records without throwing", () => {
    expect(() => passiveObserve({})).not.toThrow()
    expect(() => passiveObserve({ model: "" })).not.toThrow()
    expect(() => passiveObserve(null as unknown as { model?: string })).not.toThrow()
    expect(() => passiveObserve(undefined as unknown as { model?: string })).not.toThrow()
    expect(() => passiveObserve({ model: 123 as unknown as string })).not.toThrow()
  })
})

describe("robustness — no public function throws on nonexistent path", () => {
  beforeEach(() => {
    resetIntrospectorState()
  })

  it("getEnum resolves (never rejects) for a nonexistent candidate path", async () => {
    let result: Awaited<ReturnType<typeof getEnum>> | undefined
    let threw = false
    try {
      result = await getEnum({
        introspection: {
          enabled: true,
          scan_timeout_ms: 50,
          extra_bundle_paths: ["/no/such/dir/xyz"],
        },
        _candidatePaths: ["/no/such/dir/xyz"],
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(result).toBeDefined()
    expect(result!.models.length).toBeGreaterThanOrEqual(6)
  })

  it("getEnum with no arguments resolves to a usable result", async () => {
    const result = await getEnum()
    expect(result.models.length).toBeGreaterThanOrEqual(6)
    expect(result.agents.length).toBeGreaterThanOrEqual(11)
  })
})
