import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
  loadConfig,
  resetConfigCache,
  stripJsoncComments,
  deepMerge,
  DEFAULT_CONFIG,
} from "./config"

const TEST_PROJECT_DIR = "/tmp/oh-my-cursor-config-test-project"
const TEST_CONFIG_DIR = join(TEST_PROJECT_DIR, ".cursor")

function cleanup(): void {
  resetConfigCache()
  try {
    if (existsSync(TEST_PROJECT_DIR)) rmSync(TEST_PROJECT_DIR, { recursive: true })
  } catch {
    // best-effort
  }
}

describe("config", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  describe("stripJsoncComments", () => {
    describe("#given JSON with line comments", () => {
      describe("#when comments are stripped", () => {
        test("#then only valid JSON remains", () => {
          // given
          const input = `{
  // This is a comment
  "key": "value" // inline comment
}`
          // when
          const result = stripJsoncComments(input)

          // then
          const parsed = JSON.parse(result)
          expect(parsed.key).toBe("value")
        })
      })
    })

    describe("#given JSON with block comments", () => {
      describe("#when comments are stripped", () => {
        test("#then only valid JSON remains", () => {
          // given
          const input = `{
  /* block comment */
  "key": "value",
  /*
   * multi-line
   * block comment
   */
  "other": 42
}`
          // when
          const result = stripJsoncComments(input)

          // then
          const parsed = JSON.parse(result)
          expect(parsed.key).toBe("value")
          expect(parsed.other).toBe(42)
        })
      })
    })

    describe("#given JSON with mixed comment types", () => {
      describe("#when comments are stripped", () => {
        test("#then all comments are removed", () => {
          // given
          const input = `{
  /* block */ "a": 1, // line
  "b": /* inline block */ 2
}`
          // when
          const result = stripJsoncComments(input)

          // then
          const parsed = JSON.parse(result)
          expect(parsed.a).toBe(1)
          expect(parsed.b).toBe(2)
        })
      })
    })
  })

  describe("deepMerge", () => {
    describe("#given two flat objects", () => {
      describe("#when merged", () => {
        test("#then override values replace base values", () => {
          // given
          const base = { a: 1, b: 2, c: 3 }
          const override = { b: 20, d: 4 }

          // when
          const result = deepMerge(base, override)

          // then
          expect(result).toEqual({ a: 1, b: 20, c: 3, d: 4 })
        })
      })
    })

    describe("#given nested objects", () => {
      describe("#when merged", () => {
        test("#then nested properties are recursively merged", () => {
          // given
          const base = { nested: { a: 1, b: 2 }, top: "base" }
          const override = { nested: { b: 20, c: 3 } }

          // when
          const result = deepMerge(
            base as Record<string, unknown>,
            override as Record<string, unknown>,
          )

          // then
          expect(result).toEqual({ nested: { a: 1, b: 20, c: 3 }, top: "base" })
        })
      })
    })

    describe("#given arrays in the override", () => {
      describe("#when merged", () => {
        test("#then arrays replace rather than merge", () => {
          // given
          const base = { items: [1, 2, 3] }
          const override = { items: [4, 5] }

          // when
          const result = deepMerge(
            base as Record<string, unknown>,
            override as Record<string, unknown>,
          )

          // then
          expect(result).toEqual({ items: [4, 5] })
        })
      })
    })
  })

  describe("loadConfig", () => {
    describe("#given no config files exist", () => {
      describe("#when loadConfig is called", () => {
        test("#then it returns default config values", () => {
          // when
          const config = loadConfig()

          // then
          expect(config.disabled_hooks).toEqual([])
          expect(config.disabled_agents).toEqual([])
          expect(config.subagent_limits.explore).toBe(6)
          expect(config.subagent_limits.worker).toBe(8)
          expect(config.state_persistence.enabled).toBe(true)
          expect(config.daemon.port).toBe(47847)
          expect(config.daemon.mcp_port).toBe(47848)
        })
      })
    })

    describe("#given a project-level JSONC config exists", () => {
      describe("#when loadConfig is called from that directory", () => {
        test("#then project config overrides defaults", () => {
          // given
          mkdirSync(TEST_CONFIG_DIR, { recursive: true })
          writeFileSync(
            join(TEST_CONFIG_DIR, "oh-my-cursor.jsonc"),
            `{
  // Custom subagent limits
  "subagent_limits": { "explore": 10, "worker": 12 },
  "disabled_hooks": ["/health"]
}`,
            "utf-8",
          )
          const origCwd = process.cwd()

          try {
            process.chdir(TEST_PROJECT_DIR)
            resetConfigCache()

            // when
            const config = loadConfig()

            // then
            expect(config.subagent_limits.explore).toBe(10)
            expect(config.subagent_limits.worker).toBe(12)
            expect(config.disabled_hooks).toEqual(["/health"])
            expect(config.daemon.port).toBe(47847)
          } finally {
            process.chdir(origCwd)
          }
        })
      })
    })

    describe("#given config values are cached", () => {
      describe("#when loadConfig is called again within TTL", () => {
        test("#then it returns the cached result", () => {
          // given
          const first = loadConfig()

          // when
          const second = loadConfig()

          // then
          expect(first).toBe(second)
        })
      })
    })

    describe("#given cache is reset", () => {
      describe("#when loadConfig is called", () => {
        test("#then it loads fresh config", () => {
          // given
          const first = loadConfig()
          resetConfigCache()

          // when
          const second = loadConfig()

          // then
          expect(second).not.toBe(first)
          expect(second).toEqual(first)
        })
      })
    })
  })

  describe("DEFAULT_CONFIG", () => {
    describe("#given the exported default config", () => {
      describe("#when its structure is inspected", () => {
        test("#then it has all required fields", () => {
          expect(DEFAULT_CONFIG).toHaveProperty("disabled_hooks")
          expect(DEFAULT_CONFIG).toHaveProperty("disabled_agents")
          expect(DEFAULT_CONFIG).toHaveProperty("subagent_limits")
          expect(DEFAULT_CONFIG).toHaveProperty("state_persistence")
          expect(DEFAULT_CONFIG).toHaveProperty("daemon")
          expect(DEFAULT_CONFIG.daemon.port).toBe(47847)
          expect(DEFAULT_CONFIG.daemon.mcp_port).toBe(47848)
        })
      })
    })
  })
})
