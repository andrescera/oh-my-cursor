import { describe, test, expect } from "bun:test"
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdtempSync,
  utimesSync,
} from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const WATCHDOG = join(__dirname, "experiment-watchdog.sh")

function mkTestRoot(): string {
  return mkdtempSync(join(tmpdir(), "experiment-watchdog-"))
}

function runCleanup(
  testRoot: string,
  extraEnv: Record<string, string>,
): { exitCode: number | null; stderr: string; stdout: string } {
  const pluginDir = extraEnv.OH_MY_CURSOR_PLUGIN_DIR ?? join(testRoot, "plugin")
  const r = Bun.spawnSync(["bash", WATCHDOG, "cleanup"], {
    env: {
      ...process.env,
      HOME: testRoot,
      OH_MY_CURSOR_PLUGIN_DIR: pluginDir,
      WATCHDOG_SKIP_INSTALL: "1",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      ...extraEnv,
    },
    cwd: testRoot,
  })
  const stderr = new TextDecoder().decode(r.stderr)
  const stdout = new TextDecoder().decode(r.stdout)
  return { exitCode: r.exitCode, stderr, stdout }
}

describe("experiment-watchdog cleanup", () => {
  test("exits 3 when no baseline file matches BASELINE_GLOB", () => {
    const root = mkTestRoot()
    try {
      const globs = join(root, "hooks.json.baseline-*")
      const { exitCode, stderr } = runCleanup(root, {
        BASELINE_GLOB: globs,
        WATCHDOG_INFLIGHT_PID_FILE: join(root, "cursor-hooks-inflight.pid"),
      })
      expect(exitCode).toBe(3)
      expect(stderr).toContain("WARN: no baseline file")
    } finally {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  })

  test("restores hooks.json from newest baseline and removes inflight PID file", () => {
    const root = mkTestRoot()
    try {
      const pluginDir = join(root, "plugin")
      const hooksDir = join(pluginDir, "hooks")
      mkdirSync(hooksDir, { recursive: true })
      const hooksPath = join(hooksDir, "hooks.json")
      writeFileSync(hooksPath, '{"before":true}\n', "utf-8")

      const older = join(root, "hooks.json.baseline-older")
      const newer = join(root, "hooks.json.baseline-newer")
      writeFileSync(older, '{"old":1}\n', "utf-8")
      writeFileSync(newer, '{"after":true}\n', "utf-8")

      const oldTime = new Date("2020-01-01T00:00:00Z")
      const newTime = new Date("2024-06-01T00:00:00Z")
      utimesSync(older, oldTime, oldTime)
      utimesSync(newer, newTime, newTime)

      const inflightPath = join(root, "cursor-hooks-inflight.pid")
      writeFileSync(inflightPath, "999999001\n999999002\n", "utf-8")

      const globs = join(root, "hooks.json.baseline-*")
      const { exitCode, stderr } = runCleanup(root, {
        BASELINE_GLOB: globs,
        WATCHDOG_INFLIGHT_PID_FILE: inflightPath,
      })

      expect(exitCode).toBe(0)
      expect(readFileSync(hooksPath, "utf-8")).toBe('{"after":true}\n')
      expect(existsSync(inflightPath)).toBe(false)
      expect(stderr).toContain("killed_pids=2")
    } finally {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  })

  test("cmp verification passes when baseline matches existing hooks.json", () => {
    const root = mkTestRoot()
    try {
      const pluginDir = join(root, "plugin")
      const hooksDir = join(pluginDir, "hooks")
      mkdirSync(hooksDir, { recursive: true })
      const hooksPath = join(hooksDir, "hooks.json")
      const body = '{"match":42}\n'
      writeFileSync(hooksPath, body, "utf-8")

      const baseline = join(root, "hooks.json.baseline-same")
      writeFileSync(baseline, body, "utf-8")

      const globs = join(root, "hooks.json.baseline-*")
      const { exitCode } = runCleanup(root, {
        BASELINE_GLOB: globs,
        WATCHDOG_INFLIGHT_PID_FILE: join(root, "no-inflight"),
      })

      expect(exitCode).toBe(0)
      expect(readFileSync(hooksPath, "utf-8")).toBe(body)
    } finally {
      try {
        rmSync(root, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  })
})
