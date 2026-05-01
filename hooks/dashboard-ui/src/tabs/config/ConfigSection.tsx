import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import {
  humanLabel,
  isPlainObject,
  pathKey,
  type ConfigShape,
  type SectionDef,
} from './helpers'

export function FieldRow({
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
    // Record/map style: render as JSON in a textarea so the user can edit
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

export function renderSectionFields(
  draft: ConfigShape,
  section: SectionDef,
  errorByPath: Map<string, string>,
  onChange: (path: ReadonlyArray<string | number>, value: unknown) => void,
): ReactNode[] {
  const out: ReactNode[] = []

  function walk(node: unknown, path: (string | number)[]): void {
    if (isPlainObject(node)) {
      // Render a small heading for nested sub-objects (path.length >= 2).
      // h3 keeps the heading order valid: section title is h2, nested
      // group label is h3; no levels skipped.
      if (path.length >= 2) {
        out.push(
          <h3
            key={`h-${path.join('.')}`}
            className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {humanLabel(String(path[path.length - 1]))}
          </h3>,
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
