# Shared helpers for the Windows dev/build scripts.
# Requires Windows PowerShell 5.1+ (the default on Windows 11).

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:ToolsDir = Join-Path $script:ProjectRoot '.tools'
$script:NodeVersion = if ($env:AISPHERE_NODE_VERSION) { $env:AISPHERE_NODE_VERSION } else { 'v24.22.2' }
$script:YarnVersion = '1.22.22'
$script:MinimumNodeMajor = 20

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Get-WindowsNodeArch {
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    switch ($arch.ToUpperInvariant()) {
        'ARM64' { return 'arm64' }
        'AMD64' { return 'x64' }
        'X86' {
            if ($env:PROCESSOR_ARCHITEW6432 -eq 'AMD64') { return 'x64' }
            throw '32-bit Windows is not supported. Run this on 64-bit Windows 11.'
        }
        default { throw "Unsupported processor architecture: $arch" }
    }
}

function Get-NodeMajorVersion {
    param([Parameter(Mandatory)][string]$NodeExe)
    try {
        $value = & $NodeExe -p "process.versions.node.split('.')[0]" 2>$null
        if (-not $value) { return 0 }
        return [int]($value.ToString().Trim())
    }
    catch {
        return 0
    }
}

function Find-SystemNodeExe {
    $candidates = New-Object System.Collections.Generic.List[string]

    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { $candidates.Add($command.Source) }

    $candidates.Add((Join-Path $env:ProgramFiles 'nodejs\node.exe'))
    $candidates.Add((Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'))
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'))
    $candidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\node\node.exe'))

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Get-PortableNode {
    $arch = Get-WindowsNodeArch
    $folderName = "node-$($script:NodeVersion)-win-$arch"
    $nodeDir = Join-Path $script:ToolsDir $folderName
    $nodeExe = Join-Path $nodeDir 'node.exe'

    if (Test-Path -LiteralPath $nodeExe -PathType Leaf) {
        return $nodeExe
    }

    $downloadsDir = Join-Path $script:ToolsDir 'downloads'
    New-Item -ItemType Directory -Force -Path $downloadsDir | Out-Null

    $zipPath = Join-Path $downloadsDir "$folderName.zip"
    $baseUrl = "https://nodejs.org/dist/$($script:NodeVersion)"

    if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
        $url = "$baseUrl/$folderName.zip"
        Write-Step "Downloading portable Node.js $($script:NodeVersion) ($arch)"
        Write-Info $url
        Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    }

    Write-Step 'Verifying Node.js download'
    $sums = (Invoke-WebRequest -Uri "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
    $sumLine = ($sums -split "`r?`n") | Where-Object { $_ -match "\s+$([regex]::Escape($folderName)).zip$" } | Select-Object -First 1
    if (-not $sumLine) {
        throw "Could not find $folderName.zip in $baseUrl/SHASUMS256.txt"
    }
    $expectedHash = ($sumLine -split '\s+')[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($expectedHash -ne $actualHash) {
        Remove-Item -LiteralPath $zipPath -Force
        throw "Node.js download checksum mismatch (expected $expectedHash, got $actualHash). The file was deleted; run setup again."
    }

    Write-Step "Extracting Node.js to $nodeDir"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $tempDir = "$nodeDir.extracting"
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
    if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }

    try {
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $tempDir)
        $extractedDir = Join-Path $tempDir $folderName
        if (-not (Test-Path -LiteralPath $extractedDir -PathType Container)) {
            throw "Unexpected Node.js archive layout: $folderName was not found."
        }
        Move-Item -LiteralPath $extractedDir -Destination $nodeDir
    }
    finally {
        if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }
    }

    if (-not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) {
        throw "Node.js extraction failed: $nodeExe not found."
    }
    return $nodeExe
}

function Resolve-NodeExe {
    $systemNode = Find-SystemNodeExe
    if ($systemNode) {
        $major = Get-NodeMajorVersion -NodeExe $systemNode
        if ($major -ge $script:MinimumNodeMajor) {
            Write-Info "Using system Node.js $(& $systemNode --version) at $systemNode"
            return $systemNode
        }
        Write-Host "    System Node.js at $systemNode is too old (need v$($script:MinimumNodeMajor)+); using a portable copy instead." -ForegroundColor Yellow
    }

    $portableNode = Get-PortableNode
    Write-Info "Using portable Node.js $(& $portableNode --version) at $portableNode"
    return $portableNode
}

function Resolve-YarnCmd {
    param([Parameter(Mandatory)][string]$NodeExe)

    $yarnPrefix = Join-Path $script:ToolsDir 'yarn'
    $yarnCmd = Join-Path $yarnPrefix 'yarn.cmd'

    if (-not (Test-Path -LiteralPath $yarnCmd -PathType Leaf)) {
        $nodeDir = Split-Path -Parent $NodeExe
        $npmCmd = Join-Path $nodeDir 'npm.cmd'
        if (-not (Test-Path -LiteralPath $npmCmd -PathType Leaf)) {
            $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
            if (-not $npm) { throw 'npm.cmd was not found. Reinstall Node.js or delete .tools and run setup again.' }
            $npmCmd = $npm.Source
        }

        Write-Step "Installing Yarn $($script:YarnVersion) into .tools"
        & $npmCmd install --global --prefix $yarnPrefix --no-fund --no-audit "yarn@$($script:YarnVersion)" | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "npm failed to install Yarn (exit code $LASTEXITCODE)." }

        if (-not (Test-Path -LiteralPath $yarnCmd -PathType Leaf)) {
            $found = Get-ChildItem -LiteralPath $yarnPrefix -Recurse -Filter 'yarn.cmd' -File -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if (-not $found) { throw "Yarn installed but yarn.cmd was not found under $yarnPrefix." }
            $yarnCmd = $found.FullName
        }
    }

    Write-Info "Using Yarn $(& $yarnCmd --version) at $yarnCmd"
    return (Resolve-Path -LiteralPath $yarnCmd).Path
}

function Get-DependencyHash {
    $lockFiles = @(
        (Join-Path $script:ProjectRoot 'package.json'),
        (Join-Path $script:ProjectRoot 'yarn.lock')
    )
    $combined = New-Object System.Text.StringBuilder
    foreach ($file in $lockFiles) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Required lock file not found: $file" }
        [void]$combined.Append((Get-Content -LiteralPath $file -Raw))
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($combined.ToString())
        return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
    }
    finally {
        $sha.Dispose()
    }
}

function Invoke-AispherePostInstall {
    param([Parameter(Mandatory)][string]$NodeExe)

    $nodeModules = Join-Path $script:ProjectRoot 'node_modules'

    # Yarn runs with --ignore-scripts so Electron's binary is downloaded here.
    $electronDir = Join-Path $nodeModules 'electron'
    $electronExe = Join-Path $electronDir 'dist\electron.exe'
    if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) {
        $electronInstaller = Join-Path $electronDir 'install.js'
        if (-not (Test-Path -LiteralPath $electronInstaller -PathType Leaf)) {
            throw "Electron was not installed correctly: $electronInstaller is missing."
        }
        Write-Step 'Downloading the Electron runtime'
        Push-Location $electronDir
        try {
            & $NodeExe $electronInstaller
            if ($LASTEXITCODE -ne 0) { throw "Electron download failed (exit code $LASTEXITCODE)." }
        }
        finally {
            Pop-Location
        }
    }

    # node-pty ships Node-API prebuilds. This only copies the optional ConPTY DLLs.
    $ptyPostInstall = Join-Path $nodeModules 'node-pty\scripts\post-install.js'
    if (Test-Path -LiteralPath $ptyPostInstall -PathType Leaf) {
        Push-Location (Join-Path $nodeModules 'node-pty')
        try {
            & $NodeExe $ptyPostInstall
            if ($LASTEXITCODE -ne 0) { throw "node-pty post-install failed (exit code $LASTEXITCODE)." }
        }
        finally {
            Pop-Location
        }
    }

    # esbuild is normally supplied as an optional platform package, but run its
    # installer when present so a partially cached node_modules still works.
    $esbuildInstaller = Join-Path $nodeModules 'esbuild\install.js'
    if (Test-Path -LiteralPath $esbuildInstaller -PathType Leaf) {
        Push-Location (Join-Path $nodeModules 'esbuild')
        try {
            & $NodeExe $esbuildInstaller
            if ($LASTEXITCODE -ne 0) { throw "esbuild install failed (exit code $LASTEXITCODE)." }
        }
        finally {
            Pop-Location
        }
    }

    $electronExe = Join-Path $nodeModules 'electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) {
        throw "Electron runtime is missing after install: $electronExe"
    }
}

function Install-AisphereDependencies {
    param(
        [Parameter(Mandatory)][string]$NodeExe,
        [Parameter(Mandatory)][string]$YarnCmd,
        [switch]$Force
    )

    $nodeModules = Join-Path $script:ProjectRoot 'node_modules'
    $stampFile = Join-Path $nodeModules '.aisphere-deps-hash'
    $expectedHash = Get-DependencyHash
    $needsInstall = $Force.IsPresent -or -not (Test-Path -LiteralPath $nodeModules -PathType Container)

    if (-not $needsInstall -and (Test-Path -LiteralPath $stampFile -PathType Leaf)) {
        $currentHash = (Get-Content -LiteralPath $stampFile -Raw).Trim()
        if ($currentHash -ne $expectedHash) {
            Write-Info 'package.json or yarn.lock changed; refreshing dependencies.'
            $needsInstall = $true
        }
    }
    elseif (-not $needsInstall) {
        $needsInstall = $true
    }

    if ($needsInstall) {
        Write-Step 'Installing JavaScript dependencies (Yarn 1)'
        Push-Location $script:ProjectRoot
        try {
            # Scripts are intentionally skipped: the root postinstall runs
            # electron-builder install-app-deps, which would try to compile
            # node-pty with node-gyp. node-pty ships Node-API prebuilds that
            # work in Electron, so only the needed installers are run below.
            & $YarnCmd install --ignore-scripts --frozen-lockfile --non-interactive
            if ($LASTEXITCODE -ne 0) {
                throw "yarn install failed (exit code $LASTEXITCODE). Check the output above."
            }
        }
        finally {
            Pop-Location
        }

        Invoke-AispherePostInstall -NodeExe $NodeExe
        Set-Content -LiteralPath $stampFile -Value $expectedHash -NoNewline -Encoding ASCII
    }
    else {
        Write-Info 'Dependencies are up to date.'
        # Repair missing binaries if node_modules was moved or a download was interrupted.
        $electronExe = Join-Path $nodeModules 'electron\dist\electron.exe'
        if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) {
            Invoke-AispherePostInstall -NodeExe $NodeExe
        }
    }
}

function Test-AisphereToolchain {
    param(
        [Parameter(Mandatory)][string]$NodeExe,
        [Parameter(Mandatory)][string]$YarnCmd
    )

    $arch = Get-WindowsNodeArch
    $ptyPrebuildDir = Join-Path $script:ProjectRoot "node_modules\node-pty\prebuilds\win32-$arch"
    if (-not (Test-Path -LiteralPath (Join-Path $ptyPrebuildDir 'pty.node') -PathType Leaf)) {
        throw "node-pty has no prebuilt binary for win32-$arch. Delete node_modules and rerun setup."
    }

    $electronExe = Join-Path $script:ProjectRoot 'node_modules\electron\dist\electron.exe'
    if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) {
        throw "Electron runtime not found at $electronExe. Rerun setup with -ForceInstall."
    }

    Write-Info "Node.js: $(& $NodeExe --version)"
    Write-Info "Yarn:    $(& $YarnCmd --version)"
    Write-Info "Electron runtime: $electronExe"
}

function Initialize-AisphereEnvironment {
    param([switch]$ForceInstall)

    if ($env:OS -ne 'Windows_NT') {
        throw 'These scripts are for Windows only.'
    }

    New-Item -ItemType Directory -Force -Path $script:ToolsDir | Out-Null

    $nodeExe = Resolve-NodeExe
    $nodeDir = Split-Path -Parent $nodeExe
    $env:Path = "$nodeDir;$env:Path"

    $yarnCmd = Resolve-YarnCmd -NodeExe $nodeExe
    $yarnDir = Split-Path -Parent $yarnCmd
    $env:Path = "$yarnDir;$env:Path"

    $script:NodeExe = $nodeExe
    $script:YarnCmd = $yarnCmd

    Install-AisphereDependencies -NodeExe $nodeExe -YarnCmd $yarnCmd -Force:$ForceInstall
    Test-AisphereToolchain -NodeExe $nodeExe -YarnCmd $yarnCmd
}

function New-WindowsIcon {
    $iconsDir = Join-Path $script:ProjectRoot 'resources\icons'
    $icoPath = Join-Path $iconsDir 'icon.ico'
    $pngPath = Join-Path $iconsDir 'icon.png'
    if ((Test-Path -LiteralPath $icoPath -PathType Leaf) -and (Test-Path -LiteralPath $pngPath -PathType Leaf)) { return }

    $sourcePath = Join-Path $iconsDir 'icon.jpeg'
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Icon source not found: $sourcePath"
    }

    Write-Step 'Generating resources/icons/icon.png and icon.ico from icon.jpeg'
    Add-Type -AssemblyName System.Drawing

    $source = [System.Drawing.Image]::FromFile($sourcePath)
    $bitmap = New-Object System.Drawing.Bitmap 256, 256
    $stream = New-Object System.IO.MemoryStream
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.DrawImage($source, 0, 0, 256, 256)
        }
        finally {
            $graphics.Dispose()
        }

        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBytes = $stream.ToArray()
    }
    finally {
        $stream.Dispose()
        $bitmap.Dispose()
        $source.Dispose()
    }

    [System.IO.File]::WriteAllBytes($pngPath, $pngBytes)

    # Single 256x256 PNG-compressed icon. This is the Vista+ ICO layout and is
    # accepted by Windows and NSIS.
    $file = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
    $writer = New-Object System.IO.BinaryWriter $file
    try {
        $writer.Write([UInt16]0)               # reserved
        $writer.Write([UInt16]1)               # type: icon
        $writer.Write([UInt16]1)               # image count
        $writer.Write([byte]0)                 # width: 256
        $writer.Write([byte]0)                 # height: 256
        $writer.Write([byte]0)                 # palette size
        $writer.Write([byte]0)                 # reserved
        $writer.Write([UInt16]1)               # color planes
        $writer.Write([UInt16]32)              # bits per pixel
        $writer.Write([UInt32]$pngBytes.Length)
        $writer.Write([UInt32]22)              # image data offset
        $writer.Write($pngBytes)
    }
    finally {
        $writer.Dispose()
        $file.Dispose()
    }

    if (-not (Test-Path -LiteralPath $icoPath -PathType Leaf)) {
        throw "Failed to generate $icoPath"
    }
    if (-not (Test-Path -LiteralPath $pngPath -PathType Leaf)) {
        throw "Failed to generate $pngPath"
    }
}

function Invoke-AisphereTypeCheck {
    param([Parameter(Mandatory)][string]$YarnCmd)

    Write-Step 'Type-checking the renderer'
    Push-Location $script:ProjectRoot
    try {
        & $YarnCmd tsc -p tsconfig.json --noEmit
        if ($LASTEXITCODE -ne 0) { throw "Renderer type-check failed (exit code $LASTEXITCODE)." }

        Write-Step 'Type-checking the Electron main/preload code (advisory)'
        & $YarnCmd tsc -p tsconfig.electron.json
        if ($LASTEXITCODE -ne 0) {
            Write-Host '    Electron type-check reported errors. Packaging will continue because Vite transpiles these files;' -ForegroundColor Yellow
            Write-Host '    fix the errors above if you are changing the main/preload code.' -ForegroundColor Yellow
        }
    }
    finally {
        Pop-Location
    }
}

function Invoke-AisphereViteBuild {
    param([Parameter(Mandatory)][string]$YarnCmd)

    Write-Step 'Building the renderer, main process and preload script'
    Push-Location $script:ProjectRoot
    try {
        & $YarnCmd vite build
        if ($LASTEXITCODE -ne 0) { throw "vite build failed (exit code $LASTEXITCODE)." }

        foreach ($required in @('dist\index.html', 'dist-electron\main.js', 'dist-electron\preload.js')) {
            $path = Join-Path $script:ProjectRoot $required
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
                throw "Build output missing: $path"
            }
        }
    }
    finally {
        Pop-Location
    }
}
