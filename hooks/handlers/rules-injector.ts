import {
  existsSync as fsExistsSync,
  readFileSync as fsReadFileSync,
  readdirSync as fsReaddirSync,
} from "node:fs"
import { resolve } from "node:path"
import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { isHookEnabled } from "../hook-config"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const HOOK_NAME = "/rules-injector"
const TRACKED_TOOLS = new Set([
  "Read",
  "read",
  "StrReplace",
  "str_replace",
  "Write",
  "write",
  "Edit",
  "edit",
])
const MAX_RULE_CONTENT = 2000
const MAX_RULES_PER_READ = 3

type FsDeps = {
  existsSync: (path: string) => boolean
  readFileSync: (path: string, encoding: "utf-8") => string
  readdirSync: (path: string) => string[]
}

type RuleMetadata = {
  globs: string[]
  alwaysApply: boolean
  description: string
  body: string
}

function findProjectRoot(startDir: string, existsSync: FsDeps["existsSync"]): string {
  let current = startDir
  while (current && current !== "/") {
    if (existsSync(current + "/.git") || existsSync(current + "/package.json")) {
      return current
    }
    const parent = current.slice(0, current.lastIndexOf("/"))
    if (!parent || parent === current) break
    current = parent
  }
  return startDir
}

function parseFrontmatter(raw: string): RuleMetadata {
  const globs: string[] = []
  let alwaysApply = false
  let description = ""
  let body = raw

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (match) {
    body = match[2]
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":")
      if (idx === -1) continue
      const key = line.slice(0, idx).trim()
      let value = line.slice(idx + 1).trim()
      if (key === "globs") {
        value = value.replace(/^\[/, "").replace(/\]$/, "")
        for (const part of value.split(",")) {
          const cleaned = part.trim().replace(/^["']/, "").replace(/["']$/, "")
          if (cleaned) globs.push(cleaned)
        }
      } else if (key === "alwaysApply") {
        alwaysApply = value === "true"
      } else if (key === "description") {
        description = value.replace(/^["']/, "").replace(/["']$/, "")
      }
    }
  }

  return { globs, alwaysApply, description, body: body.trim() }
}

function globToRegExp(glob: string): RegExp {
  let pattern = ""
  let i = 0
  while (i < glob.length) {
    const char = glob[i]
    if (char === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*"
        i += 2
        if (glob[i] === "/") i++
        continue
      }
      pattern += "[^/]*"
    } else if (char === "?") {
      pattern += "[^/]"
    } else if (".+^${}()|[]\\".includes(char)) {
      pattern += "\\" + char
    } else {
      pattern += char
    }
    i++
  }
  return new RegExp("^" + pattern + "$")
}

function matchRule(meta: RuleMetadata, relativePath: string): { applies: boolean; reason: string } {
  if (meta.alwaysApply) return { applies: true, reason: "always apply" }
  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1)
  for (const glob of meta.globs) {
    const target = glob.includes("/") ? relativePath : basename
    if (globToRegExp(glob).test(target)) {
      return { applies: true, reason: `glob: ${glob}` }
    }
  }
  return { applies: false, reason: "" }
}

export function createRulesInjectorHandler(
  _conversations: Map<string, ConversationState>,
  deps?: Partial<FsDeps>,
): Partial<HandlerMap> {
  if (!isHookEnabled(HOOK_NAME)) return {}

  const existsSync = deps?.existsSync ?? fsExistsSync
  const readFileSync = deps?.readFileSync ?? fsReadFileSync
  const readdirSync = deps?.readdirSync ?? fsReaddirSync

  return {
    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!TRACKED_TOOLS.has(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const rawPath =
        (toolInput.file_path as string) ||
        (toolInput.path as string) ||
        (input.file_path as string) ||
        (input.path as string)
      if (!rawPath) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      const filePath = resolve(rawPath)
      const fileDir = filePath.slice(0, filePath.lastIndexOf("/")) || "/"
      const projectRoot = findProjectRoot(fileDir, existsSync)

      const candidates: Array<{ rulePath: string; distance: number }> = []
      let current = fileDir
      let distance = 0
      while (current.length >= projectRoot.length) {
        if (!current.includes("/node_modules/") && !current.includes("/.git/")) {
          const rulesDir = current + "/.cursor/rules"
          if (existsSync(rulesDir)) {
            let files: string[] = []
            try {
              files = readdirSync(rulesDir)
            } catch {
              files = []
            }
            for (const file of files) {
              if (file.endsWith(".mdc")) {
                candidates.push({ rulePath: rulesDir + "/" + file, distance })
              }
            }
          }
        }
        if (current === projectRoot) break
        const parent = current.slice(0, current.lastIndexOf("/"))
        if (!parent || parent === current) break
        current = parent
        distance++
      }

      candidates.sort((a, b) => a.distance - b.distance)

      const relativePath =
        projectRoot && filePath.startsWith(projectRoot + "/")
          ? filePath.slice(projectRoot.length + 1)
          : filePath

      let injected = 0
      for (const candidate of candidates) {
        if (injected >= MAX_RULES_PER_READ) break
        const dedupeKey = `rule:${candidate.rulePath}`
        if (conversation.injectedPaths.has(dedupeKey)) continue

        let raw: string
        try {
          raw = readFileSync(candidate.rulePath, "utf-8")
        } catch {
          continue
        }

        const meta = parseFrontmatter(raw)
        const match = matchRule(meta, relativePath)
        if (!match.applies) continue

        conversation.injectedPaths.add(dedupeKey)
        if (conversation.injectedPaths.size > 100) {
          conversation.injectedPaths = new Set(Array.from(conversation.injectedPaths).slice(-75))
        }

        const ruleDisplay =
          projectRoot && candidate.rulePath.startsWith(projectRoot + "/")
            ? candidate.rulePath.slice(projectRoot.length + 1)
            : candidate.rulePath
        const content =
          meta.body.length > MAX_RULE_CONTENT
            ? meta.body.slice(0, MAX_RULE_CONTENT) + "...[truncated]"
            : meta.body

        contextCollector.register(convId, {
          id: `rule-${candidate.rulePath}`,
          source: "rules-injector",
          content: `[Rule: ${ruleDisplay}][Match: ${match.reason}]\n${content}`,
          priority: "high",
        })
        injected++
      }

      return {}
    },
  }
}
