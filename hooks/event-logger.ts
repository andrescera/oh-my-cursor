import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"

export type EventEntry = {
  ts: string
  event: string
  sessionId: string
  tool?: string
  agentType?: string
  agentId?: string
  action?: string
  durationMs?: number
  error?: string
  meta?: Record<string, unknown>
}

export type ConversationSummary = {
  sessionId: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number
  totalEvents: number
  toolCounts: Record<string, number>
  dispatchCounts: Record<string, number>
  errorCount: number
  denyCount: number
  hookCounts: Record<string, number>
  errors: Array<{ ts: string; tool: string; error: string }>
  denies: Array<{ ts: string; tool: string; reason: string }>
  blockCount: number
  blocks: Array<{ ts: string; event: string; reason: string }>
}

type EventCallback = (entry: EventEntry) => void
const listeners: Set<EventCallback> = new Set()

export function onEvent(cb: EventCallback): void {
  listeners.add(cb)
}

export function offEvent(cb: EventCallback): void {
  listeners.delete(cb)
}

const MAX_BUFFER = 10_000
const TRIM_TO = 5_000
const FLUSH_DELAY = 500
const MAX_FILE_LINES = 10_000
const FILE_TRIM_TO = 5_000
const MAX_FILE_BYTES = 2_097_152

const pendingRotations: Set<string> = new Set()
let cleanupPending = false

function scheduleRotation(filePath: string): void {
  try {
    const size = statSync(filePath).size
    if (size > MAX_FILE_BYTES) pendingRotations.add(filePath)
  } catch { /* missing file is non-fatal */ }
}

function scheduleCleanup(): void {
  cleanupPending = true
}

export function drainPendingRotations(): void {
  if (pendingRotations.size === 0) return
  const paths = Array.from(pendingRotations)
  pendingRotations.clear()
  for (const filePath of paths) rotateIfNeeded(filePath)
}

export function drainCleanup(): void {
  if (!cleanupPending) return
  cleanupPending = false
  cleanupOldConversationFiles()
}

const logDir = join(process.env.HOME ?? "/tmp", ".cursor", "oh-my-cursor", "logs")

function getLogPathForConversation(sessionId?: string): string {
  if (sessionId) return join(logDir, `session-log-${sessionId}.jsonl`)
  return join(logDir, "session-log.jsonl")
}

let buffer: EventEntry[] = []
let pending: EventEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function parseEventLogFile(filePath: string): EventEntry[] {
  const out: EventEntry[] = []
  try {
    if (!existsSync(filePath)) return out
    const text = readFileSync(filePath, "utf-8")
    if (!text.trim()) return out
    for (const line of text.trim().split("\n")) {
      try {
        out.push(JSON.parse(line) as EventEntry)
      } catch { /* skip corrupt lines */ }
    }
  } catch { /* file unreadable */ }
  return out
}

function eventDedupeKey(e: EventEntry): string {
  return `${e.ts}\0${e.event}\0${e.tool ?? ""}`
}

function mergeSessionEvents(sessionId: string): EventEntry[] {
  const filePath = getLogPathForConversation(sessionId || undefined)
  const fromDisk = parseEventLogFile(filePath).filter((e) => e.sessionId === sessionId)
  const fromBuffer = buffer.filter((e) => e.sessionId === sessionId)
  const map = new Map<string, EventEntry>()
  for (const e of fromDisk) map.set(eventDedupeKey(e), e)
  for (const e of fromBuffer) map.set(eventDedupeKey(e), e)
  const merged = Array.from(map.values())
  merged.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  return merged
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPending()
  }, FLUSH_DELAY)
}

export function flushEventLog(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flushPending()
}

function flushPending(): void {
  if (pending.length === 0) return
  const entries = pending
  pending = []

  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const grouped = new Map<string, EventEntry[]>()
  for (const entry of entries) {
    const key = entry.sessionId || ""
    const group = grouped.get(key)
    if (group) group.push(entry)
    else grouped.set(key, [entry])
  }

  for (const [sessionId, group] of grouped) {
    const filePath = getLogPathForConversation(sessionId || undefined)
    const chunk = group.map((e) => JSON.stringify(e)).join("\n") + "\n"
    appendFileSync(filePath, chunk)
    scheduleRotation(filePath)
  }

  scheduleCleanup()
}

function rotateIfNeeded(filePath: string): void {
  try {
    const text = readFileSync(filePath, "utf-8")
    const lines = text.trim().split("\n")
    if (lines.length > MAX_FILE_LINES) {
      Bun.write(filePath, lines.slice(-FILE_TRIM_TO).join("\n") + "\n")
    }
  } catch { /* rotation failure is non-fatal */ }
}

const STALE_FILE_MS = 7 * 24 * 60 * 60 * 1000

function cleanupOldConversationFiles(): void {
  try {
    if (!existsSync(logDir)) return
    const now = Date.now()
    const files = readdirSync(logDir).filter((f) => f.startsWith("session-log-") && f.endsWith(".jsonl"))
    for (const file of files) {
      const fullPath = join(logDir, file)
      try {
        const stat = statSync(fullPath)
        if (now - stat.mtimeMs > STALE_FILE_MS) unlinkSync(fullPath)
      } catch { /* stat/unlink failure is non-fatal */ }
    }
  } catch { /* cleanup failure is non-fatal */ }
}

export function logEvent(entry: EventEntry): void {
  buffer.push(entry)
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-TRIM_TO)
  pending.push(entry)
  for (const cb of listeners) {
    try {
      cb(entry)
    } catch {}
  }
  scheduleFlush()
}

export function getEvents(opts?: {
  limit?: number
  sessionId?: string
  event?: string
  action?: string
}): EventEntry[] {
  if (!opts?.sessionId) {
    console.warn("[oh-my-cursor][event-logger] getEvents() called without sessionId — cross-session query (deprecated)")
  }
  const limit = opts?.limit ?? 100
  let results: EventEntry[]
  if (opts?.sessionId !== undefined && opts.sessionId !== null) {
    results = mergeSessionEvents(opts.sessionId)
  } else {
    results = buffer
  }
  if (opts?.event) results = results.filter((e) => e.event === opts.event)
  if (opts?.action) results = results.filter((e) => e.action === opts.action)
  return results.slice(-limit).reverse()
}

export function getConversationSummary(sessionId: string): ConversationSummary {
  const events = mergeSessionEvents(sessionId)
  const id = sessionId

  const toolCounts: Record<string, number> = {}
  const dispatchCounts: Record<string, number> = {}
  const hookCounts: Record<string, number> = {}
  const errors: ConversationSummary["errors"] = []
  const denies: ConversationSummary["denies"] = []
  const blocks: ConversationSummary["blocks"] = []

  for (const e of events) {
    hookCounts[e.event] = (hookCounts[e.event] ?? 0) + 1
    if (e.tool) toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1
    if (e.agentType) dispatchCounts[e.agentType] = (dispatchCounts[e.agentType] ?? 0) + 1
    if (e.action === "error" && e.error) errors.push({ ts: e.ts, tool: e.tool ?? "", error: e.error })
    if (e.action === "deny") denies.push({ ts: e.ts, tool: e.tool ?? "", reason: e.error ?? e.meta?.reason as string ?? "" })
    if (e.action === "block") blocks.push({ ts: e.ts, event: e.event, reason: (e.meta?.reason as string) ?? "" })
  }

  const timestamps = events.map((e) => e.ts).sort()
  const startedAt = timestamps[0] ?? null
  const endedAt = timestamps.length > 1 ? timestamps[timestamps.length - 1]! : null
  const durationMs = startedAt && endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : 0

  return {
    sessionId: id,
    startedAt,
    endedAt,
    durationMs,
    totalEvents: events.length,
    toolCounts,
    dispatchCounts,
    errorCount: errors.length,
    denyCount: denies.length,
    hookCounts,
    errors,
    denies,
    blockCount: blocks.length,
    blocks,
  }
}

export function clearLog(sessionId?: string): void {
  if (sessionId) {
    buffer = buffer.filter((e) => e.sessionId !== sessionId)
  } else {
    buffer = []
  }
  pending = sessionId ? pending.filter((e) => e.sessionId !== sessionId) : []
  if (!sessionId && flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    if (sessionId) {
      const filePath = getLogPathForConversation(sessionId)
      if (existsSync(filePath)) unlinkSync(filePath)
    } else {
      if (!existsSync(logDir)) return
      const files = readdirSync(logDir).filter((f) => f.startsWith("session-log") && f.endsWith(".jsonl"))
      for (const file of files) unlinkSync(join(logDir, file))
    }
  } catch { /* deletion failure is non-fatal */ }
}

export function getLogPath(sessionId?: string): string {
  return getLogPathForConversation(sessionId)
}
