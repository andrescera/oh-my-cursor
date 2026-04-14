import { renderDashboardHTML } from "./dashboard/render"

const DAEMON_PORT = process.env.OH_MY_CURSOR_PORT || "47847"

const parsedPort = parseInt(DAEMON_PORT)
export const STATUS_HTML = renderDashboardHTML(Number.isNaN(parsedPort) ? 47847 : parsedPort)

export const MCP_APP_TOOL = {
  name: "oh_my_cursor_status",
  description: "Show the oh-my-cursor status dashboard with session state, dispatch counts, and daemon health.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  _meta: {
    ui: {
      resourceUri: "ui://oh-my-cursor/dashboard",
    },
  },
}

export const MCP_APP_RESOURCE = {
  uri: "ui://oh-my-cursor/dashboard",
  name: "oh-my-cursor Status",
  description: "Session state and daemon health dashboard",
  mimeType: "text/html",
  text: STATUS_HTML,
}

export function handleStatusToolCall(): {
  content: Array<{ type: string; text: string }>
  _meta?: { ui: { resourceUri: string } }
} {
  return {
    content: [
      {
        type: "text",
        text: "oh-my-cursor status dashboard loaded. The dashboard shows daemon health, session state, dispatch counts, Ralph loop status, hook configuration, background tasks, and recent errors.",
      },
    ],
    _meta: {
      ui: {
        resourceUri: "ui://oh-my-cursor/dashboard",
      },
    },
  }
}
