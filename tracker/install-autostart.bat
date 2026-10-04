@echo off
setlocal
cd /d "%~dp0"
rem Starts the tracker now and every time you sign in to Windows (a shortcut in
rem the Startup folder). Run it again after moving this folder or building the
rem exe. uninstall-autostart.bat removes the shortcut.
rem Paths are handed to PowerShell through environment variables, so spaces,
rem apostrophes and quotes in the folder name never need escaping.
set "MF_TARGET=%~dp0dist\MindsetForestTracker\MindsetForestTracker.exe"
set "MF_WORKDIR=%~dp0dist\MindsetForestTracker"
set "MF_ARGS="
if exist "%MF_TARGET%" goto create
echo Built exe not found - the shortcut will run pythonw run_tracker.py instead.
if not exist config.json if not exist "%APPDATA%\MindsetForest\config.json" (
  echo No config.json found. Put the config.json downloaded from the dashboard next to this file.
  pause
  exit /b 1
)
set "MF_TARGET="
for /f "delims=" %%i in ('where pythonw 2^>nul') do call :pick "%%i"
if not defined MF_TARGET (
  echo pythonw.exe was not found on PATH. Install Python 3.11+ or run build.bat first.
  pause
  exit /b 1
)
echo Installing dependencies...
"%MF_PYTHON%" -m pip install -r requirements.txt --quiet
if errorlevel 1 (
  echo Installing dependencies failed - see the output above.
  pause
  exit /b 1
)
set "MF_WORKDIR=%~dp0"
set "MF_ARGS=run_tracker.py"
:create
echo Target: %MF_TARGET% %MF_ARGS%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'MindsetForest Tracker.lnk'));" ^
  "$s.TargetPath = [string]$env:MF_TARGET; $s.Arguments = [string]$env:MF_ARGS; $s.WorkingDirectory = [string]$env:MF_WORKDIR;" ^
  "$s.Description = 'MindsetForest computer-time tracker'; $s.Save(); Write-Host ('Created ' + $s.FullName)"
if errorlevel 1 (
  echo Failed to create the Startup shortcut.
  pause
  exit /b 1
)
rem Start it now as well. If a tracker is already running, the new one exits.
pushd "%MF_WORKDIR%"
start "" "%MF_TARGET%" %MF_ARGS%
popd
echo The tracker is running (tree icon by the clock) and will start when you sign in to Windows.
echo First time: click the tree icon, Sign in..., same e-mail and password as the dashboard.
pause
exit /b 0

:pick
rem First pythonw on PATH that is not the Microsoft Store stub under WindowsApps.
if defined MF_TARGET goto :eof
echo %~1 | find /i "WindowsApps" >nul && goto :eof
set "MF_TARGET=%~1"
set "MF_PYTHON=%~dp1python.exe"
goto :eof
