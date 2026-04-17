import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync, writeFileSync } from "node:fs"
import type { ConversationState } from "./types"
import { ConversationStateSchema } from "./schemas/conversation"

const DEFAULT_DIR = "/tmp/oh-my-cursor-state"
const LEGACY_FILE = "/tmp/oh-my-cursor-state.json"
const DEFAULT_DEBOUNCE_MS = 5000

export type ConversationMetadata = {
  id: string
  startedAt: string
  composerMode: string | null
  toolCallCount: number
  errorCount: number
  stoppedAt: string | null
}

export class StatePersistence {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly dirPath: string
  private readonly debounceMs: number
  private dirty: Set<string> = new Set()

  constructor(dirPath = DEFAULT_DIR, debounceMs = DEFAULT_DEBOUNCE_MS) {
    this.dirPath = dirPath
    this.debounceMs = debounceMs
    if (!existsSync(this.dirPath)) {
      mkdirSync(this.dirPath, { recursive: true })
    }
    if (existsSync(LEGACY_FILE)) {
      try { unlinkSync(LEGACY_FILE) } catch { /* best-effort */ }
    }
  }

  markDirty(convId: string): void {
    this.dirty.add(convId)
  }

  save(conversations: Map<string, ConversationState>): Promise<void> {
    if (this.debounceTimer) return Promise.resolve()
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null
      await this.writeDirty(conversations)
    }, this.debounceMs)
    return Promise.resolve()
  }

  forceFlush(conversations: Map<string, ConversationState>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    if (!existsSync(this.dirPath)) {
      mkdirSync(this.dirPath, { recursive: true })
    }
    for (const convId of this.dirty) {
      const conv = conversations.get(convId)
      if (!conv) continue
      const filePath = `${this.dirPath}/${convId}.json`
      try {
        writeFileSync(filePath, JSON.stringify(this.serializeConversation(conv)), "utf-8")
      } catch (err) {
        console.error(`[oh-my-cursor] Failed to flush conversation ${convId}:`, err instanceof Error ? err.message : String(err))
      }
    }
    this.dirty.clear()
    this.writeIndexSync(conversations)
  }

  loadOne(convId: string): ConversationState | null {
    const filePath = `${this.dirPath}/${convId}.json`
    try {
      if (!existsSync(filePath)) return null
      const text = readFileSync(filePath, "utf-8")
      if (!text.trim()) return null
      const data = JSON.parse(text)
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
      const result = ConversationStateSchema.safeParse({ ...backwardCompatDefaults, ...data })
      if (!result.success) {
        console.warn(
          "[oh-my-cursor] Skipping invalid persisted conversation entry:",
          convId,
          result.error.issues.map((i) => i.message).join(", "),
        )
        return null
      }
      const validated = result.data
      return {
        ...validated,
        readPaths: new Set(validated.readPaths),
        injectedPaths: new Set(validated.injectedPaths),
        pendingWriteArgs: new Map(Object.entries(validated.pendingWriteArgs)),
        todoStates: new Map(Object.entries(validated.todoStates)),
        ralphState: validated.ralphState
          ? {
              ...validated.ralphState,
              lastProcessedIndex: validated.ralphState.lastProcessedIndex ?? 0,
            }
          : null,
      }
    } catch (err) {
      console.error(`[oh-my-cursor] Failed to load conversation ${convId}:`, err instanceof Error ? err.message : String(err))
      return null
    }
  }

  loadIndex(): Map<string, ConversationMetadata> {
    const indexPath = `${this.dirPath}/index.json`
    try {
      if (!existsSync(indexPath)) return new Map()
      const text = readFileSync(indexPath, "utf-8")
      if (!text.trim()) return new Map()
      const data = JSON.parse(text)
      if (!Array.isArray(data)) return new Map()
      const index = new Map<string, ConversationMetadata>()
      for (const entry of data) {
        if (entry && typeof entry.id === "string") {
          index.set(entry.id, entry as ConversationMetadata)
        }
      }
      return index
    } catch (err) {
      console.error("[oh-my-cursor] Failed to load index:", err instanceof Error ? err.message : String(err))
      return new Map()
    }
  }

  removeConversation(convId: string): void {
    const filePath = `${this.dirPath}/${convId}.json`
    try {
      if (existsSync(filePath)) unlinkSync(filePath)
    } catch (err) {
      console.error(`[oh-my-cursor] Failed to remove conversation ${convId}:`, err instanceof Error ? err.message : String(err))
    }
    this.dirty.delete(convId)
    const index = this.loadIndex()
    index.delete(convId)
    this.writeIndexFromMap(index)
  }

  pruneStale(maxAgeMs: number): string[] {
    const pruned: string[] = []
    try {
      if (!existsSync(this.dirPath)) return pruned
      const files = readdirSync(this.dirPath)
      const now = Date.now()
      for (const file of files) {
        if (!file.endsWith(".json") || file === "index.json") continue
        const convId = file.slice(0, -5)
        const filePath = `${this.dirPath}/${file}`
        try {
          const text = readFileSync(filePath, "utf-8")
          const data = JSON.parse(text)
          if (data && typeof data.startedAt === "string") {
            const ageMs = now - new Date(data.startedAt).getTime()
            if (ageMs > maxAgeMs) {
              unlinkSync(filePath)
              this.dirty.delete(convId)
              pruned.push(convId)
            }
          }
        } catch { /* skip unreadable files */ }
      }
    } catch (err) {
      console.error("[oh-my-cursor] Failed to prune stale conversations:", err instanceof Error ? err.message : String(err))
    }
    if (pruned.length > 0) {
      const index = this.loadIndex()
      for (const convId of pruned) index.delete(convId)
      this.writeIndexFromMap(index)
    }
    return pruned
  }

  private async writeDirty(conversations: Map<string, ConversationState>): Promise<void> {
    if (!existsSync(this.dirPath)) {
      mkdirSync(this.dirPath, { recursive: true })
    }
    const dirtyIds = Array.from(this.dirty)
    this.dirty.clear()
    const writes: Promise<void>[] = []
    for (const convId of dirtyIds) {
      const conv = conversations.get(convId)
      if (!conv) continue
      const filePath = `${this.dirPath}/${convId}.json`
      writes.push(
        Bun.write(filePath, JSON.stringify(this.serializeConversation(conv)))
          .then(() => {})
          .catch((err) => {
            console.error(`[oh-my-cursor] Failed to write conversation ${convId}:`, err instanceof Error ? err.message : String(err))
          }),
      )
    }
    await Promise.all(writes)
    await this.writeIndexAsync(conversations)
  }

  private serializeConversation(conv: ConversationState) {
    return {
      ...conv,
      readPaths: Array.from(conv.readPaths),
      injectedPaths: Array.from(conv.injectedPaths),
      pendingWriteArgs: Object.fromEntries(conv.pendingWriteArgs),
      todoStates: Object.fromEntries(conv.todoStates),
    }
  }

  private buildMetadata(conv: ConversationState): ConversationMetadata {
    return {
      id: conv.id,
      startedAt: conv.startedAt,
      composerMode: conv.composerMode,
      toolCallCount: conv.toolCallCount,
      errorCount: conv.errorCount,
      stoppedAt: conv.stoppedAt,
    }
  }

  private async writeIndexAsync(conversations: Map<string, ConversationState>): Promise<void> {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(conversations.values()).map((conv) => this.buildMetadata(conv))
    try {
      await Bun.write(indexPath, JSON.stringify(metadata))
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }

  private writeIndexSync(conversations: Map<string, ConversationState>): void {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(conversations.values()).map((conv) => this.buildMetadata(conv))
    try {
      writeFileSync(indexPath, JSON.stringify(metadata), "utf-8")
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }

  private writeIndexFromMap(index: Map<string, ConversationMetadata>): void {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(index.values())
    try {
      writeFileSync(indexPath, JSON.stringify(metadata), "utf-8")
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }
}
