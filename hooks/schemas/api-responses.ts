import { z } from "zod"
import { EventEntrySchema, ConversationSummarySchema } from "./events"

export const HealthResponseSchema = z.object({
  status: z.string(),
  conversations: z.number(),
  uptime: z.number(),
  toolCalls: z.number(),
  exploreCounts: z.number(),
  workerCounts: z.number(),
  ralphActive: z.boolean(),
  continuationLoopsActive: z.number(),
  conversationCount: z.number(),
  allDispatchCounts: z.record(z.string(), z.number()),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const StatusResponseSchema = z.object({
  status: z.string(),
  uptime: z.number(),
  memory: z.object({
    rss: z.number(),
    heapUsed: z.number(),
    heapTotal: z.number(),
  }),
  restartCount: z.number(),
  lastError: z.null(),
  ports: z.object({
    daemon: z.number(),
    configDefault: z.number(),
  }),
  configFiles: z.object({
    user: z.string(),
    project: z.string(),
  }),
  activeConversations: z.number(),
  startTime: z.string(),
})
export type StatusResponse = z.infer<typeof StatusResponseSchema>

export const HookConfigResponseSchema = z.object({
  enabled: z.array(z.string()),
  disabled: z.array(z.string()),
})
export type HookConfigResponse = z.infer<typeof HookConfigResponseSchema>

const BackgroundTaskItemSchema = z.object({
  agentId: z.string(),
  conversationId: z.string(),
  agentType: z.string(),
  description: z.string(),
  startTime: z.number(),
  elapsedMs: z.number(),
})

export const BackgroundTasksResponseSchema = z.object({
  tasks: z.array(BackgroundTaskItemSchema),
  count: z.number(),
})
export type BackgroundTasksResponse = z.infer<typeof BackgroundTasksResponseSchema>

export const ConversationLogResponseSchema = z.array(EventEntrySchema)
export type ConversationLogResponse = z.infer<typeof ConversationLogResponseSchema>

export const ConversationSummaryResponseSchema = ConversationSummarySchema
export type ConversationSummaryResponse = z.infer<typeof ConversationSummaryResponseSchema>
