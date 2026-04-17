import { describe, test, expect } from "bun:test"
import { createServer, createConnection } from "node:net"
import { killPortSquatter } from "./process-guard"

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number }
      server.close(() => resolve(addr.port))
    })
  })
}

async function waitForPort(port: number, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const conn = createConnection({ port, host: "127.0.0.1" })
        conn.once("connect", () => { conn.destroy(); resolve() })
        conn.once("error", reject)
      })
      return true
    } catch {
      await Bun.sleep(50)
    }
  }
  return false
}

describe("killPortSquatter", () => {
  test("returns 'absent' when nothing holds the port", async () => {
    // Bind briefly to get a free port number, then release it so lsof sees nothing
    const port = await getFreePort()
    const result = await killPortSquatter(port, "test-absent")
    expect(result).toBe("absent")
  })

  test("kills our own squatter and returns 'killed'", async () => {
    const port = await getFreePort()

    // Spawn a Bun process that listens on the port
    const squatter = Bun.spawn(
      [
        "bun",
        "-e",
        `Bun.serve({ port: ${port}, hostname: '127.0.0.1', fetch() { return new Response('ok') } }); await Bun.sleep(30000)`,
      ],
      { stdout: "ignore", stderr: "ignore" },
    )

    const bound = await waitForPort(port)
    expect(bound).toBe(true)

    const result = await killPortSquatter(port, "test-kill")
    expect(result).toBe("killed")

    // Child should exit within 500ms — it gets SIGTERM during killPortSquatter
    const exitCode = await Promise.race([
      squatter.exited,
      Bun.sleep(500).then(() => "timeout" as const),
    ])
    expect(exitCode).not.toBe("timeout")
  }, 10000)

  test("returns 'absent' or 'lsof_missing' on a definitely-unused port without throwing", async () => {
    // Integration test: verifies the function is robust even when lsof finds nothing.
    // If lsof is missing on the host, this returns 'lsof_missing'. Otherwise 'absent'.
    // We cannot easily simulate lsof absence without PATH manipulation.
    const result = await killPortSquatter(59998, "lsof-presence-check")
    expect(["absent", "lsof_missing"]).toContain(result)
  })

  // Integration-only — requires a second uid to run
  test.skip("skips foreign-owned processes and returns 'not_us'", async () => {
    // Cannot test without root or a second uid. Would require spawning a process
    // as a different user and verifying the ownership guard fires.
    // Run manually: sudo -u nobody <server> then call killPortSquatter.
  })
})
