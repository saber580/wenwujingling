@echo off
chcp 65001 >nul
title 文物精灵 · 局域网聚会模式(别人连你 WiFi 一起玩)
set HERE=%~dp0
for %%I in ("%HERE%..") do set ROOT=%%~fI
set ENTRY=%ROOT%\..\文物精灵-局域网入口
for %%I in ("%ENTRY%") do set ENTRY=%%~fI

echo === 文物精灵 · 局域网聚会模式 ===
echo.

rem 准备「入口」文件夹:里面只放一个指向本项目的链接,访客看不到桌面上其他东西
if not exist "%ENTRY%\文物精灵" (
  if not exist "%ENTRY%" mkdir "%ENTRY%" >nul 2>nul
  cmd /c mklink /J "%ENTRY%\文物精灵" "%ROOT%" >nul
)

echo [1/2] 启动云端小桥(8898:识别 / 茶话会 / 幻化 / 小答问答)…
start "文物精灵-小桥" /min python -X utf8 "%HERE%ident_cloud.py"

echo [2/2] 启动网页服务(8899)…
start "文物精灵-网页" /min python -m http.server 8899 --bind 0.0.0.0 --directory "%ENTRY%"

timeout /t 2 >nul
for /f %%i in ('python "%HERE%lan_info.py"') do set LANIP=%%i

echo.
echo   本机打开:              http://127.0.0.1:8899/文物精灵/
echo   同一 WiFi 的手机打开:  http://%LANIP%:8899/文物精灵/
echo.
echo 把「同一 WiFi 的手机打开」那条发给对方,他们就能玩识图 / 茶话会 / 幻化 / 小答问答(全走你这台电脑)。
echo 提示:手机浏览器直接访问 http 时相机常被禁用,让对方用「选择照片」上传一样能玩;
echo       首次连接若被防火墙拦住,在弹出的提示里点「允许访问」即可。
echo       想停止:关掉「文物精灵-小桥」和「文物精灵-网页」两个小窗口。
echo.
pause
