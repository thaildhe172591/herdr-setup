# Tests mods/projects/list.ps1 against a throwaway config. Run: pwsh -NoProfile -File tests/list.tests.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8  # read list.ps1's UTF-8 stdout as UTF-8
$list = Join-Path $PSScriptRoot '..\mods\projects\list.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "herdr-list-test-$PID"
$R = Join-Path $tmp 'root R'
$S = Join-Path $tmp 'Dự án S'
New-Item -ItemType Directory -Force "$R\a", $S | Out-Null
git -C "$R\a" init -q 2>$null
'{"scripts":{"dev":"x"}}' | Set-Content "$S\package.json"
$cfg = Join-Path $tmp 'projects.json'
@{ roots = @($R); saved = @(
    @{ path = $S; dev = 'echo hi'; agent = 'codex' },
    @{ path = "$R\a"; check = 'echo chk' },
    @{ path = "$R\missing" }) } | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $cfg

function Run([string]$Config) {
    $err = Join-Path $tmp 'stderr.txt'
    $out = & pwsh -NoProfile -File $list -Config $Config 2> $err
    @{ code = $LASTEXITCODE; items = @(if ("$out".Trim()) { "$out" | ConvertFrom-Json }); err = (Get-Content $err -Raw) }
}
function Assert($cond, $msg) { if (-not $cond) { throw "FAIL: $msg" } }

try {
    $res = Run $cfg
    Assert ($res.code -eq 0) "exit code $($res.code)"
    $a = $res.items | Where-Object path -eq "$R\a"
    Assert $a 'repo R\a listed'
    Assert ($a.group -eq (Split-Path $R -Leaf)) "R\a group '$($a.group)'"
    Assert ($a.check -eq 'echo chk') "R\a check override '$($a.check)'"
    Assert ($a.saved -eq $true) 'R\a marked saved'
    $sv = $res.items | Where-Object path -eq $S
    Assert $sv 'saved folder S listed'
    Assert ($sv.group -eq 'Đã lưu') "S group '$($sv.group)'"
    Assert ($sv.dev -eq 'echo hi') "S dev override '$($sv.dev)'"
    Assert ($sv.agent -eq 'codex') "S saved agent '$($sv.agent)'"
    Assert ($null -eq $a.agent) "R\a has no saved agent '$($a.agent)'"
    Assert (-not ($res.items | Where-Object path -eq "$R\missing")) 'missing saved path skipped'

    $m = Run (Join-Path $tmp 'nope.json')
    Assert ($m.code -eq 0) 'missing config exits 0'
    Assert ($m.err -match 'projects\.json|nope\.json') 'missing config warns on stderr'

    '{oops' | Set-Content (Join-Path $tmp 'bad.json')
    $b = Run (Join-Path $tmp 'bad.json')
    Assert ($b.code -eq 0) 'invalid config exits 0'
    Assert ($b.err -match '\S') 'invalid config warns on stderr'
    'PASS'
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
