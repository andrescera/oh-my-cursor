---
name: playwright
description: Browser automation with Playwright MCP for testing, scraping, and interaction. Use when the user needs headless browser testing, E2E tests, web scraping, or form automation.
---

# Playwright Browser Automation

MUST USE for any browser-related tasks. Browser automation via Playwright MCP supports verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.

This skill provides browser automation capabilities via the Playwright MCP server.

## MCP server configuration

The builtin skill wires the Playwright MCP with:

- **command:** `npx`
- **args:** `@playwright/mcp@latest`

Example MCP config entry:

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest"]
  }
}
```

Equivalent one-off:

```bash
npx @playwright/mcp@latest
```

Use the tools exposed by the Playwright MCP server for navigation, assertions, screenshots, and other browser automation after the server is connected.
