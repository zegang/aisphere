[CmdletBinding()]
param(
    [switch]$ForceInstall
)

. (Join-Path $PSScriptRoot 'common.ps1')

try {
    Initialize-AisphereEnvironment -ForceInstall:$ForceInstall
    New-WindowsIcon
    Write-Host ''
    Write-Host 'AiSphere Windows toolchain is ready. Run dev.cmd or build.cmd next.' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
