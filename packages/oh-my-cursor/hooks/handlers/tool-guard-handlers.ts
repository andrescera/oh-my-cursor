import { readFileSync, existsSync } from "node:fs"
import type { SessionState, HandlerMap } from "../types"
import { getOrCreateSession, globalReadPaths } from "../shared"
import { loadConfig } from "../config"
import { createContextWindowMonitor } from "./context-window-monitor"
import { createCommentChecker } from "./comment-checker"
import { createToolOutputTruncator } from "./tool-output-truncator"
import { createDelegateTaskRetry } from "./delegate-task-retry"
import { contextCollector } from "../context-collector"

const WORKER_TYPES = new Set([
  "general-purpose", "generalpurpose",
  "sisyphus", "sisyphus-junior", "hephaestus",
  "atlas", "oracle", "prometheus", "metis", "momus",
])

export function createToolGuardHandlers(
  _sessions: Map<string, SessionState>,
): HandlerMap {
  const sessionTokens = new Map<string, number>()
  const failureCounts = new Map<string, number>()
  const config = loadConfig()
  const contextWindowMonitor = createContextWindowMonitor(sessionTokens)
  const commentChecker = createCommentChecker()
  const toolOutputTruncator = createToolOutputTruncator()
  const delegateTaskRetry = createDelegateTaskRetry(failureCounts)

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
          const limit =
            normalized === "explore"
              ? config.subagent_limits.explore
              : WORKER_TYPES.has(normalized)
                ? config.subagent_limits.worker
                : 0
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

      if (session.contextHistory.length % 10 === 0) {
        contextCollector.register(convId, {
          id: "session-activity",
          source: "session-activity",
          content: `[oh-my-cursor] Session activity: ${session.contextHistory.length} tool calls this session.`,
          priority: "low",
        })
      }

      if (["edit", "write", "str_replace", "apply_patch", "Edit", "Write", "StrReplace"].includes(toolName)) {
        if (/failed|error|could not|no match|not found in file/i.test(output)) {
          contextCollector.register(convId, {
            id: "edit-error",
            source: "edit-error-recovery",
            content: "[edit-error-recovery] Edit failed. Read the file first to verify the exact content, then retry with the correct old_string.",
            priority: "critical",
          })
        }
      }

      if (!["bash", "shell", "read", "Read", "Shell"].includes(toolName)) {
        if (/unexpected token|json.*parse|invalid json|syntaxerror.*json/i.test(output)) {
          contextCollector.register(convId, {
            id: "json-error",
            source: "json-error-recovery",
            content: "[json-error-recovery] JSON parse error detected. Check for: trailing commas, unescaped quotes, missing brackets, or invalid escape sequences.",
            priority: "high",
          })
        }
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
              contextCollector.register(convId, {
                id: `agents-${agentsPath}`,
                source: "directory-context",
                content: "[directory-context] AGENTS.md found at " + agentsPath + ":\n" + snippet,
                priority: "normal",
              })
            }
          } catch { /* AGENTS.md is optional */ }
        }
      }

      session.toolCallCount++
      if (session.toolCallCount >= 3 && !session.reminderInjected && !["task", "Task", "TodoWrite"].includes(toolName)) {
        session.reminderInjected = true
        contextCollector.register(convId, {
          id: "skill-reminder",
          source: "skill-reminder",
          content: "[skill-reminder] You have access to skills and the Task tool for delegation. Consider using them for specialized work (git operations, browser automation, code review, etc.).",
          priority: "low",
        })
      }

      if (["read", "Read"].includes(toolName) && readFilePath) {
        session.readPaths.add(readFilePath)
        globalReadPaths.add(readFilePath)
      }

      const cw = contextWindowMonitor({ sessionId: convId, content: output })
      if (cw.additional_context) {
        contextCollector.register(convId, {
          id: "context-window",
          source: "context-window-monitor",
          content: cw.additional_context,
          priority: "high",
        })
      }

      const cc = commentChecker({ tool_name: toolName, output })
      const ccCtx = cc.additional_context as string | undefined
      if (ccCtx) {
        contextCollector.register(convId, {
          id: "comment-check",
          source: "comment-checker",
          content: ccCtx,
          priority: "high",
        })
      }

      const trunc = toolOutputTruncator({ output })
      let modifiedOutput: string | undefined
      const truncMod = trunc.modified_output as string | undefined
      if (truncMod !== undefined) {
        modifiedOutput = truncMod
        contextCollector.register(convId, {
          id: "truncation-notice",
          source: "tool-output-truncator",
          content: `[tool-output-truncator] Output was truncated from ${output.length} chars.`,
          priority: "normal",
        })
      }

      if (["task", "Task"].includes(toolName)) {
        const dr = delegateTaskRetry({
          tool_input: toolInput as { subagent_type?: string; description?: string },
          output,
        })
        if (dr.additional_context) {
          contextCollector.register(convId, {
            id: "delegate-retry",
            source: "delegate-task-retry",
            content: dr.additional_context,
            priority: "high",
          })
        }
      }

      const pending = contextCollector.consume(convId)
      const out: Record<string, unknown> = {}
      if (pending.hasContent) {
        out.additional_context = pending.merged
        out.hookSpecificOutput = { hookEventName: "PostToolUse", additionalContext: pending.merged }
      }
      if (modifiedOutput !== undefined) {
        out.modified_output = modifiedOutput
      }
      return Object.keys(out).length > 0 ? out : {}
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

      if (guidance) {
        contextCollector.register(convId, {
          id: "recovery-guidance",
          source: "session-recovery",
          content: "[session-recovery] " + guidance,
          priority: "critical",
        })
      }
      const failurePending = contextCollector.consume(convId)
      return failurePending.hasContent
        ? {
            additional_context: failurePending.merged,
            hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: failurePending.merged },
          }
        : {}
    },
  }
}
