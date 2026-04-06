import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const CONFIG_PATH = join(homedir(), ".config", "oh-my-cursor", "config.json")

const ALL_HOOKS = [
  "/health", "/sessionStart", "/sessionEnd", "/preCompact",
  "/preToolUse", "/postToolUse", "/postToolUseFailure",
  "/stop", "/beforeSubmitPrompt",
  "/beforeShellExecution", "/afterShellExecution",
  "/beforeReadFile", "/afterFileEdit",
  "/beforeMCPExecution", "/afterMCPExecution",
  "/afterAgentResponse", "/afterAgentThought",
  "/subagentStart", "/subagentStop",
]

let cachedDisabled: Set<string> | null = null
let lastLoadTime = 0
const CACHE_TTL_MS = 30_000

function loadDisabledHooks(): Set<string> {
  const now = Date.now()
  if (cachedDisabled && now - lastLoadTime < CACHE_TTL_MS) return cachedDisabled

  const disabled = new Set<string>()

  const envVal = process.env.OH_MY_CURSOR_DISABLED_HOOKS
  if (envVal) {
    for (const hook of envVal.split(",")) {
      const trimmed = hook.trim()
      if (trimmed) disabled.add(trimmed.startsWith("/") ? trimmed : `/${trimmed}`)
    }
  }

  try {
    if (existsSync(CONFIG_PATH)) {
      const content = readFileSync(CONFIG_PATH, "utf-8")
      const config = JSON.parse(content)
      if (Array.isArray(config.disabled_hooks)) {
        for (const hook of config.disabled_hooks) {
          if (typeof hook === "string" && hook.trim()) {
            const trimmed = hook.trim()
            disabled.add(trimmed.startsWith("/") ? trimmed : `/${trimmed}`)
          }
        }
      }
    }
  } catch {
    // config file missing or malformed
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
