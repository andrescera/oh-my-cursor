import { readFileSync, existsSync } from "node:fs"
import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession, globalReadPaths } from "../shared"

const EXPLORE_LIMIT = 6
const WORKER_LIMIT = 8
const WORKER_TYPES = new Set([
  "general-purpose", "generalpurpose",
  "sisyphus", "sisyphus-junior", "hephaestus",
  "atlas", "oracle", "prometheus", "metis", "momus",
])

export function createToolGuardHandlers(
  _sessions: Map<string, SessionState>,
): HandlerMap {
  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)
      const toolInput = (input.tool_input as Record<string, unknown>) || {}

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit", "apply_patch", "ApplyPatch"].includes(toolName)) {
        const filePath = (toolInput.file_path || toolInput.path) as string
        if (filePath && !filePath.includes(".sisyphus") && !filePath.includes("node_modules") && !filePath.includes(".cursor/")) {
          if (existsSync(filePath) && !globalReadPaths.has(filePath) && !session.readPaths.has(filePath)) {
            const reason = "File exists but was not read first: " + filePath + ". Use Read tool first."
            return {
              permission: "deny",
              userMessage: reason,
              agentMessage: reason,
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
              },
            }
          }
        }
      }

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit"].includes(toolName) && input.tool_use_id) {
        session.pendingWriteArgs.set(input.tool_use_id as string, {
          tool: toolName,
          path: toolInput.file_path || toolInput.path,
          content: toolInput.new_string || toolInput.content || toolInput.contents,
        })
      }

      if (["Task", "task", "Agent", "agent"].includes(toolName)) {
        const agentType = (toolInput.subagent_type as string) || (toolInput.agent_type as string) || ""
        if (agentType) {
          const normalized = agentType.toLowerCase().replace("generalpurpose", "general-purpose")
          const agentKey = `subagent:${normalized}`
          session.dispatchCounts[agentKey] = (session.dispatchCounts[agentKey] || 0) + 1
          console.log(`[oh-my-cursor] Dispatch tracked via preToolUse: ${agentKey} (${session.dispatchCounts[agentKey]})`)

          const count = session.dispatchCounts[agentKey]
          const limit = normalized === "explore" ? EXPLORE_LIMIT : WORKER_TYPES.has(normalized) ? WORKER_LIMIT : 0
          if (limit > 0 && count > limit) {
            const label = normalized === "explore" ? "Explore" : "Worker"
            const reason = `[dispatch-limit] ${label} dispatch limit reached (${count}/${limit}). Consider consolidating ${normalized === "explore" ? "searches" : "tasks"}.`
            return {
              permission: "deny",
              userMessage: reason,
              agentMessage: reason,
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: reason,
              },
            }
          }
        }
      }

      session.dispatchCounts[toolName] = (session.dispatchCounts[toolName] || 0) + 1

      return {}
    },

    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const output = JSON.stringify(input.tool_response || input.output || "")
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)
      const toolInput = (input.tool_input as Record<string, unknown>) || {}

      const contextNote = `[${new Date().toISOString()}] ${toolName} completed`
      session.contextHistory.push(contextNote)

      if (session.contextHistory.length > 50) {
        session.contextHistory = session.contextHistory.slice(-30)
      }

      let additionalContext = ""

      if (session.contextHistory.length % 10 === 0) {
        additionalContext += `[oh-my-cursor] Session activity: ${session.contextHistory.length} tool calls this session.`
      }

      if (["edit", "write", "str_replace", "apply_patch", "Edit", "Write", "StrReplace"].includes(toolName)) {
        if (/failed|error|could not|no match|not found in file/i.test(output)) {
          additionalContext += (additionalContext ? "\n\n" : "") +
            "[edit-error-recovery] Edit failed. Read the file first to verify the exact content, then retry with the correct old_string."
        }
      }

      if (["task", "Task"].includes(toolName)) {
        if (/error|failed|timeout|rejected|could not complete/i.test(output)) {
          additionalContext += (additionalContext ? "\n\n" : "") +
            "[delegate-task-retry] Task delegation failed. Consider: (1) simplify the prompt, (2) provide more context/file paths, (3) use a different agent type, (4) break into smaller subtasks."
        }
      }

      if (!["bash", "shell", "read", "Read", "Shell"].includes(toolName)) {
        if (/unexpected token|json.*parse|invalid json|syntaxerror.*json/i.test(output)) {
          additionalContext += (additionalContext ? "\n\n" : "") +
            "[json-error-recovery] JSON parse error detected. Check for: trailing commas, unescaped quotes, missing brackets, or invalid escape sequences."
        }
      }

      if (output.length > 50000) {
        additionalContext += (additionalContext ? "\n\n" : "") +
          "[tool-output-truncator] Output was truncated from " + output.length + " to 30000 chars."
      }

      const readFilePath = (toolInput.file_path as string) || (toolInput.path as string) || (input.file_path as string) || (input.path as string)
      if (["read", "Read"].includes(toolName) && readFilePath) {
        const filePath = readFilePath
        const dir = filePath.substring(0, filePath.lastIndexOf("/"))
        const agentsPath = dir + "/AGENTS.md"
        if (!session.injectedPaths.has(agentsPath)) {
          try {
            const content = readFileSync(agentsPath, "utf-8")
            if (content) {
              session.injectedPaths.add(agentsPath)
              const snippet = content.length > 2000 ? content.slice(0, 2000) + "\n...[truncated]" : content
              additionalContext += (additionalContext ? "\n\n" : "") +
                "[directory-context] AGENTS.md found at " + agentsPath + ":\n" + snippet
            }
          } catch { /* AGENTS.md is optional */ }
        }
      }

      session.toolCallCount++
      if (session.toolCallCount >= 3 && !session.reminderInjected && !["task", "Task", "TodoWrite"].includes(toolName)) {
        session.reminderInjected = true
        additionalContext += (additionalContext ? "\n\n" : "") +
          "[skill-reminder] You have access to skills and the Task tool for delegation. Consider using them for specialized work (git operations, browser automation, code review, etc.)."
      }

      if (["read", "Read"].includes(toolName) && readFilePath) {
        session.readPaths.add(readFilePath)
        globalReadPaths.add(readFilePath)
      }

      return additionalContext
        ? {
            additional_context: additionalContext,
            hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
          }
        : {}
    },

    "/postToolUseFailure": (input) => {
      const toolName = (input.tool_name as string) || ""
      const errorMessage = (input.error as string) || (input.error_message as string) || ((input.tool_response as Record<string, unknown>)?.error as string) || ""
      const convId = (input.conversation_id as string) || (input.session_id as string) || "unknown"
      const session = getOrCreateSession(convId)

      session.errorCount++
      console.error("[oh-my-cursor] Tool failure:", toolName, errorMessage)

      let guidance = ""
      if (/rate.?limit|429|too many requests/i.test(errorMessage)) {
        guidance = "Rate limit hit. Wait a moment before retrying."
      } else if (/timeout|timed out|deadline/i.test(errorMessage)) {
        guidance = "Tool timed out. Consider breaking the task into smaller parts."
      } else if (/permission|denied|forbidden|403/i.test(errorMessage)) {
        guidance = "Permission denied. Check file permissions or authentication."
      } else if (/not found|404|no such file/i.test(errorMessage)) {
        guidance = "Resource not found. Verify the path or URL is correct."
      }

      return guidance
        ? {
            additional_context: "[session-recovery] " + guidance,
            hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: "[session-recovery] " + guidance },
          }
        : {}
    },
  }
}
