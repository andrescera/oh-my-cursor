/**
 * Hook channel-status knowledge table.
 *
 * A single, typed, read-only source of truth for which `hook event × output
 * field` combinations actually take effect in Cursor at the current line.
 * Derived verbatim from the canonical status catalog in
 * `docs/internal/hook-response-fields.md` (Task 3 truth-sync, the 3.7 flips).
 *
 * This module is the ONLY in-repo knowledge source for the matrix — the daemon
 * `GET /channel-status` route and the dashboard matrix view both read from
 * `CHANNEL_STATUS_TABLE`. Do NOT introduce a second source; update the doc and
 * this table together.
 *
 * Status vocabulary (mapped from the doc's legend):
 *   - `works`       — TAKES-EFFECT: field changes runtime behavior.
 *   - `broken`      — BROKEN / BROKEN-AT-3.7.x: hook fires + valid response, but
 *                     the field no longer reaches the model.
 *   - `unsupported` — NOT-SUPPORTED-BY-DESIGN: staff-confirmed the event does
 *                     not process this field by design.
 *   - `unconfirmed` — UNCONFIRMED / PROBE-DESIGNED: no live-fire verdict yet.
 */

export type ChannelStatus = "works" | "broken" | "unsupported" | "unconfirmed"

export type ChannelField =
  | "permission"
  | "updated_input"
  | "additional_context"
  | "followup_message"
  | "env"

/** Column order for the matrix view; the canonical field set. */
export const CHANNEL_FIELDS: readonly ChannelField[] = [
  "permission",
  "updated_input",
  "additional_context",
  "followup_message",
  "env",
] as const

export interface ChannelCell {
  status: ChannelStatus
  /** Free-form evidence pointer: forum thread, probe ID, or claim ID. */
  evidenceRef?: string
  /** Cursor version the status was last verified against. */
  asOfVersion?: string
  /** Optional canonical link for the evidence (e.g. a staff forum thread). */
  threadUrl?: string
}

export interface ChannelStatusRow {
  /** Hook event name, e.g. `preToolUse`. */
  event: string
  /** Known cells, keyed by output field. Absent cells default to `unconfirmed`. */
  cells: Partial<Record<ChannelField, ChannelCell>>
}

const forumThread = (id: number): string => `https://forum.cursor.com/t/${id}`

/**
 * The knowledge table. Rows = hook events, cells keyed by output field.
 * Only cells with a known verdict are populated; `getChannelStatus` fills the
 * rest with an `unconfirmed` default so the matrix is always fully dense.
 */
export const CHANNEL_STATUS_TABLE: readonly ChannelStatusRow[] = [
  {
    event: "preToolUse",
    cells: {
      permission: {
        status: "works",
        evidenceRef: "Task 2 probe (B-37-preToolUse-deny-001); Claim 1/32",
        asOfVersion: "3.7.x",
      },
      updated_input: {
        status: "works",
        evidenceRef: "Task 1 probe (B-series); forum 151985",
        asOfVersion: "3.7.x",
        threadUrl: forumThread(151985),
      },
    },
  },
  {
    event: "postToolUse",
    cells: {
      additional_context: {
        status: "broken",
        evidenceRef: "staff thread 155689; three-round 3.7.27 smoke test",
        asOfVersion: "3.7.x",
        threadUrl: forumThread(155689),
      },
    },
  },
  {
    event: "beforeSubmitPrompt",
    cells: {
      updated_input: {
        status: "unsupported",
        evidenceRef: "staff thread 158883 (Apr 23 2026)",
        threadUrl: forumThread(158883),
      },
      additional_context: {
        status: "unsupported",
        evidenceRef: "staff thread 158883 (Apr 23 2026)",
        threadUrl: forumThread(158883),
      },
    },
  },
  {
    event: "sessionStart",
    cells: {
      additional_context: {
        status: "broken",
        evidenceRef: "staff thread 158452 (Apr 19 2026); timing bug",
        asOfVersion: "3.6.21",
        threadUrl: forumThread(158452),
      },
    },
  },
  {
    event: "stop",
    cells: {
      followup_message: {
        status: "works",
        evidenceRef: "Task 18; W-EK-stop-followup-message-001..004; Claim 14",
        asOfVersion: "3.1.15",
      },
    },
  },
  {
    event: "beforeShellExecution",
    cells: {
      permission: {
        status: "works",
        evidenceRef: "W-D-beforeShellExecution-deny-005/015; Claim 32",
        asOfVersion: "3.1.15",
      },
      updated_input: {
        status: "works",
        evidenceRef: "non-interactive-env port; mergeUpdatedInputs",
        asOfVersion: "3.7.x",
      },
    },
  },
  {
    event: "beforeMCPExecution",
    cells: {
      updated_input: {
        status: "works",
        evidenceRef: "question-label-truncator port; Claim 8/52",
        asOfVersion: "3.7.x",
      },
    },
  },
  {
    event: "beforeReadFile",
    cells: {
      updated_input: {
        status: "works",
        evidenceRef: "Claim 10/39; beforeReadFile observe + rewrite path",
        asOfVersion: "3.7.x",
      },
    },
  },
] as const

const DEFAULT_CELL: ChannelCell = { status: "unconfirmed" }

const ROW_INDEX: ReadonlyMap<string, ChannelStatusRow> = new Map(
  CHANNEL_STATUS_TABLE.map((row) => [row.event, row]),
)

/**
 * Look up the status cell for an `event × field` pair. Always returns a cell;
 * unknown combinations resolve to a shared `{ status: "unconfirmed" }` default
 * so callers (matrix render, route consumers) never have to null-check.
 */
export function getChannelStatus(event: string, field: ChannelField): ChannelCell {
  const row = ROW_INDEX.get(event)
  if (!row) return DEFAULT_CELL
  return row.cells[field] ?? DEFAULT_CELL
}
