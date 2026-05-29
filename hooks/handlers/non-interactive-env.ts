import type { ConversationState, HandlerMap } from "../types"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const SHELL_TOOLS = new Set(["Shell", "shell", "Bash", "bash"])

const INTERACTIVE_PATTERN =
  /\b(vim|emacs|less|nano|more|rebase\s+-i|commit\s+--amend\b(?!.*-m))\b/

function isNonInteractiveGitCommand(command: string): boolean {
  if (/\bgit\s+commit\b/.test(command) && /(^|\s)(-m|--message)(=|\s)/.test(command)) {
    return true
  }
  return false
}

// NOTE: updated_input is UNCONFIRMED at 3.6.21 (W2.2). When confirmed, replace advisory with: return { updated_input: { command: 'GIT_EDITOR=: GIT_PAGER=cat CI=true ' + command } }
export function createNonInteractiveEnvHandler(
  _conversations: Map<string, ConversationState>,
): Partial<HandlerMap> {
  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!SHELL_TOOLS.has(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const command = (toolInput.command as string) || ""
      if (!command) return {}

      getOrCreateConversation(
        resolveConversationId(input),
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      const snippet = command.slice(0, 80)
      const isGit = /\bgit\b/.test(command)
      const isInteractive = INTERACTIVE_PATTERN.test(command)

      if (isInteractive) {
        return {
          additional_context: `[non-interactive-env] Interactive command detected: "${snippet}". This may hang in non-interactive CI environments. Consider non-interactive alternatives.`,
        }
      }

      if (isGit && !isNonInteractiveGitCommand(command)) {
        return {
          additional_context: `[non-interactive-env] Git command detected. In non-interactive environments, ensure GIT_EDITOR=: GIT_PAGER=cat CI=true are set (or pass --no-edit, -m flags). Current command: "${snippet}"`,
        }
      }

      return {}
    },
  }
}
