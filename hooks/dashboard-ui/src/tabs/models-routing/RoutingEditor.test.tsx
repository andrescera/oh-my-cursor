import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { RoutingEditor } from './RoutingEditor'
import type { AgentOverride } from '@/lib/api'

// Radix Select relies on pointer-capture + scrollIntoView APIs that happy-dom
// does not implement. Stub them so the listbox can open in tests.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
})

afterEach(() => {
  cleanup()
})

const MODELS = ['alpha-model', 'beta-model', 'gamma-model']

function renderEditor(initialOverrides: Record<string, AgentOverride> = {}) {
  return render(
    <RoutingEditor
      models={MODELS}
      agents={['curated', 'permissive']}
      modelsByAgent={{ curated: ['alpha-model'] }}
      initialOverrides={initialOverrides}
    />,
  )
}

async function openDropdown(agent: string): Promise<HTMLElement> {
  const trigger = screen.getByTestId(`routing-model-${agent}`)
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  await waitFor(() => {
    expect(screen.queryAllByRole('option').length).toBeGreaterThan(0)
  })
  return trigger
}

describe('RoutingEditor: per-agent constrained model dropdown', () => {
  test('curated agent dropdown shows only allowed models + inherit + current stored', async () => {
    renderEditor({
      curated: { model: 'stale-model', fallback_models: [], disable: false },
    })

    await openDropdown('curated')
    const labels = screen.getAllByRole('option').map((o) => o.textContent)

    expect(labels).toContain('inherit')
    expect(labels).toContain('alpha-model') // allowed for curated
    expect(labels).toContain('stale-model') // current stored, kept even though invalid
    expect(labels).not.toContain('beta-model') // not allowed for curated
    expect(labels).not.toContain('gamma-model')
  })

  test('permissive agent dropdown shows the full model list', async () => {
    renderEditor()

    await openDropdown('permissive')
    const labels = screen.getAllByRole('option').map((o) => o.textContent)

    expect(labels).toContain('inherit')
    expect(labels).toContain('alpha-model')
    expect(labels).toContain('beta-model')
    expect(labels).toContain('gamma-model')
  })

  test('valid-count indicator shows the correct per-agent count', () => {
    renderEditor()

    // curated: constrained to a single allowed model
    expect(screen.getByTestId('routing-valid-count-curated')).toHaveTextContent('1 models valid')
    // permissive: no constraint -> full model list count
    expect(screen.getByTestId('routing-valid-count-permissive')).toHaveTextContent(
      `${MODELS.length} models valid`,
    )
  })
})
