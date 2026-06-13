import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { HandlerMap, RecentToolTrailEntry, ConversationState } from "../types"
import type { BackgroundTracker } from "./background-tracker"
import {
  getOrCreateConversation,
  PLAN_PHASE_IDS,
  resolveConversationId,
  wasResolvedViaFallback,
  transitionFromPlanMode,
  derivedProjectRoot,
} from "../shared"
import { loadConfig } from "../config"
import { createContextWindowMonitor } from "./context-window-monitor"
import { createCommentChecker } from "./comment-checker"
import { createToolOutputTruncator } from "./tool-output-truncator"
import { createDelegateTaskRetry } from "./delegate-task-retry"
import { createRulesInjectorHandler } from "./rules-injector"
import { createDirectoryReadmeInjectorHandler } from "./directory-readme-injector"
import { createAgentUsageReminderHandler } from "./agent-usage-reminder"
import { createBashFileReadGuardHandler } from "./bash-file-read-guard"
import { createHashlineReadEnhancerHandler } from "./hashline-read-enhancer"
import { createWriteExistingFileGuardHandler } from "./write-existing-file-guard"
import { createPrometheusMdOnlyHandler } from "./prometheus-md-only"
import { createTasksTodowriteDisablerHandler } from "./tasks-todowrite-disabler"
import { createNonInteractiveEnvHandler } from "./non-interactive-env"
import { createWebfetchRedirectGuardHandler } from "./webfetch-redirect-guard"
import { createSisyphusJuniorNotepadHandler } from "./sisyphus-junior-notepad"
import { contextCollector } from "../context-collector"
import { logEvent } from "../event-logger"
import { redactSecrets } from "../secret-redactor"

function logBlocked(convId: string, reason: string, meta: Record<string, unknown>): void {
  logEvent({
    ts: new Date().toISOString(),
    event: "/preToolUse",
    sessionId: convId,
    action: "blocked",
    meta: { reason, ...meta },
  })
}

const PLAN_MODE_ALLOWED_AGENTS = new Set(["explore", "metis", "momus", "librarian", "oracle"])

const RECENT_TOOL_TRAIL_MAX = 15
const SKILL_REMINDER_INTERVAL = 20

const EXISTS_CACHE_TTL_MS = 30_000
const EXISTS_CACHE_MAX = 500
const existsCache = new Map<string, { exists: boolean; ts: number }>()

function cachedExistsSync(filePath: string): boolean {
  const now = Date.now()
  const hit = existsCache.get(filePath)
  if (hit && now - hit.ts < EXISTS_CACHE_TTL_MS) return hit.exists
  const exists = existsSync(filePath)
  existsCache.set(filePath, { exists, ts: now })
  if (existsCache.size > EXISTS_CACHE_MAX) {
    for (const [k, v] of existsCache) {
      if (now - v.ts >= EXISTS_CACHE_TTL_MS) existsCache.delete(k)
    }
    if (existsCache.size > EXISTS_CACHE_MAX) existsCache.clear()
  }
  return exists
}

const SHELL_TOOL_NAMES = new Set(["bash", "shell", "Shell", "Bash"])
const READ_GREP_TOOL_NAMES = new Set(["read", "Read", "grep", "Grep"])
const EDIT_TOOL_NAMES = new Set(["write", "Write", "str_replace", "StrReplace", "edit", "Edit"])
const TASK_DELEGATION_TOOLS = new Set(["task", "Task", "agent", "Agent"])

function pushRecentToolTrail(
  conversation: ConversationState,
  toolName: string,
  toolInput: Record<string, unknown>,
): void {
  const filePath = toolInput.file_path ?? toolInput.path
  const path = typeof filePath === "string" ? filePath : undefined
  const cmd = toolInput.command
  const commandSnippet = typeof cmd === "string" ? cmd.slice(0, 240) : undefined
  const entry: RecentToolTrailEntry = { tool: toolName, path, commandSnippet }
  conversation.recentToolTrail.push(entry)
  if (conversation.recentToolTrail.length > RECENT_TOOL_TRAIL_MAX) {
    conversation.recentToolTrail.shift()
  }
}

function buildSkillReminderContextLines(conversation: ConversationState): string[] {
  const lines: string[] = []
  const everSubagentDispatched = Object.keys(conversation.dispatchCounts).some((k) => k.startsWith("subagent:"))

  if (conversation.toolCallsSinceTaskDispatch >= 5) {
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

  const trail = conversation.recentToolTrail
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

  const recentTaskDispatch = recentWindow.some((e) => TASK_DELEGATION_TOOLS.has(e.tool))
  if (
    conversation.composerMode === "agent" &&
    conversation.toolCallsSinceTaskDispatch >= 3 &&
    !recentTaskDispatch
  ) {
    lines.push(
      "Available skills for delegation: git-master, playwright, review-work, frontend-ui-ux, dev-browser. Use Task with the relevant skill loaded.",
    )
  }

  return lines
}

function applyContextCollectorConfig(config: ReturnType<typeof loadConfig>): void {
  contextCollector.setConfig({
    maxEntryChars: config.context_collector.max_entry_chars,
    maxContextChars: config.context_collector.max_context_chars,
    priorityBudgets: config.context_collector.priority_budgets,
  })
}

export function createToolGuardHandlers(
  _conversations: Map<string, ConversationState>,
  tracker: BackgroundTracker,
): HandlerMap {
  const contextWindowMonitor = createContextWindowMonitor()
  const commentChecker = createCommentChecker()
  const toolOutputTruncator = createToolOutputTruncator()
  const delegateTaskRetry = createDelegateTaskRetry()

  const rulesInjector = createRulesInjectorHandler(_conversations)
  const directoryReadmeInjector = createDirectoryReadmeInjectorHandler(_conversations)
  const agentUsageReminder = createAgentUsageReminderHandler(_conversations)
  const bashFileReadGuard = createBashFileReadGuardHandler(_conversations)
  const hashlineReadEnhancer = createHashlineReadEnhancerHandler(_conversations)
  const writeExistingFileGuard = createWriteExistingFileGuardHandler(_conversations)
  const prometheusMdOnly = createPrometheusMdOnlyHandler(_conversations)
  const tasksTodowriteDisabler = createTasksTodowriteDisablerHandler(_conversations)
  const nonInteractiveEnv = createNonInteractiveEnvHandler(_conversations)
  const webfetchGuard = createWebfetchRedirectGuardHandler(_conversations)
  const sisyphusNotepad = createSisyphusJuniorNotepadHandler(_conversations)
  const portedPreToolUse = [
    tasksTodowriteDisabler,
    nonInteractiveEnv,
    writeExistingFileGuard,
    prometheusMdOnly,
    webfetchGuard,
    sisyphusNotepad,
  ]
    .map((handler) => handler["/preToolUse"])
    .filter((fn): fn is NonNullable<typeof fn> => typeof fn === "function")
  const portedPostToolUse = [
    rulesInjector,
    directoryReadmeInjector,
    agentUsageReminder,
    bashFileReadGuard,
    hashlineReadEnhancer,
    webfetchGuard,
  ]
    .map((handler) => handler["/postToolUse"])
    .filter((fn): fn is NonNullable<typeof fn> => typeof fn === "function")

  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      console.log(`[oh-my-cursor][preToolUse] convId=${convId} | tool=${toolName} | composerMode=${conversation.composerMode} | toolCallCount=${conversation.toolCallCount}`)

      for (const portedHandler of portedPreToolUse) {
        const portedResult = portedHandler(input)
        if (portedResult && Object.keys(portedResult).length > 0) {
          return portedResult
        }
      }

      if (["Write", "write"].includes(toolName)) {
        const currentMode = (input.mode as string) || (input.composerMode as string) || conversation.composerMode
        if (currentMode === "plan") {
          const rawPath = (toolInput.file_path || toolInput.path) as string | undefined
          if (rawPath) {
            const allowed = rawPath.includes(".cursor/plans/") || rawPath.includes(".cursor/drafts/")
            if (!allowed) {
              logBlocked(convId, "plan_write_guard", { path: redactSecrets(rawPath).slice(0, 1024), mode: "plan" })
              const reason = `[mode-guard] Write is restricted to .cursor/plans/ and .cursor/drafts/ in Plan mode. Refusing: ${rawPath}`
              const advisory = `[mode-guard] Write blocked in Plan mode: ${rawPath}. Only .cursor/plans/ and .cursor/drafts/ are writable in Plan mode. Switch to Agent mode to write to this path.`
              contextCollector.register(convId, {
                id: "plan-write-guard",
                source: "plan-write-guard",
                content: advisory,
                priority: "critical",
              })
              return {
                decision: "deny",
                user_message: reason,
                agent_message: reason,
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

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit", "apply_patch", "ApplyPatch"].includes(toolName)) {
        const isEditOperation = Boolean(toolInput.old_string)
        const rawWritePath = (toolInput.file_path || toolInput.path) as string
        const filePath = rawWritePath ? resolve(rawWritePath) : ""
        if (!isEditOperation && filePath && !filePath.includes(".sisyphus") && !filePath.includes("node_modules") && !filePath.includes(".cursor/")) {
          if (cachedExistsSync(filePath) && !conversation.readPaths.has(filePath)) {
            console.log(`[oh-my-cursor][read-guard] WARN write without read: "${filePath}" | conversation: ${convId}`)
            contextCollector.register(convId, {
              id: "read-before-write",
              source: "read-before-write",
              content: `[read-before-write] Writing to "${filePath}" without reading it first. Consider reading the file to verify current contents before overwriting.`,
              priority: "normal",
            })
          }
        }
      }

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit"].includes(toolName) && input.tool_use_id) {
        conversation.pendingWriteArgs.set(input.tool_use_id as string, {
          tool: toolName,
          path: toolInput.file_path || toolInput.path,
          content: toolInput.new_string || toolInput.content || toolInput.contents,
        })
        if (conversation.pendingWriteArgs.size > 20) {
          const oldest = conversation.pendingWriteArgs.keys().next().value
          if (oldest !== undefined) {
            conversation.pendingWriteArgs.delete(oldest)
          }
        }
      }

      if (["Task", "task", "Agent", "agent"].includes(toolName)) {
        const agentType = (toolInput.subagent_type as string) || (toolInput.agent_type as string) || ""
        if (agentType) {
          const normalized = agentType.toLowerCase().replace("generalpurpose", "general-purpose")
          const currentMode = (input.mode as string) || (input.composerMode as string) || conversation.composerMode

          let resolvedMode = currentMode
          if (resolvedMode === "plan") {
            const allPlanDone = PLAN_PHASE_IDS.every((id) => {
              const s = conversation.todoStates.get(id)
              return !s || s === "completed" || s === "cancelled"
            })
            if (allPlanDone) {
              console.log(
                `[oh-my-cursor][preToolUse] Plan-complete override: all plan todos done, transitioning to agent`,
              )
              transitionFromPlanMode(conversation)
              resolvedMode = "agent"
            }
          }

          if (resolvedMode === "ask") {
            logBlocked(convId, "ask_task_guard", { agent: redactSecrets(normalized).slice(0, 256), mode: "ask" })
            const reason = "[mode-guard] Task dispatches are not allowed in Ask mode."
            const advisory =
              "[mode-guard] Task dispatches blocked in Ask mode. Ask mode is read-only advisory — switch to Agent mode to dispatch subagents."
            contextCollector.register(convId, {
              id: "ask-task-guard",
              source: "ask-task-guard",
              content: advisory,
              priority: "critical",
            })
            return {
              decision: "deny",
              user_message: reason,
              agent_message: reason,
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

          if (resolvedMode === "plan" && !PLAN_MODE_ALLOWED_AGENTS.has(normalized)) {
            logBlocked(convId, "plan_agent_guard", { agent: redactSecrets(normalized).slice(0, 256), mode: "plan" })
            const reason = `[mode-guard] Agent type '${normalized}' is not allowed in Plan mode. Only explore, metis, momus, librarian, and oracle are allowed.`
            const advisory = `[mode-guard] Agent type '${normalized}' blocked in Plan mode. Only explore, metis, momus, librarian, and oracle are allowed in Plan mode.`
            contextCollector.register(convId, {
              id: "plan-agent-guard",
              source: "plan-agent-guard",
              content: advisory,
              priority: "critical",
            })
            return {
              decision: "deny",
              user_message: reason,
              agent_message: reason,
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

          if (normalized === "momus") {
            const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
            if (conversation.momusIterations >= config.momus.max_iterations) {
              return {
                additional_context: `[momus-loop] Momus iteration limit (${config.momus.max_iterations}) reached. Ask the user whether to continue reviewing or accept the current plan.`,
              }
            }
          }

          console.log(`[oh-my-cursor][preToolUse:task] agentType=${normalized} | mode=${currentMode}`)

          conversation.dispatchCounts[agentKey] = (conversation.dispatchCounts[agentKey] || 0) + 1
          conversation.dispatchCountsThisTurn[agentKey] = (conversation.dispatchCountsThisTurn[agentKey] || 0) + 1
          console.log(`[oh-my-cursor] Dispatch tracked via preToolUse: ${agentKey} (${conversation.dispatchCounts[agentKey]})`)
          if (normalized === "momus") {
            conversation.momusIterations++
          }
        }
      }

      conversation.dispatchCounts[toolName] = (conversation.dispatchCounts[toolName] || 0) + 1
      conversation.dispatchCountsThisTurn[toolName] = (conversation.dispatchCountsThisTurn[toolName] || 0) + 1

      if (["TodoWrite", "todowrite", "todo_write"].includes(toolName)) {
        const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
        if (config.context_collector.todo_tracking_via_pretool) {
          const todos = toolInput.todos as Array<{ id: string; content: string; status: string }> | undefined
          const merge = toolInput.merge as boolean | undefined
          if (todos && Array.isArray(todos)) {
            if (merge === false) conversation.todoStates.clear()
            const validStatuses = new Set(["pending", "in_progress", "completed", "cancelled"])
            for (const todo of todos) {
              if (todo.id && typeof todo.id === "string" && typeof todo.status === "string") {
                const normalized = validStatuses.has(todo.status) ? todo.status as "pending" | "in_progress" | "completed" | "cancelled" : "pending"
                conversation.todoStates.set(todo.id, normalized)
              }
            }
            const sorted = Array.from(conversation.todoStates.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            conversation.lastTodoSnapshot = JSON.stringify(sorted)
            for (const todo of todos) {
              if (todo.id.startsWith("plan-") && todo.status === "in_progress") {
                if (!conversation.activePlan) {
                  conversation.activePlan = { path: "", phase: todo.id, completedTasks: [] }
                } else {
                  conversation.activePlan.phase = todo.id
                }
              }
              if ((todo.id.includes("plan-write") || todo.id.includes("plan-draft")) && todo.status === "in_progress") {
                conversation.momusIterations = 0
              }
              if (todo.id.includes("plan-momus") && todo.status === "in_progress") {
                conversation.momusIterations = 0
              }
            }
          }
        }
      }

      for (const portedHandler of portedPreToolUse) {
        const result = portedHandler(input)
        if (result.permission === "deny") {
          return result
        }
      }

      return {}
    },

    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const output = JSON.stringify(input.tool_response || input.output || "")
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)

      const contextNote = `[${new Date().toISOString()}] ${toolName} completed`
      conversation.contextHistory.push(contextNote)
      if (conversation.contextHistory.length > 50) {
        conversation.contextHistory = conversation.contextHistory.slice(-30)
      }

      pushRecentToolTrail(conversation, toolName, toolInput)

      if (conversation.contextHistory.length % 10 === 0) {
        contextCollector.register(convId, {
          id: "conversation-activity",
          source: "conversation-activity",
          content: `[oh-my-cursor] Session activity: ${conversation.contextHistory.length} tool calls this session.`,
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

      if (
        ["write", "Write", "str_replace", "StrReplace", "edit", "Edit"].includes(toolName) &&
        input.tool_use_id &&
        !/failed|error|could not|no match|not found in file/i.test(output)
      ) {
        conversation.pendingWriteArgs.delete(input.tool_use_id as string)
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
        let dir = filePath.substring(0, filePath.lastIndexOf("/"))

        let projectRoot = dir
        let searchDir = dir
        while (searchDir && searchDir !== "/") {
          if (existsSync(searchDir + "/.git") || existsSync(searchDir + "/package.json")) {
            projectRoot = searchDir
            break
          }
          searchDir = searchDir.substring(0, searchDir.lastIndexOf("/")) || "/"
        }

        let injectedCount = 0
        const MAX_AGENTS_PER_READ = 5
        let current = dir
        while (current.length >= projectRoot.length && injectedCount < MAX_AGENTS_PER_READ) {
          if (current.includes("/node_modules/") || current.includes("/.git/")) {
            current = current.substring(0, current.lastIndexOf("/")) || ""
            continue
          }
          const agentsPath = current + "/AGENTS.md"
          if (!conversation.injectedPaths.has(agentsPath)) {
            try {
              const content = readFileSync(agentsPath, "utf-8")
              if (content) {
                conversation.injectedPaths.add(agentsPath)
                if (conversation.injectedPaths.size > 100) {
                  const arr = Array.from(conversation.injectedPaths)
                  conversation.injectedPaths = new Set(arr.slice(-75))
                }
                const snippet = content.length > 2000 ? content.slice(0, 2000) + "\n...[truncated]" : content
                contextCollector.register(convId, {
                  id: `agents-${agentsPath}`,
                  source: "directory-context",
                  content: "[directory-context] AGENTS.md found at " + agentsPath + ":\n" + snippet,
                  priority: "normal",
                })
                injectedCount++
              }
             } catch (err) { 
               console.debug('[tool-guard] path check:', agentsPath, err)
             }
          }
          if (current === projectRoot) break
          current = current.substring(0, current.lastIndexOf("/")) || ""
        }
      }

      conversation.toolCallCount++

      if (TASK_DELEGATION_TOOLS.has(toolName)) {
        conversation.toolCallsSinceTaskDispatch = 0
      } else {
        conversation.toolCallsSinceTaskDispatch++
      }

      if (conversation.toolCallCount > 0 && conversation.toolCallCount % SKILL_REMINDER_INTERVAL === 0) {
        conversation.reminderInjected = false
      }

      if (["TodoWrite", "todowrite", "todo_write"].includes(toolName) && !config.context_collector.todo_tracking_via_pretool) {
        const todos = toolInput.todos as Array<{ id: string; content: string; status: string }> | undefined
        const merge = toolInput.merge as boolean | undefined
        if (todos && Array.isArray(todos)) {
          if (merge === false) conversation.todoStates.clear()
          const validStatuses = new Set(["pending", "in_progress", "completed", "cancelled"])
          for (const todo of todos) {
            if (todo.id && typeof todo.id === "string" && typeof todo.status === "string") {
              const normalized = validStatuses.has(todo.status) ? todo.status as "pending" | "in_progress" | "completed" | "cancelled" : "pending"
              conversation.todoStates.set(todo.id, normalized)
            }
          }
          const sorted = Array.from(conversation.todoStates.entries()).sort((a, b) => a[0].localeCompare(b[0]))
          conversation.lastTodoSnapshot = JSON.stringify(sorted)
          for (const todo of todos) {
            if (todo.id.startsWith("plan-") && todo.status === "in_progress") {
              if (!conversation.activePlan) {
                conversation.activePlan = { path: "", phase: todo.id, completedTasks: [] }
              } else {
                conversation.activePlan.phase = todo.id
              }
            }
            if ((todo.id.includes("plan-write") || todo.id.includes("plan-draft")) && todo.status === "in_progress") {
              conversation.momusIterations = 0
            }
            if (todo.id.includes("plan-momus") && todo.status === "in_progress") {
              conversation.momusIterations = 0
            }
          }
        }
      }

      if (
        conversation.toolCallCount >= 3 &&
        !conversation.reminderInjected &&
        !["task", "Task", "TodoWrite", "todowrite", "todo_write"].includes(toolName)
      ) {
        conversation.reminderInjected = true
        const base =
          "[skill-reminder] You have access to skills and the Task tool for delegation. Consider using them for specialized work (git operations, browser automation, code review, etc.)."
        const extras = buildSkillReminderContextLines(conversation)
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
        const resolved = resolve(readFilePath)
        conversation.readPaths.add(resolved)
        if (conversation.readPaths.size > 200) {
          const arr = Array.from(conversation.readPaths)
          conversation.readPaths = new Set(arr.slice(-150))
        }
        console.log(`[oh-my-cursor][read-guard] Tracked read: "${resolved}" (raw: "${readFilePath}") | conversation: ${convId}`)
      }

      console.log(`[oh-my-cursor][postToolUse] convId=${convId} | tool=${toolName} | toolCallCount=${conversation.toolCallCount} | readTracked=${["read", "Read"].includes(toolName) && readFilePath ? resolve(readFilePath) : "n/a"}`)

      contextWindowMonitor({ conversation, content: output, conversationId: convId })

      commentChecker({ tool_name: toolName, output, conversationId: convId })

      const trunc = toolOutputTruncator({ output, conversationId: convId })
      let modifiedOutput: string | undefined
      const truncMod = trunc.modified_output as string | undefined
      if (truncMod !== undefined) {
        modifiedOutput = truncMod
      }

      if (["task", "Task"].includes(toolName)) {
        delegateTaskRetry(
          {
            tool_input: toolInput as { subagent_type?: string; description?: string },
            output,
            conversationId: convId,
          },
          conversation.delegateRetryState,
        )
      }

      for (const portedHandler of portedPostToolUse) {
        portedHandler(input)
      }

      if (!config.context_collector.enabled) {
        contextCollector.clear(convId)
        const out: Record<string, unknown> = {}
        if (modifiedOutput !== undefined) {
          out.modified_output = modifiedOutput
        }
        return Object.keys(out).length > 0 ? out : {}
      }

      applyContextCollectorConfig(config)
      const out: Record<string, unknown> = {}
      if (modifiedOutput !== undefined) {
        out.modified_output = modifiedOutput
      }
      return Object.keys(out).length > 0 ? out : {}
    },

    "/postToolUseFailure": (input) => {
      const toolName = (input.tool_name as string) || ""
      const errorMessage = (input.error as string) || (input.error_message as string) || ((input.tool_response as Record<string, unknown>)?.error as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))

      if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit"].includes(toolName) && input.tool_use_id) {
        conversation.pendingWriteArgs.delete(input.tool_use_id as string)
      }

      conversation.errorCount++
      console.error("[oh-my-cursor] Tool failure:", toolName, errorMessage)

      const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
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
          source: "conversation-recovery",
          content: "[conversation-recovery] " + guidance,
          priority: "critical",
        })
      }
      applyContextCollectorConfig(config)
      return {}
    },
  }
}
