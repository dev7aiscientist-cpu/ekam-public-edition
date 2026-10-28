@echo off
title EKAM - Public Edition
cd /d "%~dp0"

rem --- Find Bun: PATH first, then the standard install folder directly ---
set "BUN=bun"
where bun >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
  ) else (
    echo.
    echo   EKAM needs one free program to run: Bun - it is not installed yet.
    echo.
    echo   Type Y and press Enter, and this window will install Bun for you
    echo   using Bun's official installer from bun.sh. Or type N to just open
    echo   bun.sh and read about it first.
    echo.
    set /p "CHOICE=  Install Bun now? [Y/N]: "
    if /i not "%CHOICE%"=="Y" (
      start "" "https://bun.sh"
      pause
      exit /b 1
    )
    echo.
    echo   Installing Bun (one-time, needs internet)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression"
    if exist "%USERPROFILE%\.bun\bin\bun.exe" (
      set "BUN=%USERPROFILE%\.bun\bin\bun.exe"
    ) else (
      echo.
      echo   The Bun install did not finish. Check your internet connection,
      echo   then double-click START again.
      pause
      exit /b 1
    )
  )
)

if not exist "node_modules" (
  echo.
  echo   First run: installing EKAM's parts (one-time, needs internet)...
  echo.
  call "%BUN%" install
  if errorlevel 1 (
    echo.
    echo   Installing EKAM's parts failed - check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo   Starting EKAM... your browser will open by itself when it is ready.
echo   KEEP THIS WINDOW OPEN - it is EKAM's engine. Close it to stop EKAM.
echo.

start "" /min cmd /c "for /l %%i in (1,1,40) do (if exist ekam-port.txt (set /p P=<ekam-port.txt & start http://localhost:%%P%% & exit) else (timeout /t 1 /nobreak >nul))"

call "%BUN%" run start

pause
