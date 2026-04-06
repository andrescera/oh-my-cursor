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
    .tabs { display: flex; gap: 2px; margin-bottom: 12px; }
    .tab {
      padding: 6px 16px;
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 12px;
      border-radius: 4px 4px 0 0;
      border-bottom: none;
    }
    .tab.active {
      background: var(--vscode-editorWidget-background, #252526);
      color: var(--vscode-foreground, #cccccc);
    }
    .filters { display: flex; gap: 4px; margin-bottom: 8px; }
    .filter-btn {
      padding: 3px 10px;
      border: 1px solid var(--vscode-editorWidget-border, #454545);
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
    }
    .filter-btn.active {
      background: var(--vscode-editorWidget-background, #252526);
      color: var(--vscode-foreground, #cccccc);
    }
    .event-list { max-height: 400px; overflow-y: auto; }
    .event-row {
      display: flex;
      gap: 8px;
      padding: 3px 6px;
      font-size: 11px;
      font-family: monospace;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
      align-items: center;
    }
    .event-time { color: var(--vscode-descriptionForeground, #666); min-width: 65px; }
    .event-hook { color: var(--vscode-descriptionForeground, #888); min-width: 140px; }
    .event-tool { color: #569cd6; min-width: 80px; }
    .event-action { min-width: 50px; font-weight: 500; }
    .event-meta { color: var(--vscode-descriptionForeground, #666); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .action-allow { color: #4ec9b0; }
    .action-deny { color: #f44747; }
    .action-block, .action-continue { color: #dcdcaa; }
    .action-noop { color: #555; }
  </style>
</head>
<body>
  <h2>oh-my-cursor Status</h2>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('status')">Status</button>
    <button class="tab" onclick="switchTab('events')">Event Log</button>
  </div>

  <div id="tab-status" class="tab-content active">
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
  </div>

  <div id="tab-events" class="tab-content" style="display:none">
    <div class="filters">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="tools">Tools</button>
      <button class="filter-btn" data-filter="dispatches">Dispatches</button>
      <button class="filter-btn" data-filter="errors">Errors</button>
      <button class="filter-btn" data-filter="denies">Denies</button>
    </div>
    <div id="event-list" class="event-list"></div>
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

    let currentFilter = 'all';

    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
      document.querySelector('.tab[onclick*="' + tab + '"]').classList.add('active');
      const el = document.getElementById('tab-' + tab);
      el.style.display = 'block';
      el.classList.add('active');
      if (tab === 'events') refreshEvents();
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        refreshEvents();
      });
    });

    async function refreshEvents() {
      try {
        const res = await fetch('http://localhost:47847/session-log?limit=100');
        let events = await res.json();
        if (currentFilter === 'tools') events = events.filter(e => e.tool && !['Task','task','Agent','agent'].includes(e.tool));
        else if (currentFilter === 'dispatches') events = events.filter(e => e.agentType);
        else if (currentFilter === 'errors') events = events.filter(e => e.error || e.event === '/postToolUseFailure');
        else if (currentFilter === 'denies') events = events.filter(e => e.action === 'deny');

        const list = document.getElementById('event-list');
        if (!events.length) { list.innerHTML = '<div style="padding:12px;color:#666">No events yet</div>'; return; }
        list.innerHTML = events.map(e => {
          const time = new Date(e.ts).toLocaleTimeString('en-US', {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
          const actionClass = 'action-' + (e.action || 'noop');
          const metaStr = e.meta ? Object.entries(e.meta).map(([k,v]) => k + '=' + String(v).slice(0,40)).join(' ') : '';
          const agentBadge = e.agentType ? '<span style="color:#c586c0">[' + e.agentType + ']</span> ' : '';
          return '<div class="event-row">' +
            '<span class="event-time">' + time + '</span>' +
            '<span class="event-hook">' + e.event + '</span>' +
            '<span class="event-tool">' + agentBadge + (e.tool || '') + '</span>' +
            '<span class="event-action ' + actionClass + '">' + (e.action || '-') + '</span>' +
            (e.error ? '<span style="color:#f44747">' + e.error.slice(0,60) + '</span>' : '') +
            '<span class="event-meta">' + metaStr + '</span>' +
            '</div>';
        }).join('');
      } catch {
        document.getElementById('event-list').innerHTML = '<div style="padding:12px;color:#f44747">Failed to fetch events</div>';
      }
    }

    setInterval(() => { if (document.getElementById('tab-events')?.style.display !== 'none') refreshEvents(); }, 3000);
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
