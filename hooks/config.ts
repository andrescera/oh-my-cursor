import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { OhMyCursorConfig } from "./types"

export const DEFAULT_CONFIG: OhMyCursorConfig = {
  version: 1,
  disabled_hooks: [],
  disabled_agents: [],
  subagent_limits: { explore: 6, worker: 8 },
  state_persistence: { enabled: true, path: "/tmp/oh-my-cursor-state.json" },
  daemon: { port: 47847, mcp_port: 47848 },
  context_collector: { enabled: true, max_context_chars: 50000 },
  compaction: { prompt_enabled: true },
  experimental: { cloud_agents: false, webhooks: false, automations: false },
  mcp_allowlist: ["*"],
  notifications: { enabled: true, sound: false },
  orchestration: { mode: "native" as "native" | "subagent" },
  continuation: { cooldown_ms: 5000, max_failures: 5, backoff_multiplier: 2 },
  momus: { max_iterations: 3 },
  model_routing: { retry_on_errors: [429, 500, 502, 503, 504], max_retry_attempts: 3 },
}

export function validateConfig(raw: unknown): OhMyCursorConfig {
  if (typeof raw !== "object" || raw === null) {
    return structuredClone(DEFAULT_CONFIG)
  }
  const obj = raw as Record<string, unknown>
  const known = new Set(Object.keys(DEFAULT_CONFIG))
  for (const key of Object.keys(obj)) {
    if (!known.has(key)) {
      console.warn(`[oh-my-cursor] Unknown config key: "${key}"`)
    }
  }
  return deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    obj,
  ) as unknown as OhMyCursorConfig
}

export function stripJsoncComments(text: string): string {
  let result = text.replace(/\/\*[\s\S]*?\*\//g, "")
  result = result.replace(/\/\/[^\n]*/g, "")
  return result
}

export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const baseVal = base[key]
    const overrideVal = override[key]
    if (
      baseVal !== null &&
      overrideVal !== null &&
      typeof baseVal === "object" &&
      typeof overrideVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      )
    } else {
      result[key] = overrideVal
    }
  }
  return result
}

function parseJsoncFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, "utf-8")
    const stripped = stripJsoncComments(raw)
    return JSON.parse(stripped)
  } catch (err) {
    console.warn(
      `[oh-my-cursor] Failed to parse config ${filePath}:`,
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

let cachedConfig: OhMyCursorConfig | null = null
let configLoadTime = 0
const CONFIG_CACHE_TTL_MS = 30_000

export function loadConfig(): OhMyCursorConfig {
  const now = Date.now()
  if (cachedConfig && now - configLoadTime < CONFIG_CACHE_TTL_MS) return cachedConfig

  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>

  const userPath = join(homedir(), ".config", "oh-my-cursor", "config.jsonc")
  const userConfig = parseJsoncFile(userPath)
  if (userConfig) {
    merged = deepMerge(merged, userConfig)
  }

  const projectPath = join(process.cwd(), ".cursor", "oh-my-cursor.jsonc")
  const projectConfig = parseJsoncFile(projectPath)
  if (projectConfig) {
    merged = deepMerge(merged, projectConfig)
  }

  const config = validateConfig(merged)

  cachedConfig = config
  configLoadTime = now
  return config
}

export function resetConfigCache(): void {
  cachedConfig = null
  configLoadTime = 0
}
