import {
  getEnum as defaultGetEnum,
  passiveObserve as defaultPassiveObserve,
  type EnumResult,
  type GetEnumOptions,
} from "./task-schema-introspector"
import { KNOWN_AGENT_TYPES, KNOWN_CURSOR_MODELS } from "./known-models"
import { resolveAllowedModels } from "./agent-model-allowlist"
import { loadConfig as defaultLoadConfig } from "../config"
import { extractAgentTypeFromLogInputs, extractModelFromLogInputs } from "../handlers/extract-agent-fields"

export interface IntrospectionSnapshot {
  models: string[]
  agents: string[]
  source: "bundle" | "observed" | "fallback" | "reported"
  cursorVersion?: string
  cachedAt: string
  observedAdditions: string[]
  modelsByAgent?: Record<string, string[]>
  needsCapture?: boolean
}

export interface IntrospectionVersionChange {
  cursorVersion: string
  cachedAt: string
}

export type IntrospectionVersionChangeListener = (payload: IntrospectionVersionChange) => void

export interface IntrospectionRuntimeDeps {
  getEnum: (options?: GetEnumOptions) => Promise<EnumResult>
  passiveObserve: (record: { model?: unknown; subagent_type?: unknown; agent_type?: unknown }) => void
  loadConfig: () => { introspection: GetEnumOptions["introspection"] }
  onVersionChange?: IntrospectionVersionChangeListener
}

export interface IntrospectionRuntime {
  init: () => Promise<void>
  observe: (input: Record<string, unknown>) => void
  getSnapshot: () => IntrospectionSnapshot
  setOnVersionChange: (listener: IntrospectionVersionChangeListener | undefined) => void
  refresh: () => Promise<void>
  reset: () => void
}

interface BaseSnapshot {
  models: string[]
  agents: string[]
  source: "bundle" | "observed" | "fallback" | "reported"
  cursorVersion?: string
  cachedAt: string
  modelsByAgent: Record<string, string[]>
  needsCapture?: boolean
}

const KNOWN_FLOOR: ReadonlySet<string> = new Set<string>([
  ...KNOWN_CURSOR_MODELS,
  ...KNOWN_AGENT_TYPES,
])

function computeModelsByAgent(models: readonly string[], agents: readonly string[]): Record<string, string[]> {
  const snapshot: IntrospectionSnapshot = {
    models: [...models],
    agents: [...agents],
    source: "fallback",
    cachedAt: "",
    observedAdditions: [],
  }
  const agentSet = new Set<string>([...KNOWN_AGENT_TYPES, ...agents])
  const out: Record<string, string[]> = {}
  for (const agent of agentSet) {
    out[agent] = resolveAllowedModels(agent, snapshot)
  }
  return out
}

function syncFallbackBase(cursorVersion: string | undefined): BaseSnapshot {
  return {
    models: [...KNOWN_CURSOR_MODELS],
    agents: [...KNOWN_AGENT_TYPES],
    source: "fallback",
    cursorVersion,
    cachedAt: new Date().toISOString(),
    modelsByAgent: computeModelsByAgent(KNOWN_CURSOR_MODELS, KNOWN_AGENT_TYPES),
    needsCapture: true,
  }
}

function unionPreserve(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of [a, b]) {
    for (const item of list) {
      if (!seen.has(item)) {
        seen.add(item)
        out.push(item)
      }
    }
  }
  return out
}

export function createIntrospectionRuntime(
  deps: IntrospectionRuntimeDeps = {
    getEnum: defaultGetEnum,
    passiveObserve: defaultPassiveObserve,
    loadConfig: defaultLoadConfig,
  },
): IntrospectionRuntime {
  let base: BaseSnapshot | null = null
  let lastCursorVersion: string | undefined
  let lastScannedVersion: string | undefined
  let scanInFlight = false
  let onVersionChange = deps.onVersionChange
  const observedModels = new Set<string>()
  const observedAgents = new Set<string>()

  async function scan(): Promise<void> {
    let introspection: GetEnumOptions["introspection"]
    try {
      introspection = deps.loadConfig().introspection
    } catch {
      introspection = undefined
    }
    try {
      const result = await deps.getEnum({ introspection, cursorVersion: lastCursorVersion })
      const agents = unionPreserve(result.agents, [...observedAgents])
      base = {
        models: result.models,
        agents: result.agents,
        source: result.source,
        cursorVersion: result.cursorVersion,
        cachedAt: result.cachedAt,
        modelsByAgent: computeModelsByAgent(result.models, agents),
        needsCapture: result.needsCapture,
      }
      if (result.cursorVersion) {
        lastCursorVersion = result.cursorVersion
        // lastScannedVersion tracks the version `base` reflects, separate from
        // lastCursorVersion (which observe() advances before triggering rescan).
        // Emit only on a confirmed drift from a prior scan — never on the first
        // (init) scan that merely establishes the baseline.
        const versionChanged =
          lastScannedVersion !== undefined && result.cursorVersion !== lastScannedVersion
        lastScannedVersion = result.cursorVersion
        if (versionChanged && onVersionChange) {
          try {
            onVersionChange({ cursorVersion: result.cursorVersion, cachedAt: result.cachedAt })
          } catch {
            // Listener faults must not corrupt the scan path.
          }
        }
      }
    } catch {
      base = base ?? syncFallbackBase(lastCursorVersion)
    }
  }

  function triggerRescan(): void {
    if (scanInFlight) return
    scanInFlight = true
    void Promise.resolve()
      .then(scan)
      .finally(() => { scanInFlight = false })
  }

  return {
    async init(): Promise<void> {
      try {
        await scan()
      } catch {
        base = base ?? syncFallbackBase(lastCursorVersion)
      }
    },

    observe(input: Record<string, unknown>): void {
      try {
        if (!input || typeof input !== "object") return
        const toolInput =
          input.tool_input && typeof input.tool_input === "object"
            ? (input.tool_input as Record<string, unknown>)
            : {}
        const model = extractModelFromLogInputs(input, toolInput)
        const agent = extractAgentTypeFromLogInputs(input, toolInput)
        if (model || agent) {
          try {
            deps.passiveObserve({ model, subagent_type: agent })
          } catch {
            // introspector passiveObserve already swallows; defensive only
          }
          if (model) observedModels.add(model)
          if (agent) observedAgents.add(agent)
        }
        const version = input.cursor_version
        if (typeof version === "string" && version.length > 0 && version !== lastCursorVersion) {
          lastCursorVersion = version
          triggerRescan()
        }
      } catch {
        // observe must never throw on the hot path
      }
    },

    getSnapshot(): IntrospectionSnapshot {
      const b = base ?? syncFallbackBase(lastCursorVersion)
      // observedAdditions = runtime-observed slugs absent from the shipped KNOWN
      // floor. Computed against KNOWN (not base.models) so a version-mismatch
      // rescan — which folds passiveObserve values into getEnum's merged models —
      // can never silently drop a genuinely new observation from the list.
      const observedAdditions: string[] = []
      for (const m of observedModels) if (!KNOWN_FLOOR.has(m)) observedAdditions.push(m)
      for (const a of observedAgents) if (!KNOWN_FLOOR.has(a)) observedAdditions.push(a)
      const models = unionPreserve(b.models, [...observedModels])
      const agents = unionPreserve(b.agents, [...observedAgents])
      const source: typeof b.source =
        b.source === "fallback" && (observedModels.size > 0 || observedAgents.size > 0)
          ? "observed"
          : b.source
      return {
        models,
        agents,
        source,
        cursorVersion: b.cursorVersion,
        cachedAt: b.cachedAt,
        observedAdditions,
        modelsByAgent: b.modelsByAgent,
        needsCapture: b.needsCapture,
      }
    },

    setOnVersionChange(listener: IntrospectionVersionChangeListener | undefined): void {
      onVersionChange = listener
    },

    async refresh(): Promise<void> {
      // Re-run the scan WITHOUT clearing observations. Unlike triggerRescan()
      // (fire-and-forget), refresh() awaits scan() so callers can sequence on a
      // completed re-resolve. Never throws.
      try {
        await scan()
      } catch {
        // refresh must never throw
      }
    },

    reset(): void {
      base = null
      lastCursorVersion = undefined
      lastScannedVersion = undefined
      scanInFlight = false
      observedModels.clear()
      observedAgents.clear()
    },
  }
}

export const introspectionRuntime: IntrospectionRuntime = createIntrospectionRuntime()
