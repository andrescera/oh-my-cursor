/**
 * Single shared FALLBACK source of truth for Cursor Task model slugs and
 * oh-my-cursor agent types.
 *
 * These constants are the *fallback floor* used by the task-schema-introspector
 * when live bundle introspection is unavailable. They must never be the
 * primary/only source — the introspector's bundle scan is authoritative when it
 * succeeds (see task-schema-introspector.ts). Keeping the list here as one
 * importable constant means callers (config-generator, daemon, introspector)
 * share an identical fallback rather than duplicating hardcoded enums.
 */

/**
 * Canonical, empirically-verified Cursor Task slugs. Mirrors
 * `VALID_CURSOR_SLUGS` in `scripts/config-generator.ts` (comment there:
 * "verified empirically"). Task 28 re-points config-generator at this constant.
 */
const CANONICAL_CURSOR_SLUGS = [
  "composer-2-fast",
  "gpt-5.4-medium",
  "gpt-5.5-extra-high",
  "claude-4.6-sonnet-medium-thinking",
  "claude-opus-4-7-thinking-xhigh",
  "gemini-3.1-pro",
] as const

/**
 * Additional forum-documented / community-reported Cursor Task slug variants.
 * Demoted fallbacks only: included so a partial or failed scan never regresses
 * coverage below a reasonable superset. The bundle scan remains the source of
 * truth when it succeeds.
 */
const FORUM_DOCUMENTED_CURSOR_SLUGS = [
  "composer-2",
  "gpt-5.4-high",
  "gpt-5.5-medium",
  "claude-4.6-sonnet-thinking",
  "claude-opus-4-7-thinking",
  "gemini-3-flash",
] as const

/**
 * Superset of the canonical Cursor slugs plus forum-documented variants,
 * de-duplicated and order-preserving (canonical first).
 */
export const KNOWN_CURSOR_MODELS: readonly string[] = Object.freeze([
  ...new Set<string>([...CANONICAL_CURSOR_SLUGS, ...FORUM_DOCUMENTED_CURSOR_SLUGS]),
])

/**
 * oh-my-cursor agent types — ground truth derived from the `agents/*.md`
 * filenames (the `protocols/` subdirectory is not an agent). Hardcoded rather
 * than read from disk at import time so this constant never throws and does not
 * depend on the runtime working directory.
 */
export const KNOWN_AGENT_TYPES: readonly string[] = Object.freeze([
  "atlas",
  "explore",
  "hephaestus",
  "librarian",
  "metis",
  "momus",
  "multimodal-looker",
  "oracle",
  "prometheus",
  "sisyphus",
  "sisyphus-junior",
])
