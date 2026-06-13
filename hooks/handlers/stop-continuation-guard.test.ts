import { describe, it, expect, beforeEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { resetUserStoppedLatches, isUserStopped, setUserStopped, clearUserStopped } from "./stop-continuation-guard"

function makeConvId(): string {
  return `stop-guard-test-${randomUUID()}`
}

describe("stop-continuation-guard", () => {
  let convId: string

  beforeEach(() => {
    convId = makeConvId()
    resetUserStoppedLatches()
  })

  describe("latch state management", () => {
    it("initializes with no latches set", () => {
      expect(isUserStopped(convId)).toBe(false)
    })

    it("sets latch when user explicitly stops", () => {
      setUserStopped(convId)
      expect(isUserStopped(convId)).toBe(true)
    })

    it("clears latch on new user prompt", () => {
      setUserStopped(convId)
      expect(isUserStopped(convId)).toBe(true)
      clearUserStopped(convId)
      expect(isUserStopped(convId)).toBe(false)
    })

    it("resets all latches", () => {
      const convId2 = makeConvId()
      setUserStopped(convId)
      setUserStopped(convId2)
      expect(isUserStopped(convId)).toBe(true)
      expect(isUserStopped(convId2)).toBe(true)
      resetUserStoppedLatches()
      expect(isUserStopped(convId)).toBe(false)
      expect(isUserStopped(convId2)).toBe(false)
    })
  })

  describe("latch isolation", () => {
    it("isolates latches per conversation", () => {
      const convId2 = makeConvId()
      setUserStopped(convId)
      expect(isUserStopped(convId)).toBe(true)
      expect(isUserStopped(convId2)).toBe(false)
    })

    it("clearing one latch does not affect others", () => {
      const convId2 = makeConvId()
      setUserStopped(convId)
      setUserStopped(convId2)
      clearUserStopped(convId)
      expect(isUserStopped(convId)).toBe(false)
      expect(isUserStopped(convId2)).toBe(true)
    })
  })

  describe("idempotence", () => {
    it("setting latch multiple times is idempotent", () => {
      setUserStopped(convId)
      setUserStopped(convId)
      expect(isUserStopped(convId)).toBe(true)
    })

    it("clearing latch multiple times is idempotent", () => {
      setUserStopped(convId)
      clearUserStopped(convId)
      clearUserStopped(convId)
      expect(isUserStopped(convId)).toBe(false)
    })
  })
})
