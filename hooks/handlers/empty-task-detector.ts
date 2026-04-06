const MIN_OUTPUT_LENGTH = 50

type SubagentStopInput = {
  output?: string
  status: string
}

type DetectorResult = {
  additional_context?: string
}

export function createEmptyTaskDetector() {
  return function handleSubagentStop(input: SubagentStopInput): DetectorResult {
    if (input.status !== "completed") {
      return {}
    }

    const length = input.output?.length ?? 0
    if (length < MIN_OUTPUT_LENGTH) {
      return {
        additional_context: `Subagent returned empty/minimal output (${length} chars). Review and retry with more specific instructions.`,
      }
    }

    return {}
  }
}
