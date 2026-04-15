import { describe, test, expect } from "bun:test"

import {
  STATUS_HTML,
  getStatusHTML,
  MCP_APP_TOOL,
  MCP_APP_RESOURCE,
  handleStatusToolCall,
} from "./mcp-app"
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
        expect(STATUS_HTML).toContain("Ralph Loop")
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

  describe("#given MCP_APP_TOOL export", () => {
    describe("#when inspecting tool definition", () => {
      test("#then has correct name", () => {
        expect(MCP_APP_TOOL.name).toBe("oh_my_cursor_status")
      })

      test("#then has a non-empty description", () => {
        expect(typeof MCP_APP_TOOL.description).toBe("string")
        expect(MCP_APP_TOOL.description.length).toBeGreaterThan(0)
      })

      test("#then has valid inputSchema with object type", () => {
        expect(MCP_APP_TOOL.inputSchema).toBeDefined()
        expect(MCP_APP_TOOL.inputSchema.type).toBe("object")
        expect(MCP_APP_TOOL.inputSchema.properties).toBeDefined()
      })

      test("#then has _meta with UI resource URI", () => {
        expect(MCP_APP_TOOL._meta).toBeDefined()
        expect(MCP_APP_TOOL._meta.ui.resourceUri).toBe("ui://oh-my-cursor/dashboard")
      })
    })
  })

  describe("#given MCP_APP_RESOURCE export", () => {
    describe("#when inspecting resource definition", () => {
      test("#then has correct URI matching the tool _meta", () => {
        expect(MCP_APP_RESOURCE.uri).toBe("ui://oh-my-cursor/dashboard")
        expect(MCP_APP_RESOURCE.uri).toBe(MCP_APP_TOOL._meta.ui.resourceUri)
      })

      test("#then has name and description", () => {
        expect(typeof MCP_APP_RESOURCE.name).toBe("string")
        expect(MCP_APP_RESOURCE.name.length).toBeGreaterThan(0)
        expect(typeof MCP_APP_RESOURCE.description).toBe("string")
        expect(MCP_APP_RESOURCE.description.length).toBeGreaterThan(0)
      })

      test("#then has text/html mimeType", () => {
        expect(MCP_APP_RESOURCE.mimeType).toBe("text/html")
      })

      test("#then contains the STATUS_HTML content", () => {
        expect(MCP_APP_RESOURCE.text).toBe(STATUS_HTML)
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

      test("#then falls back to a valid port (getDaemonPort or default 47847)", () => {
        const html = getStatusHTML()
        expect(html).toMatch(/http:\/\/localhost:\d+/)
      })
    })
  })

  describe("#given handleStatusToolCall function", () => {
    describe("#when called with no arguments", () => {
      test("#then returns content array with dashboard message", () => {
        const result = handleStatusToolCall()
        expect(Array.isArray(result.content)).toBe(true)
        expect(result.content.length).toBeGreaterThan(0)
        expect(result.content[0].type).toBe("text")
        expect(result.content[0].text).toContain("status dashboard")
      })

      test("#then returns _meta with UI resource URI", () => {
        const result = handleStatusToolCall()
        expect(result._meta).toBeDefined()
        expect(result._meta?.ui.resourceUri).toBe("ui://oh-my-cursor/dashboard")
      })

      test("#then _meta URI matches MCP_APP_RESOURCE URI", () => {
        const result = handleStatusToolCall()
        expect(result._meta?.ui.resourceUri).toBe(MCP_APP_RESOURCE.uri)
      })
    })
  })
})
