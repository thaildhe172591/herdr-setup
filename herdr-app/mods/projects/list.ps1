# Lists the projects the "projects" mod offers, as JSON on stdout.
# Usage: pwsh -NoProfile -File list.ps1 [-Config <projects.json>]
# projects.json: { "roots": [...], "saved": [{ "path", "name", "agent", "dev", "check" }] }.
# Each root gives: the root folder itself, then every git repo or worktree below it
# (up to 4 levels, not descending into a repo), with branch, uncommitted changes and
# the dev/check commands its stack suggests. Saved folders are marked `saved`; one outside
# every root is listed under "Đã lưu". A saved dev/check replaces the guessed one.
param([string]$Config = (Join-Path $PSScriptRoot '..\..\projects.json'))

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$defaultRoots = @()  # roots come from projects.json (install.ps1 asks for them)
$Roots = $defaultRoots; $saved = @()
try {
    $cfg = Get-Content -LiteralPath $Config -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($cfg.roots) { $Roots = @($cfg.roots) }
    $saved = @($cfg.saved | Where-Object { $_.path })
} catch {
    [Console]::Error.WriteLine("projects.json ($Config) unreadable, using default roots: $($_.Exception.Message)")
}
$norm = { param($p) ("$p" -replace '/', '\').TrimEnd('\').ToLowerInvariant() }
$savedBy = @{}; foreach ($s in $saved) { $savedBy[(& $norm $s.path)] = $s }
$skip = 'node_modules', 'bin', 'obj', 'dist', '.next', '.git', '.vs', '.vscode', '.claude', 'packages', '_backup', 'secrets'

# dev/check commands and the folder to run them in, or $null when the stack isn't recognised.
function Get-Stack([string]$Dir) {
    $pkg = @(Get-Item -LiteralPath (Join-Path $Dir 'package.json') -ErrorAction SilentlyContinue) +
           @(Get-ChildItem -LiteralPath $Dir -Directory -ErrorAction SilentlyContinue |
             Where-Object Name -notin $skip | ForEach-Object { Get-Item -LiteralPath (Join-Path $_.FullName 'package.json') -ErrorAction SilentlyContinue }) |
           Select-Object -First 1
    if ($pkg) {
        $s = (Get-Content -LiteralPath $pkg.FullName -Raw | ConvertFrom-Json).scripts
        $dev = if ($s.dev) { 'npm run dev' } elseif ("$($s.start)" -match 'expo') { 'npx expo start' }
        $check = 'type-check', 'test', 'lint' | Where-Object { $s.$_ } | Select-Object -First 1
        $runDir = $pkg.DirectoryName
        if ($dev -and -not (Test-Path -LiteralPath (Join-Path $runDir 'node_modules'))) { $dev = "npm install; $dev" }
        $stack = if ("$($s.dev)$($s.build)" -match 'next') { 'Next.js' } elseif ("$($s.start)" -match 'expo') { 'Expo' } else { 'Node' }
        return @{ stack = $stack; dev = $dev; check = $(if ($check) { "npm run $check" }); runDir = $runDir }
    }
    $sln = @(Get-ChildItem -LiteralPath $Dir -File -Include *.slnx, *.sln -Depth 1 -Recurse -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -notmatch '\\(node_modules|bin|obj)\\' }) | Select-Object -First 1
    if ($sln) {
        return @{ stack = '.NET'; dev = $null; check = "dotnet build `"$($sln.FullName)`""; runDir = $Dir }
    }
}

function New-Item2([string]$Root, [string]$Dir, [string]$Kind) {
    $rel = [IO.Path]::GetRelativePath($Root, $Dir)
    $item = [ordered]@{
        group  = Split-Path $Root -Leaf
        name   = $(if ($rel -eq '.') { "$(Split-Path $Root -Leaf) (gốc)" } else { $rel -replace '\\', '/' })
        path   = $Dir
        kind   = $Kind
        branch = $null
        dirty  = $false
        stack  = $null; dev = $null; check = $null; runDir = $Dir
    }
    if ($Kind -ne 'root') {
        $b = git -C $Dir branch --show-current 2>$null
        if (-not $b) { $b = git -C $Dir rev-parse --short HEAD 2>$null }
        $item.branch = "$b"
        $item.dirty = [bool](git -C $Dir status --porcelain 2>$null | Select-Object -First 1)
        $st = Get-Stack $Dir
        if ($st) { $item.stack = $st.stack; $item.dev = $st.dev; $item.check = $st.check; $item.runDir = $st.runDir }
    }
    $s = $savedBy[(& $norm $Dir)]
    $item.saved = [bool]$s
    if ($s.dev) { $item.dev = $s.dev }
    if ($s.check) { $item.check = $s.check }
    $item.agent = $s.agent   # saved default agent key (claude, codex, …), null otherwise
    [pscustomobject]$item
}

function Find-Repos([string]$Root, [string]$Dir, [int]$Depth) {
    foreach ($d in Get-ChildItem -LiteralPath $Dir -Directory -ErrorAction SilentlyContinue | Where-Object Name -notin $skip) {
        $git = Join-Path $d.FullName '.git'
        if (Test-Path -LiteralPath $git -PathType Container) { New-Item2 $Root $d.FullName 'repo' }
        elseif (Test-Path -LiteralPath $git -PathType Leaf) { New-Item2 $Root $d.FullName 'worktree' }
        elseif ($Depth -gt 1) { Find-Repos $Root $d.FullName ($Depth - 1) }
    }
}

$items = foreach ($r in $Roots) {
    if (-not (Test-Path -LiteralPath $r -PathType Container)) { continue }
    $r = (Resolve-Path -LiteralPath $r).ProviderPath
    $rootKind = if (Test-Path -LiteralPath (Join-Path $r '.git')) { 'repo' } else { 'root' }
    New-Item2 $r $r $rootKind
    # A root can itself be a repo holding repos (demo): look inside either way.
    Find-Repos $r $r 4
}
# Saved folders no root covers: listed under "Đã lưu" (missing ones are skipped).
$seen = @{}; foreach ($i in $items) { $seen[(& $norm $i.path)] = $true }
$items = @($items) + @(foreach ($s in $saved) {
    if ($seen[(& $norm $s.path)] -or -not (Test-Path -LiteralPath $s.path -PathType Container)) { continue }
    $p = (Resolve-Path -LiteralPath $s.path).ProviderPath
    $kind = if (Test-Path -LiteralPath (Join-Path $p '.git') -PathType Leaf) { 'worktree' } elseif (Test-Path -LiteralPath (Join-Path $p '.git')) { 'repo' } else { 'folder' }
    $i = New-Item2 (Split-Path $p) $p $kind
    $i.group = 'Đã lưu'
    $i.name = $(if ($s.name) { $s.name } else { Split-Path $p -Leaf })
    $i
})
ConvertTo-Json -InputObject @($items) -Depth 3 -Compress
