# Clipboard helper for the attachment tray. Run with: powershell.exe -STA -NoProfile -File clip.ps1 <mode> [arg]
#   get              print the clipboard's text as base64 (UTF-8), nothing when it holds no text
#   set <text>       put text on the clipboard
#   set-b64 <b64>    put base64 (UTF-8) text back (what `get` printed)
#   set-image <png>  put an image file back as an image
# Exit code 1 when setting failed.
param([string]$Mode, [string]$Arg)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
try {
    switch ($Mode) {
        'get' { if ([Windows.Forms.Clipboard]::ContainsText()) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Windows.Forms.Clipboard]::GetText())) } }
        'set' { [Windows.Forms.Clipboard]::SetText($Arg) }
        'set-b64' { [Windows.Forms.Clipboard]::SetText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Arg))) }
        'set-image' { $img = [Drawing.Image]::FromFile($Arg); try { [Windows.Forms.Clipboard]::SetImage($img) } finally { $img.Dispose() } }
        default { throw "unknown mode $Mode" }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
