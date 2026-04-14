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

    function ElapsedTimer({ startTime, elapsedMs, status }) {
      const [elapsed, setElapsed] = useState(() => {
        if (status !== 'running') return elapsedMs || 0;
        return startTime ? Date.now() - new Date(startTime).getTime() : (elapsedMs || 0);
      });

      useEffect(() => {
        if (status !== 'running') return;
        const origin = startTime ? new Date(startTime).getTime() : Date.now() - (elapsedMs || 0);
        const t = setInterval(() => setElapsed(Date.now() - origin), 1000);
        return () => clearInterval(t);
      }, [status, startTime]);

      return html\`<span class="bg-task-footer">\${formatElapsed(elapsed)}</span>\`;
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
