import { serve } from "bun"
import { readFileSync, existsSync } from "node:fs"
import { writeContextRule, clearContextRule } from "./scripts/context-injector"
import { STATUS_HTML } from "./mcp-app"

const PORT = parseInt(process.env.OH_MY_CURSOR_PORT || "47847")

type RalphLoopState = {
  active: boolean
  iteration: number
  maxIterations: number
  startedAt: string
}

type BoulderState = {
  active: boolean
  failureCount: number
  lastContinuationAt: string | null
  stagnationCount: number
}

type SessionState = {
  id: string
  startedAt: string
  env: Record<string, string>
  dispatchCounts: Record<string, number>
  contextHistory: string[]
  readPaths: Set<string>
  injectedPaths: Set<string>
  pendingWriteArgs: Map<string, unknown>
  toolCallCount: number
  reminderInjected: boolean
  ralphState: RalphLoopState | null
  boulderState: BoulderState | null
  stoppedAt: string | null
  errorCount: number
  lastCompactionEpoch: number
  compactionSnapshot: unknown | null
}

const sessions = new Map<string, SessionState>()

function getOrCreateSession(conversationId: string): SessionState {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      id: conversationId,
      startedAt: new Date().toISOString(),
      env: {},
      dispatchCounts: {},
      contextHistory: [],
      readPaths: new Set(),
      injectedPaths: new Set(),
      pendingWriteArgs: new Map(),
      toolCallCount: 0,
      reminderInjected: false,
      ralphState: null,
      boulderState: null,
      stoppedAt: null,
      errorCount: 0,
      lastCompactionEpoch: 0,
      compactionSnapshot: null,
    })
  }
  return sessions.get(conversationId)!
}

function parseInput(body: unknown): Record<string, unknown> {
  if (typeof body === "string") return JSON.parse(body)
  return body as Record<string, unknown>
}

const handlers: Record<string, (input: Record<string, unknown>) => Record<string, unknown>> = {
  "/health": () => {
    let totalToolCalls = 0
    let exploreCounts = 0
    let workerCounts = 0
    let ralphActive = false
    let currentSessionId = ""

    for (const [id, session] of sessions) {
      currentSessionId = id
      totalToolCalls += session.toolCallCount
      exploreCounts += session.dispatchCounts["subagent:explore"] || 0
      workerCounts += session.dispatchCounts["subagent:general-purpose"] || 0
      if (session.ralphState?.active) ralphActive = true
    }

    return {
      status: "ok",
      sessions: sessions.size,
      uptime: process.uptime(),
      toolCalls: totalToolCalls,
      exploreCounts,
      workerCounts,
      ralphActive,
      currentSessionId,
    }
  },

  "/sessionStart": (input) => {
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)
    const projectDir = (input.cwd as string) || process.cwd()

    session.env.OH_MY_CURSOR_SESSION_ID = convId
    session.env.OH_MY_CURSOR_PROJECT_DIR = projectDir

    writeContextRule(projectDir, {
      sessionId: convId,
      projectDir,
      activeAgents: [],
      recentTools: [],
      lastUpdated: new Date().toISOString(),
    }).catch((err) => console.error("[oh-my-cursor] Failed to write context rule:", err))

    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: [
          "## oh-my-cursor Context",
          "",
          `Session: ${convId}`,
          `Project: ${projectDir}`,
          `Started: ${session.startedAt}`,
          "",
          "You are operating within the oh-my-cursor multi-agent orchestration system.",
          "Follow the orchestrator rule for all task delegation.",
        ].join("\n"),
      },
    }
  },

  "/sessionEnd": (input) => {
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    sessions.delete(convId)

    const projectDir = (input.cwd as string) || process.cwd()
    clearContextRule(projectDir).catch((err) => console.error("[oh-my-cursor] Failed to clear context rule:", err))

    return {}
  },

  "/preToolUse": (input) => {
    const toolName = (input.tool_name as string) || ""
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)
    const toolInput = (input.tool_input as Record<string, unknown>) || {}

    if (["write", "Write", "str_replace", "StrReplace", "edit", "Edit", "apply_patch", "ApplyPatch"].includes(toolName)) {
      const filePath = (toolInput.file_path || toolInput.path) as string
      if (filePath && !filePath.includes(".sisyphus") && !filePath.includes("node_modules")) {
        if (existsSync(filePath) && !session.readPaths.has(filePath)) {
          return {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: "File exists but was not read first: " + filePath + ". Use Read tool first.",
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

    session.dispatchCounts[toolName] = (session.dispatchCounts[toolName] || 0) + 1

    return {}
  },

  "/postToolUse": (input) => {
    const toolName = (input.tool_name as string) || ""
    const output = JSON.stringify(input.tool_response || "")
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
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

    if (["read", "Read"].includes(toolName) && toolInput.file_path) {
      const filePath = toolInput.file_path as string
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
        } catch (err) { /* AGENTS.md is optional */ }
      }
    }

    session.toolCallCount++
    if (session.toolCallCount >= 3 && !session.reminderInjected && !["task", "Task", "TodoWrite"].includes(toolName)) {
      session.reminderInjected = true
      additionalContext += (additionalContext ? "\n\n" : "") +
        "[skill-reminder] You have access to skills and the Task tool for delegation. Consider using them for specialized work (git operations, browser automation, code review, etc.)."
    }

    if (["read", "Read"].includes(toolName) && toolInput.file_path) {
      session.readPaths.add(toolInput.file_path as string)
    }

    return additionalContext
      ? { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } }
      : {}
  },

  "/postToolUseFailure": (input) => {
    const toolName = (input.tool_name as string) || ""
    const errorMessage = (input.error as string) || ""
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
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
      ? { hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: "[session-recovery] " + guidance } }
      : {}
  },

  "/subagentStart": (input) => {
    const subagentType = (input.agent_type as string) || ""
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    const agentKey = `subagent:${subagentType.toLowerCase()}`
    session.dispatchCounts[agentKey] = (session.dispatchCounts[agentKey] || 0) + 1

    const exploreCount = session.dispatchCounts["subagent:explore"] || 0
    const juniorCount = session.dispatchCounts["subagent:general-purpose"] || 0

    if (subagentType.toLowerCase() === "explore" && exploreCount > 5) {
      console.log(`[oh-my-cursor] Explore dispatch limit reached (${exploreCount}/5)`)
      return {
        hookSpecificOutput: {
          hookEventName: "SubagentStart",
          additionalContext: `[dispatch-limit] Explore dispatch limit reached (${exploreCount}/5). Batch queries into fewer dispatches.`,
        },
      }
    }

    if (juniorCount > 8) {
      console.log(`[oh-my-cursor] Worker dispatch limit reached (${juniorCount}/8)`)
      return {
        hookSpecificOutput: {
          hookEventName: "SubagentStart",
          additionalContext: `[dispatch-limit] Worker dispatch limit reached (${juniorCount}/8). Wait for current workers to complete.`,
        },
      }
    }

    const projectDir = session.env.OH_MY_CURSOR_PROJECT_DIR || process.cwd()
    writeContextRule(projectDir, {
      sessionId: convId,
      projectDir,
      activeAgents: Object.keys(session.dispatchCounts).filter(k => k.startsWith("subagent:")),
      recentTools: session.contextHistory.slice(-5).map(e => e.split(" ").pop() || ""),
      lastUpdated: new Date().toISOString(),
    }).catch((err) => console.error("[oh-my-cursor] Failed to update context rule:", err))

    return {}
  },

  "/subagentStop": (input) => {
    const subagentType = (input.agent_type as string) || ""
    const stopHookActive = Boolean(input.stop_hook_active)
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    if (!stopHookActive) {
      const stopKey = `stop:${subagentType.toLowerCase()}`
      session.dispatchCounts[stopKey] = (session.dispatchCounts[stopKey] || 0) + 1
    }

    return {}
  },

  "/beforeShellExecution": (input) => {
    const toolInput = (input.tool_input as Record<string, unknown>) || {}
    const command = (toolInput.command as string) || ""

    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /mkfs\./,
      /dd\s+if=/,
      />\s*\/dev\/sd/,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Command blocked for safety: ${command}. Use a safer alternative.`,
          },
        }
      }
    }

    return {}
  },

  "/afterShellExecution": () => ({}),

  "/beforeMCPExecution": () => ({}),

  "/afterMCPExecution": () => ({}),

  "/beforeReadFile": (input) => {
    const toolInput = (input.tool_input as Record<string, unknown>) || {}
    const filePath = (toolInput.file_path || input.file_path) as string

    const sensitivePatterns = [/\.env\.local$/, /\.env\.production$/, /credentials\.json$/]
    for (const pattern of sensitivePatterns) {
      if (pattern.test(filePath)) {
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Access to sensitive file blocked: ${filePath}`,
          },
        }
      }
    }

    return {}
  },

  "/afterFileEdit": () => ({}),

  "/afterAgentResponse": () => ({}),

  "/afterAgentThought": (input) => {
    const durationMs = input.duration_ms as number
    if (durationMs && durationMs > 30000) {
      console.log(`[oh-my-cursor] Long thinking block: ${Math.round(durationMs / 1000)}s`)
    }
    return {}
  },

  "/preCompact": (input) => {
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    session.lastCompactionEpoch++
    session.compactionSnapshot = {
      epoch: session.lastCompactionEpoch,
      toolCallCount: session.toolCallCount,
      dispatchCounts: { ...session.dispatchCounts },
      timestamp: new Date().toISOString(),
    }
    session.injectedPaths.clear()
    session.reminderInjected = false

    return {}
  },

  "/stop": (input) => {
    const stopHookActive = Boolean(input.stop_hook_active)
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    if (session.stoppedAt || stopHookActive) {
      return {}
    }

    if (session.ralphState?.active) {
      const ralph = session.ralphState
      const contextStr = session.contextHistory.join(" ")

      if (contextStr.includes("<promise>DONE</promise>") || contextStr.includes("DONE")) {
        session.ralphState = null
        return {}
      }

      ralph.iteration++
      if (ralph.maxIterations > 0 && ralph.iteration >= ralph.maxIterations) {
        session.ralphState = null
        return {}
      }

      return {
        decision: "block",
        reason: "Continue working. Iteration " + ralph.iteration + "/" + (ralph.maxIterations || "unlimited") + ". When fully done, output <promise>DONE</promise>.",
      }
    }

    if (session.contextHistory.length > 0) {
      const hasIncompleteTodos = session.contextHistory.some(
        (entry) => /TodoWrite|in_progress|pending/i.test(entry),
      )
      if (hasIncompleteTodos) {
        if (!session.boulderState) {
          session.boulderState = { active: true, failureCount: 0, lastContinuationAt: null, stagnationCount: 0 }
        }
        session.boulderState.lastContinuationAt = new Date().toISOString()
        return {
          decision: "block",
          reason: "You have incomplete todos. Continue working on them until all are completed or cancelled.",
        }
      }
    }

    return {}
  },

  "/beforeSubmitPrompt": (input) => {
    const userMessage = (input.prompt as string) || ""
    const convId = (input.session_id as string) || (input.conversation_id as string) || "unknown"
    const session = getOrCreateSession(convId)

    let additionalContext = ""

    if (session.stoppedAt) {
      session.stoppedAt = null
    }

    const lowerMsg = userMessage.toLowerCase()
    if (lowerMsg.includes("ultrawork") || lowerMsg.includes("ulw")) {
      additionalContext += "\n[mode:ultrawork] Deep sustained work mode. Work autonomously until fully complete. Use the ralph-loop pattern: iterate, verify, continue until <promise>DONE</promise>."
    }

    if (/\bthink\b|\bthink harder\b|\bthink deeply\b/i.test(userMessage)) {
      additionalContext += "\n[mode:think] Extended reasoning requested. Take extra time to analyze, consider edge cases, and reason step by step before acting."
    }

    if (userMessage.startsWith("/ralph-loop") || userMessage.startsWith("/ralph")) {
      const maxMatch = userMessage.match(/--max-iterations\s+(\d+)/)
      const maxIter = maxMatch ? parseInt(maxMatch[1]) : 0
      session.ralphState = {
        active: true,
        iteration: 0,
        maxIterations: maxIter,
        startedAt: new Date().toISOString(),
      }
      additionalContext += "\n[ralph-loop] Ralph loop activated. Work until done, then output <promise>DONE</promise>."
    }

    if (userMessage.startsWith("/stop-continuation") || userMessage.startsWith("/cancel-ralph")) {
      session.stoppedAt = new Date().toISOString()
      session.ralphState = null
      session.boulderState = null
      additionalContext += "\n[stop] Continuation loops stopped. Returning to normal chat."
    }

    if (additionalContext) {
      return {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: additionalContext.trim(),
        },
      }
    }

    return {}
  },
}

console.log(`[oh-my-cursor] Hook daemon starting on port ${PORT}...`)

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    if (path === "/dashboard") {
      return new Response(STATUS_HTML, {
        headers: { "Content-Type": "text/html" },
      })
    }

    const handler = handlers[path]
    if (!handler) {
      return new Response(JSON.stringify({ error: "unknown hook event" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    }

    try {
      const body = req.method === "POST" ? await req.json() : {}
      const result = handler(parseInput(body))
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (err) {
      console.error(`[oh-my-cursor] Hook error on ${path}:`, err)
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" },
      })
    }
  },
})

console.log(`[oh-my-cursor] Hook daemon ready on http://localhost:${PORT}`)
