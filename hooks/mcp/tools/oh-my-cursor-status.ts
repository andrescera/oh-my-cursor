import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getDaemonHealthy } from "../daemon-health"
import { wrapToolHandler } from "../validate"

const inputSchema = {}

const outputSchema = {
  daemon_healthy: z.boolean().describe("Whether the oh-my-cursor daemon is currently reachable and healthy"),
}

const uiMeta = { ui: { resourceUri: "ui://oh-my-cursor/dashboard" } }

export function register(server: McpServer): void {
  server.registerTool(
    "oh_my_cursor_status",
    {
      description:
        "Show the oh-my-cursor status dashboard with session state, dispatch counts, and daemon health.",
      inputSchema,
      outputSchema,
      _meta: uiMeta,
    },
    wrapToolHandler("oh_my_cursor_status", async () => ({
      content: [
        {
          type: "text",
          text: "oh-my-cursor status dashboard loaded. The dashboard shows daemon health, session state, dispatch counts, Ralph loop status, hook configuration, background tasks, and recent errors.",
        },
      ],
      structuredContent: { daemon_healthy: getDaemonHealthy() },
      _meta: uiMeta,
    })),
  )
}
