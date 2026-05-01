import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { redactSecrets } from "./secret-redactor"
import type { AgentHistoryEntry, AgentHistoryStatus } from "./types"

const DEFAULT_MAX_COUNT = 200
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_BYTES = 1024 * 1024
const DEFAULT_QUERY_LIMIT = 200
const SCHEMA_VERSION = 1 as const

const STATUS_RANK: Record<AgentHistoryStatus, number> = {
  running: 0,
  abandoned: 1,
  completed: 2,
  failed: 2,
}

const logDir = join(process.env.HOME ?? "/tmp", ".cursor", "oh-my-cursor", "logs")
const agentHistoryPath = join(logDir, "agent-history.jsonl")

const ALLOWED_KEYS: Array<keyof AgentHistoryEntry> = [
  "agentId",
  "agentType",
  "description",
  "startTime",
  "completedAt",
  "durationMs",
  "status",
  "errorContext",
  "projectRoot",
  "daemonBootId",
  "schemaVersion",
]

type AgentHistoryQueryFilter = {
  projectRoot?: string
  since?: number
  limit?: number
}

type CapOptions = {
  maxCount: number
  maxAgeMs: number
  maxBytes: number
  nowMs?: number
}

function truncate500(text: string): string {
  return text.length <= 500 ? text : text.slice(0, 500)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`[agent-history] "${fieldName}" must be a finite number`)
  }
  return value
}

function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`[agent-history] "${fieldName}" must be a string`)
  }
  return value
}

function parseStatus(value: unknown): AgentHistoryStatus {
  if (value === "running" || value === "completed" || value === "failed" || value === "abandoned") {
    return value
  }
  throw new Error(`[agent-history] "status" is invalid`)
}

function validateAllowlistShape(obj: Record<string, unknown>): void {
  const keys = Object.keys(obj)
  if (keys.length !== ALLOWED_KEYS.length) {
    throw new Error("[agent-history] entry must contain exactly 11 fields")
  }
  for (const key of keys) {
    if (!ALLOWED_KEYS.includes(key as keyof AgentHistoryEntry)) {
      throw new Error(`[agent-history] unexpected field "${key}"`)
    }
  }
}

function parseRawEntry(raw: unknown): AgentHistoryEntry {
  if (!isPlainObject(raw)) {
    throw new Error("[agent-history] entry must be an object")
  }
  validateAllowlistShape(raw)
  const schemaVersion = raw.schemaVersion
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`[agent-history] schemaVersion must be ${SCHEMA_VERSION}`)
  }

  const completedAtRaw = raw.completedAt
  const completedAt = completedAtRaw === null ? null : parseNumber(completedAtRaw, "completedAt")

  return {
    agentId: parseString(raw.agentId, "agentId"),
    agentType: parseString(raw.agentType, "agentType"),
    description: parseString(raw.description, "description"),
    startTime: parseNumber(raw.startTime, "startTime"),
    completedAt,
    durationMs: parseNumber(raw.durationMs, "durationMs"),
    status: parseStatus(raw.status),
    errorContext: raw.errorContext === null ? null : parseString(raw.errorContext, "errorContext"),
    projectRoot: parseString(raw.projectRoot, "projectRoot"),
    daemonBootId: parseString(raw.daemonBootId, "daemonBootId"),
    schemaVersion: SCHEMA_VERSION,
  }
}

function sanitizeEntry(entry: AgentHistoryEntry): AgentHistoryEntry {
  const parsed = parseRawEntry(entry)
  const description = truncate500(redactSecrets(parsed.description))
  const errorContext = parsed.errorContext === null ? null : truncate500(redactSecrets(parsed.errorContext))
  const startTime = Math.trunc(parsed.startTime)
  const completedAt = parsed.completedAt === null ? null : Math.trunc(parsed.completedAt)

  let durationMs = Math.max(0, Math.trunc(parsed.durationMs))
  if (completedAt !== null) {
    durationMs = Math.max(0, completedAt - startTime)
  }

  return {
    agentId: parsed.agentId,
    agentType: parsed.agentType,
    description,
    startTime,
    completedAt,
    durationMs,
    status: parsed.status,
    errorContext,
    projectRoot: parsed.projectRoot,
    daemonBootId: parsed.daemonBootId,
    schemaVersion: SCHEMA_VERSION,
  }
}

function dedupeKey(entry: AgentHistoryEntry): string {
  return `${entry.agentId}\0${entry.startTime}`
}

function chooseByRank(current: AgentHistoryEntry, incoming: AgentHistoryEntry): AgentHistoryEntry {
  const currentRank = STATUS_RANK[current.status]
  const incomingRank = STATUS_RANK[incoming.status]
  if (incomingRank > currentRank) return incoming
  if (incomingRank < currentRank) return current
  return incoming
}

function dedupeEntries(entries: AgentHistoryEntry[]): AgentHistoryEntry[] {
  const map = new Map<string, AgentHistoryEntry>()
  for (const entry of entries) {
    const key = dedupeKey(entry)
    const current = map.get(key)
    if (!current) {
      map.set(key, entry)
      continue
    }
    map.set(key, chooseByRank(current, entry))
  }
  return Array.from(map.values())
}

function jsonlString(entries: AgentHistoryEntry[]): string {
  if (entries.length === 0) return ""
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
}

function jsonlSizeBytes(entries: AgentHistoryEntry[]): number {
  return Buffer.byteLength(jsonlString(entries), "utf-8")
}

export function pruneToCap(entries: AgentHistoryEntry[], options: CapOptions): AgentHistoryEntry[] {
  const newestObservedMs = entries.reduce((latest, entry) => {
    const candidate = entry.completedAt ?? entry.startTime
    return candidate > latest ? candidate : latest
  }, 0)
  const nowMs = options.nowMs ?? newestObservedMs
  const maxAgeCutoff = nowMs - options.maxAgeMs

  let pruned = entries.filter((entry) => entry.startTime >= maxAgeCutoff)
  pruned.sort((a, b) => a.startTime - b.startTime)

  if (pruned.length > options.maxCount) {
    pruned = pruned.slice(-options.maxCount)
  }

  while (pruned.length > 0 && jsonlSizeBytes(pruned) > options.maxBytes) {
    pruned = pruned.slice(1)
  }

  return pruned
}

export class AgentHistoryStore {
  private readonly filePath: string

  constructor(options?: { filePath?: string }) {
    this.filePath = options?.filePath ?? agentHistoryPath
  }

  private readEntriesFromDisk(): AgentHistoryEntry[] {
    const out: AgentHistoryEntry[] = []
    try {
      if (!existsSync(this.filePath)) return out
      const text = readFileSync(this.filePath, "utf-8")
      if (!text.trim()) return out

      for (const line of text.trim().split("\n")) {
        try {
          const parsed = JSON.parse(line) as unknown
          const entry = parseRawEntry(parsed)
          out.push(entry)
        } catch { /* skip corrupt lines or schema drift */ }
      }
    } catch { /* file unreadable */ }
    return out
  }

  record(entry: AgentHistoryEntry): void {
    const normalized = sanitizeEntry(entry)
    const existingEntries = this.readEntriesFromDisk()
    const deduped = dedupeEntries([...existingEntries, normalized])
    const pruned = pruneToCap(deduped, {
      maxCount: DEFAULT_MAX_COUNT,
      maxAgeMs: DEFAULT_MAX_AGE_MS,
      maxBytes: DEFAULT_MAX_BYTES,
    })

    // Bad input should throw above; disk I/O should never crash the daemon.
    try {
      const dirPath = dirname(this.filePath)
      if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })

      const chunk = JSON.stringify(normalized) + "\n"
      appendFileSync(this.filePath, chunk)

      writeFileSync(this.filePath, jsonlString(pruned), "utf-8")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[oh-my-cursor][agent-history] failed to persist entry: ${message}`)
    }
  }

  query(filter: AgentHistoryQueryFilter): AgentHistoryEntry[] {
    const limit = typeof filter.limit === "number" ? Math.max(0, Math.trunc(filter.limit)) : DEFAULT_QUERY_LIMIT
    const since = typeof filter.since === "number" ? filter.since : undefined
    const projectRoot = typeof filter.projectRoot === "string" && filter.projectRoot ? filter.projectRoot : undefined

    const deduped = dedupeEntries(this.readEntriesFromDisk())
    let entries = deduped

    if (projectRoot) {
      entries = entries.filter((entry) => entry.projectRoot === projectRoot)
    }
    if (typeof since === "number" && Number.isFinite(since)) {
      entries = entries.filter((entry) => entry.startTime >= since)
    }

    entries.sort((a, b) => b.startTime - a.startTime)
    return entries.slice(0, limit)
  }
}

let defaultStore: AgentHistoryStore | null = null

export function getDefaultAgentHistoryStore(): AgentHistoryStore {
  if (!defaultStore) {
    defaultStore = new AgentHistoryStore({ filePath: agentHistoryPath })
  }
  return defaultStore
}

export function recordHistoryEntry(
  input: Partial<AgentHistoryEntry>,
  store: AgentHistoryStore = getDefaultAgentHistoryStore(),
): AgentHistoryEntry {
  const now = Date.now()

  if (typeof input.agentId !== "string" || input.agentId.trim() === "") {
    throw new Error('[agent-history] "agentId" is required')
  }

  const startTime = typeof input.startTime === "number" && Number.isFinite(input.startTime)
    ? Math.trunc(input.startTime)
    : now
  const completedAt = input.completedAt === null
    ? null
    : (typeof input.completedAt === "number" && Number.isFinite(input.completedAt) ? Math.trunc(input.completedAt) : null)

  const status: AgentHistoryStatus = input.status ?? "running"
  const fallbackDuration = completedAt === null ? 0 : completedAt - startTime

  const entry: AgentHistoryEntry = {
    agentId: input.agentId,
    agentType: typeof input.agentType === "string" ? input.agentType : "unknown",
    description: typeof input.description === "string" ? input.description : "",
    startTime,
    completedAt,
    durationMs: typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
      ? Math.trunc(input.durationMs)
      : fallbackDuration,
    status,
    errorContext: input.errorContext === null ? null : (typeof input.errorContext === "string" ? input.errorContext : null),
    projectRoot: typeof input.projectRoot === "string" ? input.projectRoot : (process.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()),
    daemonBootId: typeof input.daemonBootId === "string" ? input.daemonBootId : "unknown",
    schemaVersion: SCHEMA_VERSION,
  }

  store.record(entry)
  return entry
}
