import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { wrapToolHandler } from "../validate"

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

export function register(server: McpServer): void {
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
    wrapToolHandler("session_transcripts", ({ action, query, limit: limitRaw }) => {
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
              text: "No agent-transcripts directories found. Expected ~/.cursor/projects/*/agent-transcripts/ or $CLAUDE_PROJECT_DIR/../agent-transcripts/",
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
    }),
  )
}
