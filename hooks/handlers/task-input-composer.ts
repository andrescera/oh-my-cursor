/**
 * Central `updated_input` composer for preToolUse(Task).
 *
 * This module is the ONLY producer of `updated_input` for Task-family
 * preToolUse events. Business mutations (model routing — Task 8; prompt
 * piggyback — Task 9) register as providers here; the composer applies them
 * in priority order onto a defensive ECHO-ALL copy of the original tool_input.
 *
 * ECHO-ALL strategy (Task 1 verdict, `.omo/evidence/task-1-merge-semantics.log`):
 * the composed `updated_input` ALWAYS spreads the full original `tool_input`
 * first, so it is correct under BOTH merge and replace semantics — a partial
 * mutation can never drop `subagent_type`/`prompt` and break subagent launch.
 *
 * Pass-through contract: if zero providers actually mutate, `compose` returns
 * `null` and the daemon emits NO `updated_input` key at all.
 */

import { mergeUpdatedInputs } from "../lib/merge-updated-inputs"

export type TaskInput = Record<string, unknown>

/** A partial overlay to merge onto the echo-all draft, or `null`/`{}` for no-op. */
export type MutationResult = Partial<TaskInput> | null

export type TaskMutationProvider = {
  /** Stable identity. Re-registering the same id replaces the prior provider. */
  id: string
  /**
   * Application order. Providers run in ASCENDING priority order, so a
   * higher-priority provider's keys overwrite a lower-priority provider's keys
   * on a conflict (it is applied last). Ties break deterministically by `id`.
   */
  priority: number
  /**
   * Compute a partial overlay for this conversation. Receives the ORIGINAL
   * (unmutated) tool_input for inspection. Returning `null` or `{}` is a no-op.
   * Must be synchronous (50ms hot-path budget) and must not mutate `toolInput`.
   */
  mutate: (conversationId: string, toolInput: TaskInput) => MutationResult
}

export type ComposerLogger = (message: string, meta?: Record<string, unknown>) => void

type TaskInputComposerOptions = {
  logError?: ComposerLogger
}

const TASK_TOOL_NAMES = new Set(["Task", "task", "Agent", "agent"])

/** True when `toolName` is in the Task tool family (Task|task|Agent|agent). */
export function isTaskToolName(toolName: unknown): boolean {
  return typeof toolName === "string" && TASK_TOOL_NAMES.has(toolName)
}

/** True when a handler result is a permission/deny short-circuit. */
export function isDenyResult(result: Record<string, unknown> | null | undefined): boolean {
  if (!result) return false
  return result.permission === "deny" || result.decision === "deny"
}

function isNonEmptyOverlay(result: MutationResult): result is Partial<TaskInput> {
  return (
    result !== null &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    Object.keys(result).length > 0
  )
}

export class TaskInputComposer {
  private providers: Map<string, TaskMutationProvider> = new Map()
  private logError: ComposerLogger

  constructor(options?: TaskInputComposerOptions) {
    this.logError =
      options?.logError ??
      ((message, meta) => {
        console.error(`[oh-my-cursor][task-input-composer] ${message}`, meta ?? "")
      })
  }

  /** Register (or replace, by id) a mutation provider. */
  register(provider: TaskMutationProvider): void {
    this.providers.set(provider.id, provider)
  }

  /** Remove a provider by id. */
  unregister(id: string): void {
    this.providers.delete(id)
  }

  /** Drop all registered providers (test isolation / teardown). */
  reset(): void {
    this.providers.clear()
  }

  /** Number of registered providers. */
  size(): number {
    return this.providers.size
  }

  /**
   * Compose the `updated_input` for a Task preToolUse call.
   *
   * Builds a defensive ECHO-ALL draft (full original tool_input spread first),
   * then applies each provider's overlay in ascending priority order. Throwing
   * providers are skipped and logged; the rest still apply.
   *
   * @returns the full echo-all object when at least one provider mutated, or
   *          `null` when nothing mutated (pass-through — emit no updated_input).
   */
  compose(conversationId: string, toolInput: TaskInput): TaskInput | null {
    // Defensive copy: full original first (echo-all, replace-safe).
    const draft: TaskInput = { ...(toolInput ?? {}) }
    let mutated = false

    for (const provider of this.orderedProviders()) {
      let result: MutationResult
      try {
        result = provider.mutate(conversationId, toolInput)
      } catch (err) {
        this.logError(
          `provider "${provider.id}" threw and was skipped: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { providerId: provider.id, conversationId },
        )
        continue
      }
      if (isNonEmptyOverlay(result)) {
        Object.assign(draft, result)
        mutated = true
      }
    }

    return mutated ? draft : null
  }

  private orderedProviders(): TaskMutationProvider[] {
    return [...this.providers.values()].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.id.localeCompare(b.id)
    })
  }
}

/** Shared singleton — the daemon's canonical composer for Task preToolUse. */
export const taskInputComposer = new TaskInputComposer()

/**
 * Daemon `/preToolUse` route helper. Composes `updated_input` for Task-family
 * calls ONLY, and ONLY when the handler did not short-circuit with a deny.
 * Returns the handler result untouched (no `updated_input` key) for non-Task
 * tools, non-preToolUse paths, denied calls, or zero-mutation pass-through.
 *
 * Pure synchronous in-memory work — safe inside the 50ms hot-path budget.
 */
export function composeTaskUpdatedInput(
  path: string,
  parsed: Record<string, unknown>,
  handlerResult: Record<string, unknown>,
  composer: TaskInputComposer = taskInputComposer,
): Record<string, unknown> {
  if (path !== "/preToolUse") return handlerResult
  if (!isTaskToolName(parsed.tool_name)) return handlerResult
  // Permission/deny short-circuits run BEFORE composition: a denied call gets
  // no updated_input.
  if (isDenyResult(handlerResult)) return handlerResult

  const toolInput = (parsed.tool_input as TaskInput) || {}
  const conversationId =
    (parsed.conversation_id as string) || (parsed.session_id as string) || ""

  const updated = composer.compose(conversationId, toolInput)
  if (!updated) return handlerResult

  // Return a NEW object so the handler's returned result is never mutated.
  return { ...handlerResult, updated_input: updated }
}

export { mergeUpdatedInputs }
