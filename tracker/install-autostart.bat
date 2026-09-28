@echo off
cd /d "%~dp0"
setlocal
set "TARGET=%~dp0dist\MindsetForestTracker\MindsetForestTracker.exe"
set "WORKDIR=%~dp0dist\MindsetForestTracker"
set "ARGS="
if not exist "%TARGET%" (
  echo dist\MindsetForestTracker\MindsetForestTracker.exe not found - falling back to pythonw run_tracker.py
  for /f "delims=" %%i in ('where pythonw') do set "TARGET=%%i"
  set "WORKDIR=%~dp0"
  set "ARGS=run_tracker.py"
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'MindsetForest Tracker.lnk'));" ^
  "$s.TargetPath = '%TARGET%'; $s.Arguments = '%ARGS%'; $s.WorkingDirectory = '%WORKDIR%';" ^
  "$s.Description = 'MindsetForest computer-time tracker'; $s.Save(); Write-Host ('Created ' + $s.FullName)"
if errorlevel 1 (echo Failed to create the Startup shortcut.) else (echo The tracker will now start when you sign in to Windows.)
pause
