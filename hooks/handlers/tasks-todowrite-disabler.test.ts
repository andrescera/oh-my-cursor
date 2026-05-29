import { describe, it, expect, beforeEach } from "bun:test"
import { createTasksTodowriteDisablerHandler } from "./tasks-todowrite-disabler"
import { conversations } from "../shared"

const CONV = "tasks-todowrite-disabler-test-conv"

function todoWrite() {
  return {
    tool_name: "TodoWrite",
    conversation_id: CONV,
    tool_input: { todos: [{ id: "1", content: "x", status: "pending" }] },
  }
}

describe("tasks-todowrite-disabler", () => {
  beforeEach(() => {
    conversations.delete(CONV)
  })

  it("returns advisory when flag enabled and TodoWrite is called", () => {
    const handler = createTasksTodowriteDisablerHandler(conversations, {
      getConfig: () => ({
        context_collector: { tasks_todowrite_disabler_enabled: true },
      }),
    })["/preToolUse"]!

    const result = handler(todoWrite())
    expect(result.additional_context).toContain("[tasks-todowrite-disabler]")
    expect(result.additional_context).toContain("TodoWrite/TodoRead is disabled")
  })

  it("returns no advisory when flag is disabled (default)", () => {
    const handler = createTasksTodowriteDisablerHandler(conversations, {
      getConfig: () => ({
        context_collector: { tasks_todowrite_disabler_enabled: false },
      }),
    })["/preToolUse"]!

    const result = handler(todoWrite())
    expect(result.additional_context).toBeUndefined()
    expect(Object.keys(result)).toHaveLength(0)
  })
})
