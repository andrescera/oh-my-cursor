import { useEffect, useState } from 'react'
import { useConnection } from '@/store/selectors'

function secondsUntil(target: number | null, now: number): number {
  if (target == null) return 0
  return Math.max(0, Math.ceil((target - now) / 1000))
}

export function SseBanner() {
  const { sseStatus, reconnectAt, reconnectAttempt } = useConnection()
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    if (sseStatus === 'connected' || sseStatus === 'idle') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sseStatus])

  if (sseStatus === 'connected' || sseStatus === 'idle') return null

  const message =
    sseStatus === 'reconnecting'
      ? reconnectAt
        ? `Reconnecting in ${secondsUntil(reconnectAt, now)}s${
            reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ''
          }…`
        : `Reconnecting${reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ''}…`
      : sseStatus === 'shutdown'
        ? 'Daemon shut down. Awaiting restart…'
        : 'Disconnected from daemon.'

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sse-banner"
      data-sse-status={sseStatus}
      className="flex items-center gap-2 border-b border-border bg-status-warn/10 px-4 py-1.5 text-xs text-status-warn"
    >
      <span
        aria-hidden
        className="inline-block size-2 animate-pulse rounded-full bg-status-warn"
      />
      <span className="font-medium">{message}</span>
    </div>
  )
}
