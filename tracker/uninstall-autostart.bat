@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Join-Path ([Environment]::GetFolderPath('Startup')) 'MindsetForest Tracker.lnk';" ^
  "if (Test-Path $p) { Remove-Item $p; Write-Host ('Removed ' + $p) } else { Write-Host 'No autostart shortcut found.' }"
pause
