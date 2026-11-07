@echo off
chcp 65001 >nul
title Relic Spirit - Trust local HTTPS cert
cd /d "%~dp0.."

if not exist "certs\relic-ca.crt" (
  echo.
  echo   certs\relic-ca.crt not found. Run tools\mk_tls.py first:
  echo       python tools\mk_tls.py
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo   Trust the local CA so the browser stops warning on https
echo ============================================================
echo.
echo   This adds ONE certificate to YOUR user account only:
echo       "RelicSpirit Local CA"
echo   No administrator rights needed, nothing changes system-wide.
echo.
echo   A Windows security dialog will pop up - click  Yes / 是.
echo   To undo later: certmgr.msc - Trusted Root CAs - remove the entry.
echo.

certutil -addstore -user Root "certs\relic-ca.crt"
set RC=%errorlevel%

echo.
if "%RC%"=="0" (
  echo   Done. Close ALL browser windows, then reopen - no more warning.
  echo   Firefox keeps its own store: Settings - Privacy - Certificates
  echo   - View Certificates - Authorities - Import - pick certs\relic-ca.crt
) else (
  echo   Failed / cancelled ^(code %RC%^).
  echo   You can still use https: click  Advanced - Proceed  once per browser session.
)
echo.
pause
