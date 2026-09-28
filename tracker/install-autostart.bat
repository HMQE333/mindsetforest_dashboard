@echo off
setlocal
cd /d "%~dp0"
rem Paths are handed to PowerShell through environment variables, so spaces,
rem apostrophes and quotes in the folder name never need escaping.
set "MF_TARGET=%~dp0dist\MindsetForestTracker\MindsetForestTracker.exe"
set "MF_WORKDIR=%~dp0dist\MindsetForestTracker"
set "MF_ARGS="
if exist "%MF_TARGET%" goto create
echo Built exe not found - the shortcut will run pythonw run_tracker.py instead.
set "MF_TARGET="
for /f "delims=" %%i in ('where pythonw 2^>nul') do call :pick "%%i"
if not defined MF_TARGET (
  echo pythonw.exe was not found on PATH. Install Python 3.11+ or run build.bat first.
  pause
  exit /b 1
)
set "MF_WORKDIR=%~dp0"
set "MF_ARGS=run_tracker.py"
:create
echo Target: %MF_TARGET% %MF_ARGS%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)) MindsetForest
Tracker.lnk));" ^
  "$s.TargetPath = [string]$env:MF_TARGET; $s.Arguments = [string]$env:MF_ARGS; $s.WorkingDirectory = [string]$env:MF_WORKDIR;" ^
  "$s.Description = MindsetForest
computer-time
tracker; $s.Save(); Write-Host (Created
 + $s.FullName)"
if errorlevel 1 (echo Failed to create the Startup shortcut.) else (echo The tracker will now start when you sign in to Windows.)
pause
exit /b 0

:pick
rem First pythonw on PATH that is not the Microsoft Store stub under WindowsApps.
if defined MF_TARGET goto :eof
echo %~1 | find /i "WindowsApps" >nul && goto :eof
set "MF_TARGET=%~1"
goto :eof
