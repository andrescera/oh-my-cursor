import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export type OhMyCursorConfig = {
  disabled_hooks: string[]
  disabled_agents: string[]
  subagent_limits: { explore: number; worker: number }
  state_persistence: { enabled: boolean; path: string }
  daemon: { port: number; mcp_port: number }
  context_collector: { enabled: boolean; max_context_chars: number }
  compaction: { prompt_enabled: boolean }
  mdc_writer: { debounce_ms: number; enabled: boolean }
}

export const DEFAULT_CONFIG: OhMyCursorConfig = {
  disabled_hooks: [],
  disabled_agents: [],
  subagent_limits: { explore: 6, worker: 8 },
  state_persistence: { enabled: true, path: "/tmp/oh-my-cursor-state.json" },
  daemon: { port: 47847, mcp_port: 47848 },
  context_collector: { enabled: true, max_context_chars: 50000 },
  compaction: { prompt_enabled: true },
  mdc_writer: { debounce_ms: 5000, enabled: true },
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

  const config = merged as unknown as OhMyCursorConfig

  if (!Array.isArray(config.disabled_hooks)) config.disabled_hooks = []
  if (!Array.isArray(config.disabled_agents)) config.disabled_agents = []
  if (!config.subagent_limits) config.subagent_limits = { ...DEFAULT_CONFIG.subagent_limits }
  if (!config.state_persistence) config.state_persistence = { ...DEFAULT_CONFIG.state_persistence }
  if (!config.daemon) config.daemon = { ...DEFAULT_CONFIG.daemon }
  if (!config.context_collector) config.context_collector = { ...DEFAULT_CONFIG.context_collector }
  if (!config.compaction) config.compaction = { ...DEFAULT_CONFIG.compaction }
  if (!config.mdc_writer) config.mdc_writer = { ...DEFAULT_CONFIG.mdc_writer }

  cachedConfig = config
  configLoadTime = now
  return config
}

export function resetConfigCache(): void {
  cachedConfig = null
  configLoadTime = 0
}
