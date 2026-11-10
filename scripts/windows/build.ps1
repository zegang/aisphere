[CmdletBinding()]
param(
    [ValidateSet('installer', 'dir', 'fast-debug-build')]
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

    $fastDebugBuild = $Kind -eq 'fast-debug-build'
    if ($fastDebugBuild) {
        $runningApp = Get-Process -Name 'aisphere' -ErrorAction SilentlyContinue
        if ($runningApp) {
            $processIds = ($runningApp | ForEach-Object { $_.Id }) -join ', '
            throw "Close AiSphere before deploying a fast debug build (running process IDs: $processIds)."
        }
    }

    if (-not $SkipTypeCheck -and -not $fastDebugBuild) {
        Invoke-AisphereTypeCheck -YarnCmd $script:YarnCmd
    }
    else {
        Write-Host '    Skipping TypeScript type-check (fast debug build or -SkipTypeCheck).' -ForegroundColor Yellow
    }

    Invoke-AisphereViteBuild -YarnCmd $script:YarnCmd

    $buildKind = if ($fastDebugBuild) { 'dir' } else { $Kind }
    Write-Step "Packaging AiSphere for Windows $Arch ($buildKind)"
    $builderArgs = @('electron-builder', '--win', "--$Arch")
    if ($buildKind -eq 'dir') {
        $builderArgs += '--dir'
    }
    else {
        $builderArgs += @('--publish', 'never')
    }

    $stagingDir = $null
    $stagingConfig = $null
    if ($fastDebugBuild) {
        $releaseDir = Join-Path $script:ProjectRoot 'release'
        $buildId = [Guid]::NewGuid().ToString('N')
        $stagingDir = Join-Path $releaseDir ".fast-debug-stage-$buildId"
        $stagingConfig = Join-Path $script:ProjectRoot ".electron-builder-fast-debug-$buildId.yml"
        $configPath = Join-Path $script:ProjectRoot 'electron-builder.yml'
        $configText = Get-Content -LiteralPath $configPath -Raw
        $outputPattern = '(?m)^  output: release$'
        if ([regex]::Matches($configText, $outputPattern).Count -ne 1) {
            throw "Expected exactly one 'output: release' setting in $configPath."
        }

        $yamlStagingDir = $stagingDir.Replace('\', '/').Replace("'", "''")
        $configText = [regex]::Replace($configText, $outputPattern, "  output: '$yamlStagingDir'", 1)
        [System.IO.File]::WriteAllText($stagingConfig, $configText, (New-Object System.Text.UTF8Encoding -ArgumentList $false))
        $builderArgs += @('--config', $stagingConfig)
    }

    Push-Location $script:ProjectRoot
    try {
        $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
        & $script:YarnCmd @builderArgs
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed (exit code $LASTEXITCODE)." }

        if ($fastDebugBuild) {
            $stagedApp = Join-Path $stagingDir "win-$Arch-unpacked"
            if (-not (Test-Path -LiteralPath $stagedApp -PathType Container)) {
                $stagedApp = Join-Path $stagingDir 'win-unpacked'
            }
            if (-not (Test-Path -LiteralPath $stagedApp -PathType Container)) {
                throw "electron-builder did not produce an unpacked app in $stagingDir."
            }

            $targetFolder = if ($Arch -eq 'x64') { 'win-unpacked' } else { "win-$Arch-unpacked" }
            $targetApp = Join-Path $releaseDir $targetFolder
            New-Item -ItemType Directory -Path $targetApp -Force | Out-Null

            Write-Step "Updating packaged files in $targetApp without deleting local app data"
            $preservedPaths = @('apps', 'db', 'downloads', 'log', 'logs', 'runtimes') |
                ForEach-Object { Join-Path $stagedApp $_ }
            & robocopy.exe $stagedApp $targetApp /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XD $preservedPaths
            if ($LASTEXITCODE -ge 8) {
                throw "Failed to copy the fast debug build into $targetApp (robocopy exit code $LASTEXITCODE)."
            }

            Write-Host "    Preserved local data folders: apps, db, downloads, log, logs, runtimes" -ForegroundColor Gray
        }
    }
    finally {
        Pop-Location
        if ($stagingConfig -and (Test-Path -LiteralPath $stagingConfig -PathType Leaf)) {
            Remove-Item -LiteralPath $stagingConfig -Force
        }
        if ($stagingDir -and (Test-Path -LiteralPath $stagingDir -PathType Container)) {
            Remove-Item -LiteralPath $stagingDir -Recurse -Force
        }
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
