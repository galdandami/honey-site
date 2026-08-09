@echo off
cd /d "%~dp0"
start "" /min cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8000/admin.html"
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8000 --bind 127.0.0.1
) else (
  npx --yes http-server -p 8000 -a 127.0.0.1
)
pause
