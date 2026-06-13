import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test"
import { readFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { mapModel, resolveEnumForGenerator } from "./config-generator"
import { KNOWN_CURSOR_MODELS } from "../hooks/lib/known-models"
import { resolveCursorVersion } from "../hooks/lib/task-schema-introspector"
import { captureReported, loadReported } from "../hooks/lib/reported-models-store"

const TEST_DIR = "/tmp/oh-my-cursor-test-output"
const SCRIPT = join(import.meta.dir, "config-generator.ts")

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

describe("mapModel", () => {
  test("maps gpt-5.4 with variant high to gpt-5.5-extra-high via re-normalization", () => {
    expect(mapModel("gpt-5.4", "high")).toBe("gpt-5.5-extra-high")
  })

  test("maps gpt-5.4 without variant to gpt-5.4-medium (backward compat)", () => {
    expect(mapModel("gpt-5.4")).toBe("gpt-5.4-medium")
  })

  test("maps gpt-5.4-high directly via MODEL_MAP", () => {
    expect(mapModel("gpt-5.4-high")).toBe("gpt-5.5-extra-high")
  })

  test("maps claude-opus-4-6 without variant to claude-opus-4-7-thinking-xhigh", () => {
    expect(mapModel("claude-opus-4-6")).toBe("claude-opus-4-7-thinking-xhigh")
  })

  test("maps claude-opus-4-6 with variant high to claude-opus-4-7-thinking-xhigh", () => {
    expect(mapModel("claude-opus-4-6", "high")).toBe("claude-opus-4-7-thinking-xhigh")
  })

  test("falls back to base when variant produces invalid slug", () => {
    expect(mapModel("gpt-5.4", "unknown-variant")).toBe("gpt-5.4-medium")
  })

  test("all known model inputs map to valid Cursor slugs", () => {
    const inputs = [
      "claude-opus-4-6", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5",
      "gpt-5.4", "gpt-5.4-high", "gpt-5-nano",
      "gemini-3.1-pro", "gemini-2.5-flash", "gemini-3-flash", "kimi-k2.5",
    ]
    for (const input of inputs) {
      const result = mapModel(input)
      expect(KNOWN_CURSOR_MODELS.includes(result)).toBe(true)
    }
  })

  test("KNOWN_CURSOR_MODELS includes all 6 canonical Cursor slugs", () => {
    const canonical = [
      "composer-2-fast",
      "gpt-5.4-medium",
      "gpt-5.5-extra-high",
      "claude-4.6-sonnet-medium-thinking",
      "claude-opus-4-7-thinking-xhigh",
      "gemini-3.1-pro",
    ]
    for (const slug of canonical) {
      expect(KNOWN_CURSOR_MODELS.includes(slug)).toBe(true)
    }
  })

  test("mapModel('fast') throws with migration message", () => {
    expect(() => mapModel("fast")).toThrow("no longer accepted")
  })
})

describe("config-generator", () => {
  test("generates plugin from minimal config", async () => {
    const configPath = "/tmp/oh-my-cursor-test-config.jsonc"
    await Bun.write(
      configPath,
      JSON.stringify({
        disabled_agents: ["momus"],
        agents: {
          sisyphus: { model: "claude-opus-4-6" },
        },
        ralph_loop: { max_iterations: 50 },
      }),
    )

    const proc = Bun.spawnSync(["bun", "run", SCRIPT, configPath, TEST_DIR])
    const output = proc.stdout.toString()

    expect(proc.exitCode).toBe(0)
    expect(output).toContain("Created plugin.json")
    expect(output).toContain("agent stubs")

    // given
    const manifest = JSON.parse(await readFile(join(TEST_DIR, ".cursor-plugin", "plugin.json"), "utf-8"))

    // then
    expect(manifest.name).toBe("oh-my-cursor")
    expect(manifest.version).toBe("0.1.0")

    // given - sisyphus agent has model override
    const sisyphusContent = await readFile(join(TEST_DIR, "agents", "sisyphus.md"), "utf-8")

    // then
    expect(sisyphusContent).toContain("model: claude-opus-4-7-thinking-xhigh")

    // given - momus is disabled, should not have agent file
    const momusExists = existsSync(join(TEST_DIR, "agents", "momus.md"))

    // then
    expect(momusExists).toBe(false)

    // given - ralph loop override
    const hooksOverride = JSON.parse(await readFile(join(TEST_DIR, "hooks-override.json"), "utf-8"))

    // then
    expect(hooksOverride.hooks.stop[0].loop_limit).toBe(50)

    // given - disabled components rule
    const disabledRule = await readFile(join(TEST_DIR, "rules", "disabled-components.mdc"), "utf-8")

    // then
    expect(disabledRule).toContain("agent: momus")

    await rm(configPath, { force: true })
  })

  test("generates all 11 agents when none disabled", async () => {
    const configPath = "/tmp/oh-my-cursor-test-config-full.jsonc"
    await Bun.write(configPath, JSON.stringify({}))

    const outputDir = `${TEST_DIR}-full`
    const proc = Bun.spawnSync(["bun", "run", SCRIPT, configPath, outputDir])

    expect(proc.exitCode).toBe(0)

    const agents = await Bun.file(join(outputDir, ".cursor-plugin", "plugin.json")).json()
    expect(agents.name).toBe("oh-my-cursor")

    const agentFiles = new Bun.Glob("*.md").scanSync(join(outputDir, "agents"))
    const agentList = Array.from(agentFiles)
    expect(agentList.length).toBe(11)

    await rm(outputDir, { recursive: true, force: true })
    await rm(configPath, { force: true })
  })

  test("handles JSONC comments", async () => {
    const configPath = "/tmp/oh-my-cursor-test-jsonc.jsonc"
    await Bun.write(
      configPath,
      `{
  // This is a comment
  "disabled_agents": ["atlas"],
  /* Block comment */
  "agents": {}
}`,
    )

    const outputDir = `${TEST_DIR}-jsonc`
    const proc = Bun.spawnSync(["bun", "run", SCRIPT, configPath, outputDir])

    expect(proc.exitCode).toBe(0)

    const atlasExists = existsSync(join(outputDir, "agents", "atlas.md"))
    expect(atlasExists).toBe(false)

    await rm(outputDir, { recursive: true, force: true })
    await rm(configPath, { force: true })
  })
})

describe("resolveEnumForGenerator", () => {
  // Hermetic store: redirect the reported-models store at a fresh temp file via
  // the OH_MY_CURSOR_REPORTED_MODELS_FILE override so the real
  // ~/.config/oh-my-cursor/reported-models.json is NEVER read. beforeEach/
  // afterEach are scoped to THIS describe so the spawn-based generator tests
  // above (which inherit the parent env) are unaffected.
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

  let tmpDir: string
  let envBackup: string | undefined

  beforeEach(() => {
    envBackup = process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE
    tmpDir = mkdtempSync(join(tmpdir(), "omc-gen-enum-"))
    process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE = join(tmpDir, "reported-models.json")
  })

  afterEach(() => {
    if (envBackup === undefined) delete process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE
    else process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE = envBackup
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test("reported capture wins over KNOWN_CURSOR_MODELS for the live version", () => {
    // resolveEnumForGenerator() has no version seam — it reads the live Cursor
    // version internally. When a version resolves, a captured store entry for
    // THAT version must win. In a bundle-less CI env resolveCursorVersion()
    // returns undefined, the reported path is skipped, and KNOWN_CURSOR_MODELS
    // is the only valid result — assert that branch instead.
    const version = resolveCursorVersion()
    if (version) {
      captureReported(version, SEED_SLUGS)
      expect(loadReported(version)?.models).toEqual(SEED_SLUGS)

      const result = resolveEnumForGenerator()

      expect(result).toEqual(SEED_SLUGS)
      expect(result).not.toEqual(KNOWN_CURSOR_MODELS)
    } else {
      const result = resolveEnumForGenerator()

      expect(result).toEqual(KNOWN_CURSOR_MODELS)
    }
  })

  test("falls back to KNOWN_CURSOR_MODELS when the store has no matching entry", () => {
    // Empty store ({}) → no version entry → KNOWN fallback regardless of version.
    writeFileSync(process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE as string, "{}", "utf-8")

    const result = resolveEnumForGenerator()

    expect(result).toEqual(KNOWN_CURSOR_MODELS)
  })

  test("falls back to KNOWN_CURSOR_MODELS when the store file does not exist", () => {
    // beforeEach points at a path inside a fresh temp dir but writes nothing.
    const result = resolveEnumForGenerator()

    expect(result).toEqual(KNOWN_CURSOR_MODELS)
  })

  test("never throws on a corrupt store and returns KNOWN_CURSOR_MODELS", () => {
    writeFileSync(
      process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE as string,
      "{ this is : not json ]",
      "utf-8",
    )

    let result: readonly string[] | undefined
    expect(() => {
      result = resolveEnumForGenerator()
    }).not.toThrow()
    expect(result).toEqual(KNOWN_CURSOR_MODELS)
  })

  test("returns a non-empty readonly string array", () => {
    const result = resolveEnumForGenerator()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((s) => typeof s === "string")).toBe(true)
  })
})
