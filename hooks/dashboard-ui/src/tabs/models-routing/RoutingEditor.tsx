import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type AgentOverride,
  type AgentOverridesTarget,
  saveAgentOverrides,
} from '@/lib/api'
import { formatApiErrorInline } from '@/lib/api-error'

const INHERIT = 'inherit'

type RoutingEditorProps = {
  models: string[]
  agents: string[]
  initialOverrides: Record<string, AgentOverride>
  onSaved?: () => void
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; banner: string; agent: string | null }

function emptyOverride(): AgentOverride {
  return { fallback_models: [], disable: false }
}

function normalizeOverride(value: AgentOverride | undefined): AgentOverride {
  return {
    model: value?.model,
    fallback_models: Array.isArray(value?.fallback_models) ? [...value!.fallback_models] : [],
    disable: value?.disable === true,
  }
}

function isDefault(o: AgentOverride): boolean {
  return !o.model && o.fallback_models.length === 0 && !o.disable
}

function sameOverride(a: AgentOverride, b: AgentOverride): boolean {
  return (
    (a.model ?? '') === (b.model ?? '') &&
    a.disable === b.disable &&
    a.fallback_models.length === b.fallback_models.length &&
    a.fallback_models.every((m, i) => m === b.fallback_models[i])
  )
}

function buildRows(
  agents: string[],
  overrides: Record<string, AgentOverride>,
): Record<string, AgentOverride> {
  const names = new Set<string>([...agents, ...Object.keys(overrides)])
  const rows: Record<string, AgentOverride> = {}
  for (const name of names) {
    rows[name] = normalizeOverride(overrides[name])
  }
  return rows
}

export function RoutingEditor({ models, agents, initialOverrides, onSaved }: RoutingEditorProps) {
  const [target, setTarget] = useState<AgentOverridesTarget>('project')
  const [rows, setRows] = useState<Record<string, AgentOverride>>(() =>
    buildRows(agents, initialOverrides),
  )
  const [save, setSave] = useState<SaveState>({ status: 'idle' })

  const baseline = useMemo(() => buildRows(agents, initialOverrides), [agents, initialOverrides])
  const sortedAgents = useMemo(() => Object.keys(rows).sort((a, b) => a.localeCompare(b)), [rows])

  const dirty = useMemo(
    () => sortedAgents.some((name) => !sameOverride(rows[name]!, baseline[name] ?? emptyOverride())),
    [sortedAgents, rows, baseline],
  )

  const updateRow = useCallback(
    (agent: string, patch: Partial<AgentOverride>) => {
      setRows((prev) => ({ ...prev, [agent]: { ...prev[agent]!, ...patch } }))
      setSave({ status: 'idle' })
    },
    [],
  )

  const setModel = useCallback(
    (agent: string, value: string) => {
      updateRow(agent, { model: value === INHERIT ? undefined : value })
    },
    [updateRow],
  )

  const addFallback = useCallback(
    (agent: string, model: string) => {
      setRows((prev) => {
        const row = prev[agent]!
        if (row.fallback_models.includes(model)) return prev
        return { ...prev, [agent]: { ...row, fallback_models: [...row.fallback_models, model] } }
      })
      setSave({ status: 'idle' })
    },
    [],
  )

  const removeFallback = useCallback(
    (agent: string, model: string) => {
      setRows((prev) => {
        const row = prev[agent]!
        return {
          ...prev,
          [agent]: { ...row, fallback_models: row.fallback_models.filter((m) => m !== model) },
        }
      })
      setSave({ status: 'idle' })
    },
    [],
  )

  const toggleDisable = useCallback(
    (agent: string) => {
      setRows((prev) => {
        const row = prev[agent]!
        return { ...prev, [agent]: { ...row, disable: !row.disable } }
      })
      setSave({ status: 'idle' })
    },
    [],
  )

  const handleReset = useCallback(() => {
    setRows(buildRows(agents, initialOverrides))
    setSave({ status: 'idle' })
  }, [agents, initialOverrides])

  const handleSave = useCallback(async () => {
    setSave({ status: 'saving' })
    const payload: Record<string, AgentOverride> = {}
    for (const agent of sortedAgents) {
      const row = rows[agent]!
      const wasPresent = agent in initialOverrides
      if (!wasPresent && isDefault(row)) continue
      const entry: AgentOverride = {
        fallback_models: row.fallback_models,
        disable: row.disable,
      }
      if (row.model) entry.model = row.model
      payload[agent] = entry
    }

    const r = await saveAgentOverrides({ target, agent_overrides: payload })
    if (!r.ok) {
      if (r.error.kind === 'http' && r.error.status === 400) {
        const body = r.error.body as { error?: unknown } | undefined
        const message = typeof body?.error === 'string' ? body.error : 'Validation failed'
        const match = message.match(/agent_overrides\.([^.\s]+)/)
        setSave({ status: 'error', banner: message, agent: match?.[1] ?? null })
      } else {
        setSave({ status: 'error', banner: formatApiErrorInline(r.error), agent: null })
      }
      return
    }

    for (const w of r.data.warnings ?? []) {
      toast.warning(w)
    }
    toast.success(`Saved to ${r.data.path}`)
    setSave({ status: 'idle' })
    onSaved?.()
  }, [sortedAgents, rows, initialOverrides, target, onSaved])

  const saving = save.status === 'saving'
  const errorAgent = save.status === 'error' ? save.agent : null

  return (
    <Card data-slot="routing-editor">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Agent Routing</span>
          <div className="flex items-center gap-2">
            <label htmlFor="routing-target" className="text-xs text-muted-foreground">
              Target
            </label>
            <Select
              value={target}
              onValueChange={(v) => setTarget(v as AgentOverridesTarget)}
              disabled={saving}
            >
              <SelectTrigger id="routing-target" size="sm" data-testid="routing-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={!dirty || saving}
              data-testid="routing-reset"
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              data-testid="routing-save"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {save.status === 'error' && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
            data-testid="routing-error-banner"
          >
            <p className="font-medium">Save failed</p>
            <p className="text-[12px]">{save.banner}</p>
          </div>
        )}

        {sortedAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-slot="routing-empty">
            No agents to configure.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Agent</TableHead>
                <TableHead className="w-56">Current model</TableHead>
                <TableHead>Fallback chain</TableHead>
                <TableHead className="w-28 text-right">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAgents.map((agent) => (
                <AgentRoutingRow
                  key={agent}
                  agent={agent}
                  override={rows[agent]!}
                  models={models}
                  invalid={errorAgent === agent}
                  disabled={saving}
                  onModelChange={(v) => setModel(agent, v)}
                  onAddFallback={(m) => addFallback(agent, m)}
                  onRemoveFallback={(m) => removeFallback(agent, m)}
                  onToggleDisable={() => toggleDisable(agent)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

type AgentRoutingRowProps = {
  agent: string
  override: AgentOverride
  models: string[]
  invalid: boolean
  disabled: boolean
  onModelChange: (value: string) => void
  onAddFallback: (model: string) => void
  onRemoveFallback: (model: string) => void
  onToggleDisable: () => void
}

function AgentRoutingRow({
  agent,
  override,
  models,
  invalid,
  disabled,
  onModelChange,
  onAddFallback,
  onRemoveFallback,
  onToggleDisable,
}: AgentRoutingRowProps) {
  const modelOptions = useMemo(() => {
    const set = new Set<string>(models)
    if (override.model) set.add(override.model)
    return [INHERIT, ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [models, override.model])

  const fallbackChoices = useMemo(
    () => models.filter((m) => !override.fallback_models.includes(m) && m !== override.model),
    [models, override.fallback_models, override.model],
  )

  return (
    <TableRow data-state={override.disable ? 'selected' : undefined} data-testid={`routing-row-${agent}`}>
      <TableCell className="font-mono font-medium">{agent}</TableCell>
      <TableCell>
        <Select
          value={override.model ?? INHERIT}
          onValueChange={onModelChange}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-full"
            size="sm"
            aria-invalid={invalid || undefined}
            aria-label={`Model for ${agent}`}
            data-testid={`routing-model-${agent}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m) => (
              <SelectItem key={m} value={m} className="font-mono">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-wrap items-center gap-1.5">
          {override.fallback_models.map((m, i) => (
            <Badge key={m} variant="secondary" className="gap-1 font-mono">
              <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              {m}
              <button
                type="button"
                aria-label={`Remove ${m} from ${agent} fallback chain`}
                className="ml-0.5 rounded-sm hover:text-destructive focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onRemoveFallback(m)}
                disabled={disabled}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          {fallbackChoices.length > 0 ? (
            <Select value="" onValueChange={onAddFallback} disabled={disabled}>
              <SelectTrigger
                size="sm"
                className="h-6 border-dashed text-xs"
                aria-label={`Add fallback model for ${agent}`}
                data-testid={`routing-fallback-add-${agent}`}
              >
                <SelectValue placeholder="+ Add" />
              </SelectTrigger>
              <SelectContent>
                {fallbackChoices.map((m) => (
                  <SelectItem key={m} value={m} className="font-mono">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : override.fallback_models.length === 0 ? (
            <span className="text-xs text-muted-foreground">none</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant={override.disable ? 'destructive' : 'outline'}
          aria-pressed={override.disable}
          onClick={onToggleDisable}
          disabled={disabled}
          data-testid={`routing-disable-${agent}`}
        >
          {override.disable ? 'Disabled' : 'Enabled'}
        </Button>
      </TableCell>
    </TableRow>
  )
}
