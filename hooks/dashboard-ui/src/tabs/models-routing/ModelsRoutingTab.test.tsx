import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const getIntrospectionMock = vi.fn()
const getFullConfigMock = vi.fn()

// Mock EventSource to capture listeners
const eventSourceListeners: Record<string, Set<() => void>> = {}
class MockEventSource {
  constructor(public url: string) {}
  addEventListener(event: string, listener: () => void) {
    if (!eventSourceListeners[event]) {
      eventSourceListeners[event] = new Set()
    }
    eventSourceListeners[event].add(listener)
  }
  removeEventListener(event: string, listener: () => void) {
    eventSourceListeners[event]?.delete(listener)
  }
  close() {}
}

vi.stubGlobal('EventSource', MockEventSource as any)

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getIntrospection: (...args: unknown[]) => getIntrospectionMock(...args),
    getFullConfig: (...args: unknown[]) => getFullConfigMock(...args),
  }
})

import ModelsRoutingTab from './ModelsRoutingTab'

beforeEach(() => {
  Object.keys(eventSourceListeners).forEach((key) => {
    eventSourceListeners[key].clear()
  })
  getIntrospectionMock.mockReset()
  getFullConfigMock.mockReset()
  getIntrospectionMock.mockResolvedValue({
    ok: true,
    data: {
      models: ['gpt-4', 'claude-3'],
      agents: ['sisyphus', 'oracle'],
      source: 'bundle',
      cursorVersion: '0.42.0',
      cachedAt: '2025-06-13T10:00:00Z',
      observedAdditions: [],
      modelsByAgent: {
        sisyphus: ['gpt-4', 'claude-3'],
        oracle: ['gpt-4'],
      },
    },
  })
  getFullConfigMock.mockResolvedValue({
    ok: true,
    data: {
      agent_overrides: {
        sisyphus: {
          model: 'gpt-4',
          fallback_models: ['claude-3'],
        },
      },
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ModelsRoutingTab: SSE listeners', () => {
  test('introspection-updated event listener is registered', async () => {
    render(<ModelsRoutingTab />)

    // Wait for initial load and EventSource setup
    await waitFor(() => {
      expect(getIntrospectionMock).toHaveBeenCalled()
      expect(getFullConfigMock).toHaveBeenCalled()
    })

    // Verify that introspection-updated listener is registered
    expect(eventSourceListeners['introspection-updated']).toBeDefined()
    expect(eventSourceListeners['introspection-updated'].size).toBeGreaterThan(0)
  })

  test('introspection-updated event triggers re-fetch', async () => {
    render(<ModelsRoutingTab />)

    // Wait for initial load
    await waitFor(() => {
      expect(getIntrospectionMock).toHaveBeenCalled()
    })

    const initialCallCount = getIntrospectionMock.mock.calls.length

    // Trigger the introspection-updated event
    eventSourceListeners['introspection-updated']?.forEach((listener) => {
      listener()
    })

    // Verify that load() was called again (introspection re-fetched)
    await waitFor(() => {
      expect(getIntrospectionMock.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })

  test('config-changed event listener is registered', async () => {
    render(<ModelsRoutingTab />)

    // Wait for initial load and EventSource setup
    await waitFor(() => {
      expect(getIntrospectionMock).toHaveBeenCalled()
    })

    // Verify that config-changed listener is registered
    expect(eventSourceListeners['config-changed']).toBeDefined()
    expect(eventSourceListeners['config-changed'].size).toBeGreaterThan(0)
  })

  test('config-changed event triggers re-fetch', async () => {
    render(<ModelsRoutingTab />)

    // Wait for initial load
    await waitFor(() => {
      expect(getIntrospectionMock).toHaveBeenCalled()
    })

    const initialCallCount = getIntrospectionMock.mock.calls.length

    // Trigger the config-changed event
    eventSourceListeners['config-changed']?.forEach((listener) => {
      listener()
    })

    // Verify that load() was called again
    await waitFor(() => {
      expect(getIntrospectionMock.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })
})
