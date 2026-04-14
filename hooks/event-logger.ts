import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"

export type EventEntry = {
  ts: string
  event: string
  sessionId: string
  tool?: string
  agentType?: string
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

const logDir = join(process.env.HOME ?? "/tmp", ".cursor", "oh-my-cursor", "logs")

function getLogPathForConversation(sessionId?: string): string {
  if (sessionId) return join(logDir, `session-log-${sessionId}.jsonl`)
  return join(logDir, "session-log.jsonl")
}

let buffer: EventEntry[] = []
let pending: EventEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function loadFromFile(filePath: string): void {
  try {
    if (!existsSync(filePath)) return
    const text = Bun.file(filePath).textSync()
    if (!text.trim()) return
    for (const line of text.trim().split("\n")) {
      try {
        buffer.push(JSON.parse(line))
      } catch { /* skip corrupt lines */ }
    }
  } catch { /* file unreadable, skip */ }
}

function loadExisting(): void {
  try {
    if (!existsSync(logDir)) return
    const files = readdirSync(logDir).filter((f) => f.startsWith("session-log") && f.endsWith(".jsonl"))
    for (const file of files) {
      loadFromFile(join(logDir, file))
    }
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-TRIM_TO)
  } catch { /* directory unreadable, start fresh */ }
}

loadExisting()

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPending()
  }, FLUSH_DELAY)
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
    rotateIfNeeded(filePath)
  }

  cleanupOldConversationFiles()
}

function rotateIfNeeded(filePath: string): void {
  try {
    const text = Bun.file(filePath).textSync()
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
  const limit = opts?.limit ?? 100
  let results = buffer
  if (opts?.sessionId) results = results.filter((e) => e.sessionId === opts.sessionId)
  if (opts?.event) results = results.filter((e) => e.event === opts.event)
  if (opts?.action) results = results.filter((e) => e.action === opts.action)
  return results.slice(-limit).reverse()
}

export function getConversationSummary(sessionId?: string): ConversationSummary {
  const events = sessionId ? buffer.filter((e) => e.sessionId === sessionId) : buffer
  const id = sessionId ?? events[0]?.sessionId ?? "unknown"

  const toolCounts: Record<string, number> = {}
  const dispatchCounts: Record<string, number> = {}
  const hookCounts: Record<string, number> = {}
  const errors: ConversationSummary["errors"] = []
  const denies: ConversationSummary["denies"] = []

  for (const e of events) {
    hookCounts[e.event] = (hookCounts[e.event] ?? 0) + 1
    if (e.tool) toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1
    if (e.agentType) dispatchCounts[e.agentType] = (dispatchCounts[e.agentType] ?? 0) + 1
    if (e.action === "error" && e.error) errors.push({ ts: e.ts, tool: e.tool ?? "", error: e.error })
    if (e.action === "deny") denies.push({ ts: e.ts, tool: e.tool ?? "", reason: e.error ?? e.meta?.reason as string ?? "" })
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
