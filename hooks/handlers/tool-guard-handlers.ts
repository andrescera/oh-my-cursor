import { readFileSync, existsSync } from "node:fs"
import type { HandlerMap, RecentToolTrailEntry, SessionState } from "../types"
import type { BackgroundTracker } from "./background-tracker"
import { getOrCreateSession, resolveConversationId } from "../shared"
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

const PLAN_MODE_ALLOWED_AGENTS = new Set(["explore", "metis", "momus", "librarian"])

const RECENT_TOOL_TRAIL_MAX = 15
const SKILL_REMINDER_INTERVAL = 20

const SHELL_TOOL_NAMES = new Set(["bash", "shell", "Shell", "Bash"])
const READ_GREP_TOOL_NAMES = new Set(["read", "Read", "grep", "Grep"])
const EDIT_TOOL_NAMES = new Set(["write", "Write", "str_replace", "StrReplace", "edit", "Edit"])
const TASK_DELEGATION_TOOLS = new Set(["task", "Task", "agent", "Agent"])

function pushRecentToolTrail(
  session: SessionState,
  toolName: string,
  toolInput: Record<string, unknown>,
): void {
  const filePath = toolInput.file_path ?? toolInput.path
  const path = typeof filePath === "string" ? filePath : undefined
  const cmd = toolInput.command
  const commandSnippet = typeof cmd === "string" ? cmd.slice(0, 240) : undefined
  const entry: RecentToolTrailEntry = { tool: toolName, path, commandSnippet }
  session.recentToolTrail.push(entry)
  if (session.recentToolTrail.length > RECENT_TOOL_TRAIL_MAX) {
    session.recentToolTrail.shift()
  }
}

function buildSkillReminderContextLines(session: SessionState): string[] {
  const lines: string[] = []
  const everSubagentDispatched = Object.keys(session.dispatchCounts).some((k) => k.startsWith("subagent:"))

  if (session.toolCallsSinceTaskDispatch >= 5) {
    if (!everSubagentDispatched) {
      lines.push(
        "You have made 5+ tool calls without any Task(subagent) dispatch this session — consider Task(explore) or Task(sisyphus-junior) for delegation.",
      )
    } else {
      lines.push(
        "You have made 5+ tool calls since the last Task dispatch — consider Task(explore) or Task(sisyphus-junior) for parallel or specialized work.",
      )
    }
  }

  const trail = session.recentToolTrail
  const gitShell = trail.some(
    (e) => SHELL_TOOL_NAMES.has(e.tool) && e.commandSnippet && /\bgit\b/.test(e.commandSnippet),
  )
  if (gitShell) {
    lines.push("Recent Shell activity includes git commands — consider the git-master skill.")
  }

  const recentWindow = trail.slice(-10)
  const readGrepHits = recentWindow.filter((e) => READ_GREP_TOOL_NAMES.has(e.tool)).length
  if (readGrepHits >= 4) {
    lines.push("Heavy Read/Grep usage in recent tools — consider Task(explore) for broad codebase searches.")
  }

  const editedPaths = new Set<string>()
  for (const e of recentWindow) {
    if (EDIT_TOOL_NAMES.has(e.tool) && e.path) editedPaths.add(e.path)
  }
  if (editedPaths.size >= 3) {
    lines.push("Edits across 3+ distinct files recently — consider Task(sisyphus-junior) for parallel multi-file edits.")
  }

  return lines
}

function clipAdditionalContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return (
    text.slice(0, maxChars) +
    "\n\n[oh-my-cursor: additional context truncated to max_context_chars]"
  )
}

const sessionTokens = new Map<string, number>()

export function cleanupToolGuardSession(convId: string): void {
  sessionTokens.delete(convId)
}

export function createToolGuardHandlers(
  _sessions: Map<string, SessionState>,
  tracker: BackgroundTracker,
): HandlerMap {
  const config = loadConfig()
  const contextWindowMonitor = createContextWindowMonitor(sessionTokens)
  const commentChecker = createCommentChecker()
  const toolOutputTruncator = createToolOutputTruncator()
  const delegateTaskRetry = createDelegateTaskRetry()

  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const convId = resolveConversationId(input)
      const session = getOrCreateSession(convId)
      const toolInput = (input.tool_input as Record<string, unknown>) || {}

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit", "apply_patch", "ApplyPatch"].includes(toolName)) {
        const isEditOperation = Boolean(toolInput.old_string)
        const filePath = (toolInput.file_path || toolInput.path) as string
        if (!isEditOperation && filePath && !filePath.includes(".sisyphus") && !filePath.includes("node_modules") && !filePath.includes(".cursor/")) {
          if (existsSync(filePath) && !session.readPaths.has(filePath)) {
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
          const mode = session.composerMode

          if (mode === "ask") {
            const reason = "[mode-guard] Task dispatches are not allowed in Ask mode."
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

          if (mode === "plan" && !PLAN_MODE_ALLOWED_AGENTS.has(normalized)) {
            const reason = `[mode-guard] Agent type '${normalized}' is not allowed in Plan mode. Only explore, metis, momus, and librarian are allowed.`
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

          const agentKey = `subagent:${normalized}`
          session.dispatchCounts[agentKey] = (session.dispatchCounts[agentKey] || 0) + 1
          console.log(`[oh-my-cursor] Dispatch tracked via preToolUse: ${agentKey} (${session.dispatchCounts[agentKey]})`)

          if (normalized === "momus") {
            session.momusIterations++
            if (session.momusIterations >= 3) {
              return {
                additional_context: "[momus-loop] Momus iteration limit (3) reached. Ask the user whether to continue reviewing or accept the current plan.",
              }
            }
          }

          const limit =
            normalized === "explore"
              ? config.subagent_limits.explore
              : WORKER_TYPES.has(normalized)
                ? config.subagent_limits.worker
                : 0
          if (limit > 0) {
            const activeCount = tracker
              .getActiveTasksForSession(convId)
              .filter((t) => t.agentType === normalized).length
            if (activeCount >= limit) {
              const label = normalized === "explore" ? "Explore" : "Worker"
              const reason = `[dispatch-limit] ${label} concurrent limit reached (${activeCount}/${limit}). Consider consolidating ${normalized === "explore" ? "searches" : "tasks"}.`
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
      }

      session.dispatchCounts[toolName] = (session.dispatchCounts[toolName] || 0) + 1

      return {}
    },

    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const output = JSON.stringify(input.tool_response || input.output || "")
      const convId = resolveConversationId(input)
      const session = getOrCreateSession(convId)
      const toolInput = (input.tool_input as Record<string, unknown>) || {}

      const contextNote = `[${new Date().toISOString()}] ${toolName} completed`
      session.contextHistory.push(contextNote)
      if (session.contextHistory.length > 50) {
        session.contextHistory = session.contextHistory.slice(-30)
      }

      pushRecentToolTrail(session, toolName, toolInput)

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

      if (TASK_DELEGATION_TOOLS.has(toolName)) {
        session.toolCallsSinceTaskDispatch = 0
      } else {
        session.toolCallsSinceTaskDispatch++
      }

      if (session.toolCallCount > 0 && session.toolCallCount % SKILL_REMINDER_INTERVAL === 0) {
        session.reminderInjected = false
      }

      if (["TodoWrite", "todowrite", "todo_write"].includes(toolName)) {
        const todos = toolInput.todos as Array<{ id: string; content: string; status: string }> | undefined
        const merge = toolInput.merge as boolean | undefined
        if (todos && Array.isArray(todos)) {
          if (merge === false) session.todoStates.clear()
          for (const todo of todos) {
            if (todo.id && todo.status) {
              session.todoStates.set(todo.id, todo.status as any)
            }
          }
          const sorted = Array.from(session.todoStates.entries()).sort((a, b) => a[0].localeCompare(b[0]))
          session.lastTodoSnapshot = JSON.stringify(sorted)
          for (const todo of todos) {
            if (todo.id.startsWith("plan-") && todo.status === "in_progress") {
              if (!session.activePlan) {
                session.activePlan = { path: "", phase: todo.id, completedTasks: [] }
              } else {
                session.activePlan.phase = todo.id
              }
            }
            if ((todo.id.includes("plan-write") || todo.id.includes("plan-draft")) && todo.status === "in_progress") {
              session.momusIterations = 0
            }
          }
        }
      }

      if (
        session.toolCallCount >= 3 &&
        !session.reminderInjected &&
        !["task", "Task", "TodoWrite", "todowrite", "todo_write"].includes(toolName)
      ) {
        session.reminderInjected = true
        const base =
          "[skill-reminder] You have access to skills and the Task tool for delegation. Consider using them for specialized work (git operations, browser automation, code review, etc.)."
        const extras = buildSkillReminderContextLines(session)
        const content =
          extras.length > 0 ? `${base}\n${extras.map((line) => `[skill-reminder] ${line}`).join("\n")}` : base
        contextCollector.register(convId, {
          id: "skill-reminder",
          source: "skill-reminder",
          content,
          priority: "low",
        })
      }

      if (["read", "Read"].includes(toolName) && readFilePath) {
        session.readPaths.add(readFilePath)
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
        const dr = delegateTaskRetry(
          {
            tool_input: toolInput as { subagent_type?: string; description?: string },
            output,
          },
          session.delegateRetryState,
        )
        if (dr.additional_context) {
          contextCollector.register(convId, {
            id: "delegate-retry",
            source: "delegate-task-retry",
            content: dr.additional_context,
            priority: "high",
          })
        }
      }

      if (!config.context_collector.enabled) {
        contextCollector.clear(convId)
        const out: Record<string, unknown> = {}
        if (modifiedOutput !== undefined) {
          out.modified_output = modifiedOutput
        }
        return Object.keys(out).length > 0 ? out : {}
      }

      const pending = contextCollector.consume(convId)
      const merged = clipAdditionalContext(pending.merged, config.context_collector.max_context_chars)
      const out: Record<string, unknown> = {}
      if (pending.hasContent) {
        out.additional_context = merged
        out.hookSpecificOutput = { hookEventName: "PostToolUse", additionalContext: merged }
      }
      if (modifiedOutput !== undefined) {
        out.modified_output = modifiedOutput
      }
      return Object.keys(out).length > 0 ? out : {}
    },

    "/postToolUseFailure": (input) => {
      const toolName = (input.tool_name as string) || ""
      const errorMessage = (input.error as string) || (input.error_message as string) || ((input.tool_response as Record<string, unknown>)?.error as string) || ""
      const convId = resolveConversationId(input)
      const session = getOrCreateSession(convId)

      session.errorCount++
      console.error("[oh-my-cursor] Tool failure:", toolName, errorMessage)

      if (!config.context_collector.enabled) {
        contextCollector.clear(convId)
        return {}
      }

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
      const failureMerged = clipAdditionalContext(
        failurePending.merged,
        config.context_collector.max_context_chars,
      )
      return failurePending.hasContent
        ? {
            additional_context: failureMerged,
            hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: failureMerged },
          }
        : {}
    },
  }
}
