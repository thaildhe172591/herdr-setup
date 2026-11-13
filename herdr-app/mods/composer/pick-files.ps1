# Windows "open file" dialog for the attachment tray (several files). Run with:
# powershell.exe -STA -NoProfile -File pick-files.ps1 — prints one path per line, nothing when cancelled.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object Windows.Forms.OpenFileDialog
$d.Multiselect = $true
$d.Title = 'Đính kèm file cho agent'
if ($d.ShowDialog() -eq [Windows.Forms.DialogResult]::OK) { $d.FileNames }
