import { readFileSync } from "node:fs"
import { join } from "node:path"
import { writeFileAtomic } from "./atomic-file"
import { SLUG_FULL_RE } from "./task-schema-introspector"

// Pure, never-throwing, version-keyed JSON store for Cursor model enums that the
// IDE reports at runtime. Captures are shape-validated only (no allowlist/bundle
// dependency) and persisted atomically. Every exported function swallows its own
// errors so callers on the hot path never have to guard against I/O or parse
// failures. NO daemon/HTTP imports here — that would create a require cycle and
// inflate the module far past its budget.

export const MIN_REPORTED_MODELS = 3
export const MAX_REPORTED_VERSIONS = 10
const MAX_SLUG_LENGTH = 60

interface ReportedEntry {
  capturedAt: string
  models: string[]
}

type ReportedStore = Record<string, ReportedEntry>

function storePath(): string {
  return (
    process.env.OH_MY_CURSOR_REPORTED_MODELS_FILE ??
    join(process.env.HOME ?? "/tmp", ".config", "oh-my-cursor", "reported-models.json")
  )
}

/**
 * Split a candidate model list into accepted (shape-valid, deduped) and rejected
 * slugs. Coerces non-arrays to empty. Validation is shape-only: trimmed string,
 * non-empty, length ≤ 60, matches SLUG_FULL_RE. First-seen order is preserved
 * and duplicates land in `rejected`.
 */
export function validateReportedSlugs(models: unknown): { accepted: string[]; rejected: string[] } {
  const accepted: string[] = []
  const rejected: string[] = []
  if (!Array.isArray(models)) return { accepted, rejected }

  const seen = new Set<string>()
  for (const raw of models) {
    if (typeof raw !== "string") {
      rejected.push(String(raw))
      continue
    }
    const slug = raw.trim()
    if (slug === "" || slug.length > MAX_SLUG_LENGTH || !SLUG_FULL_RE.test(slug)) {
      rejected.push(raw)
      continue
    }
    if (seen.has(slug)) {
      rejected.push(raw)
      continue
    }
    seen.add(slug)
    accepted.push(slug)
  }
  return { accepted, rejected }
}

function readStore(): ReportedStore {
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8")) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ReportedStore
    }
  } catch {
    // Missing or corrupt store → start fresh.
  }
  return {}
}

function isReportedEntry(value: unknown): value is ReportedEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.capturedAt === "string" &&
    Array.isArray(entry.models) &&
    entry.models.every((m) => typeof m === "string")
  )
}

/**
 * Capture a reported model list under a Cursor version key. Never throws. Below
 * MIN_REPORTED_MODELS accepted slugs is a no-op (nothing written). Evicts the
 * oldest entry by capturedAt when the store would exceed MAX_REPORTED_VERSIONS.
 */
export function captureReported(version: string, models: string[]): void {
  const { accepted } = validateReportedSlugs(models)
  if (accepted.length < MIN_REPORTED_MODELS) return

  const store = readStore()
  store[version] = { capturedAt: new Date().toISOString(), models: accepted }

  if (Object.keys(store).length > MAX_REPORTED_VERSIONS) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [key, entry] of Object.entries(store)) {
      const at = isReportedEntry(entry) ? Date.parse(entry.capturedAt) : NaN
      const score = Number.isNaN(at) ? -Infinity : at
      if (score < oldestAt) {
        oldestAt = score
        oldestKey = key
      }
    }
    if (oldestKey !== null) delete store[oldestKey]
  }

  try {
    writeFileAtomic(storePath(), JSON.stringify(store, null, 2))
  } catch {
    // Swallow — persistence is best-effort and must never break the caller.
  }
}

/**
 * Load the captured entry for a version. Never throws. Returns null for a
 * missing version, missing/corrupt store, or a shape-invalid entry.
 */
export function loadReported(version: string | undefined): ReportedEntry | null {
  if (!version) return null
  const store = readStore()
  const entry = store[version]
  return isReportedEntry(entry) ? entry : null
}

/**
 * Convenience accessor returning just the captured model slugs, or null.
 */
export function loadReportedModels(version: string | undefined): string[] | null {
  return loadReported(version)?.models ?? null
}
