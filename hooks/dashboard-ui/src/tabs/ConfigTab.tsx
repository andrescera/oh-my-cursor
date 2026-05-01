/**
 * Config tab — sidebar-nav editor for the daemon's full config (W2.8).
 *
 * Data flow:
 * - Mount: GET `/config/full` (`getFullConfig`). The response is the full
 *   `OhMyCursorConfig` parsed by the daemon (see `hooks/schemas/config.ts`).
 *   The first successful response is captured as `loaded` (snapshot) and
 *   cloned into `draft`.
 * - User edits go to `draft`. Save opens a diff sheet (P1-6); confirm there
 *   POSTs the draft to `/config` (`saveConfig`). On 200 the new value
 *   becomes the snapshot. On 400 the daemon returns Zod issues; we surface
 *   them as field-level errors and a human-readable banner via
 *   `formatZodPath`.
 * - Reset reverts `draft` back to the snapshot.
 *
 * Layout (kills AB-2 — no identical-card grid):
 * - Left: `<nav role="tablist">` with one row per section. Up/Down arrow
 *   keys roving-tabindex through the list, Enter activates.
 * - Right: a flat form for the active section. Each leaf is rendered as a
 *   semantic input + `<label htmlFor>` (P0-6).
 *
 * Sections are derived from the keys of the `/config/full` response so the
 * UI keeps working when the schema grows. Known top-level keys are grouped
 * into ergonomic sections (`Hooks & Agents` bundles `disabled_hooks`,
 * `disabled_agents`, `mcp_allowlist`); any unknown keys land in `Other`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { type ApiError, getFullConfig, saveConfig } from '@/lib/api'
import { useDashboardStore } from '@/store/dashboard'

// ---------- types ----------

export type ZodIssue = {
  path?: ReadonlyArray<string | number>
  message?: string
  code?: string
}

type SaveErrorBody = {
  error?: string
  issues?: ZodIssue[]
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready' }

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved'; path?: string }
  | { status: 'error'; banner: string; issues: ZodIssue[] }

type ConfigShape = Record<string, unknown>

type SectionDef = {
  id: string
  label: string
  /** Top-level keys from `/config/full` that this section owns. */
  keys: string[]
}

// ---------- pure helpers (exported for tests) ----------

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

function pathKey(path: ReadonlyArray<string | number>): string {
  return path.map(String).join('.')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getAtPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
  let cur: unknown = obj
  for (const k of path) {
    if (cur == null) return undefined
    cur = (cur as Record<string | number, unknown>)[k]
  }
  return cur
}

function setAtPath<T>(
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

export type ConfigDiff = {
  path: ReadonlyArray<string | number>
  old: unknown
  next: unknown
}

/**
 * Walk both trees and emit one entry per leaf where the JSON-encoded
 * value differs. Leaves are anything that isn't a plain object — arrays
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

function buildSections(config: ConfigShape): SectionDef[] {
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

// ---------- field rendering ----------

function humanLabel(seg: string): string {
  const s = seg.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function FieldRow({
  path,
  value,
  errorMsg,
  onChange,
}: {
  path: ReadonlyArray<string | number>
  value: unknown
  errorMsg?: string
  onChange: (path: ReadonlyArray<string | number>, value: unknown) => void
}) {
  const id = `cfg-${path.map(String).join('-')}`
  const label = humanLabel(String(path[path.length - 1] ?? ''))
  const fullPath = path.map(String).join('.')
  const aria = errorMsg ? { 'aria-invalid': true } : {}

  if (typeof value === 'boolean') {
    return (
      <div className="flex flex-col gap-1" data-slot="config-field">
        <label
          className="flex items-center gap-2 text-sm"
          htmlFor={id}
        >
          <input
            id={id}
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(path, e.currentTarget.checked)}
            className="size-4 cursor-pointer rounded border border-input"
            data-testid={`config-input-${fullPath}`}
            {...aria}
          />
          <span>{label}</span>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {fullPath}
          </span>
        </label>
        {errorMsg && (
          <p
            className="text-xs text-destructive"
            data-slot="config-field-error"
          >
            {errorMsg}
          </p>
        )}
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <div className="flex flex-col gap-1" data-slot="config-field">
        <label htmlFor={id} className="flex items-baseline justify-between text-sm">
          <span>{label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {fullPath}
          </span>
        </label>
        <Input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const raw = e.currentTarget.value
            const next = raw === '' ? Number.NaN : Number(raw)
            onChange(path, next)
          }}
          data-testid={`config-input-${fullPath}`}
          {...aria}
        />
        {errorMsg && (
          <p
            className="text-xs text-destructive"
            data-slot="config-field-error"
          >
            {errorMsg}
          </p>
        )}
      </div>
    )
  }

  if (typeof value === 'string') {
    return (
      <div className="flex flex-col gap-1" data-slot="config-field">
        <label htmlFor={id} className="flex items-baseline justify-between text-sm">
          <span>{label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {fullPath}
          </span>
        </label>
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(path, e.currentTarget.value)}
          data-testid={`config-input-${fullPath}`}
          {...aria}
        />
        {errorMsg && (
          <p
            className="text-xs text-destructive"
            data-slot="config-field-error"
          >
            {errorMsg}
          </p>
        )}
      </div>
    )
  }

  if (Array.isArray(value)) {
    const allStrings = value.every((v) => typeof v === 'string')
    const allNumbers = value.every((v) => typeof v === 'number')
    if (allStrings) {
      return (
        <div className="flex flex-col gap-1" data-slot="config-field">
          <label htmlFor={id} className="flex items-baseline justify-between text-sm">
            <span>{label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {fullPath} (one per line)
            </span>
          </label>
          <Textarea
            id={id}
            rows={Math.min(8, Math.max(2, value.length + 1))}
            value={value.join('\n')}
            onChange={(e) => {
              const lines = e.currentTarget.value
                .split('\n')
                .map((s) => s)
                .filter((s, i, arr) => !(s === '' && i === arr.length - 1))
              onChange(path, lines)
            }}
            data-testid={`config-input-${fullPath}`}
            {...aria}
          />
          {errorMsg && (
            <p className="text-xs text-destructive" data-slot="config-field-error">
              {errorMsg}
            </p>
          )}
        </div>
      )
    }
    if (allNumbers) {
      return (
        <div className="flex flex-col gap-1" data-slot="config-field">
          <label htmlFor={id} className="flex items-baseline justify-between text-sm">
            <span>{label}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {fullPath} (comma separated)
            </span>
          </label>
          <Input
            id={id}
            type="text"
            value={value.join(', ')}
            onChange={(e) => {
              const parts = e.currentTarget.value
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
              const nums = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n))
              onChange(path, nums)
            }}
            data-testid={`config-input-${fullPath}`}
            {...aria}
          />
          {errorMsg && (
            <p className="text-xs text-destructive" data-slot="config-field-error">
              {errorMsg}
            </p>
          )}
        </div>
      )
    }
  }

  if (isPlainObject(value)) {
    // Record/map style — render as JSON in a textarea so the user can edit
    // free-form key/value entries. Persist parse errors as field errors.
    const json = JSON.stringify(value, null, 2)
    return (
      <div className="flex flex-col gap-1" data-slot="config-field">
        <label htmlFor={id} className="flex items-baseline justify-between text-sm">
          <span>{label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {fullPath} (JSON)
          </span>
        </label>
        <Textarea
          id={id}
          rows={Math.min(10, json.split('\n').length)}
          defaultValue={json}
          onBlur={(e) => {
            try {
              const parsed = JSON.parse(e.currentTarget.value)
              onChange(path, parsed)
            } catch {
              // Leave the previous value in place; banner displays parse error.
            }
          }}
          data-testid={`config-input-${fullPath}`}
          {...aria}
        />
        {errorMsg && (
          <p className="text-xs text-destructive" data-slot="config-field-error">
            {errorMsg}
          </p>
        )}
      </div>
    )
  }

  // Fallback: stringify and disable.
  return (
    <div className="flex flex-col gap-1" data-slot="config-field">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <Input id={id} value={String(value ?? '')} readOnly disabled />
    </div>
  )
}

function renderSectionFields(
  draft: ConfigShape,
  section: SectionDef,
  errorByPath: Map<string, string>,
  onChange: (path: ReadonlyArray<string | number>, value: unknown) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = []

  function walk(node: unknown, path: (string | number)[]): void {
    if (isPlainObject(node)) {
      // Render a small heading for nested sub-objects (path.length >= 2).
      if (path.length >= 2) {
        out.push(
          <h4
            key={`h-${path.join('.')}`}
            className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {humanLabel(String(path[path.length - 1]))}
          </h4>,
        )
      }
      for (const k of Object.keys(node)) {
        walk(node[k], [...path, k])
      }
      return
    }
    const key = pathKey(path)
    out.push(
      <FieldRow
        key={key}
        path={path}
        value={node}
        errorMsg={errorByPath.get(key)}
        onChange={onChange}
      />,
    )
  }

  for (const topKey of section.keys) {
    walk(draft[topKey], [topKey])
  }
  return out
}

// ---------- diff renderer ----------

function formatScalar(v: unknown): string {
  if (v === undefined) return '—'
  if (typeof v === 'string') return v === '' ? '""' : v
  return JSON.stringify(v)
}

function DiffList({ diffs }: { diffs: ConfigDiff[] }) {
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

// ---------- error banner ----------

function describeApiError(err: ApiError): string {
  switch (err.kind) {
    case 'http':
      return `HTTP ${err.status}${err.message ? ` — ${err.message}` : ''}`
    case 'network':
      return `Network error — ${err.message}`
    case 'parse':
      return `Bad response — ${err.message}`
  }
}

function extractIssues(body: unknown): ZodIssue[] {
  if (!isPlainObject(body)) return []
  const issues = (body as SaveErrorBody).issues
  if (!Array.isArray(issues)) return []
  return issues.filter(
    (i): i is ZodIssue => isPlainObject(i),
  )
}

// ---------- props (test seam) ----------

type ConfigTabProps = {
  /**
   * Test seam — when supplied bypasses the network fetch and uses the
   * given object as the loaded snapshot.
   */
  initialConfig?: ConfigShape
}

// ---------- component ----------

export default function ConfigTab(props: ConfigTabProps = {}) {
  const setStoreConfig = useDashboardStore((s) => s.setConfig)

  const [loaded, setLoaded] = useState<ConfigShape | null>(
    props.initialConfig ? structuredClone(props.initialConfig) : null,
  )
  const [draft, setDraft] = useState<ConfigShape | null>(
    props.initialConfig ? structuredClone(props.initialConfig) : null,
  )
  const [fetchState, setFetchState] = useState<FetchState>(() =>
    props.initialConfig ? { status: 'ready' } : { status: 'loading' },
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [activeId, setActiveId] = useState<string | null>(null)
  const tablistRef = useRef<HTMLElement | null>(null)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  const load = useCallback(async () => {
    setFetchState({ status: 'loading' })
    const r = await getFullConfig()
    if (!mounted.current) return
    if (!r.ok) {
      setFetchState({ status: 'error', error: r.error })
      return
    }
    if (!isPlainObject(r.data)) {
      setFetchState({
        status: 'error',
        error: { kind: 'parse', message: 'Unexpected /config/full response shape' },
      })
      return
    }
    const cfg = r.data as ConfigShape
    setLoaded(structuredClone(cfg))
    setDraft(structuredClone(cfg))
    setStoreConfig(cfg)
    setFetchState({ status: 'ready' })
  }, [setStoreConfig])

  useEffect(() => {
    if (props.initialConfig) return
    void load()
  }, [load, props.initialConfig])

  const sections = useMemo(
    () => (draft ? buildSections(draft) : []),
    [draft],
  )

  // Pick a default active section once data lands.
  useEffect(() => {
    if (activeId == null && sections.length > 0) {
      setActiveId(sections[0]!.id)
    }
  }, [activeId, sections])

  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0],
    [sections, activeId],
  )

  const diffs = useMemo<ConfigDiff[]>(
    () => (loaded && draft ? diffConfig(loaded, draft) : []),
    [loaded, draft],
  )

  const errorByPath = useMemo(() => {
    const m = new Map<string, string>()
    if (save.status === 'error') {
      for (const issue of save.issues) {
        if (Array.isArray(issue.path)) {
          m.set(pathKey(issue.path), issue.message ?? 'Invalid value')
        }
      }
    }
    return m
  }, [save])

  const onChange = useCallback(
    (path: ReadonlyArray<string | number>, value: unknown) => {
      setDraft((d) => (d ? setAtPath(d, path, value) : d))
    },
    [],
  )

  const handleReset = useCallback(() => {
    if (!loaded) return
    setDraft(structuredClone(loaded))
    setSave({ status: 'idle' })
  }, [loaded])

  const handleConfirmSave = useCallback(async () => {
    if (!draft) return
    setSave({ status: 'saving' })
    const r = await saveConfig(draft)
    if (!mounted.current) return
    if (!r.ok) {
      if (r.error.kind === 'http' && r.error.status === 400) {
        const issues = extractIssues(r.error.body)
        const banner =
          issues.length > 0
            ? issues
                .map((i) =>
                  i.path
                    ? `${formatZodPath(i.path)}: ${i.message ?? 'invalid'}`
                    : (i.message ?? 'Invalid value'),
                )
                .join('\n')
            : describeApiError(r.error)
        setSave({ status: 'error', banner, issues })
      } else {
        setSave({
          status: 'error',
          banner: describeApiError(r.error),
          issues: [],
        })
      }
      setSheetOpen(false)
      return
    }
    const data = isPlainObject(r.data) ? r.data : {}
    const savedPath = typeof data.path === 'string' ? data.path : undefined
    setLoaded(structuredClone(draft))
    setStoreConfig(draft)
    setSave({ status: 'saved', path: savedPath })
    setSheetOpen(false)
  }, [draft, setStoreConfig])

  const dirty = diffs.length > 0

  // Keyboard handler for the sidebar tablist (P2-10).
  const handleNavKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (sections.length === 0) return
      const idx = Math.max(
        0,
        sections.findIndex((s) => s.id === activeId),
      )
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = sections[(idx + 1) % sections.length]!
        setActiveId(next.id)
        focusTab(tablistRef.current, next.id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = sections[(idx - 1 + sections.length) % sections.length]!
        setActiveId(prev.id)
        focusTab(tablistRef.current, prev.id)
      } else if (e.key === 'Home') {
        e.preventDefault()
        const first = sections[0]!
        setActiveId(first.id)
        focusTab(tablistRef.current, first.id)
      } else if (e.key === 'End') {
        e.preventDefault()
        const last = sections[sections.length - 1]!
        setActiveId(last.id)
        focusTab(tablistRef.current, last.id)
      } else if (e.key === 'Enter' || e.key === ' ') {
        // Activate (no-op since selection IS activation, but consume to mirror
        // the WAI-ARIA tablist pattern).
        e.preventDefault()
      }
    },
    [activeId, sections],
  )

  if (fetchState.status === 'error') {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="config-error"
      >
        <p className="text-sm font-medium text-foreground">
          Failed to load configuration.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {describeApiError(fetchState.error)}
        </p>
        <Button onClick={() => void load()} size="sm" variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (fetchState.status === 'loading' || draft == null || activeSection == null) {
    return (
      <div className="grid h-full grid-cols-[200px_1fr] gap-3 p-3" data-slot="config-loading">
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="grid h-full grid-cols-[220px_1fr] gap-4 p-3"
      data-slot="config-tab"
    >
      <nav
        ref={tablistRef as React.RefObject<HTMLElement>}
        role="tablist"
        aria-orientation="vertical"
        aria-label="Configuration sections"
        className="flex h-fit flex-col gap-0.5 rounded-lg border border-border bg-card p-1"
        onKeyDown={handleNavKeyDown}
        data-slot="config-sidebar"
      >
        {sections.map((s) => {
          const isActive = s.id === activeSection.id
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`config-tab-${s.id}`}
              aria-controls={`config-panel-${s.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-testid={`config-section-${s.id}`}
              onClick={() => setActiveId(s.id)}
              className={
                'flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ' +
                (isActive
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground')
              }
            >
              {s.label}
            </button>
          )
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{activeSection.label}</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={!dirty || save.status === 'saving'}
              data-testid="config-reset"
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => setSheetOpen(true)}
              disabled={!dirty || save.status === 'saving'}
              data-testid="config-save"
            >
              Save…
            </Button>
          </div>
        </div>

        {save.status === 'error' && (
          <div
            className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-slot="config-error-banner"
            data-testid="config-error-banner"
          >
            <p className="font-medium">Save failed</p>
            <pre className="whitespace-pre-wrap font-sans text-[12px]">{save.banner}</pre>
          </div>
        )}

        {save.status === 'saved' && (
          <details
            className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            data-slot="config-saved-path"
            data-testid="config-saved-details"
            open
          >
            <summary className="cursor-pointer text-foreground">
              Configuration saved
            </summary>
            <p className="mt-1 break-all font-mono text-[12px] text-muted-foreground">
              {save.path ?? '(path not reported)'}
            </p>
          </details>
        )}

        <section
          id={`config-panel-${activeSection.id}`}
          role="tabpanel"
          aria-labelledby={`config-tab-${activeSection.id}`}
          tabIndex={0}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          data-slot="config-pane"
          data-section={activeSection.id}
        >
          {renderSectionFields(draft, activeSection, errorByPath, onChange)}
        </section>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-md max-w-full">
          <SheetHeader>
            <SheetTitle>Review changes</SheetTitle>
            <SheetDescription>
              {dirty
                ? `${diffs.length} change${diffs.length === 1 ? '' : 's'} pending. Confirm to write to the daemon.`
                : 'Nothing has changed since the last load.'}
            </SheetDescription>
          </SheetHeader>
          <div
            className="overflow-y-auto"
            data-slot="diff-scroll"
            data-testid="diff-scroll"
          >
            <DiffList diffs={diffs} />
          </div>
          <SheetFooter>
            <div className="flex flex-row justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSheetOpen(false)}
                data-testid="diff-cancel"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => void handleConfirmSave()}
                disabled={!dirty || save.status === 'saving'}
                data-testid="diff-confirm"
              >
                {save.status === 'saving' ? 'Saving…' : 'Confirm save'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function focusTab(root: HTMLElement | null, id: string): void {
  if (!root) return
  const el = root.querySelector<HTMLElement>(`#config-tab-${CSS.escape(id)}`)
  el?.focus()
}
