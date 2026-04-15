import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { readFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { mapModel } from "./config-generator"

const TEST_DIR = "/tmp/oh-my-cursor-test-output"
const SCRIPT = join(import.meta.dir, "config-generator.ts")

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

describe("mapModel", () => {
  test("maps gpt-5.4 with variant high to gpt-5.4-high", () => {
    expect(mapModel("gpt-5.4", "high")).toBe("gpt-5.4-high")
  })

  test("maps gpt-5.4 without variant to gpt-5.4-medium (backward compat)", () => {
    expect(mapModel("gpt-5.4")).toBe("gpt-5.4-medium")
  })

  test("maps gpt-5.4-high directly via MODEL_MAP", () => {
    expect(mapModel("gpt-5.4-high")).toBe("gpt-5.4-high")
  })

  test("maps claude-opus-4-6 without variant to claude-4.6-opus-max-thinking", () => {
    expect(mapModel("claude-opus-4-6")).toBe("claude-4.6-opus-max-thinking")
  })

  test("maps claude-opus-4-6 with variant high to claude-4.6-opus-high-thinking", () => {
    expect(mapModel("claude-opus-4-6", "high")).toBe("claude-4.6-opus-high-thinking")
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
    expect(sisyphusContent).toContain("model: claude-4.6-opus-max-thinking")

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
