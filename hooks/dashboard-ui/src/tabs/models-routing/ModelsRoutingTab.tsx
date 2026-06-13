import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type AgentOverride,
  type ApiError,
  type Introspection,
  getFullConfig,
  getIntrospection,
  saveAgentOverrides,
} from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'

import { EnumViewer, type EnumViewerStatus } from './EnumViewer'
import { InvalidOverrideBanner } from './InvalidOverrideBanner'
import { RoutingEditor } from './RoutingEditor'

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: T }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readOverrides(config: unknown): Record<string, AgentOverride> {
  if (!isObject(config) || !isObject(config.agent_overrides)) return {}
  const out: Record<string, AgentOverride> = {}
  for (const [agent, raw] of Object.entries(config.agent_overrides)) {
    if (!isObject(raw)) continue
    out[agent] = {
      model: typeof raw.model === 'string' ? raw.model : undefined,
      fallback_models: Array.isArray(raw.fallback_models)
        ? raw.fallback_models.filter((m): m is string => typeof m === 'string')
        : [],
      disable: raw.disable === true,
    }
  }
  return out
}

function configChangedStreamUrl(): string {
  const port = typeof window !== 'undefined' ? (window.OMC_DAEMON_PORT ?? 27847) : 27847
  return `http://localhost:${port}/events/stream`
}

export default function ModelsRoutingTab() {
  const [intro, setIntro] = useState<LoadState<Introspection>>({ status: 'loading' })
  const [overrides, setOverrides] = useState<LoadState<Record<string, AgentOverride>>>({
    status: 'loading',
  })
  const [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [fullConfig, setFullConfig] = useState<unknown>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true)
    const [introResult, configResult] = await Promise.all([getIntrospection(), getFullConfig()])
    if (!mounted.current) return
    setIntro(introResult.ok ? { status: 'ready', data: introResult.data } : { status: 'error', error: introResult.error })
    setOverrides(
      configResult.ok
        ? { status: 'ready', data: readOverrides(configResult.data) }
        : { status: 'error', error: configResult.error },
    )
    setFullConfig(configResult.ok ? configResult.data : null)
    setRevision((r) => r + 1)
    setRefreshing(false)
  }, [])

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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    let es: EventSource | null = null
    try {
      es = new EventSource(configChangedStreamUrl())
    } catch {
      return
    }
    const onConfigChanged = () => {
      void load()
    }
    const onIntrospectionUpdated = () => {
      void load()
    }
    es.addEventListener('config-changed', onConfigChanged)
    es.addEventListener('introspection-updated', onIntrospectionUpdated)
    return () => {
      es?.removeEventListener('config-changed', onConfigChanged)
      es?.removeEventListener('introspection-updated', onIntrospectionUpdated)
      es?.close()
    }
  }, [load])

  const enumStatus: EnumViewerStatus =
    intro.status === 'ready' ? 'ready' : intro.status === 'error' ? 'error' : 'loading'

  const introData = intro.status === 'ready' ? intro.data : null
  const introError = intro.status === 'error' ? intro.error : undefined

  return (
    <div className="flex flex-col gap-4 p-3" data-slot="models-routing-tab">
      <EnumViewer
        status={enumStatus}
        data={introData}
        error={introError}
        refreshing={refreshing}
        onRefresh={() => void load()}
      />

      {overrides.status === 'loading' && (
        <div className="flex flex-col gap-2" data-slot="routing-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {overrides.status === 'error' && (
        <div
          className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive"
          role="alert"
          data-slot="routing-load-error"
        >
          <p className="font-medium">{describeApiError(overrides.error).title}</p>
          <p className="text-[12px]">{describeApiError(overrides.error).subtitle}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {overrides.status === 'ready' && (
        <>
          <InvalidOverrideBanner
            config={fullConfig}
            modelsByAgent={introData?.modelsByAgent}
            onReset={async (agent) => {
              await saveAgentOverrides({
                target: 'project',
                agent_overrides: {
                  [agent]: { model: undefined, fallback_models: [], disable: false },
                },
              })
              void load()
            }}
          />
          <RoutingEditor
            key={revision}
            models={introData?.models ?? []}
            agents={introData?.agents ?? []}
            modelsByAgent={introData?.modelsByAgent}
            initialOverrides={overrides.data}
            onSaved={() => void load()}
          />
        </>
      )}
    </div>
  )
}
