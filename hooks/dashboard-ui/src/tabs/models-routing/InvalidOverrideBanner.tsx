import { useMemo } from 'react'
import { AlertTriangleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

const INHERIT = 'inherit'

type InvalidOverrideBannerProps = {
  config: unknown
  modelsByAgent: Record<string, string[]> | undefined
  onReset: (agent: string) => Promise<void>
}

interface InvalidEntry {
  agent: string
  models: string[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function collectModelStrings(raw: Record<string, unknown>): string[] {
  const out: string[] = []
  if (typeof raw.model === 'string') out.push(raw.model)
  if (Array.isArray(raw.fallback_models)) {
    for (const m of raw.fallback_models) {
      if (typeof m === 'string') out.push(m)
    }
  }
  return out
}

function invalidModelsFor(
  raw: Record<string, unknown>,
  allowed: string[],
): string[] {
  const allowedSet = new Set(allowed)
  const seen = new Set<string>()
  const invalid: string[] = []
  for (const model of collectModelStrings(raw)) {
    if (model === INHERIT) continue
    if (allowedSet.has(model)) continue
    if (seen.has(model)) continue
    seen.add(model)
    invalid.push(model)
  }
  return invalid
}

function scanSection(
  section: unknown,
  modelsByAgent: Record<string, string[]>,
  accumulator: Map<string, Set<string>>,
): void {
  if (!isObject(section)) return
  for (const [agent, raw] of Object.entries(section)) {
    if (agent === INHERIT) continue
    if (!isObject(raw)) continue
    // Permissive agents have no entry in modelsByAgent — skip them entirely.
    const allowed = modelsByAgent[agent]
    if (!allowed || allowed.length === 0) continue
    const invalid = invalidModelsFor(raw, allowed)
    if (invalid.length === 0) continue
    const bucket = accumulator.get(agent) ?? new Set<string>()
    for (const m of invalid) bucket.add(m)
    accumulator.set(agent, bucket)
  }
}

function computeInvalidEntries(
  config: unknown,
  modelsByAgent: Record<string, string[]> | undefined,
): InvalidEntry[] {
  if (!isObject(config) || !modelsByAgent) return []
  const accumulator = new Map<string, Set<string>>()
  scanSection(config.agent_overrides, modelsByAgent, accumulator)
  scanSection(config.categories, modelsByAgent, accumulator)
  return Array.from(accumulator.entries())
    .map(([agent, models]) => ({ agent, models: Array.from(models) }))
    .sort((a, b) => a.agent.localeCompare(b.agent))
}

export function InvalidOverrideBanner({
  config,
  modelsByAgent,
  onReset,
}: InvalidOverrideBannerProps) {
  const invalidEntries = useMemo(
    () => computeInvalidEntries(config, modelsByAgent),
    [config, modelsByAgent],
  )

  if (invalidEntries.length === 0) return null

  return (
    <div
      className="invalid-override-banner flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-300"
      role="alert"
      data-slot="invalid-override-banner"
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {invalidEntries.length === 1
            ? '1 routing override uses a model not available at this Cursor version'
            : `${invalidEntries.length} routing overrides use models not available at this Cursor version`}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {invalidEntries.map(({ agent, models }) => (
          <li
            key={agent}
            className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-amber-500/5 px-2 py-1.5"
            data-slot="invalid-override-row"
            data-agent={agent}
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono font-medium">{agent}</span>
              <span className="text-[12px] text-amber-700/80 dark:text-amber-300/80">
                {models.map((m) => (
                  <code key={m} className="ml-1 rounded bg-amber-500/15 px-1 py-0.5 font-mono">
                    {m}
                  </code>
                ))}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="invalid-override-reset border-amber-500/50 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
              data-agent={agent}
              onClick={() => void onReset(agent)}
            >
              Reset to default
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
