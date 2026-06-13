import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { z } from "zod"
import { AgentOverrideSchema, CategorySchema } from "../schemas/config"
import { stripJsoncComments } from "../config"
import { getEnum, type GetEnumOptions } from "./task-schema-introspector"

/**
 * Atomic, validated write of the `agent_overrides` (+ optional `categories`)
 * slice of an oh-my-cursor config file.
 *
 * Contract:
 *   - Body validated by `AgentOverridesWriteSchema` (Zod, Task 4 sub-schemas).
 *     Failure → `{ ok:false, status:400 }` and the target file is NOT touched.
 *   - The new overrides are shallow-merged over the existing file's
 *     `agent_overrides` / `categories` maps; all other top-level keys are
 *     preserved. Comments in the source JSONC are dropped on rewrite (the
 *     daemon's `/config` POST already serializes pretty JSON — same tradeoff).
 *   - Advisory model-enum check via the introspector: unknown slugs produce
 *     `warnings[]`, never a rejection. `"inherit"` is always allowed.
 *   - Atomic write: serialize → `<config>.tmp` → `rename()` over the real path.
 */

const TargetSchema = z.enum(["project", "user"])

export const AgentOverridesWriteSchema = z
  .object({
    target: TargetSchema,
    agent_overrides: z.record(z.string(), AgentOverrideSchema),
    categories: z.record(z.string(), CategorySchema).optional(),
  })
  .strict()

export type AgentOverridesWriteBody = z.infer<typeof AgentOverridesWriteSchema>
export type WriteTarget = z.infer<typeof TargetSchema>

export interface ResolvePathOptions {
  cwd?: string
  home?: string
}

export interface WriteOptions extends ResolvePathOptions {
  /** Introspector options forwarded to the advisory enum check (test seams). */
  enumOptions?: GetEnumOptions
}

export interface WriteSuccess {
  ok: true
  path: string
  warnings: string[]
}

export interface WriteFailure {
  ok: false
  status: number
  error: string
}

export type WriteResult = WriteSuccess | WriteFailure

// Type-guard narrowing — the project's tsconfig has strict mode off, so a bare
// `if (!result.ok)` will not narrow the union to WriteFailure. A user-defined
// predicate narrows correctly regardless of strictNullChecks.
export function isWriteFailure(result: WriteResult): result is WriteFailure {
  return result.ok === false
}

/**
 * Resolve the on-disk config path for a write target. Mirrors `loadConfig`'s
 * user/project resolution so a write is visible to a subsequent load.
 */
export function resolveConfigPath(target: WriteTarget, opts: ResolvePathOptions = {}): string {
  const home = opts.home ?? process.env.HOME ?? "/tmp"
  const cwd = opts.cwd ?? process.cwd()
  if (target === "user") {
    return join(home, ".config", "oh-my-cursor", "config.jsonc")
  }
  return join(cwd, ".cursor", "oh-my-cursor.jsonc")
}

function readExistingConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(stripJsoncComments(readFileSync(path, "utf-8")))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    // An unparseable existing file is treated as empty rather than blocking the
    // write; the caller's validated payload becomes the new source of truth.
    return {}
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function collectWarnings(
  body: AgentOverridesWriteBody,
  enumOptions: GetEnumOptions | undefined,
): Promise<string[]> {
  const warnings: string[] = []
  try {
    const result = await getEnum(enumOptions ?? {})
    const valid = new Set(result.models)
    const checkModel = (slug: string | undefined, label: string): void => {
      if (!slug || slug === "inherit") return
      if (!valid.has(slug)) {
        warnings.push(`${label} "${slug}" is not in the known Cursor model list (advisory only)`)
      }
    }
    for (const [agent, ov] of Object.entries(body.agent_overrides)) {
      checkModel(ov.model, `agent_overrides.${agent}.model`)
      for (const fm of ov.fallback_models ?? []) {
        checkModel(fm, `agent_overrides.${agent}.fallback_models`)
      }
    }
    for (const [cat, ov] of Object.entries(body.categories ?? {})) {
      checkModel(ov.model, `categories.${cat}.model`)
      for (const fm of ov.fallback_models ?? []) {
        checkModel(fm, `categories.${cat}.fallback_models`)
      }
    }
  } catch {
    // Advisory check must never block a write.
  }
  return warnings
}

/**
 * Validate, merge, advisory-check, and atomically write the agent-overrides
 * slice. Never throws — all failures are returned as `WriteFailure`.
 */
export async function writeAgentOverrides(
  rawBody: unknown,
  opts: WriteOptions = {},
): Promise<WriteResult> {
  const parsed = AgentOverridesWriteSchema.safeParse(rawBody)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first?.path?.length ? ` at ${first.path.join(".")}` : ""
    return {
      ok: false,
      status: 400,
      error: `Validation failed${where}: ${first?.message ?? "invalid body"}`,
    }
  }
  const body = parsed.data
  const path = resolveConfigPath(body.target, opts)

  const warnings = await collectWarnings(body, opts.enumOptions)

  const existing = readExistingConfig(path)
  const existingAgents = asObject(existing.agent_overrides)
  const existingCategories = asObject(existing.categories)

  const merged: Record<string, unknown> = {
    ...existing,
    agent_overrides: { ...existingAgents, ...body.agent_overrides },
  }
  if (body.categories) {
    merged.categories = { ...existingCategories, ...body.categories }
  }

  const serialized = JSON.stringify(merged, null, 2) + "\n"
  const tmpPath = path + ".tmp"
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tmpPath, serialized, "utf-8")
    renameSync(tmpPath, path)
  } catch (err) {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* tmp cleanup best-effort */
    }
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return { ok: true, path, warnings }
}
