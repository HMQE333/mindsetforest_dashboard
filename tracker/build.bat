@echo off
cd /d "%~dp0"
rem Builds dist\MindsetForestSetup.exe: one file that installs, configures and
rem runs the tracker. The steps live in build-exe.ps1, which CI runs as well;
rem this file is there to double-click. Extra arguments go to the script,
rem e.g. build.bat -Python C:\Python312\python.exe
echo === MindsetForest Tracker - build ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1" %*
if errorlevel 1 goto fail
echo.
echo Build complete: dist\MindsetForestSetup.exe
echo Run it to install or upgrade the tracker for this Windows user (no admin rights needed).
pause
exit /b 0
:fail
echo.
echo BUILD FAILED - see output above.
pause
exit /b 1
