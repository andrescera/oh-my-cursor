import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { join, resolve } from "node:path"
import { wrapToolHandler } from "../validate"

const inputSchema = {
  action: z
    .enum(["recent", "summary", "search", "export"])
    .describe(
      "recent = last N events, summary = session statistics, search = filter by event/tool, export = full log file path",
    ),
  limit: z
    .number()
    .optional()
    .describe("Max events to return (default: 50, max: 500). Used with recent and search."),
  session_id: z.string().optional().describe("Filter events by session ID. Optional."),
  event_filter: z
    .string()
    .optional()
    .describe(
      "Filter by hook event name, e.g. '/preToolUse', '/stop', '/postToolUseFailure'",
    ),
  action_filter: z
    .string()
    .optional()
    .describe("Filter by action: 'allow', 'deny', 'block', 'continue', 'noop'"),
  workspace_root: z
    .string()
    .optional()
    .describe(
      "Absolute path to workspace root (optional, for resolving project-specific log paths)",
    ),
}

export function register(server: McpServer): void {
  server.registerTool(
    "session_log",
    {
      description:
        "Query the oh-my-cursor conversation event log. Returns structured events from the current or past sessions for analysis, review, and improvement.",
      inputSchema,
    },
    wrapToolHandler("session_log", async ({ action, limit: limitRaw, session_id, event_filter, action_filter, workspace_root }) => {
      const port =
        process.env.OH_MY_CURSOR_DAEMON_PORT || process.env.OH_MY_CURSOR_PORT || "47847"

      if (action === "export") {
        try {
          const res = await fetch(`http://localhost:${port}/session-log?limit=1`, {
            signal: AbortSignal.timeout(5000),
          })
          if (!res.ok) {
            return {
              content: [{ type: "text", text: `Daemon not reachable (HTTP ${res.status})` }],
            }
          }
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Daemon offline: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          }
        }
        const projectDir = workspace_root ?? process.env.OH_MY_CURSOR_PROJECT_DIR
        const logPath = projectDir
          ? join(resolve(projectDir), ".cursor/hooks/state/session-log.jsonl")
          : "/tmp/oh-my-cursor-session-log.jsonl"
        return {
          content: [
            {
              type: "text",
              text: `Session log file: ${logPath}\n\nUse Read tool to read it, or cat/jq to process.`,
            },
          ],
        }
      }

      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 50

      if (action === "summary") {
        try {
          const params = new URLSearchParams()
          if (session_id) params.set("session", session_id)
          const res = await fetch(`http://localhost:${port}/session-log/summary?${params}`, {
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) {
            return {
              content: [{ type: "text", text: `Summary request failed: HTTP ${res.status}` }],
            }
          }
          const data = await res.json()
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          }
        }
      }

      if (action === "recent" || action === "search") {
        try {
          const params = new URLSearchParams({ limit: String(limit) })
          if (session_id) params.set("session", session_id)
          if (event_filter) params.set("event", event_filter)
          if (action_filter) params.set("action", action_filter)
          const res = await fetch(`http://localhost:${port}/session-log?${params}`, {
            signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) {
            return {
              content: [{ type: "text", text: `Log request failed: HTTP ${res.status}` }],
            }
          }
          const events = await res.json()
          if (!Array.isArray(events) || events.length === 0) {
            return { content: [{ type: "text", text: "(no events found)" }] }
          }
          return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] }
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          }
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown session_log action '${action}'. Use: recent, summary, search, export`,
          },
        ],
      }
    }),
  )
}
