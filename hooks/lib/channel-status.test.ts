import { describe, test, expect } from "bun:test"
import {
  CHANNEL_FIELDS,
  CHANNEL_STATUS_TABLE,
  getChannelStatus,
  type ChannelField,
  type ChannelStatus,
} from "./channel-status"

const VALID_STATUSES: ReadonlySet<ChannelStatus> = new Set([
  "works",
  "broken",
  "unsupported",
  "unconfirmed",
])

describe("channel-status table shape", () => {
  test("exposes the canonical five output fields as columns", () => {
    expect(CHANNEL_FIELDS).toEqual([
      "permission",
      "updated_input",
      "additional_context",
      "followup_message",
      "env",
    ])
  })

  test("every row has a non-empty event and only known cell keys", () => {
    expect(CHANNEL_STATUS_TABLE.length).toBeGreaterThan(0)
    const fieldSet = new Set<string>(CHANNEL_FIELDS)
    for (const row of CHANNEL_STATUS_TABLE) {
      expect(typeof row.event).toBe("string")
      expect(row.event.length).toBeGreaterThan(0)
      for (const key of Object.keys(row.cells)) {
        expect(fieldSet.has(key)).toBe(true)
      }
    }
  })

  test("event names are unique (single knowledge source, no duplicate rows)", () => {
    const events = CHANNEL_STATUS_TABLE.map((r) => r.event)
    expect(new Set(events).size).toBe(events.length)
  })

  test("every populated cell carries a valid status", () => {
    for (const row of CHANNEL_STATUS_TABLE) {
      for (const cell of Object.values(row.cells)) {
        expect(VALID_STATUSES.has(cell.status)).toBe(true)
      }
    }
  })
})

describe("getChannelStatus helper", () => {
  test("unknown event resolves to unconfirmed default", () => {
    expect(getChannelStatus("noSuchEvent", "permission").status).toBe("unconfirmed")
  })

  test("known event with unpopulated field resolves to unconfirmed default", () => {
    // preToolUse has no `env` cell.
    expect(getChannelStatus("preToolUse", "env").status).toBe("unconfirmed")
  })

  test("preToolUse.updated_input is works (Task 1 probe + forum 151985)", () => {
    const cell = getChannelStatus("preToolUse", "updated_input")
    expect(cell.status).toBe("works")
    expect(cell.evidenceRef).toContain("151985")
  })

  test("preToolUse.permission is works (Task 2 probe)", () => {
    expect(getChannelStatus("preToolUse", "permission").status).toBe("works")
  })

  test("stop.followup_message is works (Task 18)", () => {
    expect(getChannelStatus("stop", "followup_message").status).toBe("works")
  })

  test("beforeShellExecution/MCP/ReadFile updated_input are works", () => {
    expect(getChannelStatus("beforeShellExecution", "updated_input").status).toBe("works")
    expect(getChannelStatus("beforeMCPExecution", "updated_input").status).toBe("works")
    expect(getChannelStatus("beforeReadFile", "updated_input").status).toBe("works")
  })
})

describe("broken + unsupported channels (Task 3 flips)", () => {
  test("postToolUse.additional_context is broken with thread 155689", () => {
    const cell = getChannelStatus("postToolUse", "additional_context")
    expect(cell.status).toBe("broken")
    expect(cell.evidenceRef).toContain("155689")
  })

  test("sessionStart.additional_context is broken with thread 158452", () => {
    const cell = getChannelStatus("sessionStart", "additional_context")
    expect(cell.status).toBe("broken")
    expect(cell.evidenceRef).toContain("158452")
  })

  test("beforeSubmitPrompt.updated_input + additional_context are unsupported (158883)", () => {
    const updated = getChannelStatus("beforeSubmitPrompt", "updated_input")
    const ctx = getChannelStatus("beforeSubmitPrompt", "additional_context")
    expect(updated.status).toBe("unsupported")
    expect(ctx.status).toBe("unsupported")
    expect(updated.evidenceRef).toContain("158883")
    expect(ctx.evidenceRef).toContain("158883")
  })

  test("all broken/unsupported cells expose a verifiable evidenceRef", () => {
    const flagged: ChannelStatus[] = ["broken", "unsupported"]
    for (const row of CHANNEL_STATUS_TABLE) {
      for (const [field, cell] of Object.entries(row.cells)) {
        if (flagged.includes(cell.status)) {
          expect(
            (cell.evidenceRef ?? "").length,
            `${row.event}.${field as ChannelField} must cite evidence`,
          ).toBeGreaterThan(0)
        }
      }
    }
  })
})
