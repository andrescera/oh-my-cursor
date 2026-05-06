import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { wrapToolHandler } from "../validate"
import { spawnWithTimeout } from "../../lib/spawn-with-timeout"

const LS_TIMEOUT_MS = 500
const LS_MAX_OUTPUT_BYTES = 256 * 1024
const RG_TIMEOUT_MS = 800
const RG_MAX_OUTPUT_BYTES = 512 * 1024
const RG_MAX_COUNT = 200
const MAX_RESPONSE_BYTES = 512 * 1024

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

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>
}

interface HandlerArgs {
  action: "list" | "search"
  query?: string
  limit?: number
}

function truncateForResponse(text: string): string {
  if (text.length <= MAX_RESPONSE_BYTES) return text
  return text.slice(0, MAX_RESPONSE_BYTES) + "\n... (output truncated)"
}

export function createTranscriptSearch(
  spawn: typeof spawnWithTimeout = spawnWithTimeout,
  collectDirs: () => string[] = collectAgentTranscriptDirs,
): (args: HandlerArgs) => Promise<ToolResponse> {
  return async function handleSessionTranscripts(args: HandlerArgs): Promise<ToolResponse> {
    const { action, query, limit: limitRaw } = args
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 500)
        : 10
    const dirs = collectDirs()

    if (dirs.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No agent-transcripts directories found. Expected ~/.cursor/projects/*/agent-transcripts/ or $CLAUDE_PROJECT_DIR/../agent-transcripts/",
          },
        ],
      }
    }

    if (action === "list") {
      const sections: string[] = []
      let remaining = limit
      let anyTimedOut = false
      for (const dir of dirs) {
        if (remaining <= 0) break
        const ls = await spawn(["ls", "-lt", dir], {
          timeoutMs: LS_TIMEOUT_MS,
          maxOutputBytes: LS_MAX_OUTPUT_BYTES,
        })
        if (ls.timedOut) anyTimedOut = true
        if (ls.exitCode !== 0) {
          sections.push(
            `## ${dir}\n(ls failed, exit ${ls.exitCode})\n${ls.stderr}`.trimEnd(),
          )
          continue
        }
        const lines = ls.stdout
          .split("\n")
          .filter((line) => line.trim() !== "" && !line.startsWith("total "))
        const chunk = lines.slice(0, remaining)
        remaining -= chunk.length
        sections.push(`## ${dir}\n${chunk.join("\n")}`)
      }
      let text = truncateForResponse(sections.join("\n\n"))
      if (anyTimedOut) text += "\n(results may be truncated — search timed out)"
      return { content: [{ type: "text", text }] }
    }

    if (action === "search") {
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
      const rg = await spawn(
        ["rg", "-n", "--max-columns", "512", "--max-count", String(RG_MAX_COUNT), "--", query, ...dirs],
        { timeoutMs: RG_TIMEOUT_MS, maxOutputBytes: RG_MAX_OUTPUT_BYTES },
      )
      if (rg.exitCode === 2) {
        return {
          content: [
            {
              type: "text",
              text: `ripgrep failed (is rg installed?): ${rg.stderr || rg.stdout}`,
            },
          ],
        }
      }
      const matchLines = rg.stdout.split("\n").filter((line) => line.length > 0)
      const trimmed = matchLines.slice(0, limit)
      let text =
        trimmed.length > 0
          ? trimmed.join("\n")
          : rg.exitCode === 1
            ? "(no matches)"
            : ""
      text = truncateForResponse(text)
      if (rg.timedOut) text += "\n(results may be truncated — search timed out)"
      return { content: [{ type: "text", text }] }
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
}

export function register(server: McpServer): void {
  const handler = createTranscriptSearch()
  server.registerTool(
    "session_transcripts",
    {
      description:
        "List recent agent session transcript files, or search within them for specific content.",
      inputSchema: {
        action: z
          .enum(["list", "search"])
          .describe("list = show recent transcripts, search = find content in transcripts"),
        query: z.string().optional().describe("Search query (only used when action=search)"),
        limit: z.number().optional().describe("Max results to return (default: 10)"),
      },
    },
    wrapToolHandler("session_transcripts", (args: HandlerArgs) => handler(args)),
  )
}
