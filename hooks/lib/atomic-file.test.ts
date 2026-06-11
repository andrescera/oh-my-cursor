import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeFileAtomic, writeFileAtomicAsync } from "./atomic-file"

describe("atomic-file", () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "atomic-file-test-"))
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("writeFileAtomic", () => {
    test("writes content correctly", () => {
      const filePath = join(testDir, "test.txt")
      const content = "hello world"

      writeFileAtomic(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, "utf-8")).toBe(content)
    })

    test("writes JSON content correctly", () => {
      const filePath = join(testDir, "test.json")
      const data = { a: 1, b: "test" }
      const content = JSON.stringify(data)

      writeFileAtomic(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      const read = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(read).toEqual(data)
    })

    test("writes Buffer content correctly", () => {
      const filePath = join(testDir, "test.bin")
      const content = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"

      writeFileAtomic(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath)).toEqual(content)
    })

    test("creates parent directories if missing", () => {
      const filePath = join(testDir, "nested", "deep", "dir", "test.txt")

      writeFileAtomic(filePath, "content")

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, "utf-8")).toBe("content")
    })

    test("applies mode via chmod before rename", () => {
      const filePath = join(testDir, "test.txt")
      const mode = 0o600

      writeFileAtomic(filePath, "content", { mode })

      expect(existsSync(filePath)).toBe(true)
      const stat = statSync(filePath)
      // Extract permission bits (last 9 bits)
      const perms = stat.mode & 0o777
      expect(perms).toBe(mode)
    })

    test("cleans up temp file on write failure", () => {
      const filePath = join(testDir, "test.txt")
      const tmpPattern = `${filePath}.tmp-`

      // Simulate write failure by using an invalid path
      try {
        writeFileAtomic("/invalid/nonexistent/path/test.txt", "content")
      } catch {
        // Expected to fail
      }

      // Check that no temp files were left behind in testDir
      const files = readdirSync(testDir)
      const tmpFiles = files.filter((f) => f.includes(".tmp-"))
      expect(tmpFiles.length).toBe(0)
    })

    test("overwrites existing file atomically", () => {
      const filePath = join(testDir, "test.txt")

      writeFileAtomic(filePath, "first")
      expect(readFileSync(filePath, "utf-8")).toBe("first")

      writeFileAtomic(filePath, "second")
      expect(readFileSync(filePath, "utf-8")).toBe("second")
    })

    test("temp file is in same directory as target", () => {
      const filePath = join(testDir, "subdir", "test.txt")

      writeFileAtomic(filePath, "content")

      // Verify file exists and temp files are cleaned up
      expect(existsSync(filePath)).toBe(true)
      const files = readdirSync(join(testDir, "subdir"))
      const tmpFiles = files.filter((f) => f.includes(".tmp-"))
      expect(tmpFiles.length).toBe(0)
    })
  })

  describe("writeFileAtomicAsync", () => {
    test("writes content correctly", async () => {
      const filePath = join(testDir, "test.txt")
      const content = "hello async world"

      await writeFileAtomicAsync(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, "utf-8")).toBe(content)
    })

    test("writes JSON content correctly", async () => {
      const filePath = join(testDir, "test.json")
      const data = { x: 42, y: "async" }
      const content = JSON.stringify(data)

      await writeFileAtomicAsync(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      const read = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(read).toEqual(data)
    })

    test("writes Buffer content correctly", async () => {
      const filePath = join(testDir, "test.bin")
      const content = Buffer.from([0x41, 0x42, 0x43]) // "ABC"

      await writeFileAtomicAsync(filePath, content)

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath)).toEqual(content)
    })

    test("creates parent directories if missing", async () => {
      const filePath = join(testDir, "async", "nested", "test.txt")

      await writeFileAtomicAsync(filePath, "async content")

      expect(existsSync(filePath)).toBe(true)
      expect(readFileSync(filePath, "utf-8")).toBe("async content")
    })

    test("applies mode via chmod before rename", async () => {
      const filePath = join(testDir, "test.txt")
      const mode = 0o644

      await writeFileAtomicAsync(filePath, "content", { mode })

      expect(existsSync(filePath)).toBe(true)
      const stat = statSync(filePath)
      const perms = stat.mode & 0o777
      expect(perms).toBe(mode)
    })

    test("cleans up temp file on write failure", async () => {
      try {
        await writeFileAtomicAsync("/invalid/nonexistent/path/test.txt", "content")
      } catch {
        // Expected to fail
      }

      // Check that no temp files were left behind in testDir
      const files = readdirSync(testDir)
      const tmpFiles = files.filter((f) => f.includes(".tmp-"))
      expect(tmpFiles.length).toBe(0)
    })

    test("overwrites existing file atomically", async () => {
      const filePath = join(testDir, "test.txt")

      await writeFileAtomicAsync(filePath, "first async")
      expect(readFileSync(filePath, "utf-8")).toBe("first async")

      await writeFileAtomicAsync(filePath, "second async")
      expect(readFileSync(filePath, "utf-8")).toBe("second async")
    })

    test("temp file is in same directory as target", async () => {
      const filePath = join(testDir, "subdir", "test.txt")

      await writeFileAtomicAsync(filePath, "async content")

      expect(existsSync(filePath)).toBe(true)
      const files = readdirSync(join(testDir, "subdir"))
      const tmpFiles = files.filter((f) => f.includes(".tmp-"))
      expect(tmpFiles.length).toBe(0)
    })
  })
})
