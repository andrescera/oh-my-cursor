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

const DAEMON_PORT = process.env.OH_MY_CURSOR_PORT || "47847"

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
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    h2 {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground, #cccccc);
    }
    .refresh-btn {
      padding: 4px 12px;
      border: 1px solid var(--vscode-panel-border, #454545);
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #cccccc);
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
    }
    .refresh-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-panel-border, #454545);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground, #cccccc);
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
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
      border: 1px solid var(--vscode-panel-border, #454545);
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
    .hook-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .hook-column h3 {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--vscode-foreground, #cccccc);
    }
    .hook-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      font-size: 12px;
      font-family: monospace;
    }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-enabled { background: rgba(78,201,176,0.15); color: #4ec9b0; }
    .badge-disabled { background: rgba(244,71,71,0.15); color: #f44747; }
    .hook-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #666);
      margin-bottom: 8px;
    }
    .bg-task {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      font-size: 12px;
    }
    .bg-task:last-child { border-bottom: none; }
    .bg-task-name { font-weight: 500; }
    .bg-task-model { color: #569cd6; font-size: 11px; }
    .bg-task-status { font-size: 11px; }
    .bg-empty {
      padding: 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #666);
      font-size: 12px;
    }
    .error-item {
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      font-size: 11px;
      font-family: monospace;
    }
    .error-item:last-child { border-bottom: none; }
    .error-time { color: var(--vscode-descriptionForeground, #666); margin-right: 8px; }
    .error-hook { color: var(--vscode-descriptionForeground, #888); margin-right: 8px; }
    .error-msg { color: #f44747; }
    .filters { display: flex; gap: 4px; margin-bottom: 8px; }
    .filter-btn {
      padding: 3px 10px;
      border: 1px solid var(--vscode-panel-border, #454545);
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
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      align-items: center;
      cursor: pointer;
      flex-wrap: wrap;
    }
    .event-row:hover { background: rgba(255,255,255,0.03); }
    .event-time { color: var(--vscode-descriptionForeground, #666); min-width: 65px; }
    .event-hook { color: var(--vscode-descriptionForeground, #888); min-width: 140px; }
    .event-tool { color: #569cd6; min-width: 80px; }
    .event-action { min-width: 50px; font-weight: 500; }
    .event-meta { color: var(--vscode-descriptionForeground, #666); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .action-allow { color: #4ec9b0; }
    .action-deny { color: #f44747; }
    .action-block, .action-continue { color: #dcdcaa; }
    .action-noop { color: #555; }
    .event-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .event-actions { display: flex; gap: 4px; }
    .action-btn {
      padding: 3px 10px;
      border: 1px solid var(--vscode-panel-border, #454545);
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
      text-decoration: none;
    }
    .action-btn:hover { color: var(--vscode-foreground, #ccc); border-color: #666; }
    .event-detail {
      width: 100%;
      padding: 6px 8px;
      margin-top: 4px;
      background: rgba(0,0,0,0.2);
      border-radius: 3px;
      font-size: 10px;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-descriptionForeground, #888);
      display: none;
    }
    .event-detail.open { display: block; }
    .event-count { font-size: 11px; color: var(--vscode-descriptionForeground, #666); }
  </style>
</head>
<body>
  <div class="header">
    <h2>oh-my-cursor Status</h2>
    <button class="refresh-btn" onclick="refreshAll()">Refresh</button>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('status')">Status</button>
    <button class="tab" onclick="switchTab('hooks')">Hooks</button>
    <button class="tab" onclick="switchTab('background')">Background</button>
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

    <div class="card">
      <div class="card-title">Recent Errors</div>
      <div id="recent-errors"><div class="bg-empty">No recent errors</div></div>
    </div>
  </div>

  <div id="tab-hooks" class="tab-content" style="display:none">
    <div class="card">
      <div class="hook-count" id="hook-count">Loading...</div>
      <div class="hook-grid" id="hook-grid">
        <div class="bg-empty">Loading hook configuration...</div>
      </div>
    </div>
  </div>

  <div id="tab-background" class="tab-content" style="display:none">
    <div class="card">
      <div class="card-title">Active Background Tasks</div>
      <div id="bg-tasks"><div class="bg-empty">Loading...</div></div>
    </div>
  </div>

  <div id="tab-events" class="tab-content" style="display:none">
    <div class="event-toolbar">
      <div class="filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="tools">Tools</button>
        <button class="filter-btn" data-filter="dispatches">Dispatches</button>
        <button class="filter-btn" data-filter="errors">Errors</button>
        <button class="filter-btn" data-filter="denies">Denies</button>
      </div>
      <div class="event-actions">
        <span class="event-count" id="event-count">0 events</span>
        <a class="action-btn" href="http://localhost:${DAEMON_PORT}/session-log/download" download="session-log.jsonl" target="_blank">Download JSONL</a>
        <button class="action-btn" onclick="copyLog()">Copy JSON</button>
        <button class="action-btn" onclick="clearLogUI()">Clear</button>
      </div>
    </div>
    <div id="event-list" class="event-list"></div>
  </div>

  <script>
    async function refresh() {
      try {
        const res = await fetch('http://localhost:${DAEMON_PORT}/health');
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

    async function refreshHooks() {
      try {
        const res = await fetch('http://localhost:${DAEMON_PORT}/config');
        const data = await res.json();
        const enabled = data.enabled || [];
        const disabled = data.disabled || [];
        document.getElementById('hook-count').textContent =
          enabled.length + ' enabled, ' + disabled.length + ' disabled';
        const grid = document.getElementById('hook-grid');
        grid.innerHTML =
          '<div class="hook-column"><h3>Enabled</h3>' +
          (enabled.length
            ? enabled.map(function(h) {
                return '<div class="hook-item"><span class="dot dot-active"></span>' +
                  '<span>' + escHtml(h) + '</span>' +
                  '<span class="badge badge-enabled">on</span></div>';
              }).join('')
            : '<div class="bg-empty">None</div>') +
          '</div><div class="hook-column"><h3>Disabled</h3>' +
          (disabled.length
            ? disabled.map(function(h) {
                return '<div class="hook-item"><span class="dot dot-idle"></span>' +
                  '<span>' + escHtml(h) + '</span>' +
                  '<span class="badge badge-disabled">off</span></div>';
              }).join('')
            : '<div class="bg-empty">All hooks enabled</div>') +
          '</div>';
      } catch {
        document.getElementById('hook-grid').innerHTML =
          '<div class="bg-empty" style="color:#f44747">Failed to load hook config</div>';
      }
    }

    async function refreshBackground() {
      try {
        const res = await fetch('http://localhost:${DAEMON_PORT}/backgroundTasks');
        const data = await res.json();
        const tasks = data.tasks || [];
        const container = document.getElementById('bg-tasks');
        if (!tasks.length) {
          container.innerHTML = '<div class="bg-empty">No active background tasks</div>';
          return;
        }
        container.innerHTML = tasks.map(function(t) {
          var statusClass = t.status === 'running' ? 'status-ok'
            : t.status === 'error' ? 'status-error' : 'status-warn';
          return '<div class="bg-task">' +
            '<span class="dot ' + (t.status === 'running' ? 'dot-active' : 'dot-idle') + '"></span>' +
            '<span class="bg-task-name">' + escHtml(t.name || t.id || 'task') + '</span>' +
            (t.model ? '<span class="bg-task-model">' + escHtml(t.model) + '</span>' : '') +
            '<span class="bg-task-status ' + statusClass + '">' + escHtml(t.status || 'unknown') + '</span>' +
            '</div>';
        }).join('');
      } catch {
        document.getElementById('bg-tasks').innerHTML =
          '<div class="bg-empty" style="color:#f44747">Failed to load background tasks</div>';
      }
    }

    async function refreshErrors() {
      try {
        const res = await fetch('http://localhost:${DAEMON_PORT}/session-log?limit=200');
        const events = await res.json();
        var errors = events.filter(function(e) {
          return e.error || e.event === '/postToolUseFailure';
        }).slice(0, 5);
        var container = document.getElementById('recent-errors');
        if (!errors.length) {
          container.innerHTML = '<div class="bg-empty">No recent errors</div>';
          return;
        }
        container.innerHTML = errors.map(function(e) {
          var time = new Date(e.ts).toLocaleTimeString('en-US', {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
          return '<div class="error-item">' +
            '<span class="error-time">' + time + '</span>' +
            '<span class="error-hook">' + escHtml(e.event || '') + '</span>' +
            '<span class="error-msg">' + escHtml((e.error || 'Tool failure').slice(0, 80)) + '</span>' +
            '</div>';
        }).join('');
      } catch {
        document.getElementById('recent-errors').innerHTML =
          '<div class="bg-empty">No recent errors</div>';
      }
    }

    function refreshAll() {
      refresh();
      refreshErrors();
      var activeTab = document.querySelector('.tab-content.active');
      if (activeTab) {
        var id = activeTab.id;
        if (id === 'tab-hooks') refreshHooks();
        else if (id === 'tab-background') refreshBackground();
        else if (id === 'tab-events') refreshEvents();
      }
    }

    refresh();
    refreshErrors();
    setInterval(refresh, 5000);
    setInterval(refreshErrors, 5000);

    let currentFilter = 'all';

    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
      document.querySelector('.tab[onclick*="' + tab + '"]').classList.add('active');
      const el = document.getElementById('tab-' + tab);
      el.style.display = 'block';
      el.classList.add('active');
      if (tab === 'events') refreshEvents();
      else if (tab === 'hooks') refreshHooks();
      else if (tab === 'background') refreshBackground();
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
        const res = await fetch('http://localhost:${DAEMON_PORT}/session-log?limit=200');
        let events = await res.json();
        if (currentFilter === 'tools') events = events.filter(e => e.tool && !['Task','task','Agent','agent'].includes(e.tool));
        else if (currentFilter === 'dispatches') events = events.filter(e => e.agentType);
        else if (currentFilter === 'errors') events = events.filter(e => e.error || e.event === '/postToolUseFailure');
        else if (currentFilter === 'denies') events = events.filter(e => e.action === 'deny');

        document.getElementById('event-count').textContent = events.length + ' events';
        const list = document.getElementById('event-list');
        if (!events.length) { list.innerHTML = '<div style="padding:12px;color:#666">No events yet</div>'; return; }
        list.innerHTML = events.map((e, i) => {
          const time = new Date(e.ts).toLocaleTimeString('en-US', {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
          const actionClass = 'action-' + (e.action || 'noop');
          const agentBadge = e.agentType ? '<span style="color:#c586c0">[' + e.agentType + ']</span> ' : '';
          const errorSnip = e.error ? '<span style="color:#f44747;margin-left:4px">' + e.error.slice(0,50) + '</span>' : '';
          const metaSnip = e.meta ? Object.entries(e.meta).map(([k,v]) => k + '=' + String(v).slice(0,30)).join(' ') : '';
          const detail = JSON.stringify(e, null, 2);
          return '<div class="event-row" onclick="toggleDetail(' + i + ')">' +
            '<span class="event-time">' + time + '</span>' +
            '<span class="event-hook">' + e.event + '</span>' +
            '<span class="event-tool">' + agentBadge + (e.tool || '') + '</span>' +
            '<span class="event-action ' + actionClass + '">' + (e.action || '-') + '</span>' +
            errorSnip +
            '<span class="event-meta">' + metaStr(metaSnip) + '</span>' +
            '<div class="event-detail" id="detail-' + i + '">' + escHtml(detail) + '</div>' +
            '</div>';
        }).join('');
      } catch {
        document.getElementById('event-list').innerHTML = '<div style="padding:12px;color:#f44747">Failed to fetch events</div>';
      }
    }

    function metaStr(s) { return s; }
    function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function toggleDetail(i) {
      const el = document.getElementById('detail-' + i);
      if (el) el.classList.toggle('open');
    }

    async function copyLog() {
      try {
        const res = await fetch('http://localhost:${DAEMON_PORT}/session-log?limit=500');
        const events = await res.json();
        await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
        alert('Copied ' + events.length + ' events to clipboard');
      } catch { alert('Failed to copy'); }
    }

    async function clearLogUI() {
      if (!confirm('Clear all session events?')) return;
      try {
        await fetch('http://localhost:${DAEMON_PORT}/session-log/clear', { method: 'POST' });
        refreshEvents();
      } catch { alert('Failed to clear'); }
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
