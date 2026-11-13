# Saves the clipboard's image for the attachment tray. Run with: powershell.exe -STA -NoProfile -File clip-image.ps1 <outDir>
# Prints the saved PNG's full path (or, for image files copied in Explorer, copies of them), nothing when
# the clipboard holds no image. Also removes tray files older than 7 days.
param([string]$OutDir)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
Get-ChildItem $OutDir -File | Where-Object LastWriteTime -lt (Get-Date).AddDays(-7) | Remove-Item -ErrorAction SilentlyContinue
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$img = [Windows.Forms.Clipboard]::GetImage()
if ($img) {
    $path = Join-Path $OutDir "clip-$stamp.png"
    $img.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    $path
    exit 0
}
$i = 0
foreach ($f in [Windows.Forms.Clipboard]::GetFileDropList()) {
    if ($f -notmatch '\.(png|jpe?g|gif|webp|bmp)$') { continue }
    $dest = Join-Path $OutDir ("file-$stamp-$i-" + [IO.Path]::GetFileName($f))
    Copy-Item -LiteralPath $f $dest
    (Get-Item -LiteralPath $dest).LastWriteTime = Get-Date   # fresh, so the 7-day cleanup keeps it
    $dest; $i++
}
