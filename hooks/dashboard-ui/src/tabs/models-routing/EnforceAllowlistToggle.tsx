import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { saveConfig } from '@/lib/api'
import { formatApiErrorInline } from '@/lib/api-error'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readEnforceAllowlist(config: unknown): boolean {
  if (!isObject(config) || !isObject(config.model_routing)) return false
  return config.model_routing.enforce_allowlist === true
}

type EnforceAllowlistToggleProps = {
  config: unknown
  onSaved?: () => void
}

export function EnforceAllowlistToggle({ config, onSaved }: EnforceAllowlistToggleProps) {
  const current = readEnforceAllowlist(config)
  const [saving, setSaving] = useState(false)

  const handleToggle = useCallback(async () => {
    if (!isObject(config)) {
      toast.error('Config not loaded')
      return
    }
    setSaving(true)
    const next = !current
    // POST /config validates the FULL config and writes the project-scoped
    // .cursor/oh-my-cursor.jsonc — merge the new flag into the loaded config so
    // no other slice is dropped. No new endpoint: reuses saveConfig (POST /config).
    const existingRouting = isObject(config.model_routing) ? config.model_routing : {}
    const draft = {
      ...config,
      model_routing: { ...existingRouting, enforce_allowlist: next },
    }
    const r = await saveConfig(draft)
    setSaving(false)
    if (!r.ok) {
      toast.error(`Save failed: ${formatApiErrorInline(r.error)}`)
      return
    }
    toast.success(`Allowlist enforcement ${next ? 'enabled' : 'disabled'}`)
    onSaved?.()
  }, [config, current, onSaved])

  return (
    <Card data-slot="enforce-allowlist-toggle">
      <CardHeader>
        <CardTitle className="text-sm">Model Allowlist Enforcement</CardTitle>
      </CardHeader>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <label htmlFor="enforce-allowlist" className="text-sm font-medium">
            Enforce model allowlist (remap invalid → default)
          </label>
          <p className="text-[12px] text-muted-foreground">
            When on, out-of-allowlist models for curated agents are remapped to the
            agent&apos;s default (never denied). Default is OFF.
          </p>
        </div>
        <Button
          id="enforce-allowlist"
          size="sm"
          variant={current ? 'default' : 'outline'}
          role="switch"
          aria-checked={current}
          aria-label="Enforce model allowlist (remap invalid to default)"
          onClick={() => void handleToggle()}
          disabled={saving}
          data-testid="enforce-allowlist-toggle"
        >
          {saving ? 'Saving…' : current ? 'On' : 'Off'}
        </Button>
      </CardContent>
    </Card>
  )
}
