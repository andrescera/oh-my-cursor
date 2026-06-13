/**
 * Fallback-model rotation for retryable Task dispatch failures.
 *
 * When `delegate-task-retry` classifies a dispatch failure as RETRYABLE for a
 * `(conversationId, agentType)` pair, `recordRetryableFailure` advances a
 * rotation index over that agent's configured `fallback_models`. The composer
 * provider exported here (priority 200) then injects `fallback_models[index]`
 * onto the NEXT Task preToolUse for the same pair — overriding the static
 * model-routing override (priority 100, Task 8).
 *
 * Semantics:
 *   - First retryable failure arms `fallback_models[0]`.
 *   - Each subsequent retryable failure records the failed fallback and advances
 *     to the next slot. The injected model persists for every dispatch of that
 *     pair until the next failure advances it or a success resets it (this is
 *     the "arm on failure" reading of the one-shot contract — robust under
 *     concurrent dispatches of the same agent).
 *   - A clean (non-error) postToolUse for the pair resets the index via
 *     `resetRotationOnSuccess`.
 *   - Once every fallback has failed (`index >= fallback_models.length`),
 *     rotation STOPS: the provider returns null so the static model-routing
 *     override (or the parent model) stands, and a single CRITICAL advisory is
 *     registered naming every tried fallback.
 *   - Empty `fallback_models` ⇒ no rotation at all (existing behavior intact).
 *
 * State lives in a module-level Map keyed by `${conversationId}:${agentType}`
 * (per-conversation isolation; no un-keyed global mutable). `resetRotationState`
 * clears it for test isolation.
 */

import {
  taskInputComposer,
  type MutationResult,
  type TaskInput,
  type TaskMutationProvider,
} from "./task-input-composer"
import { extractAgentTypeFromLogInputs } from "./extract-agent-fields"
import { loadConfig as defaultLoadConfig } from "../config"
import { contextCollector as defaultContextCollector } from "../context-collector"
import { isModelAllowedForAgent } from "../lib/agent-model-allowlist"
import {
  introspectionRuntime,
  type IntrospectionSnapshot,
} from "../lib/introspection-runtime"
import type { OhMyCursorConfig } from "../schemas/config"

export const MODEL_ROTATION_PROVIDER_ID = "model-rotation"

const MODEL_ROTATION_PRIORITY = 200

export interface AdvisoryCollector {
  register: (
    conversationId: string,
    options: {
      id: string
      source: string
      content: string
      priority?: "critical" | "high" | "normal" | "low"
      metadata?: Record<string, unknown>
    },
  ) => void
}

export interface RotationDeps {
  loadConfig?: (projectDir?: string) => OhMyCursorConfig
  getProjectDir?: () => string | undefined
  contextCollector?: AdvisoryCollector
  getSnapshot?: () => IntrospectionSnapshot
}

type RotationEntry = { index: number; tried: string[] }

const rotationState = new Map<string, RotationEntry>()

function rotationKey(conversationId: string, agentType: string): string {
  return `${conversationId}:${agentType}`
}

export function resetRotationState(): void {
  rotationState.clear()
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function resolveFallbackModels(config: OhMyCursorConfig, agent: string): string[] {
  const override = config.agent_overrides?.[agent]
  if (override && Array.isArray(override.fallback_models) && override.fallback_models.length > 0) {
    return override.fallback_models
  }
  const category = config.categories?.[agent]
  if (category && Array.isArray(category.fallback_models) && category.fallback_models.length > 0) {
    return category.fallback_models
  }
  return []
}

/**
 * Advance `entry.index` past `fallback_models` entries disallowed for `agent`,
 * registering one advisory per skip. Because `entry.index` is shared and only
 * ever increases, each disallowed slot is skipped — and its advisory emitted —
 * exactly once across the rotation lifecycle (the tests rely on this).
 */
function skipDisallowedEntries(
  conversationId: string,
  agent: string,
  fallbacks: string[],
  entry: RotationEntry,
  snapshot: IntrospectionSnapshot,
  collector: AdvisoryCollector,
): void {
  while (entry.index < fallbacks.length) {
    const model = fallbacks[entry.index]
    // Empty/invalid slot: stop and let the caller's nonEmptyString guard handle it.
    if (!nonEmptyString(model)) return
    if (isModelAllowedForAgent(agent, model, snapshot)) return

    try {
      collector.register(conversationId, {
        id: `model-rotation-skipped:${agent}:${model}`,
        source: "model-rotation",
        content:
          `[model-rotation] Fallback model '${model}' for agent '${agent}' is not in the ` +
          `per-agent allowlist; skipping.`,
        priority: "critical",
      })
    } catch {
      // Advisory registration is best-effort; never break the hot path.
    }
    entry.index += 1
  }
}

export function recordRetryableFailure(
  conversationId: string,
  agentType: string,
  deps: RotationDeps = {},
): void {
  if (!nonEmptyString(agentType)) return

  const loadConfig = deps.loadConfig ?? defaultLoadConfig
  const getProjectDir = deps.getProjectDir ?? (() => process.env.OH_MY_CURSOR_PROJECT_DIR)
  const collector = deps.contextCollector ?? defaultContextCollector
  const getSnapshot = deps.getSnapshot ?? introspectionRuntime.getSnapshot

  let config: OhMyCursorConfig
  try {
    config = loadConfig(getProjectDir())
  } catch {
    return
  }

  const fallbacks = resolveFallbackModels(config, agentType)
  if (fallbacks.length === 0) return

  const key = rotationKey(conversationId, agentType)
  const entry = rotationState.get(key)

  if (!entry) {
    rotationState.set(key, { index: 0, tried: [] })
    return
  }

  if (entry.index >= fallbacks.length) return

  const snapshot = getSnapshot()
  skipDisallowedEntries(conversationId, agentType, fallbacks, entry, snapshot, collector)
  if (entry.index >= fallbacks.length) return

  const failedModel = fallbacks[entry.index]
  if (nonEmptyString(failedModel)) entry.tried.push(failedModel)
  entry.index += 1
  skipDisallowedEntries(conversationId, agentType, fallbacks, entry, snapshot, collector)

  if (entry.index >= fallbacks.length) {
    try {
      collector.register(conversationId, {
        id: `model-rotation-exhausted:${agentType}`,
        source: "model-rotation",
        content:
          `[model-rotation] All ${entry.tried.length} fallback model(s) for agent '${agentType}' ` +
          `have failed: ${entry.tried.join(", ")}. Rotation has stopped; the dispatch will use the ` +
          `static model-routing override (if configured) or the parent model. Consider a different ` +
          `agent type, a different model, or asking the user for guidance.`,
        priority: "critical",
      })
    } catch {
      // Advisory registration is best-effort; never break the hot path.
    }
  }
}

export function resetRotationOnSuccess(conversationId: string, agentType: string): void {
  if (!nonEmptyString(agentType)) return
  rotationState.delete(rotationKey(conversationId, agentType))
}

export function createModelRotationProvider(deps: RotationDeps = {}): TaskMutationProvider {
  const loadConfig = deps.loadConfig ?? defaultLoadConfig
  const getProjectDir = deps.getProjectDir ?? (() => process.env.OH_MY_CURSOR_PROJECT_DIR)
  const collector = deps.contextCollector ?? defaultContextCollector
  const getSnapshot = deps.getSnapshot ?? introspectionRuntime.getSnapshot

  return {
    id: MODEL_ROTATION_PROVIDER_ID,
    priority: MODEL_ROTATION_PRIORITY,
    mutate(conversationId: string, toolInput: TaskInput): MutationResult {
      if (!toolInput || typeof toolInput !== "object") return null

      const agent = extractAgentTypeFromLogInputs(toolInput, toolInput)
      if (!nonEmptyString(agent)) return null

      const entry = rotationState.get(rotationKey(conversationId, agent))
      if (!entry) return null

      let config: OhMyCursorConfig
      try {
        config = loadConfig(getProjectDir())
      } catch {
        return null
      }

      const fallbacks = resolveFallbackModels(config, agent)
      if (fallbacks.length === 0) return null
      if (entry.index >= fallbacks.length) return null

      skipDisallowedEntries(conversationId, agent, fallbacks, entry, getSnapshot(), collector)
      if (entry.index >= fallbacks.length) return null

      const model = fallbacks[entry.index]
      if (!nonEmptyString(model)) return null

      return { model }
    },
  }
}

export const modelRotationProvider = createModelRotationProvider()

taskInputComposer.register(modelRotationProvider)
