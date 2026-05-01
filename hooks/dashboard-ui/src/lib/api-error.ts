import type { ApiError } from './api'

/**
 * Actionable error copy derived from an `ApiError`. Each error path renders
 * as a two-line block (title + subtitle) so callers can drop it into their
 * own error UI without rebuilding the recovery script. Pair with a Retry
 * button per W1.7's `Result<T>` shape.
 */
export type ErrorCopy = { title: string; subtitle: string }

export function describeApiError(err: ApiError): ErrorCopy {
  switch (err.kind) {
    case 'http': {
      if (err.status >= 500) {
        return {
          title: `Daemon returned ${err.status}`,
          subtitle: 'Retry, or check daemon logs.',
        }
      }
      return {
        title: `Daemon rejected the request (${err.status})`,
        subtitle: err.message
          ? err.message
          : 'Retry, or check daemon logs.',
      }
    }
    case 'network':
      return {
        title: 'Could not reach daemon',
        subtitle: 'Is `oh-my-cursor start` running?',
      }
    case 'parse':
      return {
        title: 'Daemon response was malformed',
        subtitle: 'Retry; if it persists, check daemon version.',
      }
  }
}

export function formatApiErrorInline(err: ApiError): string {
  const c = describeApiError(err)
  return `${c.title}. ${c.subtitle}`
}
