import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { wrapToolHandler } from "../validate"

const inputSchema = {
  lines: z.number().optional().describe("Number of recent log lines to show (default: 50)"),
}

export function register(server: McpServer): void {
  server.registerTool(
    "daemon_logs",
    {
      description: "View recent oh-my-cursor daemon log output for debugging hook behavior.",
      inputSchema,
    },
    wrapToolHandler("daemon_logs", async ({ lines: linesRaw }) => {
      const lineCount =
        typeof linesRaw === "number" && Number.isFinite(linesRaw) && linesRaw > 0
          ? Math.min(Math.floor(linesRaw), 10_000)
          : 50
      const logPath = "/tmp/oh-my-cursor-daemon.log"
      const f = Bun.file(logPath)
      if (!(await f.exists())) {
        return {
          content: [{ type: "text", text: `Log file not found: ${logPath}` }],
        }
      }
      try {
        const text = await f.text()
        const allLines = text.split(/\r?\n/)
        const tail = allLines.slice(-lineCount).join("\n")
        return {
          content: [{ type: "text", text: tail || "(empty log)" }],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to read ${logPath}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
      }
    }),
  )
}
