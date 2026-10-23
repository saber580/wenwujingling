@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 文物精灵 · AI 云端小桥(保持开启)
echo ==============================================
echo   文物精灵 · AI 云端小桥
echo   页面在 http://127.0.0.1:8898 找它
echo   同一 WiFi 的手机访问网页时会自动改用局域网 IP
echo   - 小桥崩溃会自动重启,一般不用管
echo   - 玩完把本窗口关掉即停止
echo ==============================================
echo.

rem 优先用系统 python,找不到再用备用路径
where python >nul 2>nul
if %errorlevel%==0 (
    python ident_cloud.py
) else (
    echo 系统没找到 python,尝试备用路径...
    "C:\Users\lenovo\AppData\Local\Programs\Python\Python311\python.exe" ident_cloud.py
)

echo.
echo 小桥已退出。如果页面提示"小桥未启动",重新双击本文件即可。
pause
