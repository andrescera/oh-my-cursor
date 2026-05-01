# oh-my-cursor installer for Windows / PowerShell
# Usage: .\install.ps1 [-Scope user|project] [-Force] [-DryRun] [-Uninstall] [-Version] [-CheckUpdate] [-SkipDashboardBuild] [-Help]

param(
    [ValidateSet("user", "project")]
    [string]$Scope = "user",
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Uninstall,
    [switch]$Version,
    [switch]$CheckUpdate,
    [switch]$SkipDashboardBuild,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$PluginName = "oh-my-cursor"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DefaultDaemonPort = 27847
$DefaultMcpPort = 27848
$OurMcpKeys = @("websearch", "context7", "grep_app", "oh-my-cursor")

$TempDir = if ($env:TEMP) { $env:TEMP } else { "/tmp" }
$TempFiles = @(
    "oh-my-cursor-daemon.pid",
    "oh-my-cursor-daemon.port",
    "oh-my-cursor-sidecar.port",
    "oh-my-cursor-heartbeat",
    "oh-my-cursor-restart-count",
    "oh-my-cursor-ports.json"
)

if ($Scope -eq "user") {
    $CursorDir = Join-Path $env:USERPROFILE ".cursor"
    $PluginDir = Join-Path $CursorDir "plugins\local\$PluginName"
    $McpConfigPath = Join-Path $env:USERPROFILE ".cursor\mcp.json"
} else {
    $CursorDir = ".cursor"
    $PluginDir = Join-Path $CursorDir "plugins\local\$PluginName"
    $McpConfigPath = ".cursor\mcp.json"
}

$BackupDir = "${PluginDir}.bak"
$LockFile = Join-Path $TempDir "oh-my-cursor-install.lock"

$script:BuildOk = $true
$script:DashboardBuildSkipped = [bool]$SkipDashboardBuild

# --- Output helpers ---

function Write-Log {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Show-Usage {
    Write-Host @"

  oh-my-cursor installer (PowerShell)

  USAGE:
    .\install.ps1                        Auto: fresh install or update
    .\install.ps1 -Force                 Force fresh install (overwrite)
    .\install.ps1 -Uninstall             Complete removal
    .\install.ps1 -Version               Print installed version
    .\install.ps1 -CheckUpdate           Compare installed vs source version
    .\install.ps1 -DryRun                Preview mode (combinable with others)
    .\install.ps1 -Scope project         Project-scoped install
    .\install.ps1 -SkipDashboardBuild    Install without (re)building dashboard-ui
    .\install.ps1 -Help                  Show this help

  FLAGS:
    -Scope <user|project>    Install scope (default: user)
    -Force                   Force reinstall even if up to date
    -DryRun                  Preview changes without applying
    -Uninstall               Remove oh-my-cursor completely
    -Version                 Show installed version
    -CheckUpdate             Check if update is available
    -SkipDashboardBuild      Skip the dashboard-ui build step; preserve any
                             existing $PluginDir\hooks\dashboard-ui\dist\
    -Help                    Show this help text

"@
}

# --- Prerequisites ---

function Test-Prerequisites {
    $missing = @()
    if (-not (Get-Command "bun" -ErrorAction SilentlyContinue)) {
        $missing += "bun"
    }
    if ($missing.Count -gt 0) {
        Write-Err "Missing required tools: $($missing -join ', ')"
        Write-Err "Install bun: https://bun.sh"
        exit 1
    }
}

# --- Version management ---

function Get-SourceVersion {
    $manifestPath = Join-Path $ScriptDir ".cursor-plugin\plugin.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Err "Plugin manifest not found: $manifestPath"
        exit 1
    }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    return $manifest.version
}

function Get-InstalledVersion {
    $versionFile = Join-Path $PluginDir ".version"
    if (Test-Path $versionFile) {
        return (Get-Content $versionFile -Raw).Trim()
    }
    return "none"
}

function Write-VersionFile {
    $ver = Get-SourceVersion
    $versionFile = Join-Path $PluginDir ".version"
    if ($DryRun) {
        Write-Host "[dry-run] Would write version $ver to $versionFile"
        return
    }
    $dir = Split-Path -Parent $versionFile
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Set-Content -Path $versionFile -Value $ver -Encoding UTF8 -NoNewline
}

# --- Daemon lifecycle ---

function Stop-OhMyCursorDaemon {
    $pidFile = Join-Path $TempDir "oh-my-cursor-daemon.pid"
    $portFile = Join-Path $TempDir "oh-my-cursor-daemon.port"

    if (-not (Test-Path $pidFile)) {
        Write-Host "  No daemon PID file found, skipping stop"
        return
    }

    $pid = [int](Get-Content $pidFile -Raw).Trim()
    $port = $DefaultDaemonPort
    if (Test-Path $portFile) {
        $port = [int](Get-Content $portFile -Raw).Trim()
    }

    if ($DryRun) {
        Write-Host "[dry-run] Would stop daemon (PID: $pid, port: $port)"
        return
    }

    # Graceful shutdown via HTTP
    try {
        Invoke-RestMethod -Uri "http://localhost:${port}/shutdown" -Method Post -TimeoutSec 5 | Out-Null
        Write-Host "  Sent shutdown request to daemon"
        Start-Sleep -Seconds 2
    } catch {
        Write-Warn "  Graceful shutdown failed, forcing stop"
    }

    # Force stop if still running
    try {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc -and -not $proc.HasExited) {
            Stop-Process -Id $pid -Force
            Write-Host "  Daemon process stopped (PID: $pid)"
        }
    } catch {
        Write-Host "  Daemon process already stopped"
    }

    # Clean up temp files
    foreach ($tf in $TempFiles) {
        $p = Join-Path $TempDir $tf
        if (Test-Path $p) { Remove-Item $p -Force }
    }
}

function Start-OhMyCursorDaemon {
    if ($DryRun) {
        Write-Host "[dry-run] Would start daemon"
        return
    }

    $startScript = Join-Path $PluginDir "hooks\scripts\start-daemon.sh"
    if (-not (Test-Path $startScript)) {
        Write-Warn "  Daemon start script not found, skipping"
        return
    }

    try {
        if ($IsLinux -or $IsMacOS) {
            & bash $startScript
        } else {
            & bash $startScript 2>$null
        }
    } catch {
        Write-Warn "  Failed to start daemon: $_"
        return
    }

    # Health check with retry
    $maxRetries = 10
    $portFile = Join-Path $TempDir "oh-my-cursor-daemon.port"
    $port = $DefaultDaemonPort
    if (Test-Path $portFile) {
        $port = [int](Get-Content $portFile -Raw).Trim()
    }

    for ($i = 1; $i -le $maxRetries; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:${port}/health" -TimeoutSec 2
            Write-Log "  Daemon healthy (port: $port)"
            return
        } catch {}
    }
    Write-Warn "  Daemon started but health check did not pass after ${maxRetries}s"
}

# --- Installation verification ---

function Test-Installation {
    $ok = $true

    if (-not (Test-Path $PluginDir)) {
        Write-Err "  Plugin directory missing: $PluginDir"
        $ok = $false
    }

    $versionFile = Join-Path $PluginDir ".version"
    if (-not (Test-Path $versionFile)) {
        Write-Err "  Version file missing"
        $ok = $false
    }

    $portFile = Join-Path $TempDir "oh-my-cursor-daemon.port"
    $port = $DefaultDaemonPort
    if (Test-Path $portFile) {
        $port = [int](Get-Content $portFile -Raw).Trim()
    }
    try {
        Invoke-RestMethod -Uri "http://localhost:${port}/health" -TimeoutSec 2 | Out-Null
    } catch {
        Write-Warn "  Daemon health check failed (non-critical)"
    }

    return $ok
}

# --- Backup / Restore ---

function Backup-Installation {
    if (-not (Test-Path $PluginDir)) { return }
    if ($DryRun) {
        Write-Host "[dry-run] Would backup $PluginDir to $BackupDir"
        return
    }
    if (Test-Path $BackupDir) {
        Remove-Item $BackupDir -Recurse -Force
    }
    Copy-Item -Path $PluginDir -Destination $BackupDir -Recurse
    Write-Host "  Backup created: $BackupDir"
}

function Restore-Backup {
    if (-not (Test-Path $BackupDir)) {
        Write-Err "  No backup found to restore"
        return $false
    }
    if ($DryRun) {
        Write-Host "[dry-run] Would restore backup from $BackupDir"
        return $true
    }
    if (Test-Path $PluginDir) {
        Remove-Item $PluginDir -Recurse -Force
    }
    Rename-Item -Path $BackupDir -NewName (Split-Path -Leaf $PluginDir)
    Write-Log "  Backup restored"
    return $true
}

# --- MCP config management ---

function Read-JsonSafe {
    param([string]$Path, [PSCustomObject]$Default)
    if (-not (Test-Path $Path)) { return $Default }
    try {
        $raw = Get-Content $Path -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        return $raw | ConvertFrom-Json
    } catch {
        Write-Warn "  Malformed JSON at $Path, treating as empty"
        return $Default
    }
}

function Write-JsonSafe {
    param([string]$Path, [object]$Data)
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $Data | ConvertTo-Json -Depth 10 | Set-Content $Path -Encoding UTF8
}

function Merge-McpConfig {
    $sourceMcp = Join-Path $ScriptDir "mcp.json"
    if (-not (Test-Path $sourceMcp)) {
        Write-Warn "  Source mcp.json not found, skipping MCP merge"
        return
    }

    $sourceData = Get-Content $sourceMcp -Raw | ConvertFrom-Json

    if ($DryRun) {
        Write-Host "[dry-run] Would merge MCP servers into $McpConfigPath"
        foreach ($key in $OurMcpKeys) {
            Write-Host "  [dry-run] Would add/update: $key"
        }
        return
    }

    $defaultTarget = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    $target = Read-JsonSafe $McpConfigPath $defaultTarget

    if ($null -eq $target.mcpServers) {
        $target | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }

    $added = 0
    $skipped = 0
    foreach ($key in $OurMcpKeys) {
        $sourceEntry = $sourceData.mcpServers.PSObject.Properties[$key]
        if (-not $sourceEntry) { continue }

        $existing = $target.mcpServers.PSObject.Properties[$key]
        if ($existing -and -not $Force) {
            $skipped++
            continue
        }
        $target.mcpServers | Add-Member -NotePropertyName $key -NotePropertyValue $sourceEntry.Value -Force
        $added++
    }

    Write-JsonSafe $McpConfigPath $target
    Write-Host "  MCP config updated: $added added, $skipped skipped (existing)"
}

function Remove-McpConfig {
    if (-not (Test-Path $McpConfigPath)) { return }

    if ($DryRun) {
        Write-Host "[dry-run] Would remove MCP keys: $($OurMcpKeys -join ', ')"
        return
    }

    $defaultTarget = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
    $target = Read-JsonSafe $McpConfigPath $defaultTarget

    if ($null -eq $target.mcpServers) { return }

    $removed = 0
    foreach ($key in $OurMcpKeys) {
        $existing = $target.mcpServers.PSObject.Properties[$key]
        if ($existing) {
            $target.mcpServers.PSObject.Properties.Remove($key)
            $removed++
        }
    }

    if ($removed -gt 0) {
        Write-JsonSafe $McpConfigPath $target
        Write-Host "  Removed $removed MCP server entries"
    }
}

# --- Legacy cleanup (dynamic, no hardcoded lists) ---

function Remove-LegacyLooseFiles {
    $scanDirs = @("agents", "commands", "rules", "skills")

    foreach ($dir in $scanDirs) {
        $sourceDir = Join-Path $ScriptDir $dir
        if (-not (Test-Path $sourceDir)) { continue }

        $sourceItems = Get-ChildItem -Path $sourceDir -Recurse
        foreach ($item in $sourceItems) {
            $relativePath = $item.FullName.Substring($sourceDir.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
            $targetPath = Join-Path (Join-Path $CursorDir $dir) $relativePath

            if (Test-Path $targetPath) {
                if ($DryRun) {
                    Write-Host "[dry-run] Would remove legacy: $targetPath"
                } else {
                    if ((Get-Item $targetPath).PSIsContainer) {
                        Remove-Item $targetPath -Recurse -Force
                    } else {
                        Remove-Item $targetPath -Force
                    }
                    Write-Host "  [removed] $targetPath"
                }
            }
        }
    }

    # Hooks: daemon.ts, mcp-sidecar.ts
    $hookFiles = @("hooks\daemon.ts", "hooks\mcp-sidecar.ts")
    foreach ($rel in $hookFiles) {
        $p = Join-Path $CursorDir $rel
        if (Test-Path $p) {
            if ($DryRun) {
                Write-Host "[dry-run] Would remove legacy: $p"
            } else {
                Remove-Item $p -Force
                Write-Host "  [removed] $p"
            }
        }
    }

    # hooks/scripts directory
    $hooksScripts = Join-Path $CursorDir "hooks\scripts"
    if (Test-Path $hooksScripts) {
        if ($DryRun) {
            Write-Host "[dry-run] Would remove legacy: $hooksScripts"
        } else {
            Remove-Item $hooksScripts -Recurse -Force
            Write-Host "  [removed] $hooksScripts"
        }
    }
}

# --- Dashboard UI build ---

function Build-DashboardUI {
    if ($script:DashboardBuildSkipped) {
        Write-Log "  Dashboard build skipped (-SkipDashboardBuild)."
        return $true
    }
    if ($DryRun) {
        Write-Host "[dry-run] Would build dashboard-ui:"
        Write-Host "  Set-Location '$ScriptDir/hooks/dashboard-ui'; bun install --frozen-lockfile; bunx --bun vite build"
        return $true
    }
    $uiDir = Join-Path $ScriptDir 'hooks/dashboard-ui'
    if (-not (Test-Path $uiDir)) {
        Write-Warn "  Dashboard UI source not found at $uiDir; skipping build."
        $script:BuildOk = $false
        return $false
    }
    Write-Host "  Building dashboard-ui (bun install --frozen-lockfile && bunx --bun vite build)..."
    $pushed = $false
    try {
        Push-Location $uiDir
        $pushed = $true
        & bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "bun install --frozen-lockfile failed (exit $LASTEXITCODE)" }
        & bunx --bun vite build
        if ($LASTEXITCODE -ne 0) { throw "bunx --bun vite build failed (exit $LASTEXITCODE)" }
        $script:BuildOk = $true
        Write-Log "  Dashboard build OK."
        return $true
    }
    catch {
        Write-Warn "  Dashboard build failed: $_"
        $script:BuildOk = $false
        return $false
    }
    finally {
        if ($pushed) { Pop-Location -ErrorAction SilentlyContinue }
    }
}

# --- File operations ---

# Copy a directory tree, skipping a specific relative path under the source.
function Copy-DirectoryExcluding {
    param(
        [Parameter(Mandatory)] [string]$Source,
        [Parameter(Mandatory)] [string]$Destination,
        [Parameter(Mandatory)] [string]$ExcludeRelative
    )
    if (-not (Test-Path $Source)) { return }
    if (-not (Test-Path $Destination)) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    }
    $sourceFull = (Resolve-Path $Source).Path
    $excludeFull = Join-Path $sourceFull $ExcludeRelative
    $sep = [IO.Path]::DirectorySeparatorChar
    Get-ChildItem -Path $sourceFull -Recurse -Force | ForEach-Object {
        $itemFull = $_.FullName
        if ($itemFull -eq $excludeFull) { return }
        if ($itemFull.StartsWith($excludeFull + $sep)) { return }
        $rel = $itemFull.Substring($sourceFull.Length).TrimStart([char]$sep, [char][IO.Path]::AltDirectorySeparatorChar)
        $target = Join-Path $Destination $rel
        if ($_.PSIsContainer) {
            if (-not (Test-Path $target)) {
                New-Item -ItemType Directory -Path $target -Force | Out-Null
            }
        } else {
            $targetDir = Split-Path -Parent $target
            if ($targetDir -and -not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -Path $itemFull -Destination $target -Force
        }
    }
}

function _RemoveExcept {
    param(
        [Parameter(Mandatory)] [string]$Current,
        [Parameter(Mandatory)] [string]$ExcludeFull
    )
    $sep = [IO.Path]::DirectorySeparatorChar
    Get-ChildItem -Path $Current -Force | ForEach-Object {
        $itemFull = $_.FullName
        if ($itemFull -eq $ExcludeFull) { return }
        if ($_.PSIsContainer -and $ExcludeFull.StartsWith($itemFull + $sep)) {
            _RemoveExcept -Current $itemFull -ExcludeFull $ExcludeFull
            return
        }
        if ($_.PSIsContainer) {
            Remove-Item $itemFull -Recurse -Force
        } else {
            Remove-Item $itemFull -Force
        }
    }
}

# Remove everything under $Path except a single relative subpath (and its ancestors).
function Remove-DirectoryExcluding {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$ExcludeRelative
    )
    if (-not (Test-Path $Path)) { return }
    $rootFull = (Resolve-Path $Path).Path
    $excludeFull = Join-Path $rootFull $ExcludeRelative
    _RemoveExcept -Current $rootFull -ExcludeFull $excludeFull
}

function Copy-PluginFiles {
    if ($DryRun) {
        if ($script:DashboardBuildSkipped) {
            Write-Host "[dry-run] Would copy plugin files to $PluginDir (preserving hooks\dashboard-ui\dist\)"
        } else {
            Write-Host "[dry-run] Would copy plugin files to $PluginDir"
        }
        return
    }

    if (-not (Test-Path $PluginDir)) {
        New-Item -ItemType Directory -Path $PluginDir -Force | Out-Null
    }

    $dirs = @(".cursor-plugin", "agents", "commands", "rules", "skills", "hooks", "scripts", "automations", "docs")
    foreach ($d in $dirs) {
        $src = Join-Path $ScriptDir $d
        if (-not (Test-Path $src)) { continue }
        if ($d -eq "hooks" -and $script:DashboardBuildSkipped) {
            $dst = Join-Path $PluginDir $d
            Copy-DirectoryExcluding -Source $src -Destination $dst -ExcludeRelative "dashboard-ui\dist"
            Write-Host "  [ok] $d/ (preserved hooks\dashboard-ui\dist\)"
        } else {
            Copy-Item -Path $src -Destination $PluginDir -Recurse -Force
            Write-Host "  [ok] $d/"
        }
    }

    $files = @("mcp.json", "sandbox.json", "worktrees.json", "README.md", "ARCHITECTURE.md", "CONTRIBUTING.md")
    foreach ($f in $files) {
        $src = Join-Path $ScriptDir $f
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination (Join-Path $PluginDir $f) -Force
            Write-Host "  [ok] $f"
        }
    }

    Write-VersionFile
    Write-Log "  Plugin files installed to $PluginDir"
}

function Remove-PluginFiles {
    if (-not (Test-Path $PluginDir)) {
        Write-Host "  Plugin directory not found, nothing to remove"
        return
    }
    if ($DryRun) {
        if ($script:DashboardBuildSkipped) {
            Write-Host "[dry-run] Would remove $PluginDir (preserving hooks\dashboard-ui\dist\)"
        } else {
            Write-Host "[dry-run] Would remove $PluginDir"
        }
        return
    }
    if ($script:DashboardBuildSkipped) {
        Remove-DirectoryExcluding -Path $PluginDir -ExcludeRelative "hooks\dashboard-ui\dist"
        Write-Host "  Plugin directory cleaned (preserved hooks\dashboard-ui\dist\)"
        return
    }
    Remove-Item $PluginDir -Recurse -Force
    Write-Host "  Plugin directory removed"
}

# --- Install lock ---

function Get-InstallLock {
    $maxWait = 30
    for ($i = 0; $i -lt $maxWait; $i++) {
        if (-not (Test-Path $LockFile)) {
            Set-Content -Path $LockFile -Value $PID -Encoding UTF8
            return
        }
        $lockPid = (Get-Content $LockFile -Raw).Trim()
        try {
            $proc = Get-Process -Id ([int]$lockPid) -ErrorAction SilentlyContinue
            if (-not $proc -or $proc.HasExited) {
                Remove-Item $LockFile -Force
                Set-Content -Path $LockFile -Value $PID -Encoding UTF8
                return
            }
        } catch {
            Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
            Set-Content -Path $LockFile -Value $PID -Encoding UTF8
            return
        }
        Start-Sleep -Seconds 1
    }
    Write-Err "Timed out waiting for install lock (${maxWait}s). Remove $LockFile manually if stale."
    exit 1
}

function Release-InstallLock {
    if (Test-Path $LockFile) {
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
}

# --- Main flows ---

if ($Help) {
    Show-Usage
    exit 0
}

if ($Version) {
    $installed = Get-InstalledVersion
    if ($installed -eq "none") {
        Write-Host "$PluginName is not installed"
    } else {
        Write-Host "$PluginName v$installed"
    }
    exit 0
}

if ($CheckUpdate) {
    $installed = Get-InstalledVersion
    $source = Get-SourceVersion
    if ($installed -eq "none") {
        Write-Host "$PluginName is not installed (available: v$source)"
    } elseif ($installed -eq $source) {
        Write-Host "$PluginName v$installed is up to date"
    } else {
        Write-Host "$PluginName update available: v$installed -> v$source"
    }
    exit 0
}

if ($Uninstall) {
    Write-Host ""
    Write-Host "  Uninstalling $PluginName..." -ForegroundColor Cyan
    Write-Host ""

    Get-InstallLock
    try {
        Write-Host "==> Stopping daemon"
        Stop-OhMyCursorDaemon

        Write-Host "==> Removing plugin files"
        Remove-PluginFiles

        if (Test-Path $BackupDir) {
            if ($DryRun) {
                Write-Host "[dry-run] Would remove backup: $BackupDir"
            } else {
                Remove-Item $BackupDir -Recurse -Force
                Write-Host "  Backup removed"
            }
        }

        Write-Host "==> Removing MCP config entries"
        Remove-McpConfig

        Write-Host "==> Cleaning up legacy files"
        Remove-LegacyLooseFiles

        # Clean up temp files
        if (-not $DryRun) {
            foreach ($tf in $TempFiles) {
                $p = Join-Path $TempDir $tf
                if (Test-Path $p) { Remove-Item $p -Force }
            }
        }

        Release-InstallLock

        Write-Host ""
        Write-Log "  $PluginName uninstalled successfully."
        Write-Host ""
    } catch {
        Release-InstallLock
        Write-Err "  Uninstall failed: $_"
        exit 1
    }
    exit 0
}

# --- Install / Update ---

$isUpdate = Test-Path $PluginDir

Write-Host ""
if ($isUpdate) {
    Write-Host "  Updating $PluginName (scope: $Scope)..." -ForegroundColor Cyan
} else {
    Write-Host "  Installing $PluginName (scope: $Scope)..." -ForegroundColor Cyan
}
Write-Host ""

Test-Prerequisites

$sourceVersion = Get-SourceVersion
$installedVersion = Get-InstalledVersion

if ($isUpdate -and $installedVersion -eq $sourceVersion -and -not $Force) {
    Write-Host "  $PluginName v$installedVersion is already up to date."
    Write-Host "  Use -Force to reinstall."
    exit 0
}

Get-InstallLock
try {
    Write-Host "==> Building dashboard UI"
    if (-not (Build-DashboardUI)) {
        if ($isUpdate) {
            Write-Warn "  Dashboard build failed; preserving existing $PluginDir\hooks\dashboard-ui\dist\ and continuing update."
            $script:DashboardBuildSkipped = $true
        } else {
            Write-Err "  Dashboard build failed. Fix and re-run, or run with -SkipDashboardBuild to install without dashboard."
            Release-InstallLock
            exit 1
        }
    }

    if ($isUpdate) {
        Write-Host "==> Backing up current installation"
        Backup-Installation

        Write-Host "==> Stopping daemon"
        Stop-OhMyCursorDaemon

        Write-Host "==> Removing old plugin files"
        Remove-PluginFiles
    } else {
        Write-Host "==> Cleaning up legacy files"
        Remove-LegacyLooseFiles
    }

    Write-Host "==> Copying plugin files"
    Copy-PluginFiles

    Write-Host "==> Merging MCP configuration"
    Merge-McpConfig

    Write-Host "==> Starting daemon"
    Start-OhMyCursorDaemon

    Write-Host "==> Verifying installation"
    $valid = Test-Installation

    Release-InstallLock

    if ($valid) {
        if (Test-Path $BackupDir) {
            Remove-Item $BackupDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host ""
    if ($isUpdate) {
        Write-Log "  $PluginName updated successfully: v$installedVersion -> v$sourceVersion"
    } else {
        Write-Log "  $PluginName v$sourceVersion installed successfully!"
    }
    if ($script:DashboardBuildSkipped) {
        Write-Warn "  Dashboard build was skipped. /dashboard shell still loads, but /dashboard/assets/* will return 503 until next install."
    }
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. Restart Cursor (Ctrl+Shift+P > `"Reload Window`")"
    Write-Host "    2. Try: /plan add authentication to my app"
    Write-Host "    3. Try: @sisyphus fix the failing tests"
    Write-Host ""
} catch {
    Write-Err "  Installation failed: $_"
    if ($isUpdate) {
        Write-Warn "  Attempting to restore backup..."
        $restored = Restore-Backup
        if ($restored) {
            Write-Log "  Previous version restored successfully"
        }
    }
    Release-InstallLock
    exit 1
}
