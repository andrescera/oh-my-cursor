import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getStatusHTML } from "../../mcp-app"
import { getDaemonPort } from "../../port-manager"

const URI = "ui://oh-my-cursor/dashboard"
const DEFAULT_PORT = 27847

export function register(server: McpServer): void {
  server.registerResource(
    "oh-my-cursor-status",
    URI,
    {
      description: "Session state and daemon health dashboard",
      mimeType: "text/html",
    },
    async () => ({
      contents: [
        {
          uri: URI,
          mimeType: "text/html",
          text: await getStatusHTML(getDaemonPort(DEFAULT_PORT)),
        },
      ],
    }),
  )
}
