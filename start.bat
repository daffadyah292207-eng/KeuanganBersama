@echo off
title Catatan Keuangan
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js belum terpasang.
  echo   Unduh dan install dulu di: https://nodejs.org
  echo.
  pause
  exit /b 1
)

node server.mjs
pause
