import { describe, test, expect, afterEach } from "bun:test"
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs"
import { randomUUID } from "node:crypto"
import {
  lockPathForProject,
  acquireStartupLock,
  releaseStartupLock,
  type LockHolder,
} from "./startup-lock"

const createdLocks = new Set<string>()

function uniqueRoot(): string {
  const root = `/tmp/omc-startup-lock-test-${randomUUID()}`
  createdLocks.add(lockPathForProject(root))
  return root
}

function writeLock(root: string, holder: LockHolder): void {
  const path = lockPathForProject(root)
  writeFileSync(path, JSON.stringify(holder), "utf-8")
  createdLocks.add(path)
}

function readLock(root: string): LockHolder {
  return JSON.parse(readFileSync(lockPathForProject(root), "utf-8")) as LockHolder
}

const instantSleep = () => Promise.resolve()
const fixedNow = () => "2026-06-11T00:00:00.000Z"

afterEach(() => {
  for (const path of createdLocks) {
    try {
      if (existsSync(path)) unlinkSync(path)
    } catch {
      // best-effort
    }
  }
  createdLocks.clear()
})

describe("lockPathForProject", () => {
  test("derives a /tmp path with an 8-char hex hash suffix", () => {
    const path = lockPathForProject("/some/project/root")
    expect(path).toMatch(/^\/tmp\/oh-my-cursor-[0-9a-f]{8}\.lock$/)
  })

  test("is stable for the same root and distinct for different roots", () => {
    expect(lockPathForProject("/a")).toBe(lockPathForProject("/a"))
    expect(lockPathForProject("/a")).not.toBe(lockPathForProject("/b"))
  })
})

describe("acquireStartupLock", () => {
  test("fresh acquire writes {pid, startedAt} when no lock exists", async () => {
    const root = uniqueRoot()
    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999001,
      nowIso: fixedNow,
      isAlive: () => true,
      probeHealth: async () => true,
      sleep: instantSleep,
    })

    expect(outcome.acquired).toBe(true)
    expect(outcome.reason).toBe("fresh")
    const holder = readLock(root)
    expect(holder.pid).toBe(999001)
    expect(holder.startedAt).toBe("2026-06-11T00:00:00.000Z")
  })

  test("defers when the holder is alive AND answers /health", async () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999002, startedAt: fixedNow() })

    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999003,
      isAlive: () => true,
      probeHealth: async () => true,
      sleep: instantSleep,
    })

    expect(outcome.acquired).toBe(false)
    expect(outcome.reason).toBe("already-running")
    if (!outcome.acquired && outcome.reason === "already-running") {
      expect(outcome.holder.pid).toBe(999002)
    }
    // The healthy holder's lock must be left intact.
    expect(readLock(root).pid).toBe(999002)
  })

  test("takes over a dead holder's stale lock (mocked liveness = dead)", async () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999004, startedAt: fixedNow() })

    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999005,
      nowIso: fixedNow,
      isAlive: () => false,
      probeHealth: async () => false,
      sleep: instantSleep,
    })

    expect(outcome.acquired).toBe(true)
    expect(outcome.reason).toBe("stale-takeover")
    expect(readLock(root).pid).toBe(999005)
  })

  test("takes over a hung holder (alive but never answers /health within timeout)", async () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999006, startedAt: fixedNow() })

    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999007,
      isAlive: () => true,
      probeHealth: async () => false,
      sleep: instantSleep,
      healthTimeoutMs: 60,
      healthIntervalMs: 10,
    })

    expect(outcome.acquired).toBe(true)
    expect(outcome.reason).toBe("stale-takeover")
    expect(readLock(root).pid).toBe(999007)
  })

  test("defers to a slow-but-real holder that answers /health after polling", async () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999008, startedAt: fixedNow() })

    let probes = 0
    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999009,
      isAlive: () => true,
      probeHealth: async () => {
        probes += 1
        return probes >= 3
      },
      sleep: instantSleep,
      healthTimeoutMs: 1000,
      healthIntervalMs: 10,
    })

    expect(outcome.acquired).toBe(false)
    expect(outcome.reason).toBe("already-running")
    expect(probes).toBeGreaterThanOrEqual(3)
    expect(readLock(root).pid).toBe(999008)
  })

  test("stops polling early once the holder dies, then takes over", async () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999010, startedAt: fixedNow() })

    let aliveChecks = 0
    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999011,
      isAlive: () => {
        aliveChecks += 1
        return aliveChecks <= 1
      },
      probeHealth: async () => false,
      sleep: instantSleep,
      healthTimeoutMs: 5000,
      healthIntervalMs: 10,
    })

    expect(outcome.acquired).toBe(true)
    expect(outcome.reason).toBe("stale-takeover")
    expect(readLock(root).pid).toBe(999011)
  })

  test("recovers from an unreadable/corrupt lock file by taking over", async () => {
    const root = uniqueRoot()
    const path = lockPathForProject(root)
    writeFileSync(path, "not-json{{{", "utf-8")
    createdLocks.add(path)

    const outcome = await acquireStartupLock(root, 28999, {
      pid: 999012,
      nowIso: fixedNow,
      isAlive: () => true,
      probeHealth: async () => false,
      sleep: instantSleep,
    })

    expect(outcome.acquired).toBe(true)
    expect(outcome.reason).toBe("stale-takeover")
    expect(readLock(root).pid).toBe(999012)
  })
})

describe("releaseStartupLock", () => {
  test("removes a lock the caller owns", async () => {
    const root = uniqueRoot()
    await acquireStartupLock(root, 28999, {
      pid: 999013,
      isAlive: () => true,
      probeHealth: async () => true,
      sleep: instantSleep,
    })
    expect(existsSync(lockPathForProject(root))).toBe(true)

    releaseStartupLock(root, { pid: 999013 })
    expect(existsSync(lockPathForProject(root))).toBe(false)
  })

  test("never removes a lock owned by a different pid", () => {
    const root = uniqueRoot()
    writeLock(root, { pid: 999014, startedAt: fixedNow() })

    releaseStartupLock(root, { pid: 999015 })
    expect(existsSync(lockPathForProject(root))).toBe(true)
    expect(readLock(root).pid).toBe(999014)
  })

  test("is a no-op when no lock exists", () => {
    const root = uniqueRoot()
    expect(() => releaseStartupLock(root, { pid: 999016 })).not.toThrow()
    expect(existsSync(lockPathForProject(root))).toBe(false)
  })
})
