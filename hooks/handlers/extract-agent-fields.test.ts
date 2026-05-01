import { describe, expect, test } from "bun:test"
import {
  extractAgentTypeFromLogInputs,
  extractAgentIdFromLogInputs,
} from "./extract-agent-fields"

describe("extractAgentTypeFromLogInputs", () => {
  test("prefers toolInput.subagent_type when both top-level and tool_input have values", () => {
    const parsed = { subagent_type: "from-parsed", agent_type: "legacy-type" }
    const toolInput = { subagent_type: "from-tool", agent_type: "tool-agent-type" }
    expect(extractAgentTypeFromLogInputs(parsed, toolInput)).toBe("from-tool")
  })

  test("falls through to toolInput.agent_type when subagent_type missing", () => {
    const parsed = {}
    const toolInput = { agent_type: "explore" }
    expect(extractAgentTypeFromLogInputs(parsed, toolInput)).toBe("explore")
  })

  test("falls through to parsed.subagent_type when toolInput is empty (post-Cursor-upgrade payload shape)", () => {
    const parsed = { subagent_type: "generalPurpose" }
    const toolInput = {}
    expect(extractAgentTypeFromLogInputs(parsed, toolInput)).toBe("generalPurpose")
  })

  test("falls through to parsed.agent_type when only legacy field present", () => {
    const parsed = { agent_type: "oracle" }
    const toolInput = {}
    expect(extractAgentTypeFromLogInputs(parsed, toolInput)).toBe("oracle")
  })

  test("returns undefined when no field is present", () => {
    expect(extractAgentTypeFromLogInputs({}, {})).toBeUndefined()
  })
})

describe("extractAgentIdFromLogInputs", () => {
  test("prefers parsed.agent_id", () => {
    const parsed = { agent_id: "primary", subagent_id: "fallback-sub" }
    const toolInput = { agent_id: "tool-agent", subagent_id: "tool-sub" }
    expect(extractAgentIdFromLogInputs(parsed, toolInput)).toBe("primary")
  })

  test("falls through to parsed.subagent_id when agent_id missing (post-Cursor-upgrade payload shape)", () => {
    const parsed = { subagent_id: "sub-42" }
    const toolInput = {}
    expect(extractAgentIdFromLogInputs(parsed, toolInput)).toBe("sub-42")
  })

  test("falls through to toolInput.agent_id then toolInput.subagent_id", () => {
    expect(
      extractAgentIdFromLogInputs({}, { agent_id: "tool-a", subagent_id: "tool-b" }),
    ).toBe("tool-a")
    expect(extractAgentIdFromLogInputs({}, { subagent_id: "only-sub" })).toBe("only-sub")
  })

  test("returns undefined when no field is present", () => {
    expect(extractAgentIdFromLogInputs({}, {})).toBeUndefined()
  })
})
