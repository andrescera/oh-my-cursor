import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { registerAll } from "./register"

export interface SessionEntry {
  server: McpServer
  transport: WebStandardStreamableHTTPServerTransport
}

export type UnknownSessionResult = { readonly unknownSession: true }

const UNKNOWN_SESSION: UnknownSessionResult = { unknownSession: true } as const

export function isUnknownSession(
  x: SessionEntry | UnknownSessionResult,
): x is UnknownSessionResult {
  return (x as UnknownSessionResult).unknownSession === true
}

const sessions = new Map<string, SessionEntry>()

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: "oh-my-cursor", version: "0.6.0", title: "oh-my-cursor" },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        logging: {},
      },
    },
  )
  registerAll(server)
  return server
}

export async function getOrCreateSession(
  sessionId: string | undefined,
): Promise<SessionEntry | UnknownSessionResult> {
  if (sessionId) {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    return UNKNOWN_SESSION
  }

  // sessionId is undefined: fresh initialize handshake
  const server = buildServer()
  let transport!: WebStandardStreamableHTTPServerTransport
  transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { server, transport })
    },
    onsessionclosed: (id) => {
      sessions.delete(id)
    },
  })
  await server.connect(transport)
  return { server, transport }
}

export function getSessionCount(): number {
  return sessions.size
}
