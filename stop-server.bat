@echo off
setlocal
set "PORT=8787"

rem --- Read PORT from server/.env if defined ---
set "ENV=%~dp0server\.env"
if exist "%ENV%" (
  for /F "usebackq tokens=1,2 delims== eol=#" %%a in ("%ENV%") do (
    if /I "%%~a"=="PORT" set "PORT=%%~b"
  )
)

rem --- Stop process listening on PORT ---
powershell -NoProfile -Command "$x = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if ($x) { Stop-Process -Id $x[0].OwningProcess -Force }"