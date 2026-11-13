@echo off
rem ha: open Herdr App at a project (see %USERPROFILE%\.config\herdr-app\bin\ha.ps1, or: ha -Help)
pwsh -NoLogo -NoProfile -File "%USERPROFILE%\.config\herdr-app\bin\ha.ps1" %*
