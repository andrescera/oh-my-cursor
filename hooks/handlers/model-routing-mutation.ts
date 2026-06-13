/**
 * Dynamic per-agent model routing — a `taskInputComposer` provider.
 *
 * Resolves the model a dispatched Task should run on from user config and, when
 * it differs from the incoming `tool_input.model`, returns `{ model: <resolved> }`
 * so the central composer (Task 7) folds it into `updated_input`.
 *
 * Config precedence (highest first):
 *   1. `agent_overrides[agent].model`
 *   2. `categories[agent].model`              (category key = the agent name —
 *                                               no separate agent→category map
 *                                               exists in the schema, so an
 *                                               agent's own name doubles as its
 *                                               shared-policy category key)
 *   3. no-op (return null — emit no `updated_input`)
 *
 * Special cases:
 *   - `agent_overrides[agent].disable === true` → DO NOT mutate the model;
 *     register a CRITICAL advisory via contextCollector instead.
 *   - Resolved slug not in the introspector enum → apply ANYWAY + warn via the
 *     daemon logger (advisory only, never a gate). Validation is async
 *     (`getEnum` never rejects) and fired fire-and-forget so `mutate` stays
 *     synchronous within the 50ms hot-path budget.
 *
 * This module registers its provider on the shared `taskInputComposer`
 * singleton at import time. It is the ONLY model-routing producer; it does NOT
 * touch task-input-composer.ts (Task 7 is complete) and never denies a dispatch
 * (no `permission: "deny"` — out of scope here).
 */

import {
  taskInputComposer,
  type MutationResult,
  type TaskInput,
  type TaskMutationProvider,
} from "./task-input-composer"
import { extractAgentTypeFromLogInputs } from "./extract-agent-fields"
import { loadConfig as defaultLoadConfig } from "../config"
import {
  getEnum as defaultGetEnum,
  type EnumResult,
  type GetEnumOptions,
} from "../lib/task-schema-introspector"
import { contextCollector as defaultContextCollector } from "../context-collector"
import {
  introspectionRuntime,
  type IntrospectionSnapshot,
} from "../lib/introspection-runtime"
import { AGENT_MODEL_ALLOWLIST, isModelAllowedForAgent } from "../lib/agent-model-allowlist"
import type { OhMyCursorConfig } from "../schemas/config"

/** Stable provider id — re-registering replaces the prior provider by id. */
export const MODEL_ROUTING_PROVIDER_ID = "model-routing"

/**
 * Application order on the composer. Model routing mutates only the `model`
 * key, which never conflicts with the prompt-piggyback provider (Task 9), so
 * the exact value is not load-bearing; a mid-range priority is fine.
 */
const MODEL_ROUTING_PRIORITY = 100

export type ModelRoutingLogger = (message: string, meta?: Record<string, unknown>) => void

/** Minimal contextCollector surface this provider depends on (advisory only). */
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

/** Injectable dependencies — all default to the real daemon singletons. */
export interface ModelRoutingDeps {
  loadConfig?: (projectDir?: string) => OhMyCursorConfig
  getEnum?: (options?: GetEnumOptions) => Promise<EnumResult>
  getSnapshot?: () => IntrospectionSnapshot
  contextCollector?: AdvisoryCollector
  logWarn?: ModelRoutingLogger
  getProjectDir?: () => string | undefined
}

interface ResolveResult {
  resolved?: string
  disabled: boolean
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Resolve the configured model for `agent` using the documented precedence.
 * A disabled agent_override short-circuits everything (category included).
 */
function resolveModelFromConfig(config: OhMyCursorConfig, agent: string): ResolveResult {
  const override = config.agent_overrides?.[agent]
  if (override) {
    if (override.disable === true) return { disabled: true }
    if (nonEmptyString(override.model)) return { resolved: override.model, disabled: false }
  }

  // Category fallback — the agent name doubles as the category key.
  const category = config.categories?.[agent]
  if (category && nonEmptyString(category.model)) {
    return { resolved: category.model, disabled: false }
  }

  return { disabled: false }
}

interface AllowlistDecision {
  model: string | null
  advisory?: { rejected: string; fallback: string }
}

function hasCuratedSet(agent: string): boolean {
  const curated = AGENT_MODEL_ALLOWLIST[agent]
  return Array.isArray(curated) && curated.length > 0
}

/**
 * Dispatch-time per-agent allowlist gate (SYNCHRONOUS — the 50ms hot path forbids
 * awaits). Returns the model to apply (or `null` to inherit the parent) plus an
 * optional advisory describing a fallback. Semantics:
 *   - `"inherit"` is always allowed → applied as-is, never gated.
 *   - Snapshot read throws (cache not warm) → treat as permissive, apply as-is.
 *   - Allowed (curated member or permissive agent) → apply as-is.
 *   - Curated agent + disallowed model → fall back to `categories[agent].model`
 *     when that candidate is itself allowed, else inherit the parent (`null`).
 */
function validateAgainstAllowlist(
  resolved: string,
  agent: string,
  config: OhMyCursorConfig,
  getSnapshot: () => IntrospectionSnapshot,
): AllowlistDecision {
  if (resolved === "inherit") return { model: resolved }

  let snapshot: IntrospectionSnapshot
  try {
    snapshot = getSnapshot()
  } catch {
    return { model: resolved }
  }

  if (isModelAllowedForAgent(agent, resolved, snapshot)) return { model: resolved }

  // Disallowed. Permissive agents (no curated set) still apply as-is, no advisory.
  if (!hasCuratedSet(agent)) return { model: resolved }

  const categoryModel = config.categories?.[agent]?.model
  if (
    nonEmptyString(categoryModel) &&
    categoryModel !== resolved &&
    isModelAllowedForAgent(agent, categoryModel, snapshot)
  ) {
    return { model: categoryModel, advisory: { rejected: resolved, fallback: categoryModel } }
  }

  return { model: null, advisory: { rejected: resolved, fallback: "inherit" } }
}

/**
 * Fire-and-forget advisory: warn (out-of-band) when the resolved slug is not in
 * the introspector enum. The model is applied regardless — this never gates.
 */
function validateSlugAsync(
  resolved: string,
  agent: string,
  getEnum: (options?: GetEnumOptions) => Promise<EnumResult>,
  logWarn: ModelRoutingLogger,
): void {
  void getEnum()
    .then((enums) => {
      if (!enums.models.includes(resolved)) {
        logWarn(
          `resolved model '${resolved}' for agent '${agent}' is not in the known Cursor model enum (source=${enums.source}); applying anyway`,
          { agent, model: resolved, source: enums.source },
        )
      }
    })
    .catch(() => {
      // getEnum is contractually non-rejecting; defensive only.
    })
}

/**
 * Build a model-routing mutation provider. Defaults wire the real daemon
 * singletons; tests inject hermetic fakes.
 */
export function createModelRoutingProvider(deps: ModelRoutingDeps = {}): TaskMutationProvider {
  const loadConfig = deps.loadConfig ?? defaultLoadConfig
  const getEnum = deps.getEnum ?? defaultGetEnum
  const getSnapshot = deps.getSnapshot ?? (() => introspectionRuntime.getSnapshot())
  const collector = deps.contextCollector ?? defaultContextCollector
  const logWarn =
    deps.logWarn ??
    ((message, meta) => {
      console.warn(`[oh-my-cursor][model-routing] ${message}`, meta ?? "")
    })
  const getProjectDir = deps.getProjectDir ?? (() => process.env.OH_MY_CURSOR_PROJECT_DIR)

  return {
    id: MODEL_ROUTING_PROVIDER_ID,
    priority: MODEL_ROUTING_PRIORITY,
    mutate(conversationId: string, toolInput: TaskInput): MutationResult {
      if (!toolInput || typeof toolInput !== "object") return null

      const agent = extractAgentTypeFromLogInputs(toolInput, toolInput)
      if (!nonEmptyString(agent)) return null

      let config: OhMyCursorConfig
      try {
        config = loadConfig(getProjectDir())
      } catch {
        // Config unavailable → routing is a no-op; never break the dispatch.
        return null
      }

      const { resolved, disabled } = resolveModelFromConfig(config, agent)

      if (disabled) {
        try {
          collector.register(conversationId, {
            id: `model-routing-disabled:${agent}`,
            source: "model-routing",
            content:
              `[model-routing] Agent '${agent}' is disabled via agent_overrides.disable. ` +
              `Model routing was skipped and the dispatch proceeds on the parent model. ` +
              `Remove "disable": true from agent_overrides.${agent} to re-enable routing.`,
            priority: "critical",
          })
        } catch {
          // Advisory registration is best-effort; never break the hot path.
        }
        return null
      }

      if (!nonEmptyString(resolved)) return null

      // Synchronous per-agent allowlist gate (never awaits — 50ms hot-path budget).
      const decision = validateAgainstAllowlist(resolved, agent, config, getSnapshot)
      if (decision.advisory) {
        try {
          collector.register(conversationId, {
            id: `model-routing-allowlist:${agent}`,
            source: "model-routing",
            content:
              `[model-routing] Agent '${agent}' override '${decision.advisory.rejected}' is not ` +
              `in its allowed model set; falling back to '${decision.advisory.fallback}'.`,
            priority: "critical",
          })
        } catch {
          // Advisory registration is best-effort; never break the hot path.
        }
      }
      if (decision.model === null) return null

      // Non-blocking needsCapture advisory — never alters dispatch.
      try {
        const snapshot = getSnapshot()
        if (snapshot.needsCapture) {
          collector.register(conversationId, {
            id: "model-enum-needs-capture",
            source: "model-routing",
            content:
              "[model-routing] The Cursor Task model enum has not been captured for the current " +
              "Cursor version. Run /sync-models to capture the live enum; running on the stale " +
              "fallback floor until then.",
            priority: "normal",
          })
        }
      } catch {
        // Advisory registration is best-effort; never break the hot path.
      }

      const finalModel = decision.model
      const incoming = nonEmptyString(toolInput.model) ? toolInput.model : undefined
      if (incoming === finalModel) return null

      // Apply now; validate-and-warn out of band (mutate must stay synchronous).
      validateSlugAsync(finalModel, agent, getEnum, logWarn)

      return { model: finalModel }
    },
  }
}

/** The canonical provider, wired to the real daemon singletons. */
export const modelRoutingProvider = createModelRoutingProvider()

// Register on the shared composer at module load — this module is the daemon's
// sole model-routing producer for Task preToolUse.
taskInputComposer.register(modelRoutingProvider)
