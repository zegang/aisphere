[CmdletBinding()]
param(
    [ValidateSet('installer', 'dir')]
    [string]$Kind = 'installer',

    [ValidateSet('x64', 'arm64')]
    [string]$Arch = 'x64',

    [switch]$ForceInstall,
    [switch]$SkipTypeCheck
)

. (Join-Path $PSScriptRoot 'common.ps1')

try {
    Initialize-AisphereEnvironment -ForceInstall:$ForceInstall
    New-WindowsIcon

    if (-not $SkipTypeCheck) {
        Invoke-AisphereTypeCheck -YarnCmd $script:YarnCmd
    }
    else {
        Write-Host '    Skipping TypeScript type-check (-SkipTypeCheck).' -ForegroundColor Yellow
    }

    Invoke-AisphereViteBuild -YarnCmd $script:YarnCmd

    Write-Step "Packaging AiSphere for Windows $Arch ($Kind)"
    $builderArgs = @('electron-builder', '--win', "--$Arch")
    if ($Kind -eq 'dir') {
        $builderArgs += '--dir'
    }
    else {
        $builderArgs += @('--publish', 'never')
    }

    Push-Location $script:ProjectRoot
    try {
        $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
        & $script:YarnCmd @builderArgs
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed (exit code $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
    }

    $releaseDir = Join-Path $script:ProjectRoot 'release'
    Write-Host ''
    Write-Host 'Build complete.' -ForegroundColor Green
    if (Test-Path -LiteralPath $releaseDir -PathType Container) {
        $artifacts = Get-ChildItem -LiteralPath $releaseDir -File |
            Where-Object { $_.Extension -in @('.exe', '.msi', '.zip', '.blockmap') }
        foreach ($artifact in ($artifacts | Sort-Object Name)) {
            Write-Host "    $($artifact.FullName)"
        }

        # Point at the runnable app without walking the whole unpacked tree
        # (which also contains helper executables from native dependencies).
        foreach ($folder in @("win-$Arch-unpacked", 'win-unpacked')) {
            $unpackedExe = Join-Path $releaseDir "$folder\aisphere.exe"
            if (Test-Path -LiteralPath $unpackedExe -PathType Leaf) {
                Write-Host "    $unpackedExe"
                break
            }
        }
    }
    exit 0
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}
