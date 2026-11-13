<#
.SYNOPSIS
  ha: mở Herdr App ở một dự án (như hs mở Herdr TUI).

.DESCRIPTION
  ha                      thư mục hiện tại
  ha acme                  dự án theo tên (danh sách Ctrl+Shift+J: thư mục gốc khai trong projects.json)
  ha Approval          tên một phần cũng được (khớp nhiều thì in danh sách)
  ha D:\path\to\repo      đường dẫn
  ha acme -Task "sửa lỗi X"   Claude bắt đầu với task này (space đã có: thêm tab mới)
  ha acme -Shell           space chỉ có shell, không chạy agent
  ha acme -Agent codex     agent khác (claude | codex)
  ha -All                 bỏ phạm vi: sidebar hiện mọi space

  Như hs (mỗi repo một session): sidebar của App chỉ hiện các space trong thư mục đó (nó và các
  repo con) cùng agent của chúng; chip "Spaces · <tên> ×" bỏ phạm vi.
  Chuyển tới space của chính thư mục đó, không có thì space đầu tiên bên trong, không có nữa thì
  tạo space mới chạy Claude. App chưa mở thì mở qua Explorer (môi trường sạch).
#>
param(
    [Parameter(Position = 0)][string]$Project,
    [string]$Task,
    [switch]$Shell,
    [ValidateSet('claude', 'codex')][string]$Agent = 'claude',
    [switch]$All,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
if ($Help) { Get-Help $PSCommandPath -Detailed; return }

$app = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
$lnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Herdr.lnk'
$norm = { param($p) ([string]$p).TrimEnd('\', '/').ToLowerInvariant() }

function Resolve-Project([string]$Name) {
    if (-not $Name) { return (Get-Location).ProviderPath }
    if (Test-Path -LiteralPath $Name -PathType Container) { return (Resolve-Path -LiteralPath $Name).ProviderPath }
    # The same list as the App's "Mở dự án" (Ctrl+Shift+J).
    $list = Join-Path $PSScriptRoot '..\mods\projects\list.ps1'
    $items = @(& pwsh -NoLogo -NoProfile -File $list 2>$null | ConvertFrom-Json)
    $leaf = { param($i) Split-Path $i.path -Leaf }
    $exact = @($items | Where-Object { (& $leaf $_) -ieq $Name -or $_.name -ieq $Name })
    if ($exact.Count) { return $exact[0].path }
    $part = @($items | Where-Object { (& $leaf $_) -ilike "*$Name*" })
    $main = @($part | Where-Object kind -ne 'worktree')
    if ($part.Count -eq 1) { return $part[0].path }
    if ($main.Count -eq 1) { return $main[0].path }
    if ($part.Count) { throw "'$Name' khớp nhiều dự án: $(($part | ForEach-Object { & $leaf $_ }) -join ', ')" }
    throw "Không tìm thấy dự án '$Name'. Gõ đường dẫn, hoặc thêm thư mục gốc vào projects.json."
}

$dir = Resolve-Project $Project

# herdr-app.exe is a GUI program: PowerShell's & neither waits for it nor captures its output, so
# it runs through Process. Every call must succeed: a window that is still starting answers status
# before it knows its spaces, and a failed space.new must not be reported as done.
function Invoke-App([string[]]$CallArgs) {
    $psi = [Diagnostics.ProcessStartInfo]::new($app)
    foreach ($x in $CallArgs) { $psi.ArgumentList.Add($x) }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
    $p = [Diagnostics.Process]::Start($psi)
    $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEnd()
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { throw "herdr-app $($CallArgs[0..1] -join ' '): $($err.Trim())" }
    $out.Result
}
# The App: asked directly (a process name says nothing about its window); started through Explorer
# only when nobody answers, then waited for.
$ready = $false
try { $null = Invoke-App @('status'); $ready = $true } catch {
    Write-Host 'Đang mở Herdr App…'
    Start-Process explorer.exe -ArgumentList "`"$lnk`""
}
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    try { $null = Invoke-App @('status'); $ready = $true } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'Herdr App chưa sẵn sàng sau 30 giây.' }

$argv = @{ claude = @('claude'); codex = @('codex', '--no-daemon') }[$Agent]
$words = (($Task -split '\s+') | Where-Object { $_ } | Select-Object -First 4) -join ' '
$tabName = if ($Shell) { 'shell' } elseif ($words) { $words.Substring(0, [Math]::Min(28, $words.Length)) } else { @{ claude = 'Claude Code'; codex = 'Codex' }[$Agent] }

$spaces = $null
for ($i = 0; $i -lt 20 -and $null -eq $spaces; $i++) {
    try { $spaces = (Invoke-App @('ls') | ConvertFrom-Json).spaces } catch { Start-Sleep -Milliseconds 500 }
}
if ($null -eq $spaces) { throw 'Không đọc được danh sách space của Herdr App.' }

# The project scope: the sidebar shows only this folder's spaces (the composer shares it).
$stateDir = Join-Path $PSScriptRoot '..\state'
$null = New-Item -ItemType Directory -Force -Path $stateDir
$scope = if ($All) { $null } else { $dir }
[IO.File]::WriteAllText((Join-Path $stateDir 'scope.json'), (@{ folder = $scope } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
try { $null = Invoke-App @('do', 'composer.scope') } catch { Write-Warning "Chưa áp phạm vi (layout desktop chưa mở?): $_" }
if ($All) { '→ hiện mọi space'; $p = Get-Process herdr-app -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { $null = (New-Object -ComObject WScript.Shell).AppActivate($p.Id) }; return }

$local = @($spaces | Where-Object { -not $_.machine })
$space = $local | Where-Object { (& $norm $_.folder) -eq (& $norm $dir) } | Select-Object -First 1
$inside = @($local | Where-Object { (& $norm $_.folder).StartsWith((& $norm $dir) + '\') })
if (-not $space -and -not $Task -and $inside.Count) {
    $null = Invoke-App @('do', 'space.select', '--id', $inside[0].id)
    "→ $($inside[0].name)  ($($inside.Count) space trong $(Split-Path $dir -Leaf): $(($inside | ForEach-Object name) -join ', '))"
} elseif ($space -and -not $Task) {
    $null = Invoke-App @('do', 'space.select', '--id', $space.id)
    "→ $($space.name)"
} elseif ($space) {
    $null = Invoke-App @('do', 'space.select', '--id', $space.id)
    $null = Invoke-App @('do', 'tab.new', '--space', $space.id, '--name', $tabName, '--argv', ($argv | ConvertTo-Json -Compress -AsArray), '--task', $Task)
    "→ $($space.name) · tab mới '$tabName'"
} else {
    $cmd = @('do', 'space.new', '--folder', $dir, '--tab', $tabName)
    if (-not $Shell) { $cmd += @('--argv', ($argv | ConvertTo-Json -Compress -AsArray)); if ($Task) { $cmd += @('--task', $Task) } }
    $null = Invoke-App $cmd
    "→ space mới $(Split-Path $dir -Leaf)$(if (-not $Shell) { " · $tabName" })"
}

# Bring the window forward.
$p = Get-Process herdr-app -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) { $null = (New-Object -ComObject WScript.Shell).AppActivate($p.Id) }
