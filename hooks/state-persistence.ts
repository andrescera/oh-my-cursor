import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { ConversationState } from "./types"
import { ConversationStateSchema } from "./schemas/conversation"

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

  save(conversations: Map<string, ConversationState>): void {
    if (this.debounceTimer) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.writeToDisk(conversations)
    }, this.debounceMs)
  }

  forceFlush(conversations: Map<string, ConversationState>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.writeToDisk(conversations)
  }

  load(maxAgeMs = 4 * 60 * 60 * 1000): Map<string, ConversationState> | null {
    try {
      if (!existsSync(this.filePath)) return null
      const text = readFileSync(this.filePath, "utf-8")
      if (!text.trim()) return null

      const data = JSON.parse(text)
      if (!Array.isArray(data)) return null

      const now = Date.now()
      const conversations = new Map<string, ConversationState>()
      for (const entry of data) {
        const backwardCompatDefaults = {
          abortDetectedAt: null,
          delegateRetryState: {},
          toolCallCountAtLastStop: 0,
          consecutiveZeroDeltas: 0,
          shellFailureCounts: 0,
          fileEditCounts: {},
          mcpCallCounts: {},
          responseCount: 0,
          estimatedTokens: 0,
          tokenWarningEmitted: false,
          wisdomLearnings: [],
          createdViaFallback: false,
        }
        const result = ConversationStateSchema.safeParse({ ...backwardCompatDefaults, ...entry })
        if (result.success) {
          const validated = result.data
          const ageMs = now - new Date(validated.startedAt).getTime()
          if (ageMs > maxAgeMs) {
            console.warn(`[oh-my-cursor] Skipping stale conversation ${validated.id} (age: ${Math.round(ageMs / 60000)}min, max: ${Math.round(maxAgeMs / 60000)}min)`)
            continue
          }
          conversations.set(validated.id, {
            ...validated,
            readPaths: new Set(validated.readPaths),
            injectedPaths: new Set(validated.injectedPaths),
            pendingWriteArgs: new Map(Object.entries(validated.pendingWriteArgs)),
            todoStates: new Map(Object.entries(validated.todoStates)),
          })
        } else {
          console.warn(
            "[oh-my-cursor] Skipping invalid persisted conversation entry:",
            entry.id || "unknown",
            result.error.issues.map((i) => i.message).join(", "),
          )
        }
      }
      return conversations
    } catch (err) {
      console.error("[oh-my-cursor] Failed to load persisted state:", err instanceof Error ? err.message : String(err))
      return null
    }
  }

  private writeToDisk(conversations: Map<string, ConversationState>): void {
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

      const serialized = Array.from(conversations.values()).map((conversation) => ({
        ...conversation,
        readPaths: Array.from(conversation.readPaths),
        injectedPaths: Array.from(conversation.injectedPaths),
        pendingWriteArgs: Object.fromEntries(conversation.pendingWriteArgs),
        todoStates: Object.fromEntries(conversation.todoStates),
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
