@echo off
chcp 65001 >nul
title Relic Spirit - Local Server
cd /d "%~dp0"

if not exist "server.py" goto missing

where python >nul 2>nul
if not errorlevel 1 goto runpy
where py >nul 2>nul
if not errorlevel 1 goto runpy2
goto nopy

:runpy
python "server.py"
goto done

:runpy2
py "server.py"
goto done

:nopy
echo.
echo   Python not found. Install Python 3 first, then run this file again.
echo   Download: https://www.python.org/downloads/
echo.
pause
goto done

:missing
echo.
echo   server.py is missing, cannot start.
echo.
pause

:done
