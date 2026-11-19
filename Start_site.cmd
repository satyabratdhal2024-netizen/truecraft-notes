@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (
  echo Please install Node.js 20 or later from https://nodejs.org first.
  pause
  exit /b 1
)
findstr /C:"PASTE_YOUR_16_LETTER_APP_PASSWORD_HERE" .env >nul 2>&1
if %errorlevel%==0 (
  echo Opening .env - paste your 16-letter Gmail App Password, save, and close Notepad.
  notepad .env
)
echo Starting TrueCraft Notes at http://localhost:4318 ...
node server.mjs
pause
