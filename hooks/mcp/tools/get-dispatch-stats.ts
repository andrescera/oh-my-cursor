import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export function register(server: McpServer): void {
  server.registerTool(
    "get_dispatch_stats",
    {
      description:
        "Get current conversation dispatch statistics including explore/worker counts, tool call counts, and active agents from the oh-my-cursor daemon.",
      inputSchema: {},
    },
    async () => {
      const port = process.env.OH_MY_CURSOR_DAEMON_PORT || process.env.OH_MY_CURSOR_PORT || "47847"
      const url = `http://localhost:${port}/health`
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Daemon health request failed: HTTP ${res.status} ${res.statusText}`,
              },
            ],
          }
        }
        const data: unknown = await res.json()
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2),
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch daemon health from ${url}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
      }
    },
  )
}
