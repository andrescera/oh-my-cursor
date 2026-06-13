import type { ConversationState, HandlerMap } from "../types"
import {
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
  derivedProjectRoot,
} from "../shared"
import { contextCollector } from "../context-collector"
import { loadConfig } from "../config"

/**
 * keyword-detector (Cursor-adapted port of the upstream `keyword-detector`).
 *
 * On `/beforeSubmitPrompt` it scans the prompt text for loop-arming keywords and
 * sets a PER-CONVERSATION mode flag. Enforcement is split, because
 * `beforeSubmitPrompt` output is NOT-SUPPORTED-BY-DESIGN for context injection
 * (only `permission` + `followup_message` are honored — staff thread 158883,
 * Task 3 verdict):
 *
 *   (a) Piggyback preamble: the matched mode's preamble is registered into the
 *       contextCollector at priority "high". The Task preToolUse piggyback
 *       composer (Task 9, `context-piggyback-mutation.ts`) is the SOLE live
 *       context channel and delivers it onto the NEXT Task call's prompt. We do
 *       NOT register a separate composer provider and we do NOT rewrite the
 *       prompt directly here.
 *   (b) Loop arming: the matched mode arms the EXISTING continuation state
 *       machine the same way `continuation-handlers.ts` does — `ralphState` for
 *       the ralph/ultrawork family (ULW rides the ralph machine, Task 18) and
 *       `boulderState` for boulder. No new loop mechanics are introduced.
 *
 * Conversation scoping (Task 26, `.omo/evidence/task-26-convid-verdict.txt`):
 *   `conversation_id` IS present in the common envelope (3.5.38-confirmed) and
 *   is already the canonical scope key on this route. We therefore take the
 *   "conversation_id IS present" branch and scope via `resolveConversationId`
 *   (conversation_id -> session_id -> fallback UUID), identical to
 *   continuation-handlers. The workspace_roots + most-recently-active + 60s
 *   heuristic branch was NOT needed. Because the flag map is strictly keyed by
 *   that id, a preamble armed for conversation A can never leak into
 *   conversation B (Metis EC5).
 */

/** Loop-arming keywords (ported from upstream, Cursor-adapted). */
export const KEYWORD_DETECTOR_KEYWORDS = [
  "ultrawork",
  "ulw",
  "ralph-loop",
  "ralph",
  "boulder",
] as const

export type KeywordDetectorKeyword = (typeof KEYWORD_DETECTOR_KEYWORDS)[number]

/** Time-to-live for an armed mode flag: 300s (5 minutes). */
export const KEYWORD_FLAG_TTL_MS = 300_000

export interface KeywordModeFlag {
  keyword: string
  armedAt: number
}

export interface KeywordDetectorDeps {
  /** Whether the handler is enabled (config gate). */
  isEnabled?: () => boolean
  /** Allowlist of keywords that are permitted to trigger. */
  getEnabledExpansions?: () => string[]
  /** Clock injection for deterministic TTL tests. */
  now?: () => number
}

type KeywordMode = "ultrawork" | "ralph" | "boulder"

const KEYWORD_MODE: Record<KeywordDetectorKeyword, KeywordMode> = {
  ultrawork: "ultrawork",
  ulw: "ultrawork",
  "ralph-loop": "ralph",
  ralph: "ralph",
  boulder: "boulder",
}

const MODE_PREAMBLE: Record<KeywordMode, string> = {
  ultrawork:
    "[mode:ultrawork] Deep sustained autonomous work mode active (keyword-detected). " +
    "Work relentlessly until the task is fully complete. Use parallel agents aggressively — " +
    "fire explore/librarian for context, delegate implementation via Task. Do not stop mid-task " +
    "and do not ask permission between steps. Self-verify with lints and tests. When fully done, " +
    "output <promise>DONE</promise>.",
  ralph:
    "[mode:ralph] Ralph loop active (keyword-detected). Work until the task is fully done, " +
    "auto-continuing between steps. When fully complete, output <promise>DONE</promise>.",
  boulder:
    "[mode:boulder] Boulder continuation active (keyword-detected). Keep pushing the plan forward " +
    "across steps with backoff; do not stop until all plan tasks are complete.",
}

// Per-conversation mode flags. Strictly keyed by conversation id so a flag for
// conversation A can never be read for conversation B (Metis EC5).
const modeFlags = new Map<string, KeywordModeFlag>()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function matchesWholeWord(message: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(message)
}

/** Remove every flag whose age exceeds the TTL. Exported for tests. */
export function purgeExpiredKeywordFlags(now: number): void {
  for (const [convId, flag] of modeFlags) {
    if (now - flag.armedAt > KEYWORD_FLAG_TTL_MS) {
      modeFlags.delete(convId)
    }
  }
}

/** Read the current (non-purging) mode flag for a conversation. */
export function getKeywordFlag(convId: string): KeywordModeFlag | undefined {
  return modeFlags.get(convId)
}

/** Drop all mode flags. Test isolation / teardown. */
export function resetKeywordDetectorState(): void {
  modeFlags.clear()
}

function armContinuationLoop(
  conversation: ConversationState,
  mode: KeywordMode,
  nowMs: number,
): void {
  // Reuse the EXACT shapes continuation-handlers.ts uses — no new mechanics.
  if (mode === "boulder") {
    conversation.boulderState = {
      active: true,
      failureCount: 0,
      lastContinuationAt: null,
      loopStartedAt: new Date(nowMs).toISOString(),
    }
    return
  }
  // ultrawork + ralph both ride the ralph state machine (ULW rides ralph, Task 18).
  conversation.ralphState = {
    active: true,
    iteration: 0,
    maxIterations: 0,
    startedAt: new Date(nowMs).toISOString(),
    lastProcessedIndex: 0,
  }
}

export function createKeywordDetectorHandler(
  _conversations: Map<string, ConversationState>,
  deps: KeywordDetectorDeps = {},
): Partial<HandlerMap> {
  const isEnabled = deps.isEnabled ?? (() => loadConfig().handlers.keyword_detector.enabled)
  const getEnabledExpansions =
    deps.getEnabledExpansions ?? (() => loadConfig().handlers.keyword_detector.enabled_expansions)
  const now = deps.now ?? (() => Date.now())

  return {
    "/beforeSubmitPrompt": (input) => {
      // Env kill-switch (checked before config, mirrors other handlers).
      const disabledHooks = (process.env.OH_MY_CURSOR_DISABLED_HOOKS || "")
        .split(",")
        .map((s) => s.trim())
      if (disabledHooks.includes("keyword-detector")) return {}

      if (!isEnabled()) return {}

      const nowMs = now()
      // TTL sweep on every invocation so stale flags never linger.
      purgeExpiredKeywordFlags(nowMs)

      const userMessage = (input.prompt as string) || (input.user_message as string) || ""
      if (!userMessage) return {}

      const allowlist = getEnabledExpansions()
      // Effective keyword set = canonical keywords ∩ allowlist. Sorted
      // longest-first so "ralph-loop" wins over "ralph" on "/ralph-loop".
      const active = (KEYWORD_DETECTOR_KEYWORDS as readonly string[])
        .filter((k) => allowlist.includes(k))
        .sort((a, b) => b.length - a.length)

      const matched = active.find((k) => matchesWholeWord(userMessage, k))
      if (!matched) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      modeFlags.set(convId, { keyword: matched, armedAt: nowMs })

      const mode = KEYWORD_MODE[matched as KeywordDetectorKeyword]

      // (a) Register the mode preamble for piggyback delivery on the next Task
      //     call. Stable id => overwrite each prompt, never accumulate.
      contextCollector.register(convId, {
        id: "mode-preamble",
        source: "keyword-detector",
        content: MODE_PREAMBLE[mode],
        priority: "high",
      })

      // (b) Arm the existing continuation loop for this conversation.
      armContinuationLoop(conversation, mode, nowMs)

      console.log(
        `[oh-my-cursor][keyword-detector] convId=${convId} | keyword=${matched} | mode=${mode} | armedAt=${nowMs}`,
      )

      // beforeSubmitPrompt honors only permission + followup_message; the flag +
      // piggyback do the real work, so the wire response is empty.
      return {}
    },

    "/sessionEnd": (input) => {
      const convId = (input.conversation_id as string) || (input.session_id as string) || ""
      if (convId) modeFlags.delete(convId)
      return {}
    },
  }
}
