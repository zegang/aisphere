@echo off
setlocal
if /I "%~1"=="fast-debug-build" echo Fast debug build: updating packaged app files while preserving local data.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
