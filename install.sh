#!/bin/bash
# 文物精灵 · 服务器一键部署
# 用法（在服务器上，把整个文件夹传上去之后）：
#     cd /opt/relic && sudo bash install.sh
# 装完浏览器打开 http://服务器IP/ 就能进站

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-80}"
SERVICE="relic-spirit"

echo "=================================================="
echo "  文物精灵 · 部署"
echo "  目录: $DIR"
echo "  端口: $PORT"
echo "=================================================="

# 1) Python 检查
if ! command -v python3 >/dev/null 2>&1; then
    echo ">> 没有 python3，正在安装…"
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y -qq python3
    elif command -v yum >/dev/null 2>&1; then
        yum install -y -q python3
    else
        echo "!! 请先手动安装 python3"; exit 1
    fi
fi
echo ">> python3: $(python3 -V 2>&1)"

# 2) 入口页检查
if [ ! -f "$DIR/index.html" ]; then
    echo "!! 没找到 index.html，请确认文件和 server.py 在同一个目录"
    exit 1
fi

# 3) 停掉旧服务
if systemctl list-units --full -all 2>/dev/null | grep -q "$SERVICE.service"; then
    echo ">> 停掉旧服务"
    systemctl stop "$SERVICE" 2>/dev/null || true
fi

# 4) 写 systemd 服务
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Relic Spirit (文物精灵)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
Environment=PORT=$PORT
Environment=NO_BROWSER=1
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $DIR/server.py
Restart=always
RestartSec=3
StandardOutput=append:/var/log/$SERVICE.log
StandardError=append:/var/log/$SERVICE.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

# 5) 自检
echo ">> 等待服务起来…"
sleep 3
if curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/api/ping"; then
    echo ">> 服务正常"
else
    echo "!! 服务没起来，看日志：journalctl -u $SERVICE -n 50"
fi

# 6) 防火墙（有就放行）
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$PORT"/tcp >/dev/null 2>&1 || true
    echo ">> ufw 已放行 $PORT"
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state 2>/dev/null | grep -q running; then
    firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    echo ">> firewalld 已放行 $PORT"
fi

IP=$(curl -s --max-time 4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=================================================="
echo "  部署完成"
echo ""
echo "  访问地址: http://$IP$( [ "$PORT" = "80" ] || echo ":$PORT" )/"
echo "  账号: 2502887269@qq.com"
echo "  密码: 123456789"
echo ""
echo "  常用命令:"
echo "    systemctl status $SERVICE     查看状态"
echo "    systemctl restart $SERVICE    重启"
echo "    tail -f /var/log/$SERVICE.log 看日志"
echo "=================================================="
echo ""
echo "  ！别忘了去阿里云控制台「防火墙 / 安全组」里放行 $PORT 端口"
echo "  （轻量应用服务器叫「防火墙」，ECS 叫「安全组」）"
