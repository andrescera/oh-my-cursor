import type { ApiError } from '@/lib/api'

// ---------- types ----------

export type ZodIssue = {
  path?: ReadonlyArray<string | number>
  message?: string
  code?: string
}

export type SaveErrorBody = {
  error?: string
  issues?: ZodIssue[]
}

export type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready' }

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; path?: string }
  | { status: 'error'; banner: string; issues: ZodIssue[] }

export type ConfigShape = Record<string, unknown>

export type SectionDef = {
  id: string
  label: string
  /** Top-level keys from `/config/full` that this section owns. */
  keys: string[]
}

export type ConfigTabProps = {
  /**
   * Test seam: when supplied bypasses the network fetch and uses the
   * given object as the loaded snapshot.
   */
  initialConfig?: ConfigShape
}

export type ConfigDiff = {
  path: ReadonlyArray<string | number>
  old: unknown
  next: unknown
}

// ---------- pure helpers ----------

/**
 * Map a Zod issue path (e.g. `["daemon","port"]`) to a human-readable label
 * (`"Daemon port"`). The first segment is title-cased; underscores are
 * spaces. Numeric indices are kept verbatim and prefixed with `#`.
 */
export function formatZodPath(path: ReadonlyArray<string | number>): string {
  if (!path || path.length === 0) return 'Config'
  return path
    .map((seg, i) => {
      if (typeof seg === 'number') return `#${seg}`
      const s = seg.replace(/_/g, ' ')
      return i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
    })
    .join(' ')
}

export function pathKey(path: ReadonlyArray<string | number>): string {
  return path.map(String).join('.')
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function getAtPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null) return undefined
    cur = (cur as Record<string | number, unknown>)[k]
  }
  return cur
}

export function setAtPath<T>(
  obj: T,
  path: ReadonlyArray<string | number>,
  value: unknown,
): T {
  if (path.length === 0) return value as T
  const [head, ...rest] = path
  const src = isPlainObject(obj) ? obj : ({} as Record<string, unknown>)
  return {
    ...src,
    [head as string]:
      rest.length === 0
        ? value
        : setAtPath(
            (src as Record<string, unknown>)[head as string],
            rest,
            value,
          ),
  } as T
}

export function humanLabel(seg: string): string {
  const s = seg.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatScalar(v: unknown): string {
  if (v === undefined) return '(unset)'
  if (typeof v === 'string') return v === '' ? '""' : v
  return JSON.stringify(v)
}

export function extractIssues(body: unknown): ZodIssue[] {
  if (!isPlainObject(body)) return []
  const issues = (body as SaveErrorBody).issues
  if (!Array.isArray(issues)) return []
  return issues.filter(
    (i): i is ZodIssue => isPlainObject(i),
  )
}

export function focusTab(root: HTMLElement | null, id: string): void {
  if (!root) return
  const el = root.querySelector<HTMLElement>(`#config-tab-${CSS.escape(id)}`)
  el?.focus()
}

// ---------- section layout ----------

const SECTION_GROUPS: ReadonlyArray<SectionDef> = [
  { id: 'general', label: 'General', keys: ['version'] },
  { id: 'daemon', label: 'Daemon', keys: ['daemon'] },
  {
    id: 'hooks_and_agents',
    label: 'Hooks & Agents',
    keys: ['disabled_hooks', 'disabled_agents', 'mcp_allowlist'],
  },
  { id: 'subagent_limits', label: 'Subagent Limits', keys: ['subagent_limits'] },
  {
    id: 'state_persistence',
    label: 'State Persistence',
    keys: ['state_persistence'],
  },
  { id: 'context_collector', label: 'Context Collector', keys: ['context_collector'] },
  { id: 'compaction', label: 'Compaction', keys: ['compaction'] },
  { id: 'experimental', label: 'Experimental', keys: ['experimental'] },
  { id: 'notifications', label: 'Notifications', keys: ['notifications'] },
  { id: 'orchestration', label: 'Orchestration', keys: ['orchestration'] },
  { id: 'continuation', label: 'Continuation', keys: ['continuation'] },
  { id: 'safety', label: 'Safety', keys: ['safety'] },
  { id: 'momus', label: 'Momus', keys: ['momus'] },
  { id: 'model_routing', label: 'Model Routing', keys: ['model_routing'] },
]

export function buildSections(config: ConfigShape): SectionDef[] {
  const seen = new Set<string>()
  const sections: SectionDef[] = []
  for (const g of SECTION_GROUPS) {
    const present = g.keys.filter((k) => k in config)
    if (present.length === 0) continue
    sections.push({ ...g, keys: present })
    for (const k of present) seen.add(k)
  }
  const extras = Object.keys(config).filter((k) => !seen.has(k))
  if (extras.length > 0) {
    sections.push({ id: 'other', label: 'Other', keys: extras })
  }
  return sections
}

// ---------- diff renderer ----------

/**
 * Walk both trees and emit one entry per leaf where the JSON-encoded
 * value differs. Leaves are anything that isn't a plain object: arrays
 * and primitives both get a single diff row, which keeps the sheet
 * readable for the kinds of values this config holds.
 */
export function diffConfig(
  loaded: unknown,
  draft: unknown,
  path: ReadonlyArray<string | number> = [],
): ConfigDiff[] {
  if (isPlainObject(loaded) || isPlainObject(draft)) {
    const a = isPlainObject(loaded) ? loaded : {}
    const b = isPlainObject(draft) ? draft : {}
    const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
    const out: ConfigDiff[] = []
    for (const k of keys) {
      out.push(...diffConfig(a[k], b[k], [...path, k]))
    }
    return out
  }
  if (JSON.stringify(loaded) !== JSON.stringify(draft)) {
    return [{ path, old: loaded, next: draft }]
  }
  return []
}

export function DiffList({ diffs }: { diffs: ConfigDiff[] }) {
  if (diffs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground" data-slot="diff-empty">
        No changes to save.
      </p>
    )
  }
  return (
    <ul
      className="flex flex-col gap-2 px-4 pb-2 text-sm"
      data-slot="diff-list"
    >
      {diffs.map((d) => {
        const key = pathKey(d.path)
        return (
          <li
            key={key}
            className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2"
            data-slot="diff-item"
            data-testid={`diff-${key}`}
          >
            <div className="font-mono text-[12px] text-foreground">
              {formatZodPath(d.path)}
              <span className="ml-1 text-muted-foreground">({key})</span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]">
              <span className="text-muted-foreground">old</span>
              <code className="break-all font-mono text-[11px] text-status-error">
                {formatScalar(d.old)}
              </code>
              <span className="text-muted-foreground">new</span>
              <code className="break-all font-mono text-[11px] text-status-ok">
                {formatScalar(d.next)}
              </code>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
