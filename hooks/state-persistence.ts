import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { SessionState } from "./types"

const DEFAULT_PATH = "/tmp/oh-my-cursor-state.json"
const DEFAULT_DEBOUNCE_MS = 5000

export class StatePersistence {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly filePath: string
  private readonly debounceMs: number

  constructor(filePath = DEFAULT_PATH, debounceMs = DEFAULT_DEBOUNCE_MS) {
    this.filePath = filePath
    this.debounceMs = debounceMs
  }

  save(sessions: Map<string, SessionState>): void {
    if (this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.writeToDisk(sessions)
    }, this.debounceMs)
  }

  forceFlush(sessions: Map<string, SessionState>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.writeToDisk(sessions)
  }

  load(): Map<string, SessionState> | null {
    try {
      if (!existsSync(this.filePath)) return null
      const text = readFileSync(this.filePath, "utf-8")
      if (!text.trim()) return null

      const data = JSON.parse(text)
      if (!Array.isArray(data)) return null

      const sessions = new Map<string, SessionState>()
      for (const entry of data) {
        sessions.set(entry.id, {
          ...entry,
          readPaths: new Set(entry.readPaths || []),
          injectedPaths: new Set(entry.injectedPaths || []),
          pendingWriteArgs: new Map(Object.entries(entry.pendingWriteArgs || {})),
          todoStates: new Map(Object.entries(entry.todoStates || {})),
          activePlan: entry.activePlan || null,
          continuationCooldownUntil: entry.continuationCooldownUntil || null,
          consecutiveContinuationFailures: entry.consecutiveContinuationFailures || 0,
          lastTodoSnapshot: entry.lastTodoSnapshot || "",
          momusIterations: entry.momusIterations || 0,
          composerMode: entry.composerMode || null,
          subagentOutcomes: Array.isArray(entry.subagentOutcomes) ? entry.subagentOutcomes : [],
          subagentFailureCounts:
            entry.subagentFailureCounts && typeof entry.subagentFailureCounts === "object"
              ? entry.subagentFailureCounts
              : {},
        })
      }
      return sessions
    } catch (err) {
      console.error("[oh-my-cursor] Failed to load persisted state:", err instanceof Error ? err.message : String(err))
      return null
    }
  }

  private writeToDisk(sessions: Map<string, SessionState>): void {
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      const serialized = Array.from(sessions.values()).map((session) => ({
        ...session,
        readPaths: Array.from(session.readPaths),
        injectedPaths: Array.from(session.injectedPaths),
        pendingWriteArgs: Object.fromEntries(session.pendingWriteArgs),
        todoStates: Object.fromEntries(session.todoStates),
      }))

      const tmpPath = this.filePath + ".tmp"
      writeFileSync(tmpPath, JSON.stringify(serialized, null, 2), "utf-8")
      renameSync(tmpPath, this.filePath)
    } catch (err) {
      console.error("[oh-my-cursor] Failed to persist state:", err instanceof Error ? err.message : String(err))
      try { unlinkSync(this.filePath + ".tmp") } catch { /* cleanup best-effort */ }
    }
  }
}
