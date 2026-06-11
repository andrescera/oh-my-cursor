import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import type { ConversationState } from "./types"
import { partitionState, mergeFromDurable } from "./state-partition"
import { PersistedRecordSchema } from "./schemas/conversation"
import { writeFileAtomic, writeFileAtomicAsync } from "./lib/atomic-file"

const DEFAULT_DIR = "/tmp/oh-my-cursor-state"
const LEGACY_FILE = "/tmp/oh-my-cursor-state.json"
const DEFAULT_DEBOUNCE_MS = 5000

export type ConversationMetadata = {
  id: string
  startedAt: string
  composerMode: string | null
  displayTitle: string | null
  toolCallCount: number
  errorCount: number
  stoppedAt: string | null
}

export class StatePersistence {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly dirPath: string
  private readonly debounceMs: number
  private dirty: Set<string> = new Set()
  private projectRoot = ""
  private daemonBootId = ""

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

  // Stamps written into every persisted record so a daemon serving multiple
  // Cursor windows / projects refuses to rehydrate state from another project.
  setIdentity(projectRoot: string, daemonBootId: string): void {
    this.projectRoot = projectRoot
    this.daemonBootId = daemonBootId
  }

  markDirty(convId: string): void {
    this.dirty.add(convId)
  }

  // Project-scoped state filename: state for the same conv_id under a different
  // projectRoot lands in a distinct file, so a daemon serving multiple Cursor
  // projects cannot clobber another project's persisted state.
  private stateFileName(convId: string): string {
    const prefix = createHash("sha256").update(this.projectRoot).digest("hex").slice(0, 8)
    return `${prefix}-${convId}.json`
  }

  private statePath(convId: string): string {
    return `${this.dirPath}/${this.stateFileName(convId)}`
  }

  // Pre-project-scoping filename (`${convId}.json`). Read-only legacy fallback
  // used by the migration grace path in loadOne / cleanup in removeConversation.
  private legacyStatePath(convId: string): string {
    return `${this.dirPath}/${convId}.json`
  }

  save(conversations: Map<string, ConversationState>): Promise<void> {
    if (this.debounceTimer) return Promise.resolve()
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.writeDirty(conversations).catch((err) => {
        console.error("[state-persistence] scheduled flush error", err)
      })
    }, this.debounceMs)
    return Promise.resolve()
  }

  // Synchronous: steady-state and crash callers keep a void API and state lands
  // before the next statement / process.exit() rather than in a later microtask.
  forceFlush(conversations: Map<string, ConversationState>): void {
    this.clearDebounce()
    this.flushDirtySync(conversations)
  }

  // Awaitable shutdown flush: resolves only once every write has landed.
  async forceFlushAll(conversations: Map<string, ConversationState>): Promise<void> {
    this.clearDebounce()
    await this.flushDirtyAsync(conversations)
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  // Loads a persisted conversation. Returns null when the file is missing,
  // corrupt, pre-upgrade (schemaVersion < 2), or its projectRoot stamp does
  // not match `expectedProjectRoot` (when provided).
  // Pre-upgrade files are deleted from disk on detection (warn-once).
  // daemonBootId mismatch is allowed when projectRoot matches (legitimate
  // cold restart) — ephemeral fields are always reset to defaults regardless.
  // When `expectedProjectRoot` is omitted, project verification is skipped
  // (used by tests and tooling that operate outside a hook context).
  loadOne(convId: string, expectedProjectRoot?: string): ConversationState | null {
    const primaryPath = this.statePath(convId)
    const legacyPath = this.legacyStatePath(convId)
    let filePath: string
    let isLegacy = false
    if (existsSync(primaryPath)) {
      filePath = primaryPath
    } else if (existsSync(legacyPath)) {
      filePath = legacyPath
      isLegacy = true
    } else {
      return null
    }
    try {
      const text = readFileSync(filePath, "utf-8")
      if (!text.trim()) return null
      const data = JSON.parse(text) as Record<string, unknown>

      if (data && typeof data === "object" && data.schemaVersion !== 2) {
        console.warn(
          `[oh-my-cursor] Dropping pre-upgrade persisted state (schemaVersion=${String(data.schemaVersion)}) for ${convId}`,
        )
        try { unlinkSync(filePath) } catch { /* best-effort */ }
        return null
      }

      const result = PersistedRecordSchema.safeParse(data)
      if (!result.success) {
        console.warn(
          "[oh-my-cursor] Skipping invalid persisted conversation entry:",
          convId,
          result.error.issues.map((i) => i.message).join(", "),
        )
        return null
      }

      const record = result.data

      if (typeof expectedProjectRoot === "string" && expectedProjectRoot !== "" &&
          record.projectRoot !== "" && record.projectRoot !== expectedProjectRoot) {
        console.warn(
          `[oh-my-cursor] Refusing to rehydrate ${convId}: projectRoot mismatch (persisted=${record.projectRoot}, expected=${expectedProjectRoot})`,
        )
        return null
      }

      if (this.daemonBootId !== "" && record.daemonBootId !== "" && record.daemonBootId !== this.daemonBootId) {
        console.log(`[oh-my-cursor] Cold-restart rehydrate for ${convId} (boot ${record.daemonBootId} -> ${this.daemonBootId}); ephemeral fields reset`)
      }

      const { schemaVersion: _v, projectRoot: _p, daemonBootId: _b, ...durableSerialized } = record
      const merged = mergeFromDurable({
        ...durableSerialized,
        readPaths: new Set(durableSerialized.readPaths),
        injectedPaths: new Set(durableSerialized.injectedPaths),
        pendingWriteArgs: new Map(Object.entries(durableSerialized.pendingWriteArgs)),
        todoStates: new Map(Object.entries(durableSerialized.todoStates)),
      })

      if (isLegacy) this.migrateLegacyFile(convId, legacyPath, primaryPath, merged)
      return merged
    } catch (err) {
      console.error(`[oh-my-cursor] Failed to load conversation ${convId}:`, err instanceof Error ? err.message : String(err))
      return null
    }
  }

  // Crash-safe ordering: unlink legacy strictly after the scoped write succeeds.
  private migrateLegacyFile(
    convId: string,
    legacyPath: string,
    primaryPath: string,
    merged: ConversationState,
  ): void {
    try {
      writeFileAtomic(primaryPath, JSON.stringify(this.serializeConversation(merged)))
      try { unlinkSync(legacyPath) } catch { /* best-effort */ }
    } catch (err) {
      console.error("[state-persistence] legacy migration failed for", convId, err)
    }
    this.markDirty(convId)
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
    for (const filePath of [this.statePath(convId), this.legacyStatePath(convId)]) {
      try {
        if (existsSync(filePath)) unlinkSync(filePath)
      } catch (err) {
        console.error(`[oh-my-cursor] Failed to remove conversation ${convId}:`, err instanceof Error ? err.message : String(err))
      }
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
        const filePath = `${this.dirPath}/${file}`
        try {
          const text = readFileSync(filePath, "utf-8")
          const data = JSON.parse(text)
          if (data && typeof data.startedAt === "string") {
            const ageMs = now - new Date(data.startedAt).getTime()
            if (ageMs > maxAgeMs) {
              const convId = typeof data.id === "string" ? data.id : file.slice(0, -5)
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
    await this.flushDirtyAsync(conversations)
  }

  // Swap the dirty set for a fresh one before any await, so markDirty() calls
  // arriving during the async write land in the next batch instead of being
  // dropped. Failed writes are re-queued for the next flush.
  private async flushDirtyAsync(conversations: Map<string, ConversationState>): Promise<void> {
    const toFlush = this.dirty
    this.dirty = new Set()
    const writes: Promise<void>[] = []
    for (const convId of toFlush) {
      const conv = conversations.get(convId)
      if (!conv) continue
      const filePath = this.statePath(convId)
      const payload = JSON.stringify(this.serializeConversation(conv))
      writes.push(
        writeFileAtomicAsync(filePath, payload).catch((err) => {
          console.error("[state-persistence] flush error for", convId, err)
          this.dirty.add(convId)
        }),
      )
    }
    await Promise.all(writes)
    await this.writeIndexAsync(conversations)
  }

  private flushDirtySync(conversations: Map<string, ConversationState>): void {
    const toFlush = this.dirty
    this.dirty = new Set()
    for (const convId of toFlush) {
      const conv = conversations.get(convId)
      if (!conv) continue
      const filePath = this.statePath(convId)
      try {
        writeFileAtomic(filePath, JSON.stringify(this.serializeConversation(conv)))
      } catch (err) {
        console.error("[state-persistence] flush error for", convId, err)
        this.dirty.add(convId)
      }
    }
    this.writeIndexSync(conversations)
  }

  private serializeConversation(conv: ConversationState) {
    const { durable } = partitionState(conv)
    return {
      schemaVersion: 2 as const,
      projectRoot: this.projectRoot,
      daemonBootId: this.daemonBootId,
      ...durable,
      readPaths: Array.from(durable.readPaths),
      injectedPaths: Array.from(durable.injectedPaths),
      pendingWriteArgs: Object.fromEntries(durable.pendingWriteArgs),
      todoStates: Object.fromEntries(durable.todoStates),
    }
  }

  private buildMetadata(conv: ConversationState): ConversationMetadata {
    return {
      id: conv.id,
      startedAt: conv.startedAt,
      composerMode: conv.composerMode,
      displayTitle: conv.displayTitle,
      toolCallCount: conv.toolCallCount,
      errorCount: conv.errorCount,
      stoppedAt: conv.stoppedAt,
    }
  }

  private async writeIndexAsync(conversations: Map<string, ConversationState>): Promise<void> {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(conversations.values()).map((conv) => this.buildMetadata(conv))
    try {
      await writeFileAtomicAsync(indexPath, JSON.stringify(metadata))
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }

  private writeIndexSync(conversations: Map<string, ConversationState>): void {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(conversations.values()).map((conv) => this.buildMetadata(conv))
    try {
      writeFileAtomic(indexPath, JSON.stringify(metadata))
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }

  private writeIndexFromMap(index: Map<string, ConversationMetadata>): void {
    const indexPath = `${this.dirPath}/index.json`
    const metadata = Array.from(index.values())
    try {
      writeFileAtomic(indexPath, JSON.stringify(metadata))
    } catch (err) {
      console.error("[oh-my-cursor] Failed to write index:", err instanceof Error ? err.message : String(err))
    }
  }
}
