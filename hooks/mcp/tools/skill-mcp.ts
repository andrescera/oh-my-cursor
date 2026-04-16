import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { z } from "zod"

function getPluginRoot(): string {
  return resolve(import.meta.dir, "..", "..", "..")
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

export function register(server: McpServer): void {
  server.tool(
    "skill_mcp",
    "Read a skill's SKILL.md documentation. Returns the full skill definition for the named skill.",
    {
      skill_name: z
        .string()
        .optional()
        .describe("Name of the skill directory (e.g., 'git-master', 'review-work')"),
    },
    async (args) => {
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
      const resolvedPath = resolve(skillPath)
      if (!resolvedPath.startsWith(resolve(skillsDir))) {
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
    },
  )
}
