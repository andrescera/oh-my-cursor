// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import ConfigTab from './ConfigTab'
import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

const FIXTURE_CONFIG = Object.freeze({
  version: 1,
  disabled_hooks: ['/preToolUse'],
  disabled_agents: [],
  subagent_limits: { explore: 6, worker: 8 },
  state_persistence: { enabled: true, path: '/tmp/oh-my-cursor-state' },
  daemon: { port: 27847, mcp_port: 27848 },
  context_collector: { enabled: true, max_context_chars: 50000 },
  compaction: { prompt_enabled: true },
  experimental: { cloud_agents: false, webhooks: false, automations: false },
  mcp_allowlist: ['*'],
  notifications: { enabled: true, sound: false },
  orchestration: { mode: 'native' },
  continuation: {
    cooldown_ms: 5000,
    max_failures: 5,
    backoff_multiplier: 2,
  },
  safety: {
    continuation: {
      max_wallclock_ms: 3_600_000,
      max_consecutive_zero_deltas: 3,
    },
    mcp_llm_review_enabled: true,
  },
  momus: { max_iterations: 4 },
  model_routing: {
    retry_on_errors: [429, 500, 502, 503, 504],
    max_retry_attempts: 3,
    defaults: { explore: 'composer-2-fast', librarian: 'composer-2-fast' },
  },
})

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  cleanup()
})

describe('ConfigTab: axe a11y (W3.1)', () => {
  test('General section render has no axe violations', async () => {
    const { container } = render(
      <ConfigTab initialConfig={FIXTURE_CONFIG} />,
    )
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('Daemon section render has no axe violations', async () => {
    const { container } = render(
      <ConfigTab initialConfig={FIXTURE_CONFIG} />,
    )
    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})
