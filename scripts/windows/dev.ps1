[CmdletBinding()]
param(
    [switch]$ForceInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

try {
    Initialize-AisphereEnvironment -ForceInstall:$ForceInstall

    $listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        throw 'Port 5173 is already in use. Stop the other process (for example a previously running Vite dev server) and try again.'
    }

    Write-Host ''
    Write-Host 'Starting AiSphere in development mode...' -ForegroundColor Green
    Write-Host 'Vite serves the renderer on http://127.0.0.1:5173 and the vite-plugin-electron' -ForegroundColor Gray
    Write-Host 'plugin launches Electron automatically. Press Ctrl+C here to stop both.' -ForegroundColor Gray
    Write-Host ''

    Push-Location $script:ProjectRoot
    try {
        & $script:YarnCmd vite
        exit $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
