import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ChannelMatrix from './ChannelMatrix'
import { getConfig, type ApiError } from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'
import { useDashboardStore } from '@/store/dashboard'

type HookConfig = { enabled: string[]; disabled: string[] }

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready' }

const EMPTY_ENABLED_COPY = 'No hooks enabled. Edit hooks.json to opt in.'
const EMPTY_DISABLED_COPY = 'All hooks are enabled.'

function isHookConfig(v: unknown): v is HookConfig {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    Array.isArray(r.enabled) &&
    r.enabled.every((x) => typeof x === 'string') &&
    Array.isArray(r.disabled) &&
    r.disabled.every((x) => typeof x === 'string')
  )
}

function HookList({
  hooks,
  tone,
}: {
  hooks: string[]
  tone: 'enabled' | 'disabled'
}) {
  return (
    <ul className="flex flex-col gap-1.5" data-slot="hook-list">
      {hooks.map((hook) => (
        <li
          key={hook}
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 truncate font-mono text-[13px]">
            <span
              aria-hidden="true"
              className={
                tone === 'enabled'
                  ? 'size-1.5 shrink-0 rounded-full bg-emerald-500'
                  : 'size-1.5 shrink-0 rounded-full bg-muted-foreground/40'
              }
            />
            <span className="truncate">{hook}</span>
          </span>
          <Badge variant={tone === 'enabled' ? 'secondary' : 'outline'}>
            {tone === 'enabled' ? 'on' : 'off'}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2" data-slot="hooks-skeleton">
      <Skeleton className="h-4 w-20" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  )
}

export default function HooksTab() {
  const hooks = useDashboardStore((s) => s.data.hooks) as HookConfig | null
  const setHooks = useDashboardStore((s) => s.setHooks)

  const [state, setState] = useState<FetchState>(() =>
    isHookConfig(hooks) ? { status: 'ready' } : { status: 'loading' },
  )

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const r = await getConfig()
    if (!r.ok) {
      setState({ status: 'error', error: r.error })
      return
    }
    if (!isHookConfig(r.data)) {
      setState({
        status: 'error',
        error: { kind: 'parse', message: 'Unexpected /config response shape' },
      })
      return
    }
    setHooks(r.data)
    setState({ status: 'ready' })
  }, [setHooks])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => {
      void load()
    }
    window.addEventListener(TAB_REFRESH_EVENT, handler)
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handler)
  }, [load])

  if (state.status === 'error') {
    const copy = describeApiError(state.error)
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="hooks-error"
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

  const isLoading = state.status === 'loading' && !isHookConfig(hooks)
  const enabled = isHookConfig(hooks) ? hooks.enabled : []
  const disabled = isHookConfig(hooks) ? hooks.disabled : []

  return (
    <div className="flex flex-col gap-3 p-3" data-slot="hooks-tab">
      <div className="grid grid-cols-1 gap-3 min-[500px]:grid-cols-2">
        <Card data-slot="hooks-column-enabled">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Enabled</span>
              {!isLoading && (
                <Badge variant="secondary">{enabled.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ColumnSkeleton />
            ) : enabled.length === 0 ? (
              <p
                className="py-4 text-center text-sm text-muted-foreground"
                data-slot="hooks-empty-enabled"
              >
                {EMPTY_ENABLED_COPY}
              </p>
            ) : (
              <HookList hooks={enabled} tone="enabled" />
            )}
          </CardContent>
        </Card>

        <Card data-slot="hooks-column-disabled">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Disabled</span>
              {!isLoading && (
                <Badge variant="outline">{disabled.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <ColumnSkeleton />
            ) : disabled.length === 0 ? (
              <p
                className="py-4 text-center text-sm text-muted-foreground"
                data-slot="hooks-empty-disabled"
              >
                {EMPTY_DISABLED_COPY}
              </p>
            ) : (
              <HookList hooks={disabled} tone="disabled" />
            )}
          </CardContent>
        </Card>
      </div>

      <ChannelMatrix />
    </div>
  )
}
