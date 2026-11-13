# Describes dropped/picked paths for the attachment tray, as JSON: [{ path, isDir, preview }].
# Images get a copy in <outDir> so the tray can show a thumbnail (preview = that copy's file name).
# Usage: pwsh -NoProfile -File add-paths.ps1 <outDir> <path> [<path> ...]
param([string]$OutDir, [Parameter(ValueFromRemainingArguments)][string[]]$Paths)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
New-Item -ItemType Directory -Force $OutDir | Out-Null
Get-ChildItem $OutDir -File | Where-Object LastWriteTime -lt (Get-Date).AddDays(-7) | Remove-Item -ErrorAction SilentlyContinue
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$i = 0
$out = foreach ($p in $Paths) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $dir = Test-Path -LiteralPath $p -PathType Container
    $preview = $null
    if (-not $dir -and $p -match '\.(png|jpe?g|gif|webp|bmp)$') {
        $preview = "drop-$stamp-$i-" + [IO.Path]::GetFileName($p)
        Copy-Item -LiteralPath $p (Join-Path $OutDir $preview)
        # Copy-Item keeps the source's time; the copy must look new or the 7-day cleanup takes it.
        (Get-Item -LiteralPath (Join-Path $OutDir $preview)).LastWriteTime = Get-Date; $i++
    }
    [pscustomobject]@{ path = (Resolve-Path -LiteralPath $p).ProviderPath; isDir = $dir; preview = $preview }
}
ConvertTo-Json -InputObject @($out) -Compress
