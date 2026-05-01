import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import ConfigTab, {
  diffConfig,
  formatZodPath,
} from './ConfigTab'
import { _resetForTests } from '@/store/dashboard'

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

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
  continuation: { cooldown_ms: 5000, max_failures: 5, backoff_multiplier: 2 },
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
  mockFetch = vi.fn()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('formatZodPath', () => {
  test('humanizes the spec example', () => {
    expect(formatZodPath(['daemon', 'port'])).toBe('Daemon port')
  })

  test('replaces underscores with spaces and title-cases the head', () => {
    expect(
      formatZodPath(['safety', 'continuation', 'max_wallclock_ms']),
    ).toBe('Safety continuation max wallclock ms')
  })

  test('renders numeric indices as #N', () => {
    expect(formatZodPath(['disabled_hooks', 0])).toBe('Disabled hooks #0')
  })

  test('handles an empty path', () => {
    expect(formatZodPath([])).toBe('Config')
  })
})

describe('diffConfig', () => {
  test('returns empty array when configs match', () => {
    const a = { daemon: { port: 27847 }, version: 1 }
    expect(diffConfig(a, structuredClone(a))).toEqual([])
  })

  test('reports nested scalar changes with full paths', () => {
    const loaded = { daemon: { port: 27847, mcp_port: 27848 } }
    const draft = { daemon: { port: 27999, mcp_port: 27848 } }
    const diffs = diffConfig(loaded, draft)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.path).toEqual(['daemon', 'port'])
    expect(diffs[0]!.old).toBe(27847)
    expect(diffs[0]!.next).toBe(27999)
  })

  test('treats arrays as a single leaf', () => {
    const loaded = { disabled_hooks: ['/a'] }
    const draft = { disabled_hooks: ['/a', '/b'] }
    const diffs = diffConfig(loaded, draft)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.path).toEqual(['disabled_hooks'])
  })
})

describe('ConfigTab: rendering', () => {
  test('renders the sidebar nav with sections derived from /config/full', () => {
    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)
    const tablist = screen.getByRole('tablist', {
      name: /configuration sections/i,
    })
    expect(tablist).toBeInTheDocument()
    // Daemon, Subagent Limits, etc.: at least these are present.
    expect(within(tablist).getByText('Daemon')).toBeInTheDocument()
    expect(within(tablist).getByText('Subagent Limits')).toBeInTheDocument()
    expect(within(tablist).getByText('Hooks & Agents')).toBeInTheDocument()
  })

  test('every input has an associated label (P0-6)', () => {
    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)
    // First section should be General. Switch to Daemon to exercise number inputs.
    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    // Either has htmlFor pairing or wrapping label; we assert htmlFor pairing.
    const labels = document.querySelectorAll(
      `label[for="${portInput.id}"]`,
    )
    expect(labels.length).toBeGreaterThan(0)
  })

  test('arrow keys move sidebar selection (P2-10)', () => {
    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)
    const tablist = screen.getByRole('tablist', {
      name: /configuration sections/i,
    })
    const generalTab = within(tablist).getByRole('tab', { name: 'General' })
    generalTab.focus()
    fireEvent.keyDown(tablist, { key: 'ArrowDown' })
    const daemonTab = within(tablist).getByRole('tab', { name: 'Daemon' })
    expect(daemonTab.getAttribute('aria-selected')).toBe('true')
  })
})

describe('ConfigTab: edit + save flow', () => {
  test('editing a number, opening diff sheet, and confirming POSTs to saveConfig', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'saved', path: '/tmp/oh-my-cursor.jsonc' }))

    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)

    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    fireEvent.change(portInput, { target: { value: '27999' } })

    fireEvent.click(screen.getByTestId('config-save'))

    // Diff sheet opens with old → new for daemon.port.
    const diffItem = await screen.findByTestId('diff-daemon.port')
    expect(diffItem).toBeInTheDocument()
    expect(diffItem.textContent).toContain('27847')
    expect(diffItem.textContent).toContain('27999')

    fireEvent.click(screen.getByTestId('diff-confirm'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    const [url, init] = mockFetch.mock.calls[0]!
    expect(String(url)).toMatch(/\/config(\?|$)/)
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body.daemon.port).toBe(27999)

    expect(
      await screen.findByTestId('config-saved-details'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('/tmp/oh-my-cursor.jsonc'),
    ).toBeInTheDocument()
  })

  test('cancel in the diff sheet preserves the draft (P1-6)', async () => {
    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)

    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    fireEvent.change(portInput, { target: { value: '27999' } })

    fireEvent.click(screen.getByTestId('config-save'))
    await screen.findByTestId('diff-daemon.port')
    fireEvent.click(screen.getByTestId('diff-cancel'))

    // No POST happened.
    expect(mockFetch).not.toHaveBeenCalled()
    // Draft is still dirty: Save button enabled, port input still 27999.
    expect(
      (screen.getByTestId('config-input-daemon.port') as HTMLInputElement).value,
    ).toBe('27999')
    expect(
      (screen.getByTestId('config-save') as HTMLButtonElement).disabled,
    ).toBe(false)
  })

  test('Reset reverts the draft to the loaded snapshot', () => {
    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)
    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    fireEvent.change(portInput, { target: { value: '27999' } })
    fireEvent.click(screen.getByTestId('config-reset'))
    expect(
      (screen.getByTestId('config-input-daemon.port') as HTMLInputElement).value,
    ).toBe('27847')
    expect(
      (screen.getByTestId('config-save') as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('ConfigTab: error handling', () => {
  test('400 with Zod issues renders human-readable banner and field error', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Validation failed',
          issues: [
            {
              path: ['daemon', 'port'],
              message: 'must be between 1024 and 65535',
              code: 'too_small',
            },
          ],
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)

    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    // Set out-of-range port value to make it dirty.
    fireEvent.change(portInput, { target: { value: '80' } })
    fireEvent.click(screen.getByTestId('config-save'))
    await screen.findByTestId('diff-daemon.port')

    await act(async () => {
      fireEvent.click(screen.getByTestId('diff-confirm'))
    })

    const banner = await screen.findByTestId('config-error-banner')
    expect(banner.textContent).toContain(
      'Daemon port: must be between 1024 and 65535',
    )
    // Field is marked invalid.
    expect(
      screen
        .getByTestId('config-input-daemon.port')
        .getAttribute('aria-invalid'),
    ).toBe('true')
    // Raw zod path array is NOT exposed in user-facing copy.
    expect(banner.textContent).not.toContain('["daemon","port"]')
  })

  test('non-400 http error surfaces describeError text', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 503 }))

    render(<ConfigTab initialConfig={FIXTURE_CONFIG} />)
    fireEvent.click(screen.getByTestId('config-section-daemon'))
    const portInput = screen.getByTestId(
      'config-input-daemon.port',
    ) as HTMLInputElement
    fireEvent.change(portInput, { target: { value: '27999' } })
    fireEvent.click(screen.getByTestId('config-save'))
    await screen.findByTestId('diff-daemon.port')

    await act(async () => {
      fireEvent.click(screen.getByTestId('diff-confirm'))
    })

    const banner = await screen.findByTestId('config-error-banner')
    expect(banner.textContent).toMatch(/Daemon returned 503/)
  })
})

describe('ConfigTab: initial fetch', () => {
  test('GETs /config/full on mount and renders the daemon section', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(FIXTURE_CONFIG))

    render(<ConfigTab />)

    await screen.findByRole('tablist', { name: /configuration sections/i })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(String(mockFetch.mock.calls[0]![0])).toMatch(/\/config\/full/)
  })

  test('error path renders the Retry button', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }))

    render(<ConfigTab />)
    expect(
      await screen.findByRole('button', { name: /retry/i }),
    ).toBeInTheDocument()
  })
})
