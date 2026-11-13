<#
.SYNOPSIS
  install.ps1: cài bộ tùy biến Herdr (layout "desktop", mod, theme, phòng ban) lên một máy Windows.

.DESCRIPTION
  1. Kiểm app: Herdr App và herdr-core (hc) phải cài sẵn từ https://herdr.dev; Git và Node thiếu thì đề nghị cài bằng winget.
  2. Chép herdr-app\ vào ~\.config\herdr-app, mẫu herdr-core vào %APPDATA%\herdr-core, lệnh ha và
     herdr-shutdown vào ~\.local\bin. File cũ khác bản mới được sao lưu trước ở ~\.herdr-setup-backup\<giờ>.
  3. Hỏi thư mục chứa dự án (projects.json), đặt shell của herdr-core là Git Bash, và (nếu đồng ý) bật thanh
     trạng thái của Claude Code để Herdr hiện context, model, chi phí.
  4. In những việc còn lại cho người cài.

  .\install.ps1                         cài, hỏi từng bước
  .\install.ps1 -Yes                    cài không hỏi (bỏ trống thư mục dự án, bật thanh trạng thái)
  .\install.ps1 -Roots 'D:\Work','E:\Repos'   khai luôn thư mục dự án
  .\install.ps1 -DryRun                 chỉ in ra sẽ làm gì
  .\install.ps1 -TargetHome D:\t\home   thử cài vào một thư mục giả (không đụng PATH, không cài app)
#>
param([switch]$DryRun, [switch]$Yes, [string[]]$Roots, [switch]$NoStatusLine, [string]$TargetHome = $env:USERPROFILE)
$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 chạy đúng phần này: lấy PowerShell 7 rồi chạy lại trong đó.
if ($PSVersionTable.PSVersion.Major -lt 7) {
    if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
        Write-Host 'Cần PowerShell 7: cài bằng winget…'
        winget install --id Microsoft.PowerShell -e --source winget --accept-source-agreements --accept-package-agreements
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    }
    $argList = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    foreach ($k in $PSBoundParameters.Keys) {
        $v = $PSBoundParameters[$k]
        if ($v -is [switch]) { if ($v) { $argList += "-$k" } }
        elseif ($v -is [array]) { $argList += "-$k"; $argList += ($v -join ',') }
        else { $argList += "-$k"; $argList += "$v" }
    }
    & pwsh @argList
    exit $LASTEXITCODE
}

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$Repo = $PSScriptRoot
$Real = ($TargetHome.TrimEnd('\') -eq $env:USERPROFILE.TrimEnd('\'))
$AppData = if ($Real) { $env:APPDATA } else { Join-Path $TargetHome 'AppData\Roaming' }
$LocalAppData = if ($Real) { $env:LOCALAPPDATA } else { Join-Path $TargetHome 'AppData\Local' }
$AppHome = Join-Path $TargetHome '.config\herdr-app'
$Backup = Join-Path $TargetHome ".herdr-setup-backup\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$utf8 = [Text.UTF8Encoding]::new($false)
$Todo = [Collections.Generic.List[string]]::new()
$TextExt = @('.json', '.md', '.ps1', '.mjs', '.js', '.toml', '.txt', '.cmd', '.css', '.svg', '')

function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ask([string]$q) { if ($Yes) { return $true }; (Read-Host "$q [y/N]") -match '^(y|yes|c|co|có)$' }
function Has([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

# Đường dẫn home của máy này thay cho token trong file của repo.
$H = $TargetHome.TrimEnd('\')
$Tokens = [ordered]@{
    '{{HOME_JSON}}' = ($H -replace '\\', '\\')
    '{{HOME_FWD}}'  = ($H -replace '\\', '/')
    '{{HOME_MSYS}}' = ('/' + $H.Substring(0, 1).ToLower() + ($H.Substring(2) -replace '\\', '/'))
    '{{HOME}}'      = $H
}
function Expand-Tokens([string]$t) { foreach ($k in $Tokens.Keys) { $t = $t.Replace($k, $Tokens[$k]) }; $t }
function Test-Text([string]$path) {
    if ($TextExt -notcontains [IO.Path]::GetExtension($path).ToLower()) { return $false }
    -not ([IO.File]::ReadAllBytes($path) -contains 0)
}
# Một file vào chỗ: bản cũ khác thì sao lưu trước; file chữ thì thay token.
function Put-File([string]$from, [string]$to) {
    $text = if (Test-Text $from) { Expand-Tokens ([IO.File]::ReadAllText($from)) } else { $null }
    if (Test-Path -LiteralPath $to) {
        $same = if ($null -ne $text) { [IO.File]::ReadAllText($to) -eq $text } else { (Get-FileHash $to).Hash -eq (Get-FileHash $from).Hash }
        if ($same) { return 'same' }
        if (-not $DryRun) {
            $rel = if ($to.StartsWith($H, 'OrdinalIgnoreCase')) { $to.Substring($H.Length).TrimStart('\') } else { $to.Replace(':', '') }
            $bk = Join-Path $Backup $rel
            New-Item -ItemType Directory -Force -Path (Split-Path $bk) | Out-Null
            Copy-Item -LiteralPath $to -Destination $bk -Force
        }
    }
    if ($DryRun) { return 'would' }
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    if ($null -ne $text) { [IO.File]::WriteAllText($to, $text, $utf8) } else { Copy-Item -LiteralPath $from -Destination $to -Force }
    'put'
}
function Put-Tree([string]$from, [string]$to) {
    $c = @{ put = 0; same = 0; would = 0 }
    $base = (Get-Item -LiteralPath $from).FullName
    foreach ($f in Get-ChildItem -LiteralPath $from -Recurse -File -Force) { $c[(Put-File $f.FullName (Join-Path $to $f.FullName.Substring($base.Length).TrimStart('\')))]++ }
    $c
}
function Show-Count([string]$name, $c) { Say ('  {0,-14} {1} mới/đổi, {2} giữ nguyên{3}' -f $name, $c.put, $c.same, $(if ($c.would) { ", $($c.would) sẽ đổi" } else { '' })) }
function Write-Json([string]$path, $obj) {
    if ($DryRun) { return }
    if (Test-Path -LiteralPath $path) { $null = New-Item -ItemType Directory -Force -Path $Backup; Copy-Item -LiteralPath $path -Destination (Join-Path $Backup ([IO.Path]::GetFileName($path) + '.' + (Get-Random))) }
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 50), $utf8)
}

Say "Cài Herdr từ $Repo vào $TargetHome$(if ($DryRun) { ' (chạy thử, không ghi gì)' })" Cyan

# 1. App ----------------------------------------------------------------------------------------------
if ($Real) {
    Say "`n1. Ứng dụng" Cyan
    $herdrApp = (Has 'herdr-app') -or (Test-Path -LiteralPath (Join-Path $LocalAppData 'Programs\herdr-app\herdr-app.exe'))
    Say "  Herdr App:      $(if ($herdrApp) { 'có' } else { 'chưa có' })"
    Say "  herdr-core hc:  $(if (Has 'hc') { 'có' } else { 'chưa có' })"
    if (-not $herdrApp -or -not (Has 'hc')) {
        $Todo.Add('Cài Herdr App (kèm herdr-core) bản Windows từ https://herdr.dev')
        if (-not $DryRun -and (Ask '  Mở trang tải Herdr (herdr.dev)?')) { Start-Process 'https://herdr.dev' }
    }
    foreach ($a in @(@{ c = 'git'; id = 'Git.Git'; why = 'shell Git Bash cho terminal' }, @{ c = 'node'; id = 'OpenJS.NodeJS.LTS'; why = 'thanh trạng thái Claude và test của mod' })) {
        if (Has $a.c) { Say ('  {0,-14} có' -f "$($a.c):"); continue }
        if ((Has 'winget') -and -not $DryRun -and (Ask "  Thiếu $($a.c) ($($a.why)): cài $($a.id) bằng winget?")) {
            winget install --id $a.id -e --source winget --scope user --accept-source-agreements --accept-package-agreements
            Refresh-Path
        } else { $Todo.Add("Cài $($a.c) ($($a.why))") }
    }
    if (Get-Process herdr-app -ErrorAction SilentlyContinue) { $Todo.Add('Herdr App đang mở: tắt hẳn rồi mở lại để nạp layout và mod mới') }
}

# 2. File cấu hình ----------------------------------------------------------------------------------
Say "`n2. Cấu hình (bản cũ sao lưu ở $Backup)" Cyan
Show-Count 'herdr-app' (Put-Tree (Join-Path $Repo 'herdr-app') $AppHome)
Show-Count 'herdr-core' (Put-Tree (Join-Path $Repo 'herdr-core\templates') (Join-Path $AppData 'herdr-core\templates'))
Show-Count 'local-bin' (Put-Tree (Join-Path $Repo 'local-bin') (Join-Path $TargetHome '.local\bin'))

# Thư mục dự án: danh sách "Mở dự án" (Ctrl+Shift+J) và lệnh ha tìm repo trong đó. Có rồi thì giữ.
$projects = Join-Path $AppHome 'projects.json'
if (Test-Path -LiteralPath $projects) { Say '  projects.json  giữ nguyên (đã có)' }
else {
    if (-not $Roots -and -not $Yes -and -not $DryRun -and $Real) {
        $ans = Read-Host '  Thư mục chứa các dự án (vd D:\Work;E:\Repos), Enter để bỏ qua'
        $Roots = @($ans -split ';' | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ })
    }
    $Roots = @($Roots | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    Write-Json $projects ([ordered]@{ roots = $Roots; saved = @(); groups = [ordered]@{} })
    Say "  projects.json  $(if ($Roots) { $Roots -join ', ' } else { 'chưa có thư mục nào' })"
    if (-not $Roots) { $Todo.Add("Khai thư mục dự án trong $projects (mục roots)") }
}

# herdr-core chạy pane bằng Git Bash. File đã có thì giữ.
$coreCfg = Join-Path $AppData 'herdr-core\config.toml'
if (Test-Path -LiteralPath $coreCfg) { Say '  config.toml    giữ nguyên (herdr-core đã có cấu hình)' }
else {
    $gitRoot = if (Has 'git') { Split-Path (Split-Path (Get-Command git).Source) } else { $null }
    # git resolves to Git\cmd\git.exe, or inside Git Bash to Git\mingw64\bin (or ucrt64\bin): try both levels up.
    # Git itself is per machine, not per target home, so the real LOCALAPPDATA.
    $cands = @()
    if ($gitRoot) { $cands += Join-Path (Split-Path $gitRoot) 'bin\bash.exe'; $cands += Join-Path $gitRoot 'bin\bash.exe' }
    $cands += Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
    $cands += Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'
    $bash = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($bash) {
        if (-not $DryRun) { New-Item -ItemType Directory -Force -Path (Split-Path $coreCfg) | Out-Null; [IO.File]::WriteAllText($coreCfg, "shell = [`"$($bash -replace '\\', '/')`", `"--login`", `"-i`"]`n", $utf8) }
        Say "  config.toml    shell = $bash"
    } else { $Todo.Add("Cài Git for Windows rồi chạy lại để herdr-core dùng Git Bash (hoặc tự ghi shell trong $coreCfg)") }
}

# ~\.local\bin vào PATH của người dùng (lệnh ha, herdr-shutdown).
if ($Real -and -not $DryRun) {
    $bin = Join-Path $TargetHome '.local\bin'
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (($userPath -split ';') -notcontains $bin) { [Environment]::SetEnvironmentVariable('Path', "$userPath;$bin", 'User'); Refresh-Path; Say "  PATH           thêm $bin" }
}

# 3. Thanh trạng thái Claude Code -> Herdr (context, model, chi phí trên rail và khung chat) ----------
$claudeSettings = Join-Path $TargetHome '.claude\settings.json'
$cmd = "node $($H -replace '\\', '/')/.config/herdr-app/bridge/statusline.mjs"
if (-not $NoStatusLine -and ((Test-Path -LiteralPath $claudeSettings) -or ($Real -and (Has 'claude')))) {
    $s = if (Test-Path -LiteralPath $claudeSettings) { Get-Content -Raw -LiteralPath $claudeSettings | ConvertFrom-Json -AsHashtable } else { [ordered]@{} }
    if ($s.statusLine.command -eq $cmd) { Say '  statusLine     đã bật' }
    elseif ($s.statusLine) { $Todo.Add("Claude Code đã có statusLine khác; muốn Herdr hiện context thì đổi command thành: $cmd") }
    elseif (Ask '  Bật thanh trạng thái Claude Code cho Herdr (context, model, chi phí)?') {
        $s.statusLine = [ordered]@{ type = 'command'; command = $cmd; padding = 0 }
        Write-Json $claudeSettings $s
        Say "  statusLine     $cmd"
    }
}

# 4. Còn lại -----------------------------------------------------------------------------------------
Say "`n3. Còn lại" Cyan
$font = @('HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Fonts') |
    ForEach-Object { (Get-ItemProperty -Path $_ -ErrorAction SilentlyContinue).PSObject.Properties.Name } | Where-Object { $_ -like 'Maple Mono NF*' }
if ($Real -and -not $font) { $Todo.Add('Cài font Maple Mono NF (https://github.com/subframe7536/maple-font/releases, gói MapleMono-NF) hoặc đổi "font" trong ~\.config\herdr-app\settings.json') }
$Todo.Add('Mở Herdr App từ Start menu, hoặc gõ ha <tên dự án> trong terminal mới')
$Todo.Add('Phòng ban dùng Claude Code; Codex và Antigravity (agy) là tùy chọn cho vai Review, QA')
$Todo | ForEach-Object { Say "  - $_" Yellow }
if (Test-Path -LiteralPath $Backup) { Say "`nBản cũ đã sao lưu ở $Backup" }
Say "`nXong. Hướng dẫn dùng: ~\.config\herdr-app\docs\HUONG-DAN-SU-DUNG.md" Green
