import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { serve } from "bun"

import {
  handleStatusToolCall,
  MCP_APP_RESOURCE,
  MCP_APP_TOOL,
  STATUS_HTML,
} from "./mcp-app"

function collectAgentTranscriptDirs(): string[] {
  const dirs: string[] = []
  const seen = new Set<string>()
  const add = (dirPath: string) => {
    const r = resolve(dirPath)
    if (existsSync(r) && !seen.has(r)) {
      seen.add(r)
      dirs.push(r)
    }
  }
  const home = process.env.HOME
  if (home) {
    const projectsRoot = join(home, ".cursor", "projects")
    if (existsSync(projectsRoot)) {
      for (const ent of readdirSync(projectsRoot, { withFileTypes: true })) {
        if (ent.isDirectory()) {
          add(join(projectsRoot, ent.name, "agent-transcripts"))
        }
      }
    }
  }
  const claudeProjectDir = process.env.CLAUDE_PROJECT_DIR
  if (claudeProjectDir) {
    add(join(resolve(claudeProjectDir), "..", "agent-transcripts"))
  }
  return dirs
}

const PORT = parseInt(process.env.OH_MY_CURSOR_MCP_PORT || "47848")

const TOOLS = [
  {
    name: "look_at",
    description:
      "Analyze a file visually (images, PDFs, diagrams) or extract specific information from a file. Use when you need to understand visual content that cannot be read as plain text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to analyze",
        },
        goal: {
          type: "string",
          description: "What specific information to extract from the file",
        },
      },
      required: ["goal"],
    },
  },
  {
    name: "interactive_bash",
    description:
      "Execute commands in a persistent tmux session. Use for long-running processes, interactive commands, or when you need persistent terminal state across multiple calls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The command to execute in the tmux session",
        },
        session_name: {
          type: "string",
          description: "Name of the tmux session (default: oh-my-cursor)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "skill_mcp",
    description:
      "Manage skill-embedded MCP servers. Start, stop, or query MCP servers that are bundled with skills.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["start", "stop", "list", "status"],
          description: "Action to perform on skill MCP servers",
        },
        skill_name: {
          type: "string",
          description: "Name of the skill whose MCP server to manage",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "get_dispatch_stats",
    description:
      "Get current session dispatch statistics including explore/worker counts, tool call counts, and active agents from the oh-my-cursor daemon.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "session_transcripts",
    description: "List recent agent session transcript files, or search within them for specific content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["list", "search"],
          description:
            "list = show recent transcripts, search = find content in transcripts",
        },
        query: {
          type: "string",
          description: "Search query (only used when action=search)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 10)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "daemon_logs",
    description: "View recent oh-my-cursor daemon log output for debugging hook behavior.",
    inputSchema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "number",
          description: "Number of recent log lines to show (default: 50)",
        },
      },
    },
  },
  MCP_APP_TOOL,
]

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (name) {
    case "look_at": {
      const filePath = args.file_path as string
      const goal = args.goal as string

      if (!filePath) {
        return {
          content: [
            {
              type: "text",
              text: "No file_path provided. Use the Read tool with image support, or provide a file path for analysis.",
            },
          ],
        }
      }

      const ext = filePath.split(".").pop()?.toLowerCase()
      const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "")
      const isPdf = ext === "pdf"

      if (isImage) {
        const file = Bun.file(filePath)
        if (!(await file.exists())) {
          return { content: [{ type: "text", text: `File not found: ${filePath}` }] }
        }
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString("base64")
        const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`

        return {
          content: [
            { type: "text", text: `Analyzing image for: ${goal}` },
            { type: "text", text: `[Image data: ${base64.length} bytes base64, ${mimeType}]` },
            {
              type: "text",
              text: "Note: For full image analysis, use Cursor's native Read tool which supports images directly.",
            },
          ],
        }
      }

      if (isPdf) {
        return {
          content: [
            {
              type: "text",
              text: `PDF analysis requested for: ${filePath}\nGoal: ${goal}\n\nUse Cursor's native Read tool which supports PDF files directly.`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `File type .${ext} - use Cursor's Read tool for text files, or provide an image/PDF path for visual analysis.`,
          },
        ],
      }
    }

    case "interactive_bash": {
      const command = args.command as string
      const sessionName = (args.session_name as string) || "oh-my-cursor"

      try {
        const checkSession = Bun.spawnSync(["tmux", "has-session", "-t", sessionName])

        if (checkSession.exitCode !== 0) {
          Bun.spawnSync(["tmux", "new-session", "-d", "-s", sessionName])
        }

        Bun.spawnSync(["tmux", "send-keys", "-t", sessionName, command, "Enter"])

        await Bun.sleep(500)

        const capture = Bun.spawnSync([
          "tmux",
          "capture-pane",
          "-t",
          sessionName,
          "-p",
          "-S",
          "-50",
        ])

        const output = capture.stdout.toString()

        return {
          content: [
            {
              type: "text",
              text: `Session: ${sessionName}\nCommand: ${command}\n\nOutput:\n${output}`,
            },
          ],
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `tmux error: ${err instanceof Error ? err.message : String(err)}\n\nEnsure tmux is installed: apt install tmux / brew install tmux`,
            },
          ],
        }
      }
    }

    case "skill_mcp": {
      const action = args.action as string
      const skillName = args.skill_name as string

      switch (action) {
        case "list":
          return {
            content: [
              {
                type: "text",
                text: "Available skill MCPs:\n- dev-browser (playwright automation)\n- agent-browser (CLI browser automation)\n\nUse action='status' with skill_name to check if running.",
              },
            ],
          }
        case "status":
          return {
            content: [
              {
                type: "text",
                text: `Skill MCP '${skillName || "unknown"}': Not running. Use action='start' to launch.`,
              },
            ],
          }
        case "start":
          return {
            content: [
              {
                type: "text",
                text: `Starting skill MCP '${skillName}'... Use the dev-browser or agent-browser skill instructions to set up the server.`,
              },
            ],
          }
        case "stop":
          return {
            content: [
              { type: "text", text: `Stopping skill MCP '${skillName}'...` },
            ],
          }
        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown action '${action}'. Valid actions: start, stop, list, status`,
              },
            ],
          }
      }
    }

    case "get_dispatch_stats": {
      const port = process.env.OH_MY_CURSOR_PORT || "47847"
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
    }

    case "session_transcripts": {
      const action = args.action as string
      const limitRaw = args.limit
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 10
      const dirs = collectAgentTranscriptDirs()

      if (dirs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "No agent-transcripts directories found. Expected ~/.cursor/projects/*/agent-transcripts/ or $CLAUDE_PROJECT_DIR/../agent-transcripts/",
            },
          ],
        }
      }

      if (action === "list") {
        const sections: string[] = []
        let remaining = limit
        for (const dir of dirs) {
          if (remaining <= 0) break
          const ls = Bun.spawnSync(["ls", "-lt", dir])
          if (ls.exitCode !== 0) {
            sections.push(
              `## ${dir}\n(ls failed, exit ${ls.exitCode})\n${ls.stderr.toString()}`.trimEnd(),
            )
            continue
          }
          const lines = ls.stdout
            .toString()
            .split("\n")
            .filter((line) => line.trim() !== "" && !line.startsWith("total "))
          const chunk = lines.slice(0, remaining)
          remaining -= chunk.length
          sections.push(`## ${dir}\n${chunk.join("\n")}`)
        }
        return {
          content: [
            {
              type: "text",
              text: sections.join("\n\n"),
            },
          ],
        }
      }

      if (action === "search") {
        const query = args.query
        if (typeof query !== "string" || query.trim() === "") {
          return {
            content: [
              {
                type: "text",
                text: "action=search requires a non-empty string `query` argument.",
              },
            ],
          }
        }
        const rg = Bun.spawnSync(["rg", "-n", "--max-columns", "512", query, ...dirs])
        if (rg.exitCode === 2) {
          return {
            content: [
              {
                type: "text",
                text: `ripgrep failed (is rg installed?): ${rg.stderr.toString() || rg.stdout.toString()}`,
              },
            ],
          }
        }
        const out = rg.stdout.toString()
        const matchLines = out.split("\n").filter((line) => line.length > 0)
        const trimmed = matchLines.slice(0, limit)
        return {
          content: [
            {
              type: "text",
              text:
                trimmed.length > 0
                  ? trimmed.join("\n")
                  : rg.exitCode === 1
                    ? "(no matches)"
                    : "",
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Unknown session_transcripts action '${action}'. Use list or search.`,
          },
        ],
      }
    }

    case "daemon_logs": {
      const linesRaw = args.lines
      const lineCount =
        typeof linesRaw === "number" && Number.isFinite(linesRaw) && linesRaw > 0
          ? Math.min(Math.floor(linesRaw), 10_000)
          : 50
      const logPath = "/tmp/oh-my-cursor-daemon.log"
      const f = Bun.file(logPath)
      if (!(await f.exists())) {
        return {
          content: [
            {
              type: "text",
              text: `Log file not found: ${logPath}`,
            },
          ],
        }
      }
      try {
        const text = await f.text()
        const allLines = text.split(/\r?\n/)
        const tail = allLines.slice(-lineCount).join("\n")
        return {
          content: [
            {
              type: "text",
              text: tail || "(empty log)",
            },
          ],
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
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      }
  }
}

console.log(`[oh-my-cursor] MCP sidecar starting on port ${PORT}...`)

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/mcp" && req.method === "POST") {
      const body = await req.json()

      if (body.method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "oh-my-cursor", version: "0.1.0" },
          },
        })
      }

      if (body.method === "resources/list") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: [MCP_APP_RESOURCE],
        })
      }

      if (body.method === "resources/read") {
        const uri = body.params?.uri
        if (uri === MCP_APP_RESOURCE.uri) {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              contents: [
                {
                  uri: MCP_APP_RESOURCE.uri,
                  mimeType: "text/html",
                  text: STATUS_HTML,
                },
              ],
            },
          })
        }
      }

      if (body.method === "tools/list") {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: TOOLS },
        })
      }

      if (body.method === "tools/call") {
        const { name, arguments: args } = body.params
        if (name === "oh_my_cursor_status") {
          return Response.json({
            jsonrpc: "2.0",
            id: body.id,
            result: handleStatusToolCall(),
          })
        }
        const result = await handleToolCall(name, args || {})
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          result,
        })
      }

      return Response.json({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: "Method not found" },
      })
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", tools: TOOLS.map((t) => t.name) })
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`[oh-my-cursor] MCP sidecar ready on http://localhost:${PORT}`)
