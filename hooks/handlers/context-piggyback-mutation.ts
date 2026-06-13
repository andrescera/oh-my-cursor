import { contextCollector, type ContextCollector } from "../context-collector"
import { loadConfig } from "../config"
import {
  taskInputComposer,
  type TaskInput,
  type TaskMutationProvider,
  type MutationResult,
} from "./task-input-composer"

/**
 * Empirically observed maximum prompt length that survives
 * `preToolUse(Task).updated_input.prompt` at Cursor 3.7.x.
 *
 * Source: `.omo/evidence/task-1-size-limit.log` + runbook §B (B3). The 3.5.38
 * corpus observed `subagentStart.task` lengths up to 15,308 chars flowing
 * through this field intact, so 15,308 is the conservative confirmed bound.
 * The effective piggyback budget is clamped to 80% of it (see
 * `effectivePiggybackBudget`) so a delivery never approaches the ceiling.
 */
export const PROBED_PROMPT_SIZE_BOUND = 15308

const PROBED_SAFETY_FACTOR = 0.8

export const CONTEXT_OPEN_TAG = "<omc:context>\n"
export const CONTEXT_CLOSE_TAG = "\n</omc:context>\n\n"

export const CONTEXT_PIGGYBACK_PROVIDER_ID = "context-piggyback"
const CONTEXT_PIGGYBACK_PROVIDER_PRIORITY = 50

type PiggybackCollector = Pick<ContextCollector, "consumeUpTo">

type ContextPiggybackProviderDeps = {
  collector?: PiggybackCollector
  getMaxPiggybackChars?: () => number
}

export function effectivePiggybackBudget(maxPiggybackChars: number): number {
  const probedCeiling = Math.floor(PROBED_PROMPT_SIZE_BOUND * PROBED_SAFETY_FACTOR)
  return Math.min(maxPiggybackChars, probedCeiling)
}

export function createContextPiggybackProvider(
  deps: ContextPiggybackProviderDeps = {},
): TaskMutationProvider {
  const collector = deps.collector ?? contextCollector
  const getMaxPiggybackChars =
    deps.getMaxPiggybackChars ?? (() => loadConfig().max_piggyback_chars)

  return {
    id: CONTEXT_PIGGYBACK_PROVIDER_ID,
    priority: CONTEXT_PIGGYBACK_PROVIDER_PRIORITY,
    mutate(conversationId: string, toolInput: TaskInput): MutationResult {
      if (!conversationId) return null

      const budget = effectivePiggybackBudget(getMaxPiggybackChars())
      if (budget <= 0) return null

      const selected = collector.consumeUpTo(conversationId, budget)
      if (!selected.hasContent || selected.merged.length === 0) return null

      const originalPrompt =
        typeof toolInput.prompt === "string" ? toolInput.prompt : ""
      const prompt =
        CONTEXT_OPEN_TAG + selected.merged + CONTEXT_CLOSE_TAG + originalPrompt
      return { prompt }
    },
  }
}

export const contextPiggybackProvider = createContextPiggybackProvider()

taskInputComposer.register(contextPiggybackProvider)
