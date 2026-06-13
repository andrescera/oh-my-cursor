import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import ChannelMatrix from './ChannelMatrix'
import { TooltipProvider } from '@/components/ui/tooltip'

// The production app wraps the tree in <TooltipProvider> (App.tsx). Radix
// Tooltip throws without that ancestor, so the unit render supplies it.
function renderMatrix() {
  return render(
    <TooltipProvider>
      <ChannelMatrix />
    </TooltipProvider>,
  )
}

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

const SAMPLE_TABLE = [
  {
    event: 'preToolUse',
    cells: {
      permission: { status: 'works', evidenceRef: 'Task 2 probe' },
      updated_input: {
        status: 'works',
        evidenceRef: 'forum 151985',
        threadUrl: 'https://forum.cursor.com/t/151985',
      },
    },
  },
  {
    event: 'postToolUse',
    cells: {
      additional_context: {
        status: 'broken',
        evidenceRef: 'staff thread 155689',
        threadUrl: 'https://forum.cursor.com/t/155689',
      },
    },
  },
  {
    event: 'beforeSubmitPrompt',
    cells: {
      updated_input: { status: 'unsupported', evidenceRef: 'staff thread 158883' },
    },
  },
]

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function routeFetch(handlers: {
  channel?: () => Response
  introspection?: () => Response
}): ReturnType<typeof vi.fn> {
  return vi.fn((input: string) => {
    const u = String(input)
    if (u.includes('/channel-status')) {
      return Promise.resolve(
        handlers.channel ? handlers.channel() : jsonResponse({ table: SAMPLE_TABLE }),
      )
    }
    if (u.includes('/introspection')) {
      return Promise.resolve(
        handlers.introspection
          ? handlers.introspection()
          : jsonResponse({ cursorVersion: '3.7.27' }),
      )
    }
    return Promise.resolve(jsonResponse({}))
  })
}

beforeEach(() => {})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

function findCell(event: string, field: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-slot="channel-cell"][data-event="${event}"][data-field="${field}"]`,
  )
}

describe('ChannelMatrix', () => {
  test('renders the matrix with a status per known cell', async () => {
    mockFetch = routeFetch({})
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderMatrix()

    await waitFor(() => expect(findCell('preToolUse', 'updated_input')).not.toBeNull())

    // preToolUse × updated_input is green/works
    expect(findCell('preToolUse', 'updated_input')?.dataset.status).toBe('works')
    // postToolUse × additional_context is red/broken
    expect(findCell('postToolUse', 'additional_context')?.dataset.status).toBe('broken')
    // beforeSubmitPrompt × updated_input is gray/unsupported
    expect(findCell('beforeSubmitPrompt', 'updated_input')?.dataset.status).toBe(
      'unsupported',
    )
  })

  test('unpopulated cells fall back to unconfirmed', async () => {
    mockFetch = routeFetch({})
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderMatrix()

    await waitFor(() => expect(findCell('preToolUse', 'env')).not.toBeNull())
    expect(findCell('preToolUse', 'env')?.dataset.status).toBe('unconfirmed')
  })

  test('renders the detected cursorVersion in the header', async () => {
    mockFetch = routeFetch({})
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderMatrix()

    expect(await screen.findByText('Cursor 3.7.27')).toBeInTheDocument()
  })

  test('renders matrix even when introspection fails (version unknown)', async () => {
    mockFetch = routeFetch({
      introspection: () => new Response('boom', { status: 500 }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderMatrix()

    expect(await screen.findByText('version unknown')).toBeInTheDocument()
    expect(findCell('postToolUse', 'additional_context')?.dataset.status).toBe('broken')
  })

  test('degrades gracefully when /channel-status returns 500', async () => {
    mockFetch = routeFetch({
      channel: () => new Response('boom', { status: 500 }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderMatrix()

    expect(
      await screen.findByText(/channel matrix unavailable/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
