import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { InvalidOverrideBanner } from './InvalidOverrideBanner'

const modelsByAgent: Record<string, string[]> = {
  sisyphus: ['gpt-4', 'claude-3'],
  oracle: ['gpt-4'],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('InvalidOverrideBanner', () => {
  test('renders nothing when there are no invalid entries', () => {
    const { container } = render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'gpt-4', fallback_models: ['claude-3'] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('surfaces a banner naming the agent with an invalid model', () => {
    render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'banished-model', fallback_models: [] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    const banner = screen.getByRole('alert')
    expect(banner).toHaveAttribute('data-slot', 'invalid-override-banner')
    expect(banner.textContent).toContain('sisyphus')
    expect(banner.textContent).toContain('banished-model')
  })

  test('flags an invalid fallback model', () => {
    render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'gpt-4', fallback_models: ['ghost-model'] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(screen.getByText(/ghost-model/)).toBeInTheDocument()
  })

  test('detects invalid entries under categories', () => {
    render(
      <InvalidOverrideBanner
        config={{
          categories: {
            oracle: { model: 'claude-3', fallback_models: [] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('oracle')
    expect(banner.textContent).toContain('claude-3')
  })

  test('"Reset to default" calls onReset with the agent name', () => {
    const onReset = vi.fn(async () => {})
    render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'banished-model', fallback_models: [] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={onReset}
      />,
    )
    const button = document.querySelector(
      '.invalid-override-reset[data-agent="sisyphus"]',
    ) as HTMLButtonElement
    expect(button).not.toBeNull()
    fireEvent.click(button)
    expect(onReset).toHaveBeenCalledWith('sisyphus')
  })

  test('"inherit" agent never appears as invalid', () => {
    const { container } = render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            inherit: { model: 'whatever-model', fallback_models: ['another-ghost'] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('a model value of "inherit" is always valid', () => {
    const { container } = render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'inherit', fallback_models: [] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('permissive agent (no modelsByAgent entry) never appears as invalid', () => {
    const { container } = render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            unlisted_agent: { model: 'anything-goes', fallback_models: ['also-fine'] },
          },
        }}
        modelsByAgent={modelsByAgent}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('renders nothing when modelsByAgent is undefined', () => {
    const { container } = render(
      <InvalidOverrideBanner
        config={{
          agent_overrides: {
            sisyphus: { model: 'banished-model', fallback_models: [] },
          },
        }}
        modelsByAgent={undefined}
        onReset={vi.fn(async () => {})}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('renders nothing for non-object config', () => {
    const { container } = render(
      <InvalidOverrideBanner config={null} modelsByAgent={modelsByAgent} onReset={vi.fn(async () => {})} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
