@echo off
cd /d "%~dp0"
rem Dev run with a console window so logs are visible. Use pythonw for a silent run.
if not exist config.json if not exist "%APPDATA%\MindsetForest\config.json" (
  echo No config.json found. Copy config.example.json to config.json and fill it in.
  pause
  exit /b 1
)
pip install -r requirements.txt --quiet
python run_tracker.py --console %*
