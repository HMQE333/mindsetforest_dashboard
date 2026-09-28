@echo off
cd /d "%~dp0"
echo === MindsetForest Tracker - build ===
echo.
echo [1/3] Installing dependencies...
pip install -r requirements.txt pyinstaller --quiet
if errorlevel 1 goto fail
echo.
echo [2/3] Writing tray icon to assets\icon.ico...
if not exist assets mkdir assets
python -c "from mindsetforest_tracker.tray import save_ico; save_ico(r'assets\icon.ico')"
if errorlevel 1 goto fail
echo.
echo [3/3] Running PyInstaller...
pyinstaller --noconsole --onedir --noconfirm ^
  --name MindsetForestTracker ^
  --icon assets\icon.ico ^
  --add-data "assets\icon.ico;assets" ^
  --hidden-import pystray._win32 ^
  --hidden-import PIL._tkinter_finder ^
  --hidden-import win32crypt ^
  run_tracker.py
if errorlevel 1 goto fail
if exist config.json copy /y config.json dist\MindsetForestTracker\config.json >nul
copy /y config.example.json dist\MindsetForestTracker\config.example.json >nul
echo.
echo Build complete: dist\MindsetForestTracker\MindsetForestTracker.exe
echo Put your config.json next to the exe (or in %%APPDATA%%\MindsetForest).
pause
exit /b 0
:fail
echo.
echo BUILD FAILED - see output above.
pause
exit /b 1
