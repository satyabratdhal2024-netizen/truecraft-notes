@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (
  echo Please install Node.js 20 or later from https://nodejs.org first.
  pause
  exit /b 1
)
node server.mjs --test-mail
pause
