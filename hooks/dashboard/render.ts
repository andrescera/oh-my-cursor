export function renderDashboardHTML(daemonPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>oh-my-cursor Dashboard</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-size: 13px;
      min-height: 100vh;
    }

    #app { padding: 16px; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .header-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground, #cccccc);
    }

    .header-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 10px;
      background: rgba(78, 201, 176, 0.15);
      color: #4ec9b0;
      margin-left: 8px;
      vertical-align: middle;
      letter-spacing: 0.04em;
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

    /* Tab bar */
    .tabs {
      display: flex;
      gap: 2px;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      padding-bottom: 0;
      flex-wrap: wrap;
    }

    .tab {
      padding: 6px 14px;
      border: 1px solid transparent;
      border-bottom: none;
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 12px;
      border-radius: 4px 4px 0 0;
      position: relative;
      bottom: -1px;
      transition: color 0.1s, background 0.1s;
    }

    .tab:hover { color: var(--vscode-foreground, #ccc); }

    .tab.active {
      background: var(--vscode-editorWidget-background, #252526);
      color: var(--vscode-foreground, #cccccc);
      border-color: var(--vscode-panel-border, #454545);
      border-bottom-color: var(--vscode-editorWidget-background, #252526);
    }

    /* Cards */
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
      align-items: center;
      padding: 5px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    }
    .stat:last-child { border-bottom: none; }

    .stat-label { color: var(--vscode-descriptionForeground, #888); }
    .stat-value { font-weight: 500; font-variant-numeric: tabular-nums; }

    .status-ok    { color: #4ec9b0; }
    .status-warn  { color: #dcdcaa; }
    .status-error { color: #f44747; }

    .dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 4px;
    }
    .dot-active { background: #4ec9b0; }
    .dot-idle   { background: #555; }

    .placeholder {
      padding: 24px 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #666);
      font-size: 12px;
    }

    .placeholder-icon {
      font-size: 24px;
      margin-bottom: 8px;
      opacity: 0.4;
    }

    .section-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    @media (max-width: 500px) {
      .section-grid { grid-template-columns: 1fr; }
    }

    /* Loading spinner */
    .spinner {
      display: inline-block;
      width: 12px; height: 12px;
      border: 2px solid var(--vscode-panel-border, #333);
      border-top-color: #4ec9b0;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app"><div class="placeholder"><div class="spinner"></div> Loading dashboard...</div></div>

  <script type="module">
    import * as preact      from 'https://esm.sh/preact@10.25.4';
    import * as preactHooks from 'https://esm.sh/preact@10.25.4/hooks';
    import htm              from 'https://esm.sh/htm@3.1.1/preact';

    const { h, render, Fragment } = preact;
    const { useState, useEffect, useCallback } = preactHooks;
    const html = htm.bind(h);

    const BASE = 'http://localhost:${daemonPort}';

    const TABS = [
      { id: 'status',     label: 'Status'     },
      { id: 'hooks',      label: 'Hooks'       },
      { id: 'background', label: 'Background'  },
      { id: 'events',     label: 'Events'      },
      { id: 'config',     label: 'Config'      },
      { id: 'sessions',   label: 'Sessions'    },
      { id: 'agents',     label: 'Agents'      },
    ];

    // ── Shared helpers ──────────────────────────────────────────────────────

    function useFetch(url, deps = []) {
      const [data, setData]     = useState(null);
      const [error, setError]   = useState(null);
      const [loading, setLoading] = useState(true);

      const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
          setData(await res.json());
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      }, [url]);

      useEffect(() => { load(); }, [load, ...deps]);

      return { data, error, loading, reload: load };
    }

    function Placeholder({ icon = '⧗', text = 'Loading...' }) {
      return html\`
        <div class="placeholder">
          <div class="placeholder-icon">\${icon}</div>
          <div>\${text}</div>
        </div>\`;
    }

    function Stat({ label, value, valueClass = '' }) {
      return html\`
        <div class="stat">
          <span class="stat-label">\${label}</span>
          <span class=\${'stat-value ' + valueClass}>\${value ?? '--'}</span>
        </div>\`;
    }

    // ── Tab: Status ─────────────────────────────────────────────────────────

    function StatusTab() {
      const { data: health, error, loading, reload } = useFetch(\`\${BASE}/health\`);

      useEffect(() => {
        const t = setInterval(reload, 5000);
        return () => clearInterval(t);
      }, [reload]);

      if (loading) return html\`<\${Placeholder} text="Loading health..." />\`;
      if (error)   return html\`<\${Placeholder} icon="✕" text=\${"Daemon offline: " + error} />\`;

      const uptime = health ? Math.round(health.uptime || 0) + 's' : '--';

      return html\`
        <div class="card">
          <\${Stat} label="Session"         value=\${health?.currentSessionId || '--'} />
          <\${Stat} label="Daemon"          value="Connected" valueClass="status-ok" />
          <\${Stat} label="Uptime"          value=\${uptime} />
          <\${Stat} label="Active Sessions" value=\${health?.sessions ?? '--'} />
        </div>
        <div class="card">
          <\${Stat} label="Tool Calls"          value=\${health?.toolCalls ?? 0} />
          <\${Stat} label="Explore Dispatches"  value=\${(health?.exploreCounts ?? 0) + ' / 5'} />
          <\${Stat} label="Worker Dispatches"   value=\${(health?.workerCounts ?? 0) + ' / 8'} />
          <\${Stat} label="Ralph Loop"          value=\${health?.ralphActive ? 'Active' : 'Inactive'}
                   valueClass=\${health?.ralphActive ? 'status-ok' : ''} />
        </div>\`;
    }

    // ── Tab: Hooks ──────────────────────────────────────────────────────────

    function HooksTab() {
      const { data, error, loading } = useFetch(\`\${BASE}/config\`);

      if (loading) return html\`<\${Placeholder} text="Loading hook config..." />\`;
      if (error)   return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + error} />\`;

      const enabled  = data?.enabled  || [];
      const disabled = data?.disabled || [];

      return html\`
        <div class="card">
          <div class="card-title">Hook Configuration — \${enabled.length} enabled, \${disabled.length} disabled</div>
          <div class="section-grid">
            <div>
              <div class="card-title" style="border:none;margin-bottom:6px">Enabled</div>
              \${enabled.length
                ? enabled.map(h => html\`
                    <div class="stat" key=\${h}>
                      <span><span class="dot dot-active"></span>\${h}</span>
                    </div>\`)
                : html\`<\${Placeholder} text="None enabled" />\`}
            </div>
            <div>
              <div class="card-title" style="border:none;margin-bottom:6px">Disabled</div>
              \${disabled.length
                ? disabled.map(h => html\`
                    <div class="stat" key=\${h}>
                      <span><span class="dot dot-idle"></span>\${h}</span>
                    </div>\`)
                : html\`<\${Placeholder} text="All hooks enabled" />\`}
            </div>
          </div>
        </div>\`;
    }

    // ── Tab: Background ─────────────────────────────────────────────────────

    function BackgroundTab() {
      const { data, error, loading, reload } = useFetch(\`\${BASE}/backgroundTasks\`);

      useEffect(() => {
        const t = setInterval(reload, 3000);
        return () => clearInterval(t);
      }, [reload]);

      if (loading) return html\`<\${Placeholder} text="Loading background tasks..." />\`;
      if (error)   return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + error} />\`;

      const tasks = data?.tasks || [];

      return html\`
        <div class="card">
          <div class="card-title">Active Background Tasks (\${tasks.length})</div>
          \${tasks.length === 0
            ? html\`<\${Placeholder} text="No active background tasks" />\`
            : tasks.map(t => html\`
                <div class="stat" key=\${t.id || t.name}>
                  <span>
                    <span class="dot \${t.status === 'running' ? 'dot-active' : 'dot-idle'}"></span>
                    \${t.name || t.id || 'task'}
                    \${t.model ? html\`<span style="color:#569cd6;font-size:11px;margin-left:6px">\${t.model}</span>\` : ''}
                  </span>
                  <span class=\${'stat-value ' + (t.status === 'running' ? 'status-ok' : t.status === 'error' ? 'status-error' : 'status-warn')}>
                    \${t.status || 'unknown'}
                  </span>
                </div>\`)}\
        </div>\`;
    }

    // ── Tab: Events ─────────────────────────────────────────────────────────

    function EventsTab() {
      return html\`
        <div class="card">
          <div class="card-title">Event Log</div>
          <\${Placeholder} icon="📋" text="Event log viewer — coming soon" />
        </div>\`;
    }

    // ── Tab: Config ─────────────────────────────────────────────────────────

    function ConfigTab() {
      const { data, error, loading } = useFetch(\`\${BASE}/status\`);

      if (loading) return html\`<\${Placeholder} text="Loading config..." />\`;
      if (error)   return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + error} />\`;

      return html\`
        <div class="card">
          <div class="card-title">Daemon Status</div>
          <\${Stat} label="Port (daemon)"   value=\${data?.ports?.daemon} />
          <\${Stat} label="Port (config)"   value=\${data?.ports?.configDefault} />
          <\${Stat} label="Active Sessions" value=\${data?.activeSessions} />
          <\${Stat} label="Started"         value=\${data?.startTime ? new Date(data.startTime).toLocaleString() : '--'} />
          <\${Stat} label="Restart Count"   value=\${data?.restartCount ?? 0} />
        </div>
        <div class="card">
          <div class="card-title">Config Files</div>
          \${data?.configFiles
            ? Object.entries(data.configFiles).map(([k, v]) => html\`
                <div class="stat" key=\${k}>
                  <span class="stat-label">\${k}</span>
                  <span class="stat-value" style="font-family:monospace;font-size:11px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title=\${v}>\${v}</span>
                </div>\`)
            : null}
        </div>\`;
    }

    // ── Tab: Sessions ───────────────────────────────────────────────────────

    function SessionsTab() {
      return html\`
        <div class="card">
          <div class="card-title">Sessions</div>
          <\${Placeholder} icon="🗂" text="Session inspector — coming soon" />
        </div>\`;
    }

    // ── Tab: Agents ─────────────────────────────────────────────────────────

    function AgentsTab() {
      return html\`
        <div class="card">
          <div class="card-title">Agents</div>
          <\${Placeholder} icon="🤖" text="Agent tracker — coming soon" />
        </div>\`;
    }

    const TAB_COMPONENTS = {
      status:     StatusTab,
      hooks:      HooksTab,
      background: BackgroundTab,
      events:     EventsTab,
      config:     ConfigTab,
      sessions:   SessionsTab,
      agents:     AgentsTab,
    };

    // ── App shell ────────────────────────────────────────────────────────────

    function App() {
      const [activeTab, setActiveTab] = useState('status');
      const TabComponent = TAB_COMPONENTS[activeTab];

      return html\`
        <div id="app">
          <div class="header">
            <div class="header-title">
              oh-my-cursor
              <span class="header-badge">v2</span>
            </div>
          </div>

          <div class="tabs">
            \${TABS.map(tab => html\`
              <button
                key=\${tab.id}
                class=\${'tab' + (activeTab === tab.id ? ' active' : '')}
                onClick=\${() => setActiveTab(tab.id)}
              >
                \${tab.label}
              </button>\`)}
          </div>

          <\${TabComponent} />
        </div>\`;
    }

    render(html\`<\${App} />\`, document.getElementById('app'));
  </script>
</body>
</html>`;
}
