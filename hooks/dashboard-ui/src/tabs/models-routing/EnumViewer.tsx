import { RefreshCwIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type ApiError, type Introspection, type IntrospectionSource } from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import { cn } from '@/lib/utils'

export type EnumViewerStatus = 'loading' | 'error' | 'ready'

type EnumViewerProps = {
  status: EnumViewerStatus
  data: Introspection | null
  error?: ApiError
  refreshing?: boolean
  onRefresh: () => void
}

const SOURCE_STYLE: Record<IntrospectionSource, string> = {
  bundle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  observed: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  fallback: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

const SOURCE_LABEL: Record<IntrospectionSource, string> = {
  bundle: 'bundle',
  observed: 'observed',
  fallback: 'fallback',
}

function formatCachedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function SourceChip({ source }: { source: IntrospectionSource }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-mono', SOURCE_STYLE[source])}
      data-testid="enum-source-chip"
      data-source={source}
    >
      {SOURCE_LABEL[source]}
    </Badge>
  )
}

export function EnumViewer({ status, data, error, refreshing, onRefresh }: EnumViewerProps) {
  return (
    <Card data-slot="enum-viewer">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            Models
            {data ? <SourceChip source={data.source} /> : null}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing || status === 'loading'}
            data-testid="enum-refresh"
            aria-label="Refresh introspection"
          >
            <RefreshCwIcon className={cn('size-3.5', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === 'loading' && (
          <div className="flex flex-wrap gap-2" data-slot="enum-loading">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-24 rounded-4xl" />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div
            className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="enum-error"
          >
            <p className="font-medium">{error ? describeApiError(error).title : 'Failed to load introspection'}</p>
            {error ? <p className="text-[12px]">{describeApiError(error).subtitle}</p> : null}
          </div>
        )}

        {status === 'ready' && data && (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3" data-slot="enum-meta">
              <div className="flex flex-col">
                <dt className="text-muted-foreground">Cursor version</dt>
                <dd className="font-mono text-foreground" data-testid="enum-cursor-version">
                  {data.cursorVersion ?? 'unknown'}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground">Cached at</dt>
                <dd className="font-mono text-foreground" data-testid="enum-cached-at">
                  {formatCachedAt(data.cachedAt)}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-muted-foreground">Agent types</dt>
                <dd className="font-mono text-foreground">{data.agents.length}</dd>
              </div>
            </dl>

            <section className="flex flex-col gap-2" data-slot="enum-models">
              <h3 className="text-xs font-medium text-muted-foreground">
                {data.models.length} model{data.models.length === 1 ? '' : 's'}
              </h3>
              {data.models.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-slot="enum-models-empty">
                  No models reported.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="enum-model-badges">
                  {data.models.map((model) => {
                    const isObserved = data.observedAdditions.includes(model)
                    return (
                      <Badge
                        key={model}
                        variant="outline"
                        className={cn(
                          'font-mono',
                          isObserved ? SOURCE_STYLE.observed : SOURCE_STYLE[data.source],
                        )}
                        data-testid="enum-model-badge"
                        data-observed={isObserved || undefined}
                        title={isObserved ? `${model} (observed at runtime)` : model}
                      >
                        {model}
                      </Badge>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2" data-slot="enum-agents">
              <h3 className="text-xs font-medium text-muted-foreground">
                {data.agents.length} agent type{data.agents.length === 1 ? '' : 's'}
              </h3>
              {data.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-slot="enum-agents-empty">
                  No agent types reported.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="enum-agent-badges">
                  {data.agents.map((agent) => (
                    <Badge key={agent} variant="secondary" className="font-mono">
                      {agent}
                    </Badge>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
