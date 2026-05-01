import { cn } from '@/lib/utils'

/**
 * Hand-rolled inline-SVG sparkline. Renders a single-stroke polyline normalized
 * to a 100×100 viewBox so the host can size it via Tailwind utilities. We keep
 * this in-tree (rather than pulling a chart lib) because the W2.2 plan caps
 * dashboard sparklines at this fidelity — see plan §P2-4.
 *
 * - Fewer than 2 samples → render an aria-hidden empty placeholder so the
 *   surrounding flex/grid keeps its rhythm without showing a flat line.
 * - Stroke uses `currentColor`; consumers tint with `text-chart-1`, etc.
 * - `vectorEffect="non-scaling-stroke"` keeps the line crisp regardless of
 *   container aspect ratio (we squish via `preserveAspectRatio="none"`).
 */
export function Sparkline({
  data,
  className,
  ariaLabel,
}: {
  data: number[]
  className?: string
  ariaLabel?: string
}) {
  if (data.length < 2) {
    return (
      <span
        data-testid="sparkline-empty"
        className={cn('inline-block', className)}
        aria-hidden="true"
      />
    )
  }
  const max = Math.max(...data, 1)
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`)
    .join(' ')
  return (
    <svg
      data-testid="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn('overflow-visible', className)}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
