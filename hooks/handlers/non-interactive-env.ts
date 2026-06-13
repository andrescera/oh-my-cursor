import type { ConversationState, HandlerMap } from "../types"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"
import { mergeUpdatedInputs } from "../lib/merge-updated-inputs"

const SHELL_TOOLS = new Set(["Shell", "shell", "Bash", "bash"])

const INTERACTIVE_PATTERN =
  /\b(vim|emacs|less|nano|more|rebase\s+-i|commit\s+--amend\b(?!.*-m))\b/

function isNonInteractiveGitCommand(command: string): boolean {
  if (/\bgit\s+commit\b/.test(command) && /(^|\s)(-m|--message)(=|\s)/.test(command)) {
    return true
  }
  return false
}

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

      const isGit = /\bgit\b/.test(command)
      const isInteractive = INTERACTIVE_PATTERN.test(command)

      // Interactive commands are not rewritten; they should be avoided in CI
      if (isInteractive) {
        return {}
      }

      if (isGit && !isNonInteractiveGitCommand(command)) {
        const rewrittenCommand = `GIT_EDITOR=: GIT_PAGER=cat CI=true ${command}`
        return mergeUpdatedInputs([
          {
            updated_input: { command: rewrittenCommand },
          },
        ])
      }

      return {}
    },
  }
}
