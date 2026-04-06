/**
 * MCP App: oh-my-cursor Status Dashboard
 *
 * Provides interactive UI within the Cursor conversation for:
 * - Session state overview
 * - Active agent tracking
 * - Dispatch count monitoring
 * - Ralph loop status
 *
 * This tool is registered alongside the MCP sidecar and returns
 * UI resources via the MCP Apps extension spec.
 */

export const STATUS_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      padding: 16px;
      font-size: 13px;
    }
    h2 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-foreground, #cccccc);
    }
    .card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
    }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: var(--vscode-descriptionForeground, #888); }
    .stat-value { font-weight: 500; font-variant-numeric: tabular-nums; }
    .status-ok { color: #4ec9b0; }
    .status-warn { color: #dcdcaa; }
    .status-error { color: #f44747; }
    .agent-list { list-style: none; }
    .agent-list li {
      padding: 3px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-active { background: #4ec9b0; }
    .dot-idle { background: #555; }
  </style>
</head>
<body>
  <h2>oh-my-cursor Status</h2>

  <div class="card">
    <div class="stat">
      <span class="stat-label">Session</span>
      <span class="stat-value" id="session-id">--</span>
    </div>
    <div class="stat">
      <span class="stat-label">Daemon</span>
      <span class="stat-value status-ok" id="daemon-status">Checking...</span>
    </div>
    <div class="stat">
      <span class="stat-label">Uptime</span>
      <span class="stat-value" id="uptime">--</span>
    </div>
    <div class="stat">
      <span class="stat-label">Active Sessions</span>
      <span class="stat-value" id="session-count">--</span>
    </div>
  </div>

  <div class="card">
    <div class="stat">
      <span class="stat-label">Tool Calls</span>
      <span class="stat-value" id="tool-calls">0</span>
    </div>
    <div class="stat">
      <span class="stat-label">Explore Dispatches</span>
      <span class="stat-value" id="explore-count">0 / 5</span>
    </div>
    <div class="stat">
      <span class="stat-label">Worker Dispatches</span>
      <span class="stat-value" id="worker-count">0 / 8</span>
    </div>
    <div class="stat">
      <span class="stat-label">Ralph Loop</span>
      <span class="stat-value" id="ralph-status">Inactive</span>
    </div>
  </div>

  <script>
    async function refresh() {
      try {
        const res = await fetch('http://localhost:47847/health');
        const data = await res.json();
        document.getElementById('daemon-status').textContent = 'Connected';
        document.getElementById('daemon-status').className = 'stat-value status-ok';
        document.getElementById('session-id').textContent = data.currentSessionId || '--';
        document.getElementById('session-count').textContent = data.sessions || 0;
        document.getElementById('uptime').textContent = Math.round(data.uptime || 0) + 's';
        document.getElementById('tool-calls').textContent = String(data.toolCalls ?? 0);
        document.getElementById('explore-count').textContent =
          String(data.exploreCounts ?? 0) + ' / 5';
        document.getElementById('worker-count').textContent =
          String(data.workerCounts ?? 0) + ' / 8';
        document.getElementById('ralph-status').textContent = data.ralphActive
          ? 'Active'
          : 'Inactive';
      } catch {
        document.getElementById('daemon-status').textContent = 'Offline';
        document.getElementById('daemon-status').className = 'stat-value status-error';
      }
    }
    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`

export const MCP_APP_TOOL = {
  name: "oh_my_cursor_status",
  description: "Show the oh-my-cursor status dashboard with session state, dispatch counts, and daemon health.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  _meta: {
    ui: {
      resourceUri: "ui://oh-my-cursor/status",
    },
  },
}

export const MCP_APP_RESOURCE = {
  uri: "ui://oh-my-cursor/status",
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
        text: "oh-my-cursor status dashboard loaded. The dashboard shows daemon health, session state, dispatch counts, and Ralph loop status.",
      },
    ],
    _meta: {
      ui: {
        resourceUri: "ui://oh-my-cursor/status",
      },
    },
  }
}
