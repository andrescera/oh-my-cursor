import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import {
  AgentOverridesWriteSchema,
  resolveConfigPath,
  writeAgentOverrides,
  isWriteFailure,
} from "./agent-overrides-write"
import { resetIntrospectorState } from "./task-schema-introspector"

// Deterministic enum injection: no bundle scan → fallback to KNOWN_CURSOR_MODELS.
// "composer-2-fast" is a canonical known model; "totally-fake-model-xyz" is not.
const FALLBACK_ENUM_OPTS = {
  introspection: { enabled: true, scan_timeout_ms: 50 },
  _candidatePaths: [] as string[],
  _bundleScan: async () => null,
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

let dir: string

beforeEach(() => {
  resetIntrospectorState()
  dir = mkdtempSync(join(tmpdir(), "omc-aow-"))
})

afterEach(() => {
  resetIntrospectorState()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
})

describe("AgentOverridesWriteSchema", () => {
  test("accepts a valid project body", () => {
    const r = AgentOverridesWriteSchema.safeParse({
      target: "project",
      agent_overrides: { explore: { model: "gpt-5.4-medium" } },
    })
    expect(r.success).toBe(true)
  })

  test("rejects an invalid target", () => {
    const r = AgentOverridesWriteSchema.safeParse({
      target: "global",
      agent_overrides: {},
    })
    expect(r.success).toBe(false)
  })

  test("rejects unknown agent-override keys (strict sub-schema)", () => {
    const r = AgentOverridesWriteSchema.safeParse({
      target: "user",
      agent_overrides: { explore: { model: "x", bogus_key: 1 } },
    })
    expect(r.success).toBe(false)
  })

  test("rejects unknown top-level body keys (strict body)", () => {
    const r = AgentOverridesWriteSchema.safeParse({
      target: "project",
      agent_overrides: {},
      surprise: true,
    })
    expect(r.success).toBe(false)
  })

  test("accepts optional categories", () => {
    const r = AgentOverridesWriteSchema.safeParse({
      target: "project",
      agent_overrides: {},
      categories: { quick: { model: "composer-2-fast", description: "fast" } },
    })
    expect(r.success).toBe(true)
  })
})

describe("resolveConfigPath", () => {
  test("project target resolves under cwd/.cursor", () => {
    const p = resolveConfigPath("project", { cwd: "/proj", home: "/home/u" })
    expect(p).toBe(join("/proj", ".cursor", "oh-my-cursor.jsonc"))
  })

  test("user target resolves under home/.config", () => {
    const p = resolveConfigPath("user", { cwd: "/proj", home: "/home/u" })
    expect(p).toBe(join("/home/u", ".config", "oh-my-cursor", "config.jsonc"))
  })
})

describe("writeAgentOverrides", () => {
  test("validation failure returns 400 and leaves an existing file byte-identical", async () => {
    const path = join(dir, ".cursor", "oh-my-cursor.jsonc")
    const seed = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "composer-2-fast" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(seed.ok).toBe(true)
    const before = sha256OfFile(path)

    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "x", bogus_key: 1 } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(false)
    if (isWriteFailure(res)) expect(res.status).toBe(400)
    expect(sha256OfFile(path)).toBe(before)
  })

  test("success round-trips: written agent_overrides parse back identically", async () => {
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "gpt-5.4-medium" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const parsed = JSON.parse(readFileSync(res.path, "utf-8"))
    expect(parsed.agent_overrides.explore.model).toBe("gpt-5.4-medium")
  })

  test("merge preserves pre-existing unrelated top-level keys and other agents", async () => {
    const path = join(dir, ".cursor", "oh-my-cursor.jsonc")
    mkdirSync(join(dir, ".cursor"), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify(
        { daemon: { port: 27847 }, agent_overrides: { librarian: { model: "composer-2-fast" } } },
        null,
        2,
      ),
      "utf-8",
    )

    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "gpt-5.4-medium" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const parsed = JSON.parse(readFileSync(res.path, "utf-8"))
    expect(parsed.daemon.port).toBe(27847)
    expect(parsed.agent_overrides.librarian.model).toBe("composer-2-fast")
    expect(parsed.agent_overrides.explore.model).toBe("gpt-5.4-medium")
  })

  test("advisory warning emitted for an unknown model, write still succeeds", async () => {
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "totally-fake-model-xyz" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.warnings.join("\n")).toContain("totally-fake-model-xyz")
    expect(existsSync(res.path)).toBe(true)
  })

  test("known model produces no warning", async () => {
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "composer-2-fast" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBe(0)
  })

  test("per-agent: known model NOT in the agent's curated set warns, write still succeeds", async () => {
    // claude-opus-4-7-thinking-xhigh is a KNOWN model but NOT allowed for `explore`.
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "claude-opus-4-7-thinking-xhigh" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.warnings.join("\n")).toContain("claude-opus-4-7-thinking-xhigh")
    expect(res.warnings.join("\n")).toContain("explore")
    expect(existsSync(res.path)).toBe(true)
  })

  test('per-agent: "inherit" produces no warning', async () => {
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "inherit" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBe(0)
  })

  test("per-agent: invalid fallback_models entry warns, write still succeeds", async () => {
    const res = await writeAgentOverrides(
      {
        target: "project",
        agent_overrides: {
          explore: { model: "composer-2-fast", fallback_models: ["totally-fake-model-xyz"] },
        },
      },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBeGreaterThan(0)
    expect(res.warnings.join("\n")).toContain("fallback_models")
    expect(res.warnings.join("\n")).toContain("totally-fake-model-xyz")
  })

  test("per-agent: model in the agent's curated set produces no warning", async () => {
    const res = await writeAgentOverrides(
      {
        target: "project",
        agent_overrides: {
          explore: { model: "composer-2-fast", fallback_models: ["composer-2", "gpt-5.4-medium"] },
        },
      },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.length).toBe(0)
  })

  test("atomic write leaves no <config>.tmp behind", async () => {
    const res = await writeAgentOverrides(
      { target: "project", agent_overrides: { explore: { model: "composer-2-fast" } } },
      { cwd: dir, enumOptions: FALLBACK_ENUM_OPTS },
    )
    expect(res.ok).toBe(true)
    const entries = readdirSync(join(dir, ".cursor"))
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false)
  })
})
