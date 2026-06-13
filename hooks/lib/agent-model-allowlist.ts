/**
 * Curated per-`subagent_type` model allowlist + resolver/predicate.
 *
 * DATA SOURCE: The slugs in `AGENT_MODEL_ALLOWLIST` are hand-authored from
 * Cursor's `task()` model enum cross-referenced against `KNOWN_CURSOR_MODELS`
 * (hooks/lib/known-models.ts). Every curated slug MUST be a member of
 * `KNOWN_CURSOR_MODELS`. This list is the *floor* — a reasonable per-agent
 * default to be refined by the Wave-1 introspection spike (Task 3).
 *
 * This module is pure and side-effect-free: NO HTTP/daemon imports, NO
 * cost/latency/capability metadata. The single predicate `isModelAllowedForAgent`
 * is reused by both dispatch and write paths.
 *
 * SEMANTICS:
 *  - Known agent with a non-empty curated set → only those slugs are allowed.
 *  - Unknown agent, OR known agent with an empty curated array → PERMISSIVE:
 *    fall back to `snapshot.models` (whatever introspection currently allows).
 *  - `"inherit"` is always allowed and is never listed inside a curated set or
 *    returned by `resolveAllowedModels`.
 */

import type { IntrospectionSnapshot } from "./introspection-runtime"

/**
 * Allowed Cursor model slugs per `subagent_type`. Keys seeded from the canonical
 * agent names in `KNOWN_AGENT_TYPES` (validated by the test suite). Fast/search
 * agents prefer fast slugs; deep workers and reviewers prefer high-capability
 * slugs. `Object.freeze` mirrors the frozen-export style of known-models.ts.
 */
export const AGENT_MODEL_ALLOWLIST: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Fast, cheap search/executor agents.
  explore: Object.freeze(["composer-2-fast", "composer-2.5", "gpt-5.4-medium"]),
  librarian: Object.freeze(["composer-2-fast", "composer-2.5", "gpt-5.4-medium"]),
  "sisyphus-junior": Object.freeze(["composer-2-fast", "composer-2.5", "gpt-5.4-medium"]),

  // High-capability deep workers / orchestrators.
  sisyphus: Object.freeze([
    "claude-opus-4-7-thinking-xhigh",
    "claude-opus-4-7-thinking",
    "gpt-5.5-extra-high",
  ]),
  hephaestus: Object.freeze([
    "gpt-5.5-extra-high",
    "gpt-5.5-medium",
    "claude-opus-4-7-thinking-xhigh",
  ]),
  prometheus: Object.freeze([
    "claude-opus-4-7-thinking-xhigh",
    "claude-opus-4-7-thinking",
    "gpt-5.5-extra-high",
  ]),
  atlas: Object.freeze([
    "claude-4.6-sonnet-medium-thinking",
    "claude-4.6-sonnet-thinking",
    "gpt-5.4-high",
  ]),

  // Read-only consultants / reviewers.
  oracle: Object.freeze(["gpt-5.5-extra-high", "gpt-5.5-medium", "claude-opus-4-7-thinking"]),
  momus: Object.freeze(["gpt-5.5-extra-high", "gpt-5.5-medium", "claude-4.6-sonnet-thinking"]),
  metis: Object.freeze(["gpt-5.4-medium", "gpt-5.4-high", "composer-2-fast"]),

  // Visual analysis.
  "multimodal-looker": Object.freeze(["gemini-3.1-pro", "gemini-3-flash"]),
})

/**
 * `subagent_type` is considered "known" only when present in the allowlist with
 * a non-empty curated set. Unknown or empty agents are PERMISSIVE.
 */
function hasCuratedSet(agentType: string): boolean {
  const curated = AGENT_MODEL_ALLOWLIST[agentType]
  return Array.isArray(curated) && curated.length > 0
}

/**
 * Resolve the list of allowed model slugs for an agent.
 *
 * - Known, non-empty agent → a mutable copy of the curated set.
 * - Unknown agent OR empty curated array → PERMISSIVE: a copy of
 *   `snapshot.models`.
 *
 * Never returns `"inherit"`.
 */
export function resolveAllowedModels(agentType: string, snapshot: IntrospectionSnapshot): string[] {
  if (hasCuratedSet(agentType)) {
    return [...AGENT_MODEL_ALLOWLIST[agentType]]
  }
  return [...snapshot.models]
}

/**
 * Single predicate reused by dispatch and write paths.
 *
 * Returns true when:
 *  - `model === "inherit"` (always allowed), OR
 *  - the agent is permissive (unknown / empty curated set), OR
 *  - `model` is a member of the agent's curated set.
 */
export function isModelAllowedForAgent(
  agentType: string,
  model: string,
  snapshot: IntrospectionSnapshot,
): boolean {
  if (model === "inherit") return true
  return resolveAllowedModels(agentType, snapshot).includes(model)
}
