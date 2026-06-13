/**
 * stop-continuation-guard: Per-conversation latch to suppress continuation followups
 * when the user explicitly stops the agent.
 *
 * Semantics:
 * - On `/stop` with explicit-stop signals (e.g., stop_hook_active=true), set the latch
 * - The latch suppresses `followup_message` emission in continuationResponse() gate
 * - On `/beforeSubmitPrompt` (new user prompt), clear the latch
 * - Loop state (ralph/boulder) remains untouched; only followup emission is suppressed
 */

const userStoppedLatches = new Map<string, boolean>()

/**
 * Check if a conversation has the user-stopped latch set.
 */
export function isUserStopped(conversationId: string): boolean {
  return userStoppedLatches.get(conversationId) ?? false
}

/**
 * Set the user-stopped latch for a conversation.
 * Called when the user explicitly stops the agent (e.g., stop_hook_active=true).
 */
export function setUserStopped(conversationId: string): void {
  userStoppedLatches.set(conversationId, true)
}

/**
 * Clear the user-stopped latch for a conversation.
 * Called on /beforeSubmitPrompt (new user prompt) to re-enable followups.
 */
export function clearUserStopped(conversationId: string): void {
  userStoppedLatches.delete(conversationId)
}

/**
 * Reset all user-stopped latches.
 * Used for test isolation.
 */
export function resetUserStoppedLatches(): void {
  userStoppedLatches.clear()
}
