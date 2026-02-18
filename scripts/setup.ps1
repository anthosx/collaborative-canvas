#
# Collaborative Canvas Plugin - Setup Script (Windows)
#
# Downloads the packaged Electron app from GitHub Releases.
# The MCP server bundle is pre-committed to git (no build step needed).
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#

$ErrorActionPreference = "Stop"

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = Split-Path -Parent $ScriptDir

# Read version from plugin manifest
try {
    $manifest = Get-Content "$PluginDir\.claude-plugin\plugin.json" -Raw | ConvertFrom-Json
    $Version = "v$($manifest.version)"
} catch {
    $Version = "v1.0.0"
}
$Repo = "anthosx/collaborative-canvas"

Write-Host ""
Write-Host "=== Collaborative Canvas - Setup ===" -ForegroundColor Cyan
Write-Host ""

# Pre-flight: ensure Node.js 18+ is available
function Install-Node {
    Write-Host "  Node.js not found or too old. Installing..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>$null
        # Refresh PATH
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        & choco install nodejs-lts -y 2>$null
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    } else {
        Write-Host "Error: Could not auto-install Node.js. Install Node.js 18+ manually:" -ForegroundColor Red
        Write-Host "  https://nodejs.org/en/download"
        exit 1
    }
}

$needsInstall = $false
try {
    $nodeVersion = & node --version 2>$null
    $nodeMajor = [int]($nodeVersion -replace 'v','').Split('.')[0]
    if ($nodeMajor -lt 18) { $needsInstall = $true }
} catch {
    $needsInstall = $true
}

if ($needsInstall) {
    Install-Node
    try {
        $nodeVersion = & node --version 2>$null
        $nodeMajor = [int]($nodeVersion -replace 'v','').Split('.')[0]
        if ($nodeMajor -lt 18) {
            Write-Host "Error: Node.js 18+ required (found $nodeVersion)" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "Error: Node.js installation failed. Install manually: https://nodejs.org" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Step 1: Create storage directory and queue files
Write-Host ""
Write-Host "--- Creating storage directory" -ForegroundColor Blue

$LocalAppData = $env:LOCALAPPDATA
if (-not $LocalAppData) { $LocalAppData = "$env:USERPROFILE\AppData\Local" }
$StorageDir = "$LocalAppData\collaborative-canvas"

$dirs = @(
    $StorageDir,
    "$StorageDir\drawings",
    "$StorageDir\logs",
    "$StorageDir\screenshots",
    "$StorageDir\exports",
    "$StorageDir\thumbnails"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Ensure queue files exist
foreach ($queueFile in @("collaboration-queue.json", "hooks-queue.json")) {
    $queuePath = "$StorageDir\$queueFile"
    if (-not (Test-Path $queuePath)) {
        Set-Content -Path $queuePath -Value "[]"
    }
}
Write-Host "  OK: $StorageDir" -ForegroundColor Green

# Step 2: Detect platform
Write-Host ""
Write-Host "--- Detecting platform" -ForegroundColor Blue
$Asset = "collaborative-canvas-win-x64.zip"
$DestDir = "$PluginDir\electron-app\release\win"
Write-Host "  Platform: Windows (x64)" -ForegroundColor Green
Write-Host "  Asset: $Asset" -ForegroundColor Green

# Step 3: Download Electron app
Write-Host ""
Write-Host "--- Downloading Electron app ($Version)" -ForegroundColor Blue

if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

$TempDir = Join-Path $env:TEMP "collaborative-canvas-setup"
if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

$DownloadOk = $false

# Try GitHub CLI first
if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "  Using GitHub CLI..."
    try {
        & gh release download $Version --repo $Repo --pattern $Asset --dir $TempDir 2>&1
        if ($LASTEXITCODE -eq 0) { $DownloadOk = $true }
    } catch {}
}

# Fallback to Invoke-WebRequest
if (-not $DownloadOk) {
    Write-Host "  Using Invoke-WebRequest..."
    $DownloadUrl = "https://github.com/$Repo/releases/download/$Version/$Asset"
    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile "$TempDir\$Asset" -UseBasicParsing
        $DownloadOk = $true
    } catch {
        Write-Host "  Download failed: $_" -ForegroundColor Red
    }
}

if (-not $DownloadOk) {
    Write-Host ""
    Write-Host "Could not download: $Asset" -ForegroundColor Red
    Write-Host "The release may not include a build for Windows." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Available assets at: https://github.com/$Repo/releases/tag/$Version"
    Write-Host ""
    Write-Host "To build from source instead:" -ForegroundColor Blue
    Write-Host "  cd $PluginDir\electron-app"
    Write-Host "  npm install"
    Write-Host "  npm run build"
    Write-Host "  npx electron-builder --dir"
    Write-Host ""
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "  OK: Downloaded $Asset" -ForegroundColor Green

# Step 4: Extract
Write-Host ""
Write-Host "--- Extracting" -ForegroundColor Blue
Expand-Archive -Path "$TempDir\$Asset" -DestinationPath $DestDir -Force
Write-Host "  OK: Extracted to $DestDir" -ForegroundColor Green

# Clean up temp
Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue

# Step 5: Pre-approve MCP tool permissions
Write-Host ""
Write-Host "--- Configuring tool permissions" -ForegroundColor Blue
$ToolRule = "mcp__plugin_collaborative-canvas_canvas__*"
$PermOk = $false

# Primary: use headless Claude to inject permission (knows its own config path)
if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "  Using Claude Code to configure permissions..."
    try {
        $result = & claude -p `
          "Add the string '$ToolRule' to the permissions.allow array in your `
           user-level settings.json. If it already exists, do nothing. Preserve all `
           existing settings. `
           Known settings.json locations: `
           - Windows: %USERPROFILE%\.claude\settings.json `
           - macOS/Linux: ~/.claude/settings.json `
           - Custom: CLAUDE_CONFIG_DIR env var overrides the .claude directory `
           Check which path exists on this system and modify it. `
           Output ONLY the word 'done' or 'exists'." `
          --allowedTools 'Read,Edit,Write' 2>$null
        if ($result -match "done|exists|already") {
            Write-Host "  OK: Tool permissions configured via Claude" -ForegroundColor Green
            $PermOk = $true
        }
    } catch {}
}

# Fallback: direct JSON manipulation via PowerShell
if (-not $PermOk) {
    $ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
    $SettingsFile = "$ClaudeDir\settings.json"

    if (Test-Path $SettingsFile) {
        Write-Host "  Using PowerShell fallback..."
        try {
            $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json

            if (-not $settings.permissions) {
                $settings | Add-Member -NotePropertyName "permissions" -NotePropertyValue ([PSCustomObject]@{ allow = @() })
            }
            if (-not $settings.permissions.allow) {
                $settings.permissions | Add-Member -NotePropertyName "allow" -NotePropertyValue @()
            }

            if ($settings.permissions.allow -contains $ToolRule) {
                Write-Host "  OK: Tool permissions already configured" -ForegroundColor Green
            } else {
                $settings.permissions.allow += $ToolRule
                $settings | ConvertTo-Json -Depth 10 | Set-Content $SettingsFile -Encoding UTF8
                Write-Host "  OK: Added tool pre-approval to settings" -ForegroundColor Green
            }
            $PermOk = $true
        } catch {
            Write-Host "  Warning: Could not auto-configure permissions" -ForegroundColor Yellow
        }
    }
}

if (-not $PermOk) {
    Write-Host "  Warning: Could not auto-configure permissions" -ForegroundColor Yellow
    Write-Host "  Add `"$ToolRule`" to permissions.allow in your Claude settings"
}

# Done
Write-Host ""
Write-Host "=== Setup Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  OK: Storage directory: $StorageDir" -ForegroundColor Green
Write-Host "  OK: MCP server: pre-bundled (mcp-server\dist\bundle.cjs)" -ForegroundColor Green
Write-Host "  OK: Electron app: $DestDir" -ForegroundColor Green
Write-Host ""
Write-Host "Restart Claude Code to load the plugin, then use:" -ForegroundColor Yellow
Write-Host "  /canvas My Diagram"
Write-Host ""
