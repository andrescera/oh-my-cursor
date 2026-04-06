import { describe, test, expect } from "bun:test"

import {
  STATUS_HTML,
  MCP_APP_TOOL,
  MCP_APP_RESOURCE,
  handleStatusToolCall,
} from "./mcp-app"

describe("mcp-app", () => {
  describe("#given STATUS_HTML export", () => {
    describe("#when inspecting the HTML string", () => {
      test("#then is a non-empty string", () => {
        expect(typeof STATUS_HTML).toBe("string")
        expect(STATUS_HTML.length).toBeGreaterThan(0)
      })

      test("#then contains valid HTML document structure", () => {
        expect(STATUS_HTML).toContain("<!DOCTYPE html>")
        expect(STATUS_HTML).toContain("<html>")
        expect(STATUS_HTML).toContain("</html>")
        expect(STATUS_HTML).toContain("<head>")
        expect(STATUS_HTML).toContain("<body>")
      })

      test("#then contains status dashboard UI elements", () => {
        expect(STATUS_HTML).toContain("oh-my-cursor Status")
        expect(STATUS_HTML).toContain("daemon-status")
        expect(STATUS_HTML).toContain("session-id")
        expect(STATUS_HTML).toContain("tool-calls")
        expect(STATUS_HTML).toContain("explore-count")
        expect(STATUS_HTML).toContain("worker-count")
        expect(STATUS_HTML).toContain("ralph-status")
      })

      test("#then contains tab navigation for Status and Event Log", () => {
        expect(STATUS_HTML).toContain("switchTab('status')")
        expect(STATUS_HTML).toContain("switchTab('events')")
        expect(STATUS_HTML).toContain("tab-status")
        expect(STATUS_HTML).toContain("tab-events")
      })

      test("#then contains event log filtering UI", () => {
        expect(STATUS_HTML).toContain("filter-btn")
        expect(STATUS_HTML).toContain("event-list")
        expect(STATUS_HTML).toContain("refreshEvents")
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
        expect(MCP_APP_TOOL._meta.ui.resourceUri).toBe("ui://oh-my-cursor/status")
      })
    })
  })

  describe("#given MCP_APP_RESOURCE export", () => {
    describe("#when inspecting resource definition", () => {
      test("#then has correct URI matching the tool _meta", () => {
        expect(MCP_APP_RESOURCE.uri).toBe("ui://oh-my-cursor/status")
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
        expect(result._meta?.ui.resourceUri).toBe("ui://oh-my-cursor/status")
      })

      test("#then _meta URI matches MCP_APP_RESOURCE URI", () => {
        const result = handleStatusToolCall()
        expect(result._meta?.ui.resourceUri).toBe(MCP_APP_RESOURCE.uri)
      })
    })
  })
})
