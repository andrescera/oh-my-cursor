const MAX_LENGTH = 30_000
const KEEP_CHARS = 10_000

export function createToolOutputTruncator() {
  return (input: Record<string, unknown>): Record<string, unknown> => {
    const output = input.output as string | undefined
    if (!output || output.length <= MAX_LENGTH) return {}

    const head = output.slice(0, KEEP_CHARS)
    const tail = output.slice(-KEEP_CHARS)
    const separator = `\n\n--- [TRUNCATED: ${output.length} chars total, showing first 10k + last 10k] ---\n\n`

    return { modified_output: head + separator + tail }
  }
}
