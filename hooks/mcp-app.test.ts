import { describe, test, expect } from "bun:test"

import { STATUS_HTML, getStatusHTML } from "./mcp-app"
import { renderDashboardHTML } from "./dashboard/render"

describe("mcp-app", () => {
  describe("#given STATUS_HTML export", () => {
    describe("#when inspecting the HTML string", () => {
      test("#then is a non-empty string", () => {
        expect(typeof STATUS_HTML).toBe("string")
        expect(STATUS_HTML.length).toBeGreaterThan(0)
      })

      test("#then contains valid HTML document structure", () => {
        expect(STATUS_HTML).toContain("<!DOCTYPE html>")
        expect(STATUS_HTML).toMatch(/<html[\s>]/)
        expect(STATUS_HTML).toContain("</html>")
        expect(STATUS_HTML).toContain("<head>")
        expect(STATUS_HTML).toContain("<body>")
      })

      test("#then contains status dashboard UI elements", () => {
        expect(STATUS_HTML).toContain("oh-my-cursor Dashboard")
        expect(STATUS_HTML).toContain('label="Session"')
        expect(STATUS_HTML).toContain("Tool Calls")
        expect(STATUS_HTML).toContain("Explore Dispatches")
        expect(STATUS_HTML).toContain("Worker Dispatches")
        expect(STATUS_HTML).toContain("Continuation loops")
      })

      test("#then contains tab navigation for Status and Events", () => {
        expect(STATUS_HTML).toContain("setActiveTab")
        expect(STATUS_HTML).toContain("{ id: 'status'")
        expect(STATUS_HTML).toContain("{ id: 'events'")
      })

      test("#then contains event log filtering UI", () => {
        expect(STATUS_HTML).toContain("ev-filter")
        expect(STATUS_HTML).toContain("ev-list")
        expect(STATUS_HTML).toContain("applyEventFilter")
      })
    })
  })

  describe("#given getStatusHTML function", () => {
    describe("#when called with a specific port", () => {
      test("#then renderDashboardHTML with that port contains the right localhost URL", () => {
        const html = renderDashboardHTML(12345)
        expect(html).toContain("http://localhost:12345")
      })

      test("#then getStatusHTML(12345) returns HTML containing http://localhost:12345", () => {
        const html = getStatusHTML(12345)
        expect(html).toContain("http://localhost:12345")
      })

      test("#then getStatusHTML(99999) returns HTML containing http://localhost:99999", () => {
        const html = getStatusHTML(99999)
        expect(html).toContain("http://localhost:99999")
      })
    })

    describe("#when called without arguments", () => {
      test("#then returns a non-empty HTML string", () => {
        const html = getStatusHTML()
        expect(typeof html).toBe("string")
        expect(html.length).toBeGreaterThan(0)
        expect(html).toContain("<!DOCTYPE html>")
      })

      test("#then falls back to a valid port (getDaemonPort or default 27847)", () => {
        const html = getStatusHTML()
        expect(html).toMatch(/http:\/\/localhost:\d+/)
      })

      test("#then dashboard HTML uses 'Continuation loop' copy, not 'Ralph loop'", () => {
        const html = getStatusHTML()
        expect(html).not.toMatch(/Ralph loop/i)
        expect(html).toContain("Continuation loop")
      })

      test("#then Status tab stat label is 'Continuation loops'", () => {
        const html = getStatusHTML()
        expect(html).toContain('label="Continuation loops"')
        expect(html).not.toMatch(/label="Ralph Loop"/)
        // The stat value is a numeric count, not "Active"/"Inactive" string.
        expect(html).toContain("stats?.continuationLoopsActive")
      })
    })

    describe("#when inspecting Agents tab fetch wiring", () => {
      test("#then dashboard HTML contains /agentHistory endpoint", () => {
        const html = getStatusHTML()
        expect(html).toContain("/agentHistory")
      })

      test("#then dashboard HTML still contains /backgroundTasks endpoint", () => {
        const html = getStatusHTML()
        expect(html).toContain("/backgroundTasks")
      })
    })
  })
})
