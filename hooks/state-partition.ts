import type {
  ConversationState,
  DurableConversationFields,
  EphemeralConversationFields,
} from "./types"

/**
 * Durable fields survive process restarts; ephemeral fields are runtime-only.
 * Same `conv_id` means same session and last write wins, while different
 * `conv_id` values remain isolated.
 * Pre-upgrade state blobs with `schemaVersion < 2` are dropped on first load.
 */
const DEFAULT_EPHEMERAL_FIELDS: EphemeralConversationFields = {
  composerMode: null,
  ralphState: null,
  boulderState: null,
  continuationCooldownUntil: null,
  consecutiveContinuationFailures: 0,
  toolCallCountAtLastStop: 0,
  consecutiveZeroDeltas: 0,
  lastTodoSnapshot: "",
  abortDetectedAt: null,
  reminderInjected: false,
}

export function partitionState(
  state: ConversationState,
): { durable: DurableConversationFields; ephemeral: EphemeralConversationFields } {
  const durable: DurableConversationFields = {
    id: state.id,
    startedAt: state.startedAt,
    displayTitle: state.displayTitle,
    env: state.env,
    dispatchCounts: state.dispatchCounts,
    dispatchCountsThisTurn: state.dispatchCountsThisTurn,
    contextHistory: state.contextHistory,
    readPaths: state.readPaths,
    injectedPaths: state.injectedPaths,
    pendingWriteArgs: state.pendingWriteArgs,
    toolCallCount: state.toolCallCount,
    recentToolTrail: state.recentToolTrail,
    toolCallsSinceTaskDispatch: state.toolCallsSinceTaskDispatch,
    stoppedAt: state.stoppedAt,
    errorCount: state.errorCount,
    lastCompactionEpoch: state.lastCompactionEpoch,
    compactionSnapshot: state.compactionSnapshot,
    activePlan: state.activePlan,
    continuationStoppedAt: state.continuationStoppedAt,
    todoStates: state.todoStates,
    momusIterations: state.momusIterations,
    subagentOutcomes: state.subagentOutcomes,
    subagentFailureCounts: state.subagentFailureCounts,
    delegateRetryState: state.delegateRetryState,
    shellFailureCounts: state.shellFailureCounts,
    fileEditCounts: state.fileEditCounts,
    mcpCallCounts: state.mcpCallCounts,
    responseCount: state.responseCount,
    estimatedTokens: state.estimatedTokens,
    tokenWarningEmitted: state.tokenWarningEmitted,
    wisdomLearnings: state.wisdomLearnings,
    createdViaFallback: state.createdViaFallback,
  }

  const ephemeral: EphemeralConversationFields = {
    composerMode: state.composerMode,
    ralphState: state.ralphState,
    boulderState: state.boulderState,
    continuationCooldownUntil: state.continuationCooldownUntil,
    consecutiveContinuationFailures: state.consecutiveContinuationFailures,
    toolCallCountAtLastStop: state.toolCallCountAtLastStop,
    consecutiveZeroDeltas: state.consecutiveZeroDeltas,
    lastTodoSnapshot: state.lastTodoSnapshot,
    abortDetectedAt: state.abortDetectedAt,
    reminderInjected: state.reminderInjected,
  }

  return { durable, ephemeral }
}

export function mergeFromDurable(durable: DurableConversationFields): ConversationState {
  return {
    ...durable,
    ...DEFAULT_EPHEMERAL_FIELDS,
  }
}
