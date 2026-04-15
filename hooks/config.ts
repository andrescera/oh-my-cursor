import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { OhMyCursorConfigSchema, DEFAULT_CONFIG } from "./schemas/config"
import type { OhMyCursorConfig } from "./schemas/config"

export { DEFAULT_CONFIG }

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
  const result = OhMyCursorConfigSchema.safeParse(obj)
  if (result.success) {
    return result.data
  }
  return parseConfigPartially(obj)
}

function parseConfigPartially(rawConfig: Record<string, unknown>): OhMyCursorConfig {
  const partial: Record<string, unknown> = {}
  for (const key of Object.keys(rawConfig)) {
    const fieldResult = OhMyCursorConfigSchema.safeParse({ [key]: rawConfig[key] })
    if (fieldResult.success) {
      const fieldValue = (fieldResult.data as Record<string, unknown>)[key]
      if (fieldValue !== undefined) {
        partial[key] = fieldValue
      }
    } else {
      console.warn(
        `[oh-my-cursor] Config warning: field '${key}' has invalid value. Using default.`,
      )
    }
  }
  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    partial,
  )
  return OhMyCursorConfigSchema.parse(merged)
}

export function stripJsoncComments(text: string): string {
  let result = ""
  let i = 0
  while (i < text.length) {
    if (text[i] === '"') {
      result += '"'
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) {
          result += text[i] + text[i + 1]
          i += 2
        } else {
          result += text[i]
          i++
        }
      }
      if (i < text.length) {
        result += '"'
        i++
      }
    } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (text[i] === '/' && i + 1 < text.length && text[i + 1] === '*') {
      i += 2
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      if (i + 1 < text.length) i += 2
    } else {
      result += text[i]
      i++
    }
  }
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

const configCache = new Map<string, { config: OhMyCursorConfig; loadTime: number }>()
const CONFIG_CACHE_TTL_MS = 30_000

export function loadConfig(projectDir?: string): OhMyCursorConfig {
  const cacheKey = projectDir || "__default__"
  const now = Date.now()
  const cached = configCache.get(cacheKey)
  if (cached && now - cached.loadTime < CONFIG_CACHE_TTL_MS) return cached.config

  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>

  const userPath = join(homedir(), ".config", "oh-my-cursor", "config.jsonc")
  const userConfig = parseJsoncFile(userPath)
  if (userConfig) {
    merged = deepMerge(merged, userConfig)
  }

  const projectPath = join(projectDir || process.cwd(), ".cursor", "oh-my-cursor.jsonc")
  const projectConfig = parseJsoncFile(projectPath)
  if (projectConfig) {
    merged = deepMerge(merged, projectConfig)
  }

  const config = validateConfig(merged)
  configCache.set(cacheKey, { config, loadTime: now })
  return config
}

export function resetConfigCache(): void {
  configCache.clear()
}
