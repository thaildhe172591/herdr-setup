# Tests mods/composer/add-paths.ps1. Run: pwsh -NoProfile -File tests/attach.tests.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$script = Join-Path $PSScriptRoot '..\mods\composer\add-paths.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "herdr-attach-test-$PID"
$out = Join-Path $tmp 'out'
New-Item -ItemType Directory -Force $tmp, "$tmp\thư mục" | Out-Null
function Assert($cond, $msg) { if (-not $cond) { throw "FAIL: $msg" } }
try {
    $old = Join-Path $tmp 'ảnh cũ.png'
    [IO.File]::WriteAllBytes($old, [byte[]](137, 80, 78, 71))
    (Get-Item $old).LastWriteTime = (Get-Date).AddDays(-30)
    $res = & pwsh -NoProfile -File $script $out $old "$tmp\thư mục" | ConvertFrom-Json
    $img = $res | Where-Object path -eq $old
    Assert $img 'old image listed with its exact path'
    Assert $img.preview 'image has a preview copy'
    $copy = Get-Item (Join-Path $out $img.preview)
    Assert ($copy.LastWriteTime -gt (Get-Date).AddMinutes(-5)) "preview copy is fresh ($($copy.LastWriteTime))"
    $dir = $res | Where-Object path -eq "$tmp\thư mục"
    Assert ($dir.isDir -eq $true) 'folder marked isDir'
    # a second run must not delete the fresh copy of the 30-day-old image
    & pwsh -NoProfile -File $script $out "$tmp\thư mục" | Out-Null
    Assert (Test-Path $copy.FullName) 'preview survives the next run'
    'PASS'
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
