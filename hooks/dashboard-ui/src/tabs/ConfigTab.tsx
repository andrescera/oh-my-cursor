/**
 * Config tab: sidebar-nav editor for the daemon's full config (W2.8).
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
 * Layout (kills AB-2; no identical-card grid):
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
import { describeApiError, formatApiErrorInline } from '@/lib/api-error'
import { useDashboardStore } from '@/store/dashboard'

import { renderSectionFields } from './config/ConfigSection'
import { ConfigSidebar } from './config/ConfigSidebar'
import {
  DiffList,
  buildSections,
  diffConfig,
  extractIssues,
  focusTab,
  formatZodPath,
  isPlainObject,
  pathKey,
  setAtPath,
  type ConfigDiff,
  type ConfigShape,
  type ConfigTabProps,
  type FetchState,
  type SaveState,
  type ZodIssue,
} from './config/helpers'

// Re-export symbols that were originally part of this module's public API.
export type { ZodIssue, ConfigDiff }
export { formatZodPath, diffConfig }

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
            : formatApiErrorInline(r.error)
        setSave({ status: 'error', banner, issues })
      } else {
        setSave({
          status: 'error',
          banner: formatApiErrorInline(r.error),
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
    const copy = describeApiError(fetchState.error)
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="config-error"
      >
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {copy.subtitle}
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
      <ConfigSidebar
        sections={sections}
        activeId={activeSection.id}
        setActiveId={setActiveId}
        onKeyDown={handleNavKeyDown}
        tablistRef={tablistRef}
      />

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
