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
  model_routing: {
    retry_on_errors: [429, 500, 502, 503, 504],
    max_retry_attempts: 3,
    defaults: {
      explore: "fast",
      librarian: "fast",
      metis: "fast",
    },
  },
}

function typeDesc(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}

function warnInvalid(path: string, expected: string, actual: unknown): void {
  console.warn(
    `[oh-my-cursor] Config warning: field '${path}' has invalid type (expected ${expected}, got ${typeDesc(actual)}). Using default.`,
  )
}

function sanitizeFiniteNumber(path: string, val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val)) return val
  warnInvalid(path, "number", val)
  return fallback
}

function sanitizePositiveNumber(path: string, val: unknown, fallback: number): number {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val
  warnInvalid(path, "positive number", val)
  return fallback
}

function sanitizePort(path: string, val: unknown, fallback: number): number {
  if (
    typeof val === "number" &&
    Number.isInteger(val) &&
    val >= 1024 &&
    val <= 65535
  ) {
    return val
  }
  warnInvalid(path, "integer between 1024 and 65535", val)
  return fallback
}

function sanitizeContextChars(path: string, val: unknown, fallback: number): number {
  if (
    typeof val === "number" &&
    Number.isFinite(val) &&
    Number.isInteger(val) &&
    val >= 1000 &&
    val <= 500_000
  ) {
    return val
  }
  warnInvalid(path, "integer between 1000 and 500000", val)
  return fallback
}

function sanitizeBoolean(path: string, val: unknown, fallback: boolean): boolean {
  if (typeof val === "boolean") return val
  warnInvalid(path, "boolean", val)
  return fallback
}

function sanitizeString(path: string, val: unknown, fallback: string): string {
  if (typeof val === "string") return val
  warnInvalid(path, "string", val)
  return fallback
}

function sanitizeStringArray(path: string, val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) {
    warnInvalid(path, "string[]", val)
    return fallback
  }
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== "string") {
      warnInvalid(`${path}[${i}]`, "string", val[i])
      return fallback
    }
  }
  return val as string[]
}

function sanitizeNumberArray(path: string, val: unknown, fallback: number[]): number[] {
  if (!Array.isArray(val)) {
    warnInvalid(path, "number[]", val)
    return fallback
  }
  for (let i = 0; i < val.length; i++) {
    const el = val[i]
    if (typeof el !== "number" || !Number.isFinite(el) || !Number.isInteger(el)) {
      warnInvalid(`${path}[${i}]`, "integer", el)
      return fallback
    }
  }
  return val as number[]
}

function sanitizeOrchestrationMode(
  path: string,
  val: unknown,
  fallback: "native" | "subagent",
): "native" | "subagent" {
  if (val === "native" || val === "subagent") return val
  warnInvalid(path, '"native" or "subagent"', val)
  return fallback
}

function sanitizeMergedConfig(merged: Record<string, unknown>): OhMyCursorConfig {
  const d = DEFAULT_CONFIG

  const version = sanitizeFiniteNumber("version", merged.version, d.version)

  const disabled_hooks = sanitizeStringArray("disabled_hooks", merged.disabled_hooks, d.disabled_hooks)
  const disabled_agents = sanitizeStringArray("disabled_agents", merged.disabled_agents, d.disabled_agents)

  let subagent_limits = { ...d.subagent_limits }
  const slRaw = merged.subagent_limits
  if (typeof slRaw !== "object" || slRaw === null || Array.isArray(slRaw)) {
    warnInvalid("subagent_limits", "object with explore (number) and worker (number)", slRaw)
  } else {
    const sl = slRaw as Record<string, unknown>
    subagent_limits = {
      explore: sanitizeFiniteNumber(
        "subagent_limits.explore",
        sl.explore,
        d.subagent_limits.explore,
      ),
      worker: sanitizeFiniteNumber(
        "subagent_limits.worker",
        sl.worker,
        d.subagent_limits.worker,
      ),
    }
  }

  let state_persistence = { ...d.state_persistence }
  const spRaw = merged.state_persistence
  if (typeof spRaw !== "object" || spRaw === null || Array.isArray(spRaw)) {
    warnInvalid("state_persistence", "object", spRaw)
  } else {
    const sp = spRaw as Record<string, unknown>
    state_persistence = {
      enabled: sanitizeBoolean("state_persistence.enabled", sp.enabled, d.state_persistence.enabled),
      path: sanitizeString("state_persistence.path", sp.path, d.state_persistence.path),
    }
  }

  let daemon = { ...d.daemon }
  const dmRaw = merged.daemon
  if (typeof dmRaw !== "object" || dmRaw === null || Array.isArray(dmRaw)) {
    warnInvalid("daemon", "object", dmRaw)
  } else {
    const dm = dmRaw as Record<string, unknown>
    daemon = {
      port: sanitizePort("daemon.port", dm.port, d.daemon.port),
      mcp_port: sanitizePort("daemon.mcp_port", dm.mcp_port, d.daemon.mcp_port),
    }
  }

  let context_collector = { ...d.context_collector }
  const ccRaw = merged.context_collector
  if (typeof ccRaw !== "object" || ccRaw === null || Array.isArray(ccRaw)) {
    warnInvalid("context_collector", "object", ccRaw)
  } else {
    const cc = ccRaw as Record<string, unknown>
    context_collector = {
      enabled: sanitizeBoolean(
        "context_collector.enabled",
        cc.enabled,
        d.context_collector.enabled,
      ),
      max_context_chars: sanitizeContextChars(
        "context_collector.max_context_chars",
        cc.max_context_chars,
        d.context_collector.max_context_chars,
      ),
    }
  }

  let compaction = { ...d.compaction }
  const cpRaw = merged.compaction
  if (typeof cpRaw !== "object" || cpRaw === null || Array.isArray(cpRaw)) {
    warnInvalid("compaction", "object", cpRaw)
  } else {
    const cp = cpRaw as Record<string, unknown>
    compaction = {
      prompt_enabled: sanitizeBoolean(
        "compaction.prompt_enabled",
        cp.prompt_enabled,
        d.compaction.prompt_enabled,
      ),
    }
    if (cp.user_message_template !== undefined) {
      if (typeof cp.user_message_template === "string") {
        compaction.user_message_template = cp.user_message_template
      } else {
        warnInvalid("compaction.user_message_template", "string", cp.user_message_template)
      }
    }
  }

  let experimental = { ...d.experimental }
  const exRaw = merged.experimental
  if (typeof exRaw !== "object" || exRaw === null || Array.isArray(exRaw)) {
    warnInvalid("experimental", "object", exRaw)
  } else {
    const ex = exRaw as Record<string, unknown>
    experimental = {
      cloud_agents: sanitizeBoolean(
        "experimental.cloud_agents",
        ex.cloud_agents,
        d.experimental.cloud_agents,
      ),
      webhooks: sanitizeBoolean("experimental.webhooks", ex.webhooks, d.experimental.webhooks),
      automations: sanitizeBoolean(
        "experimental.automations",
        ex.automations,
        d.experimental.automations,
      ),
    }
  }

  const mcp_allowlist = sanitizeStringArray("mcp_allowlist", merged.mcp_allowlist, d.mcp_allowlist)

  let notifications = { ...d.notifications }
  const nRaw = merged.notifications
  if (typeof nRaw !== "object" || nRaw === null || Array.isArray(nRaw)) {
    warnInvalid("notifications", "object", nRaw)
  } else {
    const n = nRaw as Record<string, unknown>
    notifications = {
      enabled: sanitizeBoolean("notifications.enabled", n.enabled, d.notifications.enabled),
      sound: sanitizeBoolean("notifications.sound", n.sound, d.notifications.sound),
    }
  }

  let orchestration = { ...d.orchestration }
  const orRaw = merged.orchestration
  if (typeof orRaw !== "object" || orRaw === null || Array.isArray(orRaw)) {
    warnInvalid("orchestration", "object", orRaw)
  } else {
    const or = orRaw as Record<string, unknown>
    orchestration = {
      mode: sanitizeOrchestrationMode("orchestration.mode", or.mode, d.orchestration.mode),
    }
  }

  let continuation = { ...d.continuation }
  const ctRaw = merged.continuation
  if (typeof ctRaw !== "object" || ctRaw === null || Array.isArray(ctRaw)) {
    warnInvalid("continuation", "object", ctRaw)
  } else {
    const ct = ctRaw as Record<string, unknown>
    continuation = {
      cooldown_ms: sanitizePositiveNumber(
        "continuation.cooldown_ms",
        ct.cooldown_ms,
        d.continuation.cooldown_ms,
      ),
      max_failures: sanitizePositiveNumber(
        "continuation.max_failures",
        ct.max_failures,
        d.continuation.max_failures,
      ),
      backoff_multiplier: sanitizePositiveNumber(
        "continuation.backoff_multiplier",
        ct.backoff_multiplier,
        d.continuation.backoff_multiplier,
      ),
    }
  }

  let momus = { ...d.momus }
  const moRaw = merged.momus
  if (typeof moRaw !== "object" || moRaw === null || Array.isArray(moRaw)) {
    warnInvalid("momus", "object", moRaw)
  } else {
    const mo = moRaw as Record<string, unknown>
    momus = {
      max_iterations: sanitizePositiveNumber(
        "momus.max_iterations",
        mo.max_iterations,
        d.momus.max_iterations,
      ),
    }
  }

  let model_routing = {
    retry_on_errors: [...d.model_routing.retry_on_errors],
    max_retry_attempts: d.model_routing.max_retry_attempts,
    defaults: { ...d.model_routing.defaults },
  }
  const mrRaw = merged.model_routing
  if (typeof mrRaw !== "object" || mrRaw === null || Array.isArray(mrRaw)) {
    warnInvalid("model_routing", "object", mrRaw)
  } else {
    const mr = mrRaw as Record<string, unknown>
    model_routing.retry_on_errors = sanitizeNumberArray(
      "model_routing.retry_on_errors",
      mr.retry_on_errors,
      d.model_routing.retry_on_errors,
    )
    model_routing.max_retry_attempts = sanitizePositiveNumber(
      "model_routing.max_retry_attempts",
      mr.max_retry_attempts,
      d.model_routing.max_retry_attempts,
    )
    const defRaw = mr.defaults
    if (typeof defRaw !== "object" || defRaw === null || Array.isArray(defRaw)) {
      warnInvalid("model_routing.defaults", "Record<string, string>", defRaw)
    } else {
      const defObj = defRaw as Record<string, unknown>
      const nextDefaults: Record<string, string> = { ...d.model_routing.defaults }
      for (const key of Object.keys(defObj)) {
        const v = defObj[key]
        if (typeof v === "string") {
          nextDefaults[key] = v
        } else {
          warnInvalid(`model_routing.defaults.${key}`, "string", v)
          if (key in d.model_routing.defaults) {
            nextDefaults[key] = d.model_routing.defaults[key]!
          } else {
            delete nextDefaults[key]
          }
        }
      }
      model_routing.defaults = nextDefaults
    }
  }

  return {
    version,
    disabled_hooks,
    disabled_agents,
    subagent_limits,
    state_persistence,
    daemon,
    context_collector,
    compaction,
    experimental,
    mcp_allowlist,
    notifications,
    orchestration,
    continuation,
    momus,
    model_routing,
  }
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
  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    obj,
  )
  return sanitizeMergedConfig(merged)
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
