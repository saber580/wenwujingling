# -*- coding: utf-8 -*-
"""本地启动文物精灵：开一个 http 服务并自动打开浏览器。

用法:
  python tools/serve.py

为什么必须用它、不能直接双击 html：
  云端 AI 只在 http(s) 站点下允许调用，file:// 会被拒绝。
  这个脚本用 http://127.0.0.1:端口 打开页面，登录 / 识别 / 茶话会才能正常工作。
"""
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRY = "index.html"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 改代码后刷新即生效，不用清缓存
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静音，别刷屏


def free_port(start=8080):
    for p in range(start, start + 40):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return start


def lan_ips():
    """本机所有可能被局域网内其它设备访问到的 IPv4（排除回环）。"""
    out = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except Exception:
        pass
    # 再补一条：靠 UDP 探路拿默认出口网卡地址（hostname 解析常常不全）
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and ip not in out:
            out.insert(0, ip)
    except Exception:
        pass
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    if not os.path.exists(os.path.join(ROOT, ENTRY)):
        print("没找到 %s，请确认脚本在 文物精灵/tools/ 下" % ENTRY)
        input()
        return

    port = free_port()
    url = "http://127.0.0.1:%d/%s" % (port, ENTRY)

    socketserver.TCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    # 绑 0.0.0.0：本机能用，同一 WiFi 下的手机/电脑也能打开
    httpd = socketserver.ThreadingTCPServer(("0.0.0.0", port), Handler)

    if os.environ.get("NO_BROWSER") != "1":     # 自动化测试时置 1，别弹窗
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    print("=" * 60)
    print("  文物精灵 已启动")
    print("  自己打开: %s" % url)
    ips = lan_ips()
    if ips:
        print("  ------------------------------")
        print("  同一 WiFi 下，别人在浏览器输入下面任一地址即可进入：")
        for ip in ips:
            print("      http://%s:%d/" % (ip, port))
    print("  ------------------------------")
    # 安全约定：不在控制台/日志输出明文口令
    print("  账号: %s" % os.environ.get("DEMO_EMAIL", "见 .env.example（DEMO_EMAIL）"))
    print("  密码: %s" % ("*" * 8 + "（已由 DEMO_PASS 设置）"
                          if os.environ.get("DEMO_PASS") else "见 部署到服务器.md / .env.example"))
    print("  用完直接关掉这个黑窗口就停止服务")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
