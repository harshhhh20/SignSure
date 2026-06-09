@echo off
title SignSure - Digital Signature Verification System
color 0F
echo.
echo  ==============================================
echo   SignSure - Digital Signature Verification
echo   RSA-2048 + SHA-256 + OpenSSL
echo  ==============================================
echo.

REM --- Python: try py launcher, then full known path ---
set "PYTHON="
py --version >nul 2>&1
if %errorlevel%==0 (
    set "PYTHON=py"
    goto :python_found
)

set "PYPATH=C:\Users\Harsh Singh\AppData\Local\Programs\Python\Python313\python.exe"
if exist "%PYPATH%" (
    set "PYTHON=%PYPATH%"
    goto :python_found
)

echo  [ERROR] Python not found. Please install Python 3.
pause
exit /b 1

:python_found
echo  [OK] Python: %PYTHON%

REM --- OpenSSL check ---
openssl version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] OpenSSL not found in PATH.
    echo         Download: https://slproweb.com/products/Win32OpenSSL.html
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('openssl version') do echo  [OK] %%v

REM --- Kill any process already on port 5002 ---
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5002 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ' [*] Stopped process on port 5002' }" 2>nul

REM --- Install Python dependencies ---
echo  [*] Checking dependencies...
%PYTHON% -m pip install flask flask-cors werkzeug -q

REM --- Open browser after a 3-second delay ---
start "" /b cmd /c "ping 127.0.0.1 -n 4 >nul & start http://127.0.0.1:5002"

REM --- Start Flask server (keeps this window open) ---
echo.
echo  [*] Starting server at http://127.0.0.1:5002
echo  [*] Press Ctrl+C to stop.
echo.
cd /d "%~dp0backend"
%PYTHON% app.py

echo.
echo  [*] Server stopped.
pause
