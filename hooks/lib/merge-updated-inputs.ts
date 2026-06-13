/**
 * Merge multiple updated_input responses into a single response object.
 * Used by non-Task preToolUse handlers to combine their mutations.
 *
 * Strategy: shallow merge all updated_input objects in order.
 * Later mutations override earlier ones for the same key.
 */

export interface UpdatedInput {
  [key: string]: unknown
}

export interface HookResponse {
  updated_input?: UpdatedInput
  permission?: string
  additional_context?: string
  [key: string]: unknown
}

/**
 * Merge multiple hook responses into a single response.
 * Combines all updated_input objects via shallow merge.
 * If no updated_input exists in any response, returns undefined.
 *
 * @param responses Array of hook responses to merge
 * @returns Merged response with combined updated_input, or undefined if no mutations
 */
export function mergeUpdatedInputs(responses: HookResponse[]): HookResponse {
  const merged: HookResponse = {}
  let hasUpdatedInput = false

  for (const response of responses) {
    if (response.updated_input) {
      if (!merged.updated_input) {
        merged.updated_input = {}
      }
      // Shallow merge: later mutations override earlier ones
      Object.assign(merged.updated_input, response.updated_input)
      hasUpdatedInput = true
    }

    // Preserve other fields (permission, additional_context, etc.)
    // Later responses override earlier ones for non-updated_input fields
    for (const [key, value] of Object.entries(response)) {
      if (key !== "updated_input" && value !== undefined) {
        merged[key] = value
      }
    }
  }

  // Return empty object if no mutations (pass-through)
  return hasUpdatedInput ? merged : {}
}
