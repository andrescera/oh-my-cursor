import { loadConfig } from "./config"

const ALL_HOOKS = [
  "/health", "/heartbeat", "/sessionStart", "/sessionEnd", "/preCompact",
  "/preToolUse", "/postToolUse", "/postToolUseFailure",
  "/stop", "/beforeSubmitPrompt",
  "/beforeShellExecution", "/afterShellExecution",
  "/beforeReadFile", "/afterFileEdit",
  "/beforeTabFileRead", "/afterTabFileEdit",
  "/beforeMCPExecution", "/afterMCPExecution",
  "/afterAgentResponse", "/afterAgentThought",
  "/subagentStart", "/subagentStop",
]

let cachedDisabled: Set<string> | null = null
let lastLoadTime = 0
const CACHE_TTL_MS = 30_000

function normalizeHookName(hook: string): string {
  const trimmed = hook.trim()
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

function loadDisabledHooks(): Set<string> {
  const now = Date.now()
  if (cachedDisabled && now - lastLoadTime < CACHE_TTL_MS) return cachedDisabled

  const disabled = new Set<string>()

  const envVal = process.env.OH_MY_CURSOR_DISABLED_HOOKS
  if (envVal) {
    for (const hook of envVal.split(",")) {
      const trimmed = hook.trim()
      if (trimmed) disabled.add(normalizeHookName(trimmed))
    }
  }

  const pluginConfig = loadConfig()
  if (Array.isArray(pluginConfig.disabled_hooks)) {
    for (const hook of pluginConfig.disabled_hooks) {
      if (typeof hook === "string" && hook.trim()) {
        disabled.add(normalizeHookName(hook))
      }
    }
  }

  cachedDisabled = disabled
  lastLoadTime = now
  return disabled
}

export function isHookEnabled(hookName: string): boolean {
  const normalized = hookName.startsWith("/") ? hookName : `/${hookName}`
  return !loadDisabledHooks().has(normalized)
}

export function getHookConfig(): { enabled: string[]; disabled: string[] } {
  const disabled = loadDisabledHooks()
  return {
    enabled: ALL_HOOKS.filter((h) => !disabled.has(h)),
    disabled: ALL_HOOKS.filter((h) => disabled.has(h)),
  }
}

export function resetHookConfigCache(): void {
  cachedDisabled = null
  lastLoadTime = 0
}
