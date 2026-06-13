import { resolve } from "node:path"
import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { resolveConversationId } from "../shared"
import { loadConfig } from "../config"

// tool-pair-validator — enforces the read-before-edit invariant ("Never edit
// files without reading first", AGENTS.md). It tracks, per conversation, the
// set of file paths the agent has demonstrably seen this conversation (via a
// Read or Write completion) and denies an Edit/MultiEdit to any path not in
// that set.
//
// State: one bounded LRU read-set per `conversation_id`, held in a module-level
// Map (NEVER global/shared across conversations). The LRU is capped at
// TOOL_PAIR_READ_SET_CAP paths; the oldest entry is evicted when the cap is
// exceeded. Re-reading a path bumps its recency.
//
// Channel: `permission: "deny"` + `user_message` is the PRIMARY block channel
// (Task 2 verdict: `preToolUse.permission:"deny"` TAKES-EFFECT at 3.7.x). A
// CRITICAL advisory is also registered via contextCollector as the fallback
// channel (delivered through the Task preToolUse piggyback composer if the deny
// is ever softened).
//
// SKIPPED / EXEMPT RULES (do NOT flag — see docs/cursor/19-known-sharp-edges.md
// "Hook Tool Coverage"):
//   - `Write`: a full-content / new-file tool. New-file creation is legitimate
//     and the daemon's existing read-before-write advisory (tool-guard) already
//     covers the existing-file blind-overwrite case. Denying Write here would
//     also break the established daemon contract (integration.test.ts asserts
//     Write to unread paths is allowed). A successful Write instead ESTABLISHES
//     awareness (it is tracked as a "read").
//   - `StrReplace` / `str_replace`: does NOT fire `postToolUse` (sharp-edges),
//     so its own reads can't be tracked symmetrically, and it inherently
//     carries `old_string` (proof of awareness). Exempt from deny.
//   - `EditNotebook`, `TodoWrite`, `SwitchMode`, `CreatePlan`, `Glob`,
//     `AskQuestion`, `GenerateImage`, `Task`: unreliable or absent hook
//     coverage (TodoWrite/SwitchMode fire NEITHER pre nor post). Not edit-pair
//     candidates; never flagged.

export const TOOL_PAIR_READ_SET_CAP = 500

// Tools whose successful completion proves the agent has seen a file's contents.
// `Read` and `Write` both fire `postToolUse` reliably (sharp-edges: 4,565 Read /
// 834 Write events in the production corpus).
const READ_TRACK_TOOLS = new Set(["Read", "read", "Write", "write"])

// Edit-family tools subject to the read-before-edit deny. Deliberately EXCLUDES
// Write/StrReplace/EditNotebook (see exempt-rules note above).
const EDIT_VALIDATE_TOOLS = new Set(["Edit", "edit", "MultiEdit", "multi_edit", "multiedit"])

// Per-conversation read-sets. JS `Set` preserves insertion order, which we use
// as the LRU ordering: the first key is the least-recently-used.
const readSets = new Map<string, Set<string>>()

function normalizePath(filePath: string): string {
  try {
    return resolve(filePath)
  } catch {
    return filePath
  }
}

function recordRead(conversationId: string, filePath: string): void {
  let set = readSets.get(conversationId)
  if (!set) {
    set = new Set<string>()
    readSets.set(conversationId, set)
  }
  // Bump recency: delete-then-add moves an existing path to the most-recent end.
  if (set.has(filePath)) set.delete(filePath)
  set.add(filePath)
  // Evict oldest entries until within the cap.
  while (set.size > TOOL_PAIR_READ_SET_CAP) {
    const oldest = set.values().next().value
    if (oldest === undefined) break
    set.delete(oldest)
  }
}

function hasSeen(conversationId: string, filePath: string): boolean {
  const set = readSets.get(conversationId)
  return set ? set.has(filePath) : false
}

// Test-isolation hook: clears every per-conversation read-set.
export function resetToolPairState(): void {
  readSets.clear()
}

interface ToolPairValidatorDeps {
  isEnabled?: () => boolean
}

function isDisabledViaEnv(): boolean {
  return (process.env.OH_MY_CURSOR_DISABLED_HOOKS || "")
    .split(",")
    .map((s) => s.trim())
    .includes("tool-pair-validator")
}

export function createToolPairValidatorHandler(
  _conversations: Map<string, ConversationState>,
  deps?: ToolPairValidatorDeps,
): Partial<HandlerMap> {
  function isEnabled(): boolean {
    if (isDisabledViaEnv()) return false
    if (deps?.isEnabled) return deps.isEnabled()
    return loadConfig().handlers.tool_pair_validator.enabled
  }

  return {
    // Read tracking: record the path for any Read/Write completion.
    "/postToolUse": (input) => {
      if (!isEnabled()) return {}
      const toolName = (input.tool_name as string) || ""
      if (!READ_TRACK_TOOLS.has(toolName)) return {}
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const filePath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!filePath) return {}
      recordRead(resolveConversationId(input), normalizePath(filePath))
      return {}
    },

    // Edit validation: deny an Edit/MultiEdit to a file not seen this conversation.
    "/preToolUse": (input) => {
      if (!isEnabled()) return {}
      const toolName = (input.tool_name as string) || ""
      if (!EDIT_VALIDATE_TOOLS.has(toolName)) return {}
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const filePath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!filePath) return {}

      const convId = resolveConversationId(input)
      const normalized = normalizePath(filePath)

      if (hasSeen(convId, normalized)) {
        // Allowed: refresh recency so an actively-edited file is not evicted.
        recordRead(convId, normalized)
        return {}
      }

      const userMessage =
        `[tool-pair-validator] Refusing ${toolName} to "${normalized}" — this file was not read in this conversation. ` +
        `Read the file first to honor the read-before-edit invariant (AGENTS.md: "Never edit files without reading first").`

      // Fallback channel: CRITICAL advisory via the context collector.
      contextCollector.register(convId, {
        id: `tool-pair-violation:${normalized}`,
        source: "tool-pair-validator",
        content: userMessage,
        priority: "critical",
      })

      // Primary channel: permission deny (TAKES-EFFECT at 3.7.x per Task 2).
      return {
        permission: "deny",
        userMessage,
        agentMessage: userMessage,
        additional_context: userMessage,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: userMessage,
        },
      }
    },
  }
}
