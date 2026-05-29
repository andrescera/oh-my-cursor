import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from "node:fs"
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

const HOOK_NAME = "/directory-readme-injector"
const READ_TOOLS = new Set(["Read", "read"])
const MAX_README_CONTENT = 1500

type FsDeps = {
  existsSync: (path: string) => boolean
  readFileSync: (path: string, encoding: "utf-8") => string
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

export function createDirectoryReadmeInjectorHandler(
  _conversations: Map<string, ConversationState>,
  deps?: Partial<FsDeps>,
): Partial<HandlerMap> {
  if (!isHookEnabled(HOOK_NAME)) return {}

  const existsSync = deps?.existsSync ?? fsExistsSync
  const readFileSync = deps?.readFileSync ?? fsReadFileSync

  return {
    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!READ_TOOLS.has(toolName)) return {}

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

      let current = fileDir
      while (current.length >= projectRoot.length) {
        if (!current.includes("/node_modules/") && !current.includes("/.git/")) {
          const dedupeKey = `readme:${current}`
          if (!conversation.injectedPaths.has(dedupeKey)) {
            const readmePath = current + "/README.md"
            if (existsSync(readmePath)) {
              try {
                const raw = readFileSync(readmePath, "utf-8")
                conversation.injectedPaths.add(dedupeKey)
                if (conversation.injectedPaths.size > 100) {
                  conversation.injectedPaths = new Set(
                    Array.from(conversation.injectedPaths).slice(-75),
                  )
                }
                const content =
                  raw.length > MAX_README_CONTENT
                    ? raw.slice(0, MAX_README_CONTENT) + "...[truncated]"
                    : raw
                contextCollector.register(convId, {
                  id: `readme-${current}`,
                  source: "directory-readme-injector",
                  content: `[directory-readme] README.md at ${current}:\n${content}`,
                  priority: "normal",
                })
              } catch {
                /* README.md is optional */
              }
            }
          }
        }
        if (current === projectRoot) break
        const parent = current.slice(0, current.lastIndexOf("/"))
        if (!parent || parent === current) break
        current = parent
      }

      return {}
    },
  }
}
