import { CallToolResultSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js"

export function validateCallToolResult<T>(result: T, toolName: string): T {
  const parsed = CallToolResultSchema.safeParse(result)
  if (!parsed.success) {
    throw new McpError(
      ErrorCode.InternalError,
      `Tool ${toolName} returned invalid CallToolResult shape: ${parsed.error.message}`,
    )
  }
  return result
}

export function wrapToolHandler<Args extends Record<string, unknown>>(
  toolName: string,
  handler: (args: Args, extra?: unknown) => Promise<unknown> | unknown,
): (args: Args, extra?: unknown) => Promise<unknown> {
  return async (args, extra) => {
    const result = await handler(args, extra)
    return validateCallToolResult(result, toolName)
  }
}
