import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, posix, win32 } from "node:path"
import { KNOWN_AGENT_TYPES, KNOWN_CURSOR_MODELS } from "./known-models"
import { loadReportedModels } from "./reported-models-store"

/**
 * task-schema-introspector — multi-OS hybrid discovery of the Cursor Task model
 * slug enum and oh-my-cursor agent-type enum.
 *
 * Strategy chain (highest priority first):
 *   1. bundleScan      — scan the installed Cursor bundle JS for slug clusters
 *   2. passiveObserve  — additive store of model/agent values fed by callers
 *   3. fallback        — KNOWN_CURSOR_MODELS / KNOWN_AGENT_TYPES (the floor)
 *
 * Hard guarantees:
 *   - No public function ever throws (every error path falls through silently).
 *   - The bundle scan is bounded by `scan_timeout_ms` (default 2000ms).
 *   - Results are cached by `cursorVersion`; a version mismatch invalidates and
 *     rescans. Passive observations are merged additively on every call and
 *     never replace scan results.
 */

export type EnumSource = "bundle" | "observed" | "fallback" | "reported"

export interface EnumResult {
  models: string[]
  agents: string[]
  source: EnumSource
  cursorVersion?: string
  cachedAt: string
  needsCapture: boolean
}

export interface IntrospectionConfig {
  enabled?: boolean
  scan_timeout_ms?: number
  extra_bundle_paths?: string[]
}

export interface BundleScanContext {
  candidatePaths: string[]
  timeoutMs: number
  now: () => number
}

export interface BundleScanResult {
  models: string[]
  cursorVersion?: string
}

export interface GetEnumOptions {
  introspection?: IntrospectionConfig
  cursorVersion?: string
  /** Override process.platform (testing / cross-OS resolution). */
  platform?: NodeJS.Platform
  /** Override the resolved home directory. */
  homeDir?: string
  /** Override process.env. */
  env?: Record<string, string | undefined>
  /** Injectable clock for deterministic timeout/cache testing. */
  now?: () => number
  /** @internal test seam — bypass per-OS path resolution. */
  _candidatePaths?: string[]
  /** @internal test seam — replace the bundle scan strategy. */
  _bundleScan?: (ctx: BundleScanContext) => Promise<BundleScanResult | null>
  /** @internal test seam — replace the reported-store loader. */
  _reportedLoad?: (version?: string) => string[] | null
}

export interface CandidatePathOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  env?: Record<string, string | undefined>
  extraPaths?: string[]
}

const DEFAULT_SCAN_TIMEOUT_MS = 2000
const MAX_SCAN_FILES = 600
const MAX_SCAN_DEPTH = 8
const MIN_CLUSTER = 2
const MAX_SLUG_LENGTH = 60
const NO_VERSION_KEY = "__no_version__"

// A quoted string looks like a model slug when it starts with a known vendor
// prefix, contains a digit, and has at least one hyphen-separated segment.
// Every real Cursor Task slug is hyphenated (composer-2-fast, gpt-5.4-medium,
// claude-opus-4-7-thinking-xhigh, gemini-3.1-pro). Requiring a hyphen rejects
// dotted-only false positives like "O3.5"/"O12.1" found in minified bundles
// while staying discovery-friendly for unseen hyphenated variants.
export const SLUG_FULL_RE =
  /^(?:composer|gpt|claude|gemini|grok|kimi|deepseek|qwen|llama|mistral|o[0-9])[a-z0-9]*(?:[.\-][a-z0-9]+)*-[a-z0-9]+(?:[.\-][a-z0-9]+)*$/i
const QUOTED_RE = /["']([^"']{1,80})["']/g

// ---------------------------------------------------------------------------
// Module-level state (cleared via resetIntrospectorState)
// ---------------------------------------------------------------------------

const observedModels = new Set<string>()
const observedAgents = new Set<string>()

interface BaseResult {
  models: string[]
  agents: string[]
  source: EnumSource
  cursorVersion?: string
  cachedAt: string
  needsCapture: boolean
}

let cachedBase: BaseResult | null = null
let cachedKey: string | null = null
let scanCount = 0

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve candidate Cursor install paths for the active (or overridden)
 * platform, plus any caller-supplied `extra_bundle_paths`. Pure and
 * non-throwing; existence is checked later during the scan.
 */
export function resolveCandidatePaths(opts: CandidatePathOptions = {}): string[] {
  const out: string[] = []
  try {
    const platform = opts.platform ?? process.platform
    const env = opts.env ?? (process.env as Record<string, string | undefined>)
    const home = opts.homeDir ?? env.HOME ?? env.USERPROFILE ?? ""

    if (platform === "darwin") {
      out.push("/Applications/Cursor.app/Contents/Resources/app")
      if (home) {
        out.push(posix.join(home, "Applications/Cursor.app/Contents/Resources/app"))
      }
    } else if (platform === "win32") {
      const localAppData = env.LOCALAPPDATA
      const programFiles = env.PROGRAMFILES
      if (localAppData) {
        out.push(win32.join(localAppData, "Programs", "cursor", "resources", "app"))
      }
      if (programFiles) {
        out.push(win32.join(programFiles, "cursor", "resources", "app"))
      }
    } else {
      // linux + other unix
      out.push("/usr/share/cursor")
      out.push("/usr/share/cursor/resources/app")
      out.push("/opt/cursor")
      // /opt/Cursor* glob expansion
      try {
        for (const name of readdirSync("/opt")) {
          if (/cursor/i.test(name)) out.push(posix.join("/opt", name))
        }
      } catch {
        // /opt unreadable — ignore
      }
      if (home) {
        out.push(posix.join(home, ".local/share/cursor"))
        out.push(posix.join(home, ".local/share/cursor/resources/app"))
        out.push(posix.join(home, "squashfs-root"))
        out.push(posix.join(home, "squashfs-root/usr/share/cursor/resources/app"))
      }
      try {
        out.push(posix.join(process.cwd(), "squashfs-root"))
      } catch {
        // cwd unavailable — ignore
      }
      const appImage = env.APPIMAGE
      if (appImage) {
        const dir = posix.dirname(appImage)
        out.push(dir)
        out.push(posix.join(dir, "squashfs-root"))
      }
    }
  } catch {
    // never throw from path resolution
  }

  if (opts.extraPaths) {
    for (const p of opts.extraPaths) {
      if (typeof p === "string" && p.length > 0) out.push(p)
    }
  }

  return [...new Set(out)]
}

/**
 * Record an observed model and/or agent type. Additive only — observations are
 * unioned into every subsequent `getEnum` result and never replace scan
 * results. Mirrors the field-extraction idiom in extract-agent-fields.ts.
 */
export function passiveObserve(
  record: { model?: unknown; subagent_type?: unknown; agent_type?: unknown } | null | undefined,
): void {
  try {
    if (!record || typeof record !== "object") return
    const model = record.model
    if (typeof model === "string" && model.trim().length > 0) {
      observedModels.add(model.trim())
    }
    const agent = record.subagent_type ?? record.agent_type
    if (typeof agent === "string" && agent.trim().length > 0) {
      observedAgents.add(agent.trim())
    }
  } catch {
    // never throw
  }
}

/**
 * Resolve the current model/agent enums via the strategy chain. Never throws;
 * always returns a usable result. Cached by `cursorVersion` — a mismatch
 * triggers a rescan.
 */
export async function getEnum(options: GetEnumOptions = {}): Promise<EnumResult> {
  try {
    const base = await getOrComputeBase(options)
    const models = unionPreserve(base.models, [...observedModels])
    const agents = unionPreserve(base.agents, [...observedAgents])
    let source = base.source
    if (source === "fallback" && (observedModels.size > 0 || observedAgents.size > 0)) {
      source = "observed"
    }
    return {
      models,
      agents,
      source,
      cursorVersion: base.cursorVersion,
      cachedAt: base.cachedAt,
      needsCapture: base.needsCapture,
    }
  } catch {
    // Absolute last-resort fallback — getEnum must never reject.
    return {
      models: unionPreserve([...KNOWN_CURSOR_MODELS], [...observedModels]),
      agents: unionPreserve([...KNOWN_AGENT_TYPES], [...observedAgents]),
      source: observedModels.size > 0 || observedAgents.size > 0 ? "observed" : "fallback",
      cursorVersion: options.cursorVersion,
      cachedAt: new Date().toISOString(),
      needsCapture: true,
    }
  }
}

/** Clear cache, observations, and scan counter. Intended for tests / restart. */
export function resetIntrospectorState(): void {
  cachedBase = null
  cachedKey = null
  observedModels.clear()
  observedAgents.clear()
  scanCount = 0
}

/** Clear ONLY the base cache (not observations). Used after a reported capture to force a re-resolve. */
export function invalidateBaseCache(): void {
  cachedBase = null
  cachedKey = null
}

/** Number of bundle scans actually executed since the last reset (test seam). */
export function getIntrospectorScanCount(): number {
  return scanCount
}

// ---------------------------------------------------------------------------
// Internal: base computation + caching
// ---------------------------------------------------------------------------

async function getOrComputeBase(options: GetEnumOptions): Promise<BaseResult> {
  const key = options.cursorVersion ?? NO_VERSION_KEY
  if (cachedBase && cachedKey === key) return cachedBase

  let base: BaseResult
  try {
    base = await computeBase(options)
  } catch {
    base = fallbackBase(options)
  }

  cachedBase = base
  cachedKey = key
  return base
}

async function computeBase(options: GetEnumOptions): Promise<BaseResult> {
  const introspection = options.introspection ?? {}
  const enabled = introspection.enabled !== false
  const timeoutMs = introspection.scan_timeout_ms ?? DEFAULT_SCAN_TIMEOUT_MS
  const now = options.now ?? (() => Date.now())

  // Highest-priority tier: a runtime-reported capture for this exact version.
  // When present it wins outright (no bundle scan needed) and is fully resolved,
  // so `needsCapture` is false. Any other tier still wants a capture.
  const reportedLoad = options._reportedLoad ?? loadReportedModels
  const reported = reportedLoad(options.cursorVersion)
  if (reported && reported.length > 0) {
    return {
      models: [...reported],
      agents: [...KNOWN_AGENT_TYPES],
      source: "reported",
      cursorVersion: options.cursorVersion,
      needsCapture: false,
      cachedAt: isoFrom(now),
    }
  }

  let bundle: BundleScanResult | null = null
  if (enabled) {
    const candidatePaths =
      options._candidatePaths ??
      resolveCandidatePaths({
        platform: options.platform,
        homeDir: options.homeDir,
        env: options.env,
        extraPaths: introspection.extra_bundle_paths,
      })
    const scanFn = options._bundleScan ?? bundleScan
    scanCount++
    try {
      bundle = await scanFn({ candidatePaths, timeoutMs, now })
    } catch {
      bundle = null
    }
  }

  const models = bundle
    ? unionPreserve(bundle.models, [...KNOWN_CURSOR_MODELS])
    : [...KNOWN_CURSOR_MODELS]

  return {
    models,
    agents: [...KNOWN_AGENT_TYPES],
    source: bundle ? "bundle" : "fallback",
    cursorVersion: bundle?.cursorVersion ?? options.cursorVersion,
    cachedAt: isoFrom(now),
    needsCapture: true,
  }
}

function fallbackBase(options: GetEnumOptions): BaseResult {
  return {
    models: [...KNOWN_CURSOR_MODELS],
    agents: [...KNOWN_AGENT_TYPES],
    source: "fallback",
    cursorVersion: options.cursorVersion,
    cachedAt: new Date().toISOString(),
    needsCapture: true,
  }
}

// ---------------------------------------------------------------------------
// Internal: bundle scan strategy
// ---------------------------------------------------------------------------

/**
 * Scan candidate Cursor install directories for model-slug enum clusters.
 * Returns null on any failure, empty result, or timeout — never throws.
 */
export async function bundleScan(ctx: BundleScanContext): Promise<BundleScanResult | null> {
  const { candidatePaths, timeoutMs, now } = ctx
  if (timeoutMs <= 0) return null

  const deadline = now() + timeoutMs
  const models = new Set<string>()
  let version: string | undefined

  try {
    for (const candidate of candidatePaths) {
      if (now() > deadline) break
      let isDir = false
      try {
        isDir = statSync(candidate).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue

      if (!version) version = readBundleVersion(candidate)
      walkAndScan(candidate, models, now, deadline)
      if (now() > deadline) break
    }
  } catch {
    // fall through to the size check below
  }

  if (models.size >= MIN_CLUSTER) {
    return { models: [...models], cursorVersion: version }
  }
  return null
}

function readBundleVersion(candidate: string): string | undefined {
  for (const rel of ["package.json", join("resources", "app", "package.json")]) {
    try {
      const raw = readFileSync(join(candidate, rel), "utf-8")
      const parsed = JSON.parse(raw) as { version?: unknown }
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        return parsed.version
      }
    } catch {
      // missing / unparseable — try next
    }
  }
  return undefined
}

function walkAndScan(
  root: string,
  models: Set<string>,
  now: () => number,
  deadline: number,
): void {
  let fileCount = 0
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (stack.length > 0) {
    if (now() > deadline || fileCount >= MAX_SCAN_FILES) return
    const next = stack.pop()
    if (!next) return
    const { dir, depth } = next
    if (depth > MAX_SCAN_DEPTH) continue

    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (now() > deadline || fileCount >= MAX_SCAN_FILES) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue
        stack.push({ dir: full, depth: depth + 1 })
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        fileCount++
        try {
          const content = readFileSync(full, "utf-8")
          const slugs = extractSlugCluster(content)
          for (const slug of slugs) models.add(slug)
        } catch {
          // unreadable file — skip
        }
      }
    }
  }
}

/**
 * Extract slug-shaped quoted strings from file content. Returns them only when
 * the file contains a *cluster* (>= MIN_CLUSTER distinct slugs), avoiding
 * stray single mentions in unrelated code.
 */
function extractSlugCluster(content: string): string[] {
  const found = new Set<string>()
  QUOTED_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = QUOTED_RE.exec(content)) !== null) {
    const candidate = match[1]
    if (looksLikeSlug(candidate)) found.add(candidate)
  }
  return found.size >= MIN_CLUSTER ? [...found] : []
}

function looksLikeSlug(value: string): boolean {
  if (value.length > MAX_SLUG_LENGTH) return false
  if (!/[0-9]/.test(value)) return false
  if (!/[.\-]/.test(value)) return false
  return SLUG_FULL_RE.test(value)
}

// ---------------------------------------------------------------------------
// Internal: helpers
// ---------------------------------------------------------------------------

function unionPreserve(...lists: ReadonlyArray<readonly string[]>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item)) {
        seen.add(item)
        out.push(item)
      }
    }
  }
  return out
}

function isoFrom(now: () => number): string {
  try {
    return new Date(now()).toISOString()
  } catch {
    return new Date().toISOString()
  }
}
