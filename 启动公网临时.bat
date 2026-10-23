@echo off
chcp 65001 >nul
title Relic Spirit - Public Tunnel
cd /d "%~dp0"

if not exist "server.py" goto missing

echo.
echo   ============================================================
echo     文物精灵 · 临时公网地址
echo   ============================================================
echo.
echo   第 1 步：启动本地服务（会弹一个小窗口，别关它）
start "RelicSpirit-Server" /min cmd /c "python server.py"

echo   第 2 步：等 4 秒，然后建立公网隧道...
timeout /t 4 >nul

echo.
echo   ------------------------------------------------------------
echo   下面出现一行  https://xxxx.serveousercontent.com
echo   那就是你的公网网址，复制它发给别人。
echo.
echo   别人第一次打开会看到一个 Serveo 提示页，
echo   点一下 "Continue to Site" 就进站了。
echo.
echo   注意：关掉这个窗口，网址立刻失效；
echo         电脑关机/休眠也会断，重开就是新地址。
echo   ------------------------------------------------------------
echo.

where ssh >nul 2>nul
if errorlevel 1 goto nossh
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -T -R 80:localhost:8080 serveo.net
goto done

:nossh
echo   没有找到 ssh 命令。Windows 10 以上请到
echo   「设置 - 应用 - 可选功能」里安装 OpenSSH 客户端。
echo.
pause
goto done

:missing
echo.
echo   server.py 不见了，请确认这个 bat 和 server.py 在同一目录。
echo.
pause

:done
