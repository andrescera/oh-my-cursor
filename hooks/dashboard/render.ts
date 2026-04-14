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

    .badge {
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 8px;
      letter-spacing: 0.03em;
    }
    .badge-enabled  { background: rgba(78,201,176,0.15); color: #4ec9b0; }
    .badge-disabled { background: rgba(136,136,136,0.12); color: #888; }

    .hook-name { font-family: monospace; font-size: 12px; }

    .dot-error { background: #f44747; }

    .bg-task-row {
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    }
    .bg-task-row:last-child { border-bottom: none; }
    .bg-task-header { display: flex; justify-content: space-between; align-items: center; }
    .bg-task-type   { font-weight: 500; font-size: 12px; margin-left: 2px; }
    .bg-task-desc   {
      color: var(--vscode-descriptionForeground, #888);
      font-size: 11px;
      margin: 3px 0 2px 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bg-task-footer { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-left: 10px; }

    /* ── Event Log ─────────────────────────────────────────────────────────── */
    .ev-toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #454545);
    }
    .ev-filters { display: flex; gap: 4px; flex-wrap: wrap; }
    .ev-filter {
      padding: 2px 8px;
      border: 1px solid var(--vscode-panel-border, #454545);
      background: transparent;
      color: var(--vscode-descriptionForeground, #888);
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
    }
    .ev-filter:hover { color: var(--vscode-foreground, #ccc); }
    .ev-filter.active {
      background: rgba(78, 201, 176, 0.15);
      color: #4ec9b0;
      border-color: rgba(78, 201, 176, 0.4);
    }
    .ev-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-left: auto;
    }
    .ev-count { font-size: 11px; color: var(--vscode-descriptionForeground, #666); }
    .ev-btn {
      padding: 2px 8px;
      border: 1px solid var(--vscode-panel-border, #454545);
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
      text-decoration: none;
      display: inline-block;
    }
    .ev-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .ev-btn-danger:hover { background: rgba(244,71,71,0.15); border-color: rgba(244,71,71,0.4); color: #f44747; }
    .ev-list {
      max-height: 60vh;
      overflow-y: auto;
      font-family: monospace;
      font-size: 11px;
    }
    .ev-empty { padding: 16px 12px; color: var(--vscode-descriptionForeground, #666); text-align: center; }
    .ev-row {
      padding: 4px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      cursor: pointer;
      transition: background 0.1s;
    }
    .ev-row:hover { background: rgba(255,255,255,0.04); }
    .ev-main { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .ev-time  { color: var(--vscode-descriptionForeground, #666); min-width: 70px; }
    .ev-hook  { color: #569cd6; }
    .ev-tool  { color: var(--vscode-foreground, #ccc); }
    .ev-agent { color: #c586c0; }
    .ev-action { font-weight: 500; min-width: 40px; }
    .ev-action-allow { color: #4ec9b0; }
    .ev-action-deny  { color: #f44747; }
    .ev-action-noop  { color: #888; }
    .ev-error { color: #f44747; font-size: 10px; }
    .ev-meta  { color: var(--vscode-descriptionForeground, #666); font-size: 10px; }
    .ev-detail {
      margin: 4px 0 2px;
      padding: 6px 8px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 3px;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-editor-foreground, #d4d4d4);
      max-height: 300px;
      overflow-y: auto;
    }

    /* ── Sessions ─────────────────────────────────────────────────────────── */
    .sess-list {
      max-height: 65vh;
      overflow-y: auto;
      font-size: 12px;
    }
    .sess-row {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      cursor: pointer;
      transition: background 0.1s;
    }
    .sess-row:hover { background: rgba(255,255,255,0.04); }
    .sess-row:last-child { border-bottom: none; }
    .sess-main {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    .sess-id {
      font-family: monospace;
      font-size: 11px;
      color: #569cd6;
      min-width: 0;
    }
    .sess-time { color: var(--vscode-descriptionForeground, #666); font-size: 11px; }
    .sess-meta { font-size: 11px; color: var(--vscode-descriptionForeground, #888); }
    .sess-detail-block {
      margin-top: 8px;
      padding: 8px 10px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 4px;
      font-size: 11px;
    }
    .sess-detail-title {
      font-weight: 600;
      color: var(--vscode-foreground, #ccc);
      margin: 10px 0 4px;
    }
    .sess-detail-title:first-child { margin-top: 0; }
    .sess-dispatch-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
      font-family: monospace;
      font-size: 10px;
    }
    .sess-dispatch-row:last-child { border-bottom: none; }
    .sess-trail-item {
      font-family: monospace;
      font-size: 10px;
      padding: 3px 0;
      border-bottom: 1px solid var(--vscode-panel-border, #252525);
      color: var(--vscode-editor-foreground, #d4d4d4);
    }
    .sess-trail-item:last-child { border-bottom: none; }
    .badge-composer-plan  { background: rgba(86,156,214,0.2); color: #569cd6; }
    .badge-composer-agent { background: rgba(78,201,176,0.15); color: #4ec9b0; }
    .badge-composer-none  { background: rgba(136,136,136,0.12); color: #888; }

    /* ── Agents monitor (flat list) ───────────────────────────────────────── */
    .ag-list { font-size: 11px; }
    .ag-row {
      display: grid;
      grid-template-columns: 14px minmax(72px, 0.9fr) minmax(0, 1.4fr) minmax(64px, 0.75fr) minmax(52px, auto);
      gap: 8px;
      align-items: center;
      padding: 7px 4px;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    }
    .ag-row:last-child { border-bottom: none; }
    .ag-dot-cell { display: flex; justify-content: center; }
    .ag-type { font-weight: 500; font-variant-numeric: tabular-nums; }
    .ag-desc {
      color: var(--vscode-descriptionForeground, #888);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .ag-status { font-variant-numeric: tabular-nums; }
    .ag-dur {
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--vscode-descriptionForeground, #888);
    }
    .dot-ag-running { background: #4ec9b0; }
    .dot-ag-done { background: #6b6b6b; }
    .dot-ag-failed { background: #f44747; }
  </style>
</head>
<body>
  <div id="app"><div class="placeholder"><div class="spinner"></div> Loading dashboard...</div></div>

  <script type="module">
    import * as preact      from 'https://esm.sh/preact@10.25.4';
    import * as preactHooks from 'https://esm.sh/preact@10.25.4/hooks';
    import htm              from 'https://esm.sh/htm@3.1.1/preact';

    const { h, render, Fragment } = preact;
    const { useState, useEffect, useCallback, useRef } = preactHooks;
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
      const [stats, setStats]     = useState(null);
      const [errors, setErrors]   = useState([]);
      const [loading, setLoading] = useState(true);
      const [sseOn, setSseOn]     = useState(false);
      const [offline, setOffline] = useState(false);

      useEffect(() => {
        fetch(\`\${BASE}/health\`)
          .then(r => { if (!r.ok) throw new Error('offline'); return r.json(); })
          .then(data => { setStats(data); setOffline(false); })
          .catch(() => setOffline(true))
          .finally(() => setLoading(false));
      }, []);

      useEffect(() => {
        let es;
        let retryTimer;

        function connect() {
          es = new EventSource(\`\${BASE}/events/stream\`);

          es.onopen = () => setSseOn(true);

          es.onmessage = (evt) => {
            let event;
            try { event = JSON.parse(evt.data); } catch { return; }

            if (event.action === 'health' && event.data) {
              setStats(event.data);
              setOffline(false);
            }
            if (event.action === 'tool_call' || event.action === 'toolCall') {
              setStats(prev => prev ? { ...prev, toolCalls: (prev.toolCalls || 0) + 1 } : prev);
            }
            if (event.action === 'error' || event.error || event.action === '/postToolUseFailure') {
              const entry = {
                ts: event.ts || Date.now(),
                hook: event.event || event.action || 'error',
                msg: (event.error || event.message || 'Error').slice(0, 80),
              };
              setErrors(prev => [entry, ...prev].slice(0, 5));
            }
          };

          es.onerror = () => {
            setSseOn(false);
            es.close();
            retryTimer = setTimeout(connect, 3000);
          };
        }

        connect();
        return () => { clearTimeout(retryTimer); if (es) es.close(); };
      }, []);

      if (loading) return html\`<\${Placeholder} text="Loading health..." />\`;
      if (offline) return html\`<\${Placeholder} icon="✕" text="Daemon offline" />\`;

      const uptime = stats ? Math.round(stats.uptime || 0) + 's' : '--';

      return html\`
        <div class="card">
          <\${Stat} label="Session"         value=\${stats?.currentSessionId || '--'} />
          <\${Stat} label="Daemon"          value=\${'Connected' + (sseOn ? ' ●' : '')} valueClass="status-ok" />
          <\${Stat} label="Uptime"          value=\${uptime} />
          <\${Stat} label="Active Sessions" value=\${stats?.sessions ?? '--'} />
        </div>
        <div class="card">
          <\${Stat} label="Tool Calls"         value=\${stats?.toolCalls ?? 0} />
          <\${Stat} label="Explore Dispatches" value=\${(stats?.exploreCounts ?? 0) + ' / 5'} />
          <\${Stat} label="Worker Dispatches"  value=\${(stats?.workerCounts ?? 0) + ' / 8'} />
          <\${Stat} label="Ralph Loop"         value=\${stats?.ralphActive ? 'Active' : 'Inactive'}
                   valueClass=\${stats?.ralphActive ? 'status-ok' : ''} />
        </div>
        <div class="card">
          <div class="card-title">Recent Errors</div>
          \${errors.length === 0
            ? html\`<\${Placeholder} text="No recent errors" />\`
            : errors.map((e, i) => {
                const t = new Date(e.ts).toLocaleTimeString('en-US', {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
                return html\`
                  <div class="stat" key=\${i}>
                    <span style="font-size:11px;color:var(--vscode-descriptionForeground,#888)">\${t} \${e.hook}</span>
                    <span class="stat-value status-error" style="font-size:11px;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title=\${e.msg}>\${e.msg}</span>
                  </div>\`;
              })}
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
                ? enabled.map(hook => html\`
                    <div class="stat" key=\${hook}>
                      <span><span class="dot dot-active"></span><span class="hook-name">\${hook}</span></span>
                      <span class="badge badge-enabled">on</span>
                    </div>\`)
                : html\`<\${Placeholder} text="None enabled" />\`}
            </div>
            <div>
              <div class="card-title" style="border:none;margin-bottom:6px">Disabled</div>
              \${disabled.length
                ? disabled.map(hook => html\`
                    <div class="stat" key=\${hook}>
                      <span><span class="dot dot-idle"></span><span class="hook-name">\${hook}</span></span>
                      <span class="badge badge-disabled">off</span>
                    </div>\`)
                : html\`<\${Placeholder} text="All hooks enabled" />\`}
            </div>
          </div>
        </div>\`;
    }

    // ── Tab: Background ─────────────────────────────────────────────────────

    function formatElapsed(ms) {
      if (!ms || ms < 0) return '0s';
      const s = Math.floor(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.floor(s / 60);
      return m + 'm ' + (s % 60) + 's';
    }

    function ElapsedTimer({ startTime, elapsedMs, status, className = 'bg-task-footer' }) {
      const [elapsed, setElapsed] = useState(() => {
        if (status !== 'running') return elapsedMs || 0;
        return startTime ? Date.now() - new Date(startTime).getTime() : (elapsedMs || 0);
      });

      useEffect(() => {
        if (status !== 'running') return;
        const origin = startTime ? new Date(startTime).getTime() : Date.now() - (elapsedMs || 0);
        const t = setInterval(() => setElapsed(Date.now() - origin), 1000);
        return () => clearInterval(t);
      }, [status, startTime, elapsedMs]);

      return html\`<span class=\${className}>\${formatElapsed(elapsed)}</span>\`;
    }

    function BackgroundTab() {
      const [tasks, setTasks] = useState(null);
      const [loadErr, setLoadErr] = useState(null);

      useEffect(() => {
        let mounted = true;
        let es = null;

        fetch(\`\${BASE}/backgroundTasks\`)
          .then(r => { if (!r.ok) throw new Error(\`HTTP \${r.status}\`); return r.json(); })
          .then(d => { if (mounted) setTasks(d.tasks || []); })
          .catch(e => { if (mounted) setLoadErr(e.message); });

        es = new EventSource(\`\${BASE}/events/stream\`);
        es.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.event === '/subagentStart') {
              const task = msg.body ?? msg.data ?? msg;
              setTasks(prev => {
                if (!prev) return [{ ...task, status: 'running' }];
                if (prev.find(t => t.agentId === task.agentId)) return prev;
                return [...prev, { ...task, status: 'running' }];
              });
            } else if (msg.event === '/subagentStop') {
              const payload = msg.body ?? msg.data ?? msg;
              setTasks(prev => prev
                ? prev.map(t => t.agentId === payload.agentId
                    ? { ...t, status: payload.error ? 'failed' : 'completed', elapsedMs: payload.elapsedMs ?? t.elapsedMs }
                    : t)
                : prev
              );
            }
          } catch {}
        };

        return () => {
          mounted = false;
          if (es) es.close();
        };
      }, []);

      if (tasks === null && !loadErr) return html\`<\${Placeholder} text="Loading background tasks..." />\`;
      if (loadErr) return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + loadErr} />\`;

      const list = tasks || [];

      return html\`
        <div class="card">
          <div class="card-title">Active Background Tasks (\${list.length})</div>
          \${list.length === 0
            ? html\`<\${Placeholder} text="No active background tasks" />\`
            : list.map(t => {
                const dotClass = t.status === 'running' ? 'dot-active'
                               : t.status === 'failed'  ? 'dot-error'
                               : 'dot-idle';
                const statusClass = t.status === 'running'   ? 'status-ok'
                                  : t.status === 'failed'    ? 'status-error'
                                  : t.status === 'completed' ? 'status-warn'
                                  : '';
                return html\`
                  <div class="bg-task-row" key=\${t.agentId}>
                    <div class="bg-task-header">
                      <span>
                        <span class="dot \${dotClass}"></span>
                        <span class="bg-task-type">\${t.agentType || 'agent'}</span>
                      </span>
                      <span class=\${'stat-value ' + statusClass}>\${t.status}</span>
                    </div>
                    \${t.description ? html\`<div class="bg-task-desc">\${t.description}</div>\` : null}
                    <\${ElapsedTimer} startTime=\${t.startTime} elapsedMs=\${t.elapsedMs} status=\${t.status} />
                  </div>\`;
              })}\
        </div>\`;
    }

    // ── Tab: Events ─────────────────────────────────────────────────────────

    function eventKey(e) {
      return \`\${e.ts}:\${e.event}:\${e.tool || ''}\`;
    }

    const EV_FILTERS = [
      { id: 'all',        label: 'All'        },
      { id: 'tools',      label: 'Tools'      },
      { id: 'dispatches', label: 'Dispatches' },
      { id: 'errors',     label: 'Errors'     },
      { id: 'denies',     label: 'Denies'     },
    ];

    function applyEventFilter(evts, filter) {
      if (filter === 'tools')      return evts.filter(e => e.tool && !['Task','task','Agent','agent'].includes(e.tool));
      if (filter === 'dispatches') return evts.filter(e => e.agentType);
      if (filter === 'errors')     return evts.filter(e => e.error || e.event === '/postToolUseFailure');
      if (filter === 'denies')     return evts.filter(e => e.action === 'deny');
      return evts;
    }

    function EventRow({ event, expanded, onToggle }) {
      const time = new Date(event.ts).toLocaleTimeString('en-US', {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const actionCls = \`ev-action ev-action-\${event.action || 'noop'}\`;
      const metaStr = event.meta
        ? Object.entries(event.meta).map(([k,v]) => k + '=' + String(v).slice(0,30)).join(' ')
        : '';
      return html\`
        <div class="ev-row" onClick=\${onToggle}>
          <div class="ev-main">
            <span class="ev-time">\${time}</span>
            <span class="ev-hook">\${event.event || ''}</span>
            <span class="ev-tool">
              \${event.agentType ? html\`<span class="ev-agent">[\${event.agentType}]</span>\` : ''}
              \${event.tool || ''}
            </span>
            <span class=\${actionCls}>\${event.action || '-'}</span>
            \${event.error ? html\`<span class="ev-error">\${event.error.slice(0, 50)}</span>\` : ''}
            \${metaStr ? html\`<span class="ev-meta">\${metaStr}</span>\` : ''}
          </div>
          \${expanded ? html\`<pre class="ev-detail">\${JSON.stringify(event, null, 2)}</pre>\` : ''}
        </div>\`;
    }

    function EventsTab() {
      const [events, setEvents]         = useState([]);
      const [expandedKeys, setExpanded] = useState(new Set());
      const [filter, setFilter]         = useState('all');
      const [autoScroll, setAutoScroll] = useState(true);
      const scrollRef = useRef(null);
      const atBottom  = useRef(true);

      // Fetch initial log then open SSE — chained to avoid duplicates during load
      useEffect(() => {
        const seen = new Set();
        let es;
        fetch(\`\${BASE}/session-log?limit=200\`)
          .then(r => r.json())
          .then(data => {
            data.forEach(e => seen.add(eventKey(e)));
            setEvents(data);
            es = new EventSource(\`\${BASE}/events/stream\`);
            es.onmessage = msg => {
              try {
                const ev = JSON.parse(msg.data);
                const k  = eventKey(ev);
                if (seen.has(k)) return;
                seen.add(k);
                setEvents(prev => [...prev, ev]);
              } catch {}
            };
          })
          .catch(() => {});
        return () => { if (es) es.close(); };
      }, []);

      // Track whether user is at the bottom of the scroll container
      useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
      }, []);

      // Scroll to bottom after new events when already at bottom or auto-scroll is on
      useEffect(() => {
        if ((atBottom.current || autoScroll) && scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, [events]);

      function toggleExpand(key) {
        setExpanded(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }

      async function copyLog() {
        try {
          await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
        } catch {}
      }

      async function clearLog() {
        if (!confirm('Clear all session events?')) return;
        try {
          await fetch(\`\${BASE}/session-log/clear\`, { method: 'POST' });
          setEvents([]);
          setExpanded(new Set());
        } catch {}
      }

      const filtered = applyEventFilter(events, filter);

      return html\`
        <div class="card" style="padding:0;overflow:hidden">
          <div class="ev-toolbar">
            <div class="ev-filters">
              \${EV_FILTERS.map(f => html\`
                <button
                  key=\${f.id}
                  class=\${'ev-filter' + (filter === f.id ? ' active' : '')}
                  onClick=\${() => setFilter(f.id)}
                >\${f.label}</button>\`)}
            </div>
            <div class="ev-actions">
              <span class="ev-count">\${filtered.length} events</span>
              <button
                class=\${'ev-filter' + (autoScroll ? ' active' : '')}
                onClick=\${() => setAutoScroll(v => !v)}
                title="Toggle auto-scroll to bottom"
              >↓ Auto</button>
              <a class="ev-btn" href=\${BASE + '/session-log/download'} download="session-log.jsonl" target="_blank">↓ JSONL</a>
              <button class="ev-btn" onClick=\${copyLog}>Copy JSON</button>
              <button class="ev-btn ev-btn-danger" onClick=\${clearLog}>Clear</button>
            </div>
          </div>
          <div class="ev-list" ref=\${scrollRef}>
            \${filtered.length === 0
              ? html\`<div class="ev-empty">No events</div>\`
              : filtered.map(e => {
                  const k = eventKey(e);
                  return html\`<\${EventRow} key=\${k} event=\${e} expanded=\${expandedKeys.has(k)} onToggle=\${() => toggleExpand(k)} />\`;
                })}
          </div>
        </div>\`;
    }

    // ── Tab: Config ─────────────────────────────────────────────────────────

    const CFG_INPUT = 'background:var(--vscode-editor-background,#1e1e1e);border:1px solid var(--vscode-panel-border,#454545);color:var(--vscode-editor-foreground,#d4d4d4);padding:3px 6px;border-radius:3px;font-size:12px';

    function FieldRow({ label, children }) {
      return html\`
        <div class="stat" style="align-items:flex-start;padding:6px 0;gap:8px">
          <span class="stat-label" style="min-width:160px;padding-top:2px">\${label}</span>
          <span style="flex:1;text-align:right">\${children}</span>
        </div>\`;
    }

    function NumField({ label, value, min, max, step, onChange }) {
      return html\`
        <\${FieldRow} label=\${label}>
          <input type="number" value=\${value} min=\${min} max=\${max} step=\${step ?? 1}
            onInput=\${e => onChange(parseFloat(e.target.value))}
            style=\${CFG_INPUT + ';width:120px;text-align:right'} />
        </\${FieldRow}>\`;
    }

    function BoolField({ label, value, onChange }) {
      return html\`
        <div class="stat" style="padding:6px 0">
          <span class="stat-label">\${label}</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" checked=\${value} onChange=\${e => onChange(e.target.checked)} />
            <span style=\${'font-size:12px;color:' + (value ? '#4ec9b0' : '#888')}>\${value ? 'on' : 'off'}</span>
          </label>
        </div>\`;
    }

    function StrField({ label, value, onChange }) {
      return html\`
        <\${FieldRow} label=\${label}>
          <input type="text" value=\${value ?? ''} onInput=\${e => onChange(e.target.value)}
            style=\${CFG_INPUT + ';width:100%;max-width:260px'} />
        </\${FieldRow}>\`;
    }

    function EnumField({ label, value, options, onChange }) {
      return html\`
        <\${FieldRow} label=\${label}>
          <select value=\${value} onChange=\${e => onChange(e.target.value)} style=\${CFG_INPUT}>
            \${options.map(o => html\`<option value=\${o} selected=\${o === value}>\${o}</option>\`)}
          </select>
        </\${FieldRow}>\`;
    }

    function ListField({ label, value, onChange }) {
      const arr = value || [];
      return html\`
        <\${FieldRow} label=\${label}>
          <textarea value=\${arr.join('\n')} rows=\${Math.max(2, arr.length + 1)}
            onInput=\${e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
            style=\${CFG_INPUT + ';width:100%;max-width:260px;resize:vertical;font-family:monospace'} />
        </\${FieldRow}>\`;
    }

    function NumListField({ label, value, onChange }) {
      return html\`
        <\${FieldRow} label=\${label}>
          <input type="text" value=\${(value || []).join(', ')}
            onInput=\${e => onChange(e.target.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)))}
            style=\${CFG_INPUT + ';width:100%;max-width:260px;font-family:monospace'} />
        </\${FieldRow}>\`;
    }

    function kvText(obj) {
      return Object.entries(obj || {}).map(([k, v]) => k + ': ' + v).join('\n');
    }
    function parseKV(text) {
      const out = {};
      text.split('\n').forEach(line => {
        const i = line.indexOf(':');
        if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      });
      return out;
    }

    function KVField({ label, value, onChange }) {
      return html\`
        <\${FieldRow} label=\${label}>
          <textarea value=\${kvText(value)} rows=\${Math.max(2, Object.keys(value || {}).length + 1)}
            onInput=\${e => onChange(parseKV(e.target.value))}
            style=\${CFG_INPUT + ';width:100%;max-width:260px;resize:vertical;font-family:monospace'} />
        </\${FieldRow}>\`;
    }

    function deepSet(obj, path, value) {
      const next = JSON.parse(JSON.stringify(obj));
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return next;
    }

    function ConfigTab() {
      const [config, setConfig]   = useState(null);
      const [draft, setDraft]     = useState(null);
      const [loading, setLoading] = useState(true);
      const [saving, setSaving]   = useState(false);
      const [banner, setBanner]   = useState(null);

      useEffect(() => {
        fetch(\`\${BASE}/config/full\`)
          .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(data => { setConfig(data); setDraft(JSON.parse(JSON.stringify(data))); })
          .catch(e => setBanner({ type: 'error', msg: e.message }))
          .finally(() => setLoading(false));
      }, []);

      async function save() {
        setSaving(true);
        setBanner(null);
        try {
          const res = await fetch(\`\${BASE}/config\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          });
          const data = await res.json();
          if (!res.ok) {
            const msg = data.issues
              ? data.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ')
              : (data.error || 'Save failed');
            setBanner({ type: 'error', msg });
          } else {
            setConfig(JSON.parse(JSON.stringify(draft)));
            setBanner({ type: 'success', msg: 'Saved to ' + data.path });
          }
        } catch (e) {
          setBanner({ type: 'error', msg: e.message });
        } finally {
          setSaving(false);
        }
      }

      function upd(...path) { return v => setDraft(prev => deepSet(prev, path, v)); }

      if (loading) return html\`<\${Placeholder} text="Loading config..." />\`;
      if (!draft && banner) return html\`<\${Placeholder} icon="✕" text=\${banner.msg} />\`;
      if (!draft) return html\`<\${Placeholder} text="No config loaded" />\`;

      const d = draft;
      const bannerStyle = banner
        ? 'margin-bottom:10px;padding:8px 12px;border-radius:4px;font-size:12px;border:1px solid;' +
          (banner.type === 'success'
            ? 'background:rgba(78,201,176,0.1);border-color:rgba(78,201,176,0.4);color:#4ec9b0'
            : 'background:rgba(244,71,71,0.1);border-color:rgba(244,71,71,0.4);color:#f44747')
        : '';

      return html\`
        <div>
          \${banner ? html\`<div style=\${bannerStyle}>\${banner.msg}</div>\` : null}
          <div style="display:flex;gap:8px;margin-bottom:12px;justify-content:flex-end">
            <button class="ev-btn" onClick=\${() => { setDraft(JSON.parse(JSON.stringify(config))); setBanner(null); }}>Reset</button>
            <button class="refresh-btn" onClick=\${save} disabled=\${saving}
              style="background:rgba(78,201,176,0.15);border-color:rgba(78,201,176,0.4);color:#4ec9b0">
              \${saving ? html\`<span class="spinner"></span>Saving...\` : 'Save Config'}
            </button>
          </div>

          <div class="card">
            <div class="card-title">Daemon</div>
            <\${NumField} label="Port" value=\${d.daemon.port} min=\${1024} max=\${65535} onChange=\${upd('daemon','port')} />
            <\${NumField} label="MCP Port" value=\${d.daemon.mcp_port} min=\${1024} max=\${65535} onChange=\${upd('daemon','mcp_port')} />
          </div>

          <div class="card">
            <div class="card-title">Hooks & Agents</div>
            <\${ListField} label="Disabled Hooks" value=\${d.disabled_hooks} onChange=\${upd('disabled_hooks')} />
            <\${ListField} label="Disabled Agents" value=\${d.disabled_agents} onChange=\${upd('disabled_agents')} />
            <\${ListField} label="MCP Allowlist" value=\${d.mcp_allowlist} onChange=\${upd('mcp_allowlist')} />
          </div>

          <div class="card">
            <div class="card-title">Subagent Limits</div>
            <\${NumField} label="Explore" value=\${d.subagent_limits.explore} min=\${1} onChange=\${upd('subagent_limits','explore')} />
            <\${NumField} label="Worker" value=\${d.subagent_limits.worker} min=\${1} onChange=\${upd('subagent_limits','worker')} />
          </div>

          <div class="card">
            <div class="card-title">State Persistence</div>
            <\${BoolField} label="Enabled" value=\${d.state_persistence.enabled} onChange=\${upd('state_persistence','enabled')} />
            <\${StrField} label="Path" value=\${d.state_persistence.path} onChange=\${upd('state_persistence','path')} />
          </div>

          <div class="card">
            <div class="card-title">Context Collector</div>
            <\${BoolField} label="Enabled" value=\${d.context_collector.enabled} onChange=\${upd('context_collector','enabled')} />
            <\${NumField} label="Max Context Chars" value=\${d.context_collector.max_context_chars} min=\${1000} max=\${500000} onChange=\${upd('context_collector','max_context_chars')} />
          </div>

          <div class="card">
            <div class="card-title">Compaction</div>
            <\${BoolField} label="Prompt Enabled" value=\${d.compaction.prompt_enabled} onChange=\${upd('compaction','prompt_enabled')} />
            <\${StrField} label="User Message Template" value=\${d.compaction.user_message_template ?? ''} onChange=\${v => upd('compaction','user_message_template')(v || undefined)} />
          </div>

          <div class="card">
            <div class="card-title">Experimental</div>
            <\${BoolField} label="Cloud Agents" value=\${d.experimental.cloud_agents} onChange=\${upd('experimental','cloud_agents')} />
            <\${BoolField} label="Webhooks" value=\${d.experimental.webhooks} onChange=\${upd('experimental','webhooks')} />
            <\${BoolField} label="Automations" value=\${d.experimental.automations} onChange=\${upd('experimental','automations')} />
          </div>

          <div class="card">
            <div class="card-title">Notifications</div>
            <\${BoolField} label="Enabled" value=\${d.notifications.enabled} onChange=\${upd('notifications','enabled')} />
            <\${BoolField} label="Sound" value=\${d.notifications.sound} onChange=\${upd('notifications','sound')} />
          </div>

          <div class="card">
            <div class="card-title">Orchestration</div>
            <\${EnumField} label="Mode" value=\${d.orchestration.mode} options=\${['native','subagent']} onChange=\${upd('orchestration','mode')} />
          </div>

          <div class="card">
            <div class="card-title">Continuation</div>
            <\${NumField} label="Cooldown (ms)" value=\${d.continuation.cooldown_ms} min=\${100} onChange=\${upd('continuation','cooldown_ms')} />
            <\${NumField} label="Max Failures" value=\${d.continuation.max_failures} min=\${1} onChange=\${upd('continuation','max_failures')} />
            <\${NumField} label="Backoff Multiplier" value=\${d.continuation.backoff_multiplier} min=\${1} step=\${0.1} onChange=\${upd('continuation','backoff_multiplier')} />
          </div>

          <div class="card">
            <div class="card-title">Momus</div>
            <\${NumField} label="Max Iterations" value=\${d.momus.max_iterations} min=\${1} onChange=\${upd('momus','max_iterations')} />
          </div>

          <div class="card">
            <div class="card-title">Model Routing</div>
            <\${NumField} label="Max Retry Attempts" value=\${d.model_routing.max_retry_attempts} min=\${1} onChange=\${upd('model_routing','max_retry_attempts')} />
            <\${NumListField} label="Retry on Errors" value=\${d.model_routing.retry_on_errors} onChange=\${upd('model_routing','retry_on_errors')} />
            <\${KVField} label="Model Defaults" value=\${d.model_routing.defaults} onChange=\${upd('model_routing','defaults')} />
          </div>
        </div>\`;
    }

    // ── Tab: Sessions ───────────────────────────────────────────────────────

    function truncateSessionId(id) {
      if (!id) return '--';
      return id.length > 14 ? id.slice(0, 10) + '…' : id;
    }

    function mergeSessionSnapshots(prev, incoming) {
      const prevMap = new Map((prev || []).map(s => [s.id, s]));
      return incoming.map(row => {
        const old = prevMap.get(row.id);
        return old ? { ...old, ...row } : row;
      });
    }

    function composerBadge(mode) {
      if (mode === 'plan')  return html\`<span class="badge badge-composer-plan">plan</span>\`;
      if (mode === 'agent') return html\`<span class="badge badge-composer-agent">agent</span>\`;
      return html\`<span class="badge badge-composer-none">auto</span>\`;
    }

    function SessionRow({ session, expanded, onToggle }) {
      const started = session.startedAt
        ? new Date(session.startedAt).toLocaleString()
        : '--';
      const active = !session.stoppedAt;
      const statusClass = active ? 'status-ok' : 'status-warn';
      const statusLabel = active ? 'active' : 'stopped';
      const ralph = session.ralphState;

      return html\`
        <div class="sess-row" onClick=\${onToggle}>
          <div class="sess-main">
            <span class="sess-id" title=\${session.id}>\${truncateSessionId(session.id)}</span>
            <span class="sess-time">\${started}</span>
            <span class=\${'stat-value ' + statusClass}>\${statusLabel}</span>
            \${composerBadge(session.composerMode)}
            <span class="sess-meta">tools \${session.toolCallCount ?? 0}</span>
            <span class=\${'sess-meta' + ((session.errorCount || 0) > 0 ? ' status-error' : '')}>err \${session.errorCount ?? 0}</span>
          </div>
          \${expanded ? html\`
            <div class="sess-detail-block" onClick=\${e => e.stopPropagation()}>
              <div class="sess-detail-title">Dispatch counts</div>
              \${Object.keys(session.dispatchCounts || {}).length === 0
                ? html\`<div class="sess-meta">No dispatches recorded</div>\`
                : Object.entries(session.dispatchCounts || {}).sort((a,b) => a[0].localeCompare(b[0])).map(
                    ([k, v]) => html\`
                      <div class="sess-dispatch-row" key=\${k}>
                        <span>\${k}</span>
                        <span>\${v}</span>
                      </div>\`
                  )}
              <div class="sess-detail-title">Ralph loop</div>
              \${ralph && ralph.active
                ? html\`<div class="sess-meta status-ok">
                    Active — iter \${ralph.iteration} / \${ralph.maxIterations}
                    (since \${ralph.startedAt ? new Date(ralph.startedAt).toLocaleString() : '--'})
                  </div>\`
                : ralph
                  ? html\`<div class="sess-meta">Inactive</div>\`
                  : html\`<div class="sess-meta">—</div>\`}
              \${session.stoppedAt
                ? html\`<div class="sess-meta" style="margin-top:6px">Stopped at \${new Date(session.stoppedAt).toLocaleString()}</div>\`
                : null}
              <div class="sess-detail-title">Recent tool trail</div>
              \${!(session.recentToolTrail && session.recentToolTrail.length)
                ? html\`<div class="sess-meta">Empty</div>\`
                : session.recentToolTrail.map((t, i) => {
                    const extra = t.path || t.commandSnippet || '';
                    return html\`
                      <div class="sess-trail-item" key=\${i}>
                        \${t.tool}\${extra ? ' — ' + String(extra).slice(0, 120) : ''}
                      </div>\`;
                  })}
            </div>\` : null}
        </div>\`;
    }

    function SessionsTab() {
      const [rows, setRows]         = useState(null);
      const [loadErr, setLoadErr]   = useState(null);
      const [expandedKeys, setExpanded] = useState(new Set());

      useEffect(() => {
        let es;
        let cancelled = false;

        fetch(\`\${BASE}/sessions\`)
          .then(r => { if (!r.ok) throw new Error(\`HTTP \${r.status}\`); return r.json(); })
          .then(data => {
            if (cancelled) return;
            setRows(Array.isArray(data) ? data : []);
            es = new EventSource(\`\${BASE}/sessions/stream\`);
            es.onmessage = evt => {
              try {
                const snap = JSON.parse(evt.data);
                if (!Array.isArray(snap)) return;
                setRows(prev => mergeSessionSnapshots(prev, snap));
              } catch {}
            };
          })
          .catch(e => { if (!cancelled) setLoadErr(e.message); });

        return () => {
          cancelled = true;
          if (es) es.close();
        };
      }, []);

      function toggleExpand(id) {
        setExpanded(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }

      if (rows === null && !loadErr) return html\`<\${Placeholder} text="Loading sessions..." />\`;
      if (loadErr) return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + loadErr} />\`;

      const list = rows || [];

      return html\`
        <div class="card" style="padding:0;overflow:hidden">
          <div class="card-title" style="margin:0;padding:12px 12px 8px;border-bottom:1px solid var(--vscode-panel-border,#454545)">
            Sessions (\${list.length})
          </div>
          <div class="sess-list">
            \${list.length === 0
              ? html\`<div class="ev-empty">No sessions</div>\`
              : list.map(s => html\`
                  <\${SessionRow}
                    key=\${s.id}
                    session=\${s}
                    expanded=\${expandedKeys.has(s.id)}
                    onToggle=\${() => toggleExpand(s.id)}
                  />\`)}
          </div>
        </div>\`;
    }

    // ── Tab: Agents ─────────────────────────────────────────────────────────

    const AG_DESC_MAX = 60;
    const AG_HISTORY_MAX = 20;

    function truncateAgentDesc(s) {
      if (!s) return '';
      const t = String(s);
      return t.length <= AG_DESC_MAX ? t : t.slice(0, AG_DESC_MAX - 1) + '…';
    }

    function normalizeAgentId(raw) {
      if (raw != null && String(raw).trim()) return String(raw);
      return '';
    }

    function ssePayloadFromEvent(msg) {
      const m = msg && typeof msg === 'object' ? msg : {};
      const meta = m.meta && typeof m.meta === 'object' ? m.meta : {};
      return {
        agent_id: m.agent_id ?? m.agentId ?? meta.agent_id ?? meta.agentId,
        agent_type: m.agent_type ?? m.agentType ?? meta.agent_type ?? meta.agentType,
        description: m.description ?? meta.description,
        status: m.status ?? meta.status,
        duration_ms: m.duration_ms ?? m.durationMs ?? meta.duration_ms ?? meta.durationMs,
      };
    }

    function AgentsTab() {
      const [running, setRunning] = useState([]);
      const [history, setHistory] = useState([]);
      const [loadErr, setLoadErr] = useState(null);
      const [ready, setReady] = useState(false);

      useEffect(() => {
        let cancelled = false;
        let es = null;

        fetch(\`\${BASE}/backgroundTasks\`)
          .then(r => { if (!r.ok) throw new Error(\`HTTP \${r.status}\`); return r.json(); })
          .then(d => {
            if (cancelled) return;
            const tasks = d.tasks || [];
            setRunning(tasks.map(t => ({
              agentId: t.agentId,
              conversationId: t.conversationId,
              agentType: t.agentType || 'unknown',
              description: t.description || '',
              startTime: t.startTime,
              elapsedMs: t.elapsedMs,
              status: 'running',
            })));
            setLoadErr(null);
          })
          .catch(e => { if (!cancelled) setLoadErr(e.message); })
          .finally(() => { if (!cancelled) setReady(true); });

        es = new EventSource(\`\${BASE}/events/stream\`);
        es.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.event === '/subagentStart') {
              const p = ssePayloadFromEvent(msg);
              const agentId = normalizeAgentId(p.agent_id)
                || ('pending-' + (msg.ts || new Date().toISOString()) + '-' + Math.random().toString(36).slice(2, 9));
              const agentType = (p.agent_type || msg.agentType || 'unknown').toLowerCase();
              const description = p.description || '';
              const startTime = msg.ts ? new Date(msg.ts).getTime() : Date.now();
              setRunning(prev => {
                if (prev.some(a => a.agentId === agentId)) return prev;
                return [...prev, {
                  agentId,
                  conversationId: msg.sessionId || '',
                  agentType,
                  description,
                  startTime,
                  elapsedMs: 0,
                  status: 'running',
                }];
              });
            } else if (msg.event === '/subagentStop') {
              const p = ssePayloadFromEvent(msg);
              const agentId = normalizeAgentId(p.agent_id);
              const agentType = (p.agent_type || msg.agentType || '').toLowerCase() || 'unknown';
              const rawStatus = (p.status || '').toLowerCase();
              const failed = rawStatus === 'error' || rawStatus === 'failed' || Boolean(msg.error);
              const doneStatus = failed ? 'failed' : 'completed';
              const finalMs = typeof p.duration_ms === 'number' ? p.duration_ms : (typeof msg.durationMs === 'number' ? msg.durationMs : undefined);

              setRunning(prev => {
                let matchIdx = -1;
                if (agentId) matchIdx = prev.findIndex(a => a.agentId === agentId);
                if (matchIdx < 0 && agentType && agentType !== 'unknown') {
                  let oldest = Infinity;
                  const norm = agentType.toLowerCase();
                  for (let i = 0; i < prev.length; i++) {
                    if (prev[i].agentType.toLowerCase() !== norm) continue;
                    const st = prev[i].startTime || 0;
                    if (st < oldest) { oldest = st; matchIdx = i; }
                  }
                }
                if (matchIdx < 0) {
                  const elapsedFinal = finalMs != null ? finalMs : 0;
                  const histEntry = {
                    agentId: agentId || ('stop-' + (msg.ts || Date.now()) + '-' + Math.random().toString(36).slice(2, 7)),
                    agentType,
                    description: p.description || '',
                    startTime: msg.ts && finalMs != null ? new Date(msg.ts).getTime() - finalMs : Date.now() - elapsedFinal,
                    elapsedMs: elapsedFinal,
                    status: doneStatus,
                    completedAt: Date.now(),
                  };
                  setHistory(h => [histEntry, ...h].slice(0, AG_HISTORY_MAX));
                  return prev;
                }
                const ended = prev[matchIdx];
                const nextRunning = prev.filter((_, i) => i !== matchIdx);
                const elapsedFinal = finalMs != null
                  ? finalMs
                  : (ended.startTime ? Date.now() - new Date(ended.startTime).getTime() : (ended.elapsedMs || 0));
                const histEntry = {
                  agentId: ended.agentId,
                  agentType: ended.agentType,
                  description: ended.description || p.description || '',
                  startTime: ended.startTime,
                  elapsedMs: elapsedFinal,
                  status: doneStatus,
                  completedAt: Date.now(),
                };
                setHistory(h => [histEntry, ...h].slice(0, AG_HISTORY_MAX));
                return nextRunning;
              });
            }
          } catch {}
        };

        return () => {
          cancelled = true;
          if (es) es.close();
        };
      }, []);

      const rows = [
        ...running.map(a => ({ ...a, sortKey: a.startTime || 0 })),
        ...history.map(a => ({ ...a, sortKey: a.completedAt || a.startTime || 0 })),
      ].sort((a, b) => {
        const ar = a.status === 'running' ? 1 : 0;
        const br = b.status === 'running' ? 1 : 0;
        if (ar !== br) return br - ar;
        return (b.sortKey || 0) - (a.sortKey || 0);
      });

      if (!ready && !loadErr) return html\`<\${Placeholder} text="Loading agents..." />\`;
      if (loadErr) return html\`<\${Placeholder} icon="✕" text=\${"Failed: " + loadErr} />\`;

      return html\`
        <div class="card">
          <div class="card-title">Agents — \${running.length} running, \${history.length} recent</div>
          \${rows.length === 0
            ? html\`<\${Placeholder} text="No agents yet" />\`
            : html\`
              <div class="ag-list">
                \${rows.map(a => {
                  const isRun = a.status === 'running';
                  const dotClass = isRun ? 'dot-ag-running' : a.status === 'failed' ? 'dot-ag-failed' : 'dot-ag-done';
                  const statusText = isRun ? 'running' : a.status === 'failed' ? 'failed' : 'completed';
                  const statusCls = isRun ? 'status-ok' : a.status === 'failed' ? 'status-error' : 'status-warn';
                  return html\`
                    <div class="ag-row" key=\${a.agentId + ':' + (a.completedAt || 'run')}>
                      <div class="ag-dot-cell"><span class=\${'dot ' + dotClass}></span></div>
                      <div class="ag-type">\${a.agentType || 'unknown'}</div>
                      <div class="ag-desc" title=\${a.description || ''}>\${truncateAgentDesc(a.description)}</div>
                      <div class=\${'ag-status stat-value ' + statusCls}>\${statusText}</div>
                      <div class="ag-dur">
                        <\${ElapsedTimer}
                          startTime=\${a.startTime}
                          elapsedMs=\${a.elapsedMs}
                          status=\${isRun ? 'running' : 'completed'}
                          className="ag-dur"
                        />
                      </div>
                    </div>\`;
                })}
              </div>\`}\
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
