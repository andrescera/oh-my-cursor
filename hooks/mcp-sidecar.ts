import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs"
import { join, resolve } from "node:path"

import { serve } from "bun"

import {
  handleStatusToolCall,
  getStatusHTML,
  MCP_APP_RESOURCE,
  MCP_APP_TOOL,
} from "./mcp-app"
import { loadConfig } from "./config"
import { cleanupStaleProcess } from "./process-guard"
import { readPortCoordination, writePortCoordination, getDaemonPort } from "./port-manager"

function getPluginRoot(): string {
  return resolve(import.meta.dir, "..")
}

function listSkillNamesFromPluginRoot(): string[] {
  const skillsDir = join(getPluginRoot(), "skills")
  if (!existsSync(skillsDir)) return []
  const names: string[] = []
  for (const ent of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue
    if (existsSync(join(skillsDir, ent.name, "SKILL.md"))) {
      names.push(ent.name)
    }
  }
  names.sort()
  return names
}

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

const config = loadConfig()
const ENV_MCP_PORT = process.env.OH_MY_CURSOR_MCP_PORT
const DEFAULT_MCP_PORT = config.daemon.mcp_port
const DAEMON_PORT_FILE = "/tmp/oh-my-cursor-daemon.port"
// TODO: Refactored into port-manager.ts in T18
function resolvePreferredMcpPortFromDaemonFile(fallbackMcpPort: number): number {
  try {
    if (!existsSync(DAEMON_PORT_FILE)) return fallbackMcpPort
    const raw = readFileSync(DAEMON_PORT_FILE, "utf-8").trim()
    const daemonPort = parseInt(raw, 10)
    if (
      Number.isFinite(daemonPort) &&
      daemonPort >= 1 &&
      daemonPort <= 65535
    ) {
      return daemonPort + 1
    }
  } catch {
    // ignore invalid or unreadable daemon port file
  }
  return fallbackMcpPort
}
const MCP_PORT_FILE = "/tmp/oh-my-cursor-sidecar.port"
const MCP_PID_FILE = "/tmp/oh-my-cursor-sidecar.pid"
const MAX_PORT_ATTEMPTS = 11

function isPortInUseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes("eaddrinuse") || msg.includes("address already in use")
}

function writePortFile(port: number): void {
  writeFileSync(MCP_PORT_FILE, String(port), "utf-8")
}

function removePortFile(): void {
  try {
    if (existsSync(MCP_PORT_FILE)) unlinkSync(MCP_PORT_FILE)
  } catch {
    // best-effort cleanup
  }
}

process.on("SIGTERM", () => { removePortFile(); try { unlinkSync(MCP_PID_FILE) } catch {} process.exit(0) })
process.on("SIGINT", () => { removePortFile(); try { unlinkSync(MCP_PID_FILE) } catch {} process.exit(0) })

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
      "Read a skill's SKILL.md documentation. Returns the full skill definition for the named skill.",
    inputSchema: {
      type: "object" as const,
      properties: {
        skill_name: {
          type: "string",
          description:
            "Name of the skill directory (e.g., 'git-master', 'review-work')",
        },
      },
      required: ["skill_name"],
    },
  },
  {
    name: "get_dispatch_stats",
    description:
      "Get current conversation dispatch statistics including explore/worker counts, tool call counts, and active agents from the oh-my-cursor daemon.",
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
  {
    name: "session_log",
    description:
      "Query the oh-my-cursor conversation event log. Returns structured events from the current or past sessions for analysis, review, and improvement.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["recent", "summary", "search", "export"],
          description:
            "recent = last N events, summary = session statistics, search = filter by event/tool, export = full log file path",
        },
        limit: {
          type: "number",
          description: "Max events to return (default: 50, max: 500). Used with recent and search.",
        },
        session_id: {
          type: "string",
          description: "Filter events by session ID. Optional.",
        },
        event_filter: {
          type: "string",
          description:
            "Filter by hook event name, e.g. '/preToolUse', '/stop', '/postToolUseFailure'",
        },
        action_filter: {
          type: "string",
          description: "Filter by action: 'allow', 'deny', 'block', 'continue', 'noop'",
        },
        workspace_root: {
          type: "string",
          description: "Absolute path to workspace root (optional, for resolving project-specific log paths)",
        },
      },
      required: ["action"],
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
      const skillNameRaw = args.skill_name
      const skillName =
        typeof skillNameRaw === "string" ? skillNameRaw.trim() : ""
      const available = listSkillNamesFromPluginRoot()
      const labelForError =
        typeof skillNameRaw === "string"
          ? skillNameRaw
          : skillNameRaw === undefined
            ? ""
            : String(skillNameRaw)

      if (!skillName) {
        return {
          content: [
            {
              type: "text",
              text: `Skill '${labelForError}' not found. Available skills: ${available.join(", ")}`,
            },
          ],
        }
      }

      const skillsDir = join(getPluginRoot(), "skills")
      const skillPath = join(skillsDir, skillName, "SKILL.md")
      const resolvedPath = require("node:path").resolve(skillPath)
      if (!resolvedPath.startsWith(require("node:path").resolve(skillsDir))) {
        return {
          content: [
            {
              type: "text",
              text: "Invalid skill name: path traversal detected.",
            },
          ],
        }
      }
      if (!existsSync(skillPath)) {
        return {
          content: [
            {
              type: "text",
              text: `Skill '${skillName}' not found. Available skills: ${available.join(", ")}`,
            },
          ],
        }
      }

      try {
        const fileContent = readFileSync(skillPath, "utf-8")
        return { content: [{ type: "text", text: fileContent }] }
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to read ${skillPath}: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        }
      }
    }

    case "get_dispatch_stats": {
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
        const rg = Bun.spawnSync(["rg", "-n", "--max-columns", "512", "--", query, ...dirs])
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

    case "session_log": {
      const action = args.action as string
      const port = process.env.OH_MY_CURSOR_DAEMON_PORT || process.env.OH_MY_CURSOR_PORT || "47847"

      if (action === "export") {
        try {
          const res = await fetch(`http://localhost:${port}/session-log?limit=1`, {
            signal: AbortSignal.timeout(5000),
          })
          if (!res.ok) {
            return {
              content: [
                { type: "text", text: `Daemon not reachable (HTTP ${res.status})` },
              ],
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
        const projectDir = (args.workspace_root as string) ?? process.env.OH_MY_CURSOR_PROJECT_DIR
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

      const limitRaw = args.limit
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 500)
          : 50
      const sessionId = args.session_id as string | undefined
      const eventFilter = args.event_filter as string | undefined
      const actionFilter = args.action_filter as string | undefined

      if (action === "summary") {
        try {
          const params = new URLSearchParams()
          if (sessionId) params.set("session", sessionId)
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
          if (sessionId) params.set("session", sessionId)
          if (eventFilter) params.set("event", eventFilter)
          if (actionFilter) params.set("action", actionFilter)
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
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      }
  }
}

let daemonHealthy = true

const mcpFetchHandler = async (req: Request) => {
  const url = new URL(req.url)

  if (url.pathname === "/mcp" && req.method === "POST") {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return Response.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      })
    }

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
                text: getStatusHTML(),
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
          result: {
            ...handleStatusToolCall(),
            daemon_healthy: daemonHealthy,
          },
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
    return Response.json({
      status: "ok",
      tools: TOOLS.map((t) => t.name),
      daemonHealthy,
    })
  }

  return new Response("Not found", { status: 404 })
}

cleanupStaleProcess(MCP_PID_FILE, MCP_PORT_FILE, "sidecar")

let actualMcpPort = ENV_MCP_PORT ? parseInt(ENV_MCP_PORT) : DEFAULT_MCP_PORT
const scanBaseMcpPort = ENV_MCP_PORT
  ? DEFAULT_MCP_PORT
  : resolvePreferredMcpPortFromDaemonFile(DEFAULT_MCP_PORT)

if (ENV_MCP_PORT) {
  console.log(`[oh-my-cursor] MCP sidecar starting on port ${actualMcpPort} (env override)...`)
  serve({ port: actualMcpPort, fetch: mcpFetchHandler })
} else {
  actualMcpPort = scanBaseMcpPort
  console.log(`[oh-my-cursor] MCP sidecar starting on port ${actualMcpPort}...`)
  let started = false
  for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
    const tryPort = scanBaseMcpPort + offset
    try {
      serve({ port: tryPort, fetch: mcpFetchHandler })
      actualMcpPort = tryPort
      started = true
      if (offset > 0) {
        console.log(`[oh-my-cursor] Preferred MCP port ${scanBaseMcpPort} in use, using port ${actualMcpPort}`)
      }
      break
    } catch (err) {
      if (isPortInUseError(err)) {
        console.log(`[oh-my-cursor] MCP port ${tryPort} in use, trying next...`)
        continue
      }
      throw err
    }
  }
  if (!started) {
    console.error(`[oh-my-cursor] Could not find available MCP port in range ${scanBaseMcpPort}-${scanBaseMcpPort + MAX_PORT_ATTEMPTS - 1}`)
    process.exit(1)
  }
}

writePortFile(actualMcpPort)
writeFileSync(MCP_PID_FILE, String(process.pid), "utf-8")

const coord = readPortCoordination()
if (coord) {
  writePortCoordination({ ...coord, sidecar: actualMcpPort, updatedAt: new Date().toISOString() })
}

console.log(`[oh-my-cursor] MCP sidecar ready on http://localhost:${actualMcpPort}`)

setInterval(async () => {
  try {
    const daemonPort = getDaemonPort(47847)
    const res = await fetch(`http://localhost:${daemonPort}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    daemonHealthy = res.ok
    if (!res.ok) {
      console.warn(`[oh-my-cursor] Daemon health check failed: HTTP ${res.status}`)
    }
  } catch {
    daemonHealthy = false
    console.warn("[oh-my-cursor] Daemon health check failed: unreachable")
  }
}, 30_000)
