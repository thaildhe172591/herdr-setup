@echo off
rem Shut down (or "herdr-shutdown restart") without losing Herdr's sessions.
rem Windows' own shut down kills the panes' shells first, so herdr-core records them as finished and
rem nothing comes back. `hc server stop` parks the terminals instead: after boot each pane gets a
rem shell again, Herdr App types `claude --resume` into Claude's, and the board's Restart serves agy.
setlocal
set "MODE=/s"
if /i "%~1"=="restart" set "MODE=/r"

rem 1. Close Herdr App first so it does not start the core again before the machine goes down.
taskkill /im herdr-app.exe >nul 2>&1
timeout /t 3 /nobreak >nul
taskkill /f /im herdr-app.exe >nul 2>&1

rem 2. Park every kept terminal.
"%USERPROFILE%\.local\bin\hc.exe" server stop

rem 3. Then shut down or restart.
shutdown %MODE% /t 5 /c "Herdr: terminals parked, sessions come back after boot"
