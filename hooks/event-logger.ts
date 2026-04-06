import { existsSync, mkdirSync, appendFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

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

export type SessionSummary = {
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

const MAX_BUFFER = 10_000
const TRIM_TO = 5_000
const FLUSH_DELAY = 500
const MAX_FILE_LINES = 10_000
const FILE_TRIM_TO = 5_000

const logPath = process.env.OH_MY_CURSOR_PROJECT_DIR
  ? resolve(process.env.OH_MY_CURSOR_PROJECT_DIR, ".cursor/hooks/state/session-log.jsonl")
  : "/tmp/oh-my-cursor-session-log.jsonl"

let buffer: EventEntry[] = []
let pending: EventEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function loadExisting(): void {
  try {
    if (!existsSync(logPath)) return
    const text = Bun.file(logPath).textSync()
    if (!text.trim()) return
    for (const line of text.trim().split("\n")) {
      try {
        buffer.push(JSON.parse(line))
      } catch {
        // skip corrupt lines
      }
    }
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-TRIM_TO)
  } catch {
    // file unreadable, start fresh
  }
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

  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const chunk = entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
  appendFileSync(logPath, chunk)

  rotateIfNeeded()
}

function rotateIfNeeded(): void {
  try {
    const text = Bun.file(logPath).textSync()
    const lines = text.trim().split("\n")
    if (lines.length > MAX_FILE_LINES) {
      Bun.write(logPath, lines.slice(-FILE_TRIM_TO).join("\n") + "\n")
    }
  } catch {
    // rotation failure is non-fatal
  }
}

export function logEvent(entry: EventEntry): void {
  buffer.push(entry)
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-TRIM_TO)
  pending.push(entry)
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

export function getSessionSummary(sessionId?: string): SessionSummary {
  const events = sessionId ? buffer.filter((e) => e.sessionId === sessionId) : buffer
  const id = sessionId ?? events[0]?.sessionId ?? "unknown"

  const toolCounts: Record<string, number> = {}
  const dispatchCounts: Record<string, number> = {}
  const hookCounts: Record<string, number> = {}
  const errors: SessionSummary["errors"] = []
  const denies: SessionSummary["denies"] = []

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

export function clearLog(): void {
  buffer = []
  pending = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    const { unlinkSync } = require("node:fs")
    if (existsSync(logPath)) unlinkSync(logPath)
  } catch {
    // deletion failure is non-fatal
  }
}

export function getLogPath(): string {
  return logPath
}
