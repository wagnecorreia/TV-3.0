@echo off
title TV 3.0 (offline)
cd /d "%~dp0"
echo Subindo o servidor local em http://localhost:8090 ...
start "TV 3.0 server" /min cmd /c "node scripts/serve.mjs"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8090"
exit