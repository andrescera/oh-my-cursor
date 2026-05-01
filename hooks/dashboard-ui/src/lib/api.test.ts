import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as api from './api'

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(window as unknown as { OMC_DAEMON_PORT?: number }).OMC_DAEMON_PORT = 27847
  mockFetch = vi.fn()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete (window as unknown as { OMC_DAEMON_PORT?: number }).OMC_DAEMON_PORT
})

function ok(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('base URL resolution', () => {
  test('falls back to 27847 when window.OMC_DAEMON_PORT is missing', async () => {
    delete (window as unknown as { OMC_DAEMON_PORT?: number }).OMC_DAEMON_PORT
    mockFetch.mockResolvedValueOnce(ok({ uptime: 1 }))
    await api.getHealth()
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^http:\/\/localhost:27847\//)
  })

  test('uses runtime port when present', async () => {
    ;(window as unknown as { OMC_DAEMON_PORT?: number }).OMC_DAEMON_PORT = 27999
    mockFetch.mockResolvedValueOnce(ok({ uptime: 1 }))
    await api.getHealth()
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^http:\/\/localhost:27999\//)
  })

  test('non-numeric port falls back to 27847', async () => {
    ;(window as unknown as { OMC_DAEMON_PORT?: unknown }).OMC_DAEMON_PORT = 'nope'
    mockFetch.mockResolvedValueOnce(ok({ uptime: 1 }))
    await api.getHealth()
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^http:\/\/localhost:27847\//)
  })
})

describe('getHealth', () => {
  test('200 → ok', async () => {
    mockFetch.mockResolvedValueOnce(ok({ uptime: 5 }))
    const r = await api.getHealth()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual({ uptime: 5 })
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/health(\?|$)/)
  })

  test('500 → error.kind="http"', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const r = await api.getHealth()
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('http')
      if (r.error.kind === 'http') expect(r.error.status).toBe(500)
    }
  })

  test('network error → error.kind="network"', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('boom'))
    const r = await api.getHealth()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })

  test('passes conversationId as query param', async () => {
    mockFetch.mockResolvedValueOnce(ok({ uptime: 5 }))
    await api.getHealth('conv-123')
    expect(String(mockFetch.mock.calls[0][0])).toContain('conversationId=conv-123')
  })

  test('omits conversationId when undefined', async () => {
    mockFetch.mockResolvedValueOnce(ok({ uptime: 5 }))
    await api.getHealth()
    expect(String(mockFetch.mock.calls[0][0])).not.toContain('conversationId=')
  })
})

describe('getSessions', () => {
  test('200 → ok', async () => {
    mockFetch.mockResolvedValueOnce(ok([{ id: 'sess-1' }]))
    const r = await api.getSessions()
    expect(r.ok).toBe(true)
    if (r.ok) expect(Array.isArray(r.data)).toBe(true)
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/sessions$/)
  })

  test('500 → http error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.getSessions()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('http')
  })

  test('network failure → network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('down'))
    const r = await api.getSessions()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('getSessionLog', () => {
  test('passes limit and session in query', async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    await api.getSessionLog({ limit: 50, session: 'sess-1' })
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('/session-log')
    expect(url).toContain('limit=50')
    expect(url).toContain('session=sess-1')
  })

  test('omits undefined params', async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    await api.getSessionLog()
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).not.toContain('limit=')
    expect(url).not.toContain('session=')
  })

  test('http error returned as error result', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 503 }))
    const r = await api.getSessionLog()
    expect(r.ok).toBe(false)
    if (!r.ok && r.error.kind === 'http') expect(r.error.status).toBe(503)
  })

  test('network failure → network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.getSessionLog({ limit: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('clearSessionLog', () => {
  test('uses POST and passes sessionId in query', async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: 'cleared' }))
    await api.clearSessionLog({ sessionId: 'sess-1' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(['DELETE', 'POST']).toContain(init?.method ?? 'GET')
    expect(String(url)).toContain('/session-log/clear')
    expect(String(url)).toContain('sessionId=sess-1')
  })

  test('passes conversationId in query when provided', async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: 'cleared' }))
    await api.clearSessionLog({ conversationId: 'conv-9' })
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('conversationId=conv-9')
  })

  test('http 5xx → error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.clearSessionLog({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('http')
  })

  test('network failure → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.clearSessionLog({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('getConfig', () => {
  test('GETs /config and returns ok', async () => {
    mockFetch.mockResolvedValueOnce(ok({ enabled: true }))
    const r = await api.getConfig()
    expect(r.ok).toBe(true)
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/config(\?|$)/)
  })

  test('500 → error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.getConfig()
    expect(r.ok).toBe(false)
  })

  test('network failure → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.getConfig()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('getFullConfig', () => {
  test('GETs /config/full', async () => {
    mockFetch.mockResolvedValueOnce(ok({}))
    const r = await api.getFullConfig()
    expect(r.ok).toBe(true)
    expect(String(mockFetch.mock.calls[0][0])).toContain('/config/full')
  })

  test('500 → error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.getFullConfig()
    expect(r.ok).toBe(false)
  })

  test('network failure → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.getFullConfig()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('saveConfig', () => {
  test('POSTs draft as JSON body to /config', async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: 'saved' }))
    const draft = { daemon: { port: 27999 } }
    await api.saveConfig(draft)
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toMatch(/\/config(\?|$)/)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify(draft))
    expect((init?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json')
  })

  test('400 with JSON body → error.body parsed', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Validation failed',
          issues: [{ path: ['daemon', 'port'], message: 'must be...' }],
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const r = await api.saveConfig({})
    expect(r.ok).toBe(false)
    if (!r.ok && r.error.kind === 'http') {
      expect(r.error.status).toBe(400)
      expect(r.error.body).toMatchObject({ error: 'Validation failed' })
    }
  })

  test('network error → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('down'))
    const r = await api.saveConfig({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('getBackgroundTasks', () => {
  test('200 → ok', async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    const r = await api.getBackgroundTasks()
    expect(r.ok).toBe(true)
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/backgroundTasks$/)
  })

  test('http error → error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.getBackgroundTasks()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('http')
  })

  test('network failure → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.getBackgroundTasks()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('getAgentHistory', () => {
  test('passes limit query param', async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    await api.getAgentHistory({ limit: 20 })
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).toContain('/agentHistory')
    expect(url).toContain('limit=20')
  })

  test('omits limit when undefined', async () => {
    mockFetch.mockResolvedValueOnce(ok([]))
    await api.getAgentHistory()
    const url = String(mockFetch.mock.calls[0][0])
    expect(url).not.toContain('limit=')
  })

  test('http error → error', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 500 }))
    const r = await api.getAgentHistory()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('http')
  })

  test('network failure → error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'))
    const r = await api.getAgentHistory()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('network')
  })
})

describe('parse error path', () => {
  test('200 with non-JSON body → error.kind="parse"', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const r = await api.getHealth()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('parse')
  })
})
