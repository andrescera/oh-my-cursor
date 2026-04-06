const CONFUSION_PATTERN = /<(result|answer)\b/i

export function createThinkingBlockValidator() {
  return (input: Record<string, unknown>): Record<string, unknown> => {
    const thought = input.thought as string | undefined
    if (!thought) return {}

    if (CONFUSION_PATTERN.test(thought)) {
      console.error(
        "[oh-my-cursor] Thinking block contains result/answer tags - possible model confusion",
      )
    }

    return {}
  }
}
