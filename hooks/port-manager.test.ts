import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  writePortCoordination,
  readPortCoordination,
  getDaemonPort,
  getSidecarPort,
  type PortCoordination,
} from "./port-manager"

const TEST_DIR = "/tmp/omc-test-port-manager"
const TEST_PORTS_FILE = join(TEST_DIR, "ports.json")

let originalEnv: string | undefined

function setPortsFile(path: string): void {
  process.env.OH_MY_CURSOR_PORTS_FILE = path
}

function cleanup(): void {
  if (originalEnv !== undefined) {
    process.env.OH_MY_CURSOR_PORTS_FILE = originalEnv
  } else {
    delete process.env.OH_MY_CURSOR_PORTS_FILE
  }
  try {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  } catch {
    // best-effort
  }
}

describe("port-manager", () => {
  beforeEach(() => {
    originalEnv = process.env.OH_MY_CURSOR_PORTS_FILE
    mkdirSync(TEST_DIR, { recursive: true })
    setPortsFile(TEST_PORTS_FILE)
  })

  afterEach(cleanup)

  describe("readPortCoordination", () => {
    describe("#given ports file does not exist", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns null", () => {
          // given: file does not exist (TEST_PORTS_FILE not written)
          expect(existsSync(TEST_PORTS_FILE)).toBe(false)

          // when
          const result = readPortCoordination()

          // then
          expect(result).toBeNull()
        })
      })
    })

    describe("#given ports file contains corrupt JSON", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns null without throwing", () => {
          // given
          writeFileSync(TEST_PORTS_FILE, "{invalid json", "utf-8")

          // when
          const result = readPortCoordination()

          // then
          expect(result).toBeNull()
        })
      })
    })

    describe("#given ports file contains truncated JSON", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns null without throwing", () => {
          // given
          writeFileSync(TEST_PORTS_FILE, '{"daemon": 27847, "sidecar":', "utf-8")

          // when
          const result = readPortCoordination()

          // then
          expect(result).toBeNull()
        })
      })
    })

    describe("#given ports file contains JSON with missing required fields", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns null", () => {
          // given: daemon field is missing
          writeFileSync(
            TEST_PORTS_FILE,
            JSON.stringify({ sidecar: 27848, updatedAt: "2026-01-01T00:00:00.000Z" }),
            "utf-8",
          )

          // when
          const result = readPortCoordination()

          // then
          expect(result).toBeNull()
        })
      })
    })

    describe("#given ports file contains valid JSON", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns the parsed coordination object", () => {
          // given
          const ports: PortCoordination = {
            daemon: 28854,
            sidecar: 28855,
            updatedAt: "2026-06-11T00:00:00.000Z",
          }
          writeFileSync(TEST_PORTS_FILE, JSON.stringify(ports, null, 2), "utf-8")

          // when
          const result = readPortCoordination()

          // then
          expect(result).not.toBeNull()
          expect(result?.daemon).toBe(28854)
          expect(result?.sidecar).toBe(28855)
          expect(result?.updatedAt).toBe("2026-06-11T00:00:00.000Z")
        })
      })
    })
  })

  describe("writePortCoordination", () => {
    describe("#given valid port coordination data", () => {
      describe("#when writePortCoordination is called", () => {
        test("#then it writes valid JSON to the ports file", () => {
          // given
          const ports: PortCoordination = {
            daemon: 28854,
            sidecar: 28855,
            updatedAt: "2026-06-11T00:00:00.000Z",
          }

          // when
          writePortCoordination(ports)

          // then: file exists and round-trips correctly
          expect(existsSync(TEST_PORTS_FILE)).toBe(true)
          const readBack = readPortCoordination()
          expect(readBack).not.toBeNull()
          expect(readBack?.daemon).toBe(28854)
          expect(readBack?.sidecar).toBe(28855)
        })

        test("#then no .tmp file is left behind after successful write", () => {
          // given
          const ports: PortCoordination = {
            daemon: 28854,
            sidecar: 28855,
            updatedAt: "2026-06-11T00:00:00.000Z",
          }

          // when
          writePortCoordination(ports)

          // then: no temp files remain
          const files = readdirSync(TEST_DIR)
          const tmpFiles = files.filter((f) => f.includes(".tmp-"))
          expect(tmpFiles).toHaveLength(0)
        })
      })
    })

    describe("#given corrupt ports file already exists", () => {
      describe("#when writePortCoordination is called", () => {
        test("#then it overwrites corrupt file with valid JSON", () => {
          // given: pre-existing corrupt file
          writeFileSync(TEST_PORTS_FILE, "{invalid json", "utf-8")

          const ports: PortCoordination = {
            daemon: 28854,
            sidecar: 28855,
            updatedAt: "2026-06-11T00:00:00.000Z",
          }

          // when
          writePortCoordination(ports)

          // then: file is now valid
          const result = readPortCoordination()
          expect(result).not.toBeNull()
          expect(result?.daemon).toBe(28854)
        })
      })
    })
  })

  describe("env-injectable path (OH_MY_CURSOR_PORTS_FILE)", () => {
    describe("#given OH_MY_CURSOR_PORTS_FILE is set to a custom path", () => {
      describe("#when writePortCoordination is called", () => {
        test("#then it writes to the custom path, not the default /tmp/oh-my-cursor-ports.json", () => {
          // given: custom path already set in beforeEach to TEST_PORTS_FILE
          const ports: PortCoordination = {
            daemon: 28854,
            sidecar: 28855,
            updatedAt: "2026-06-11T00:00:00.000Z",
          }

          // when
          writePortCoordination(ports)

          // then: custom path has the file
          expect(existsSync(TEST_PORTS_FILE)).toBe(true)
        })
      })
    })

    describe("#given OH_MY_CURSOR_PORTS_FILE points to a corrupt file", () => {
      describe("#when readPortCoordination is called", () => {
        test("#then it returns null (not crash)", () => {
          // given
          writeFileSync(TEST_PORTS_FILE, "{invalid json", "utf-8")

          // when
          const result = readPortCoordination()

          // then
          expect(result).toBeNull()
        })
      })
    })
  })

  describe("getDaemonPort", () => {
    describe("#given no ports file exists", () => {
      describe("#when getDaemonPort is called with a default", () => {
        test("#then it returns the default port", () => {
          // given: no file
          expect(existsSync(TEST_PORTS_FILE)).toBe(false)

          // when
          const port = getDaemonPort(27847)

          // then
          expect(port).toBe(27847)
        })
      })
    })

    describe("#given a valid ports file exists", () => {
      describe("#when getDaemonPort is called", () => {
        test("#then it returns the daemon port from the file", () => {
          // given
          writePortCoordination({
            daemon: 28854,
            sidecar: 28855,
            updatedAt: new Date().toISOString(),
          })

          // when
          const port = getDaemonPort(27847)

          // then
          expect(port).toBe(28854)
        })
      })
    })

    describe("#given a corrupt ports file", () => {
      describe("#when getDaemonPort is called", () => {
        test("#then it falls back to the default port", () => {
          // given
          writeFileSync(TEST_PORTS_FILE, "{invalid json", "utf-8")

          // when
          const port = getDaemonPort(27847)

          // then
          expect(port).toBe(27847)
        })
      })
    })
  })

  describe("getSidecarPort", () => {
    describe("#given no ports file exists", () => {
      describe("#when getSidecarPort is called with a default", () => {
        test("#then it returns the default MCP port", () => {
          // given: no file
          expect(existsSync(TEST_PORTS_FILE)).toBe(false)

          // when
          const port = getSidecarPort(27848)

          // then
          expect(port).toBe(27848)
        })
      })
    })

    describe("#given a valid ports file exists", () => {
      describe("#when getSidecarPort is called", () => {
        test("#then it returns daemon+1", () => {
          // given
          writePortCoordination({
            daemon: 28854,
            sidecar: 28855,
            updatedAt: new Date().toISOString(),
          })

          // when
          const port = getSidecarPort(27848)

          // then
          expect(port).toBe(28855) // daemon(28854) + 1
        })
      })
    })
  })
})
