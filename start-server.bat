@echo off
setlocal
set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"

rem --- Check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  timeout /t 6 >nul
  exit /b 1
)

cd /d "%SERVER_DIR%"

rem --- Create server/.env from template if missing ---
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
  ) else (
    echo [ERROR] server/.env.example not found.
    timeout /t 6 >nul
    exit /b 1
  )
)

rem --- npm install if node_modules missing ---
if not exist "node_modules" (
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    timeout /t 6 >nul
    exit /b 1
  )
)

rem --- Start server in background, do not block ---
echo Starting server: http://localhost:8787/
start "" http://localhost:8787/
start "" /b node index.js