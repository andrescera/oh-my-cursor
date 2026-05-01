// @vitest-environment jsdom
/**
 * W3.1 axe-core scan over the Shell shell (header + tablist + active panel).
 *
 * vitest-axe is incompatible with happy-dom (`Node.prototype.isConnected`
 * bug) so this file forces the jsdom environment with the per-file pragma
 * above. The rest of the tab-level axe specs follow the same pattern.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

import Shell from '@/components/Shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { _resetForTests } from '@/store/dashboard'
import { axeShell } from '@/test-utils/axe'

vi.mock('@/lib/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getHealth: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        uptime: 1,
        toolCalls: 0,
        currentConversationId: 'conv-axe',
        conversations: 0,
      },
    }),
  }
})

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  cleanup()
})

describe('Shell: axe a11y (W3.1)', () => {
  test('default render has no axe violations', async () => {
    const { container } = render(
      <TooltipProvider>
        <Shell enableSse={false} />
      </TooltipProvider>,
    )

    // Wait for any first-paint async work (StatusTab fires a getHealth fetch).
    await waitFor(() => {
      expect(container.querySelector('[role="tablist"]')).not.toBeNull()
    })

    const results = await axeShell(container)
    expect(results).toHaveNoViolations()
  })
})
