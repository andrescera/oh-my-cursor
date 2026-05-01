import { describe, expect, test } from "bun:test"
import { mergeByAgentId, type RunningRow } from "./merge-by-agent-id"

type Row = RunningRow & {
  agentType: string
  startTime: number
  status: "running"
}

function makeRow(agentId: string, startTime = 100): Row {
  return {
    agentId,
    agentType: "worker",
    startTime,
    status: "running",
  }
}

function rowById(rows: Row[], id: string): Row | undefined {
  return rows.find((row) => row.agentId === id)
}

describe("mergeByAgentId", () => {
  test("merging [] and [a, b] returns [a, b]", () => {
    const a = makeRow("a", 100)
    const b = makeRow("b", 200)
    expect(mergeByAgentId<Row>([], [a, b])).toEqual([a, b])
  })

  test("merging [a] and [a] returns [a] length 1 with next winning", () => {
    const prevA = makeRow("a", 100)
    const nextA = makeRow("a", 200)
    const merged = mergeByAgentId<Row>([prevA], [nextA])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toEqual(nextA)
  })

  test("merging [a] and [b] keeps both rows", () => {
    const a = makeRow("a", 100)
    const b = makeRow("b", 200)
    const merged = mergeByAgentId<Row>([a], [b])
    expect(merged).toHaveLength(2)
    expect(rowById(merged, "a")).toEqual(a)
    expect(rowById(merged, "b")).toEqual(b)
  })

  test("merging [a, b] and [b, c] keeps 3 rows and next b wins", () => {
    const a = makeRow("a", 100)
    const prevB = makeRow("b", 110)
    const nextB = makeRow("b", 210)
    const c = makeRow("c", 300)
    const merged = mergeByAgentId<Row>([a, prevB], [nextB, c])

    expect(merged).toHaveLength(3)
    expect(rowById(merged, "a")).toEqual(a)
    expect(rowById(merged, "b")).toEqual(nextB)
    expect(rowById(merged, "c")).toEqual(c)
  })

  test("conflict tie-break keeps next row values", () => {
    const prevA = makeRow("a", 100)
    const nextA = makeRow("a", 200)
    const merged = mergeByAgentId<Row>([prevA], [nextA])
    expect(merged).toHaveLength(1)
    expect(merged[0].startTime).toBe(200)
  })
})
