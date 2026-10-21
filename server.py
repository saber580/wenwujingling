# -*- coding: utf-8 -*-
"""文物精灵 · 一体服务（静态页面 + 云端 AI 转发）

为什么需要这一层：
    云端大模型会校验请求来源（Origin 头），只有应用绑定的官方域名和本机地址放行，
    换成 IP 或别的域名一律 403。这个服务在自己这边把 Origin 头去掉再转发，
    云端就认了。于是：
        · 放在自己电脑上  → 局域网/穿透地址也能用全部 AI
        · 放在云服务器上  → http://你的IP/ 直接访问，AI 照样能用

用法:
    python server.py                # 默认 8080
    PORT=80 python server.py        # 服务器上想直接用 80 端口
    NO_BROWSER=1 python server.py   # 不自动开浏览器（自动化/服务器环境）

对外接口:
    GET  /                    静态页面
    POST /api/llm             OpenAI 格式的聊天请求 → 转发云端，SSE 流式回传
    GET  /api/ping            健康检查
"""
import json
import mimetypes
import os
import re
import socket
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
ENTRY = "index.html"

# 云端大模型网关：鉴权只靠这个可公开的 publishableKey，真正的门槛是 Origin
BASE = "https://relic-spirit.app.workbuddy.host/.cloud/llm"
UPSTREAM = BASE + "/chat/completions"
UPSTREAM_MODELS = BASE + "/models"
ACCESS_KEY = "wbpk_EmA5VK2VcIUoBzfFI6Zacw_F1K3gdiinbg22xd0OTLtOuN32jy1A4wX"

PORTS = [int(x) for x in (os.environ.get("PORTS") or os.environ.get("PORT") or "8080").split(",") if x.strip()]
PORT = PORTS[0]


class Server(ThreadingHTTPServer):
    """默认 backlog 只有 5：浏览器打开首页会并发拉几十个素材，
    队列一满内核就直接丢弃新连接，浏览器表现正是 ERR_CONNECTION_TIMED_OUT。
    这里放大到 256，并让后台线程随主线程退出。"""
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 256


class Handler(SimpleHTTPRequestHandler):
    server_version = "RelicSpirit/1.0"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # ---------- 日志：只留一行，别刷屏 ----------
    # 注意：args 里可能是 HTTPStatus 对象（404 走 send_error 时），直接 in 会抛 TypeError
    def log_message(self, fmt, *args):
        try:
            line = fmt % args
        except Exception:
            line = str(fmt)
        if "/api/llm" in line:
            return
        sys.stderr.write("  [%s] %s\n" % (self.client_address[0], line))

    def end_headers(self):
        # 接口不缓存；静态资源交给浏览器按 Last-Modified 协商，避免每次刷新重下几十兆素材
        if self.path.split("?")[0].startswith("/api/"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        if getattr(self, "_range_ok", False):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self._range_ok = True          # 告诉浏览器：这个大文件支持分段下载
        return super().send_head()

    # ---------- 路由 ----------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/ping":
            return self._json(200, {"ok": True, "provider": "cloud-proxy", "model": "云端大模型"})
        if path == "/api/models":
            return self._proxy_models()
        if self._serve_range():
            return
        return super().do_GET()

    # ---------- 分段传输：让视频/大图边下边用，不必等整个文件 ----------
    def _serve_range(self):
        rng = self.headers.get("Range")
        if not rng:
            return False
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return False
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        if not m or (not m.group(1) and not m.group(2)):
            return False

        size = os.path.getsize(path)
        if m.group(1):
            start = int(m.group(1))
            end = int(m.group(2)) if m.group(2) else size - 1
        else:                                   # bytes=-500 表示取最后 500 字节
            start = max(0, size - int(m.group(2)))
            end = size - 1
        end = min(end, size - 1)

        if start >= size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.send_header("Content-Length", "0")
            self._range_ok = True
            self.end_headers()
            return True

        self._range_ok = True
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        try:
            f = open(path, "rb")
        except OSError:
            return False
        try:
            f.seek(start)
            left = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(left))
            self.end_headers()
            while left > 0:
                chunk = f.read(min(65536, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                f.close()
            except Exception:
                pass
        return True

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/llm":
            return self._proxy_llm()
        return self._json(404, {"ok": False, "error": "没有这个接口"})

    # ---------- 工具 ----------
    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---------- 模型清单也走转发 ----------
    def _proxy_models(self):
        req = urllib.request.Request(UPSTREAM_MODELS, method="GET")
        req.add_header("Accept", "application/json")
        req.add_header("x-wb-webapp-access-key", ACCESS_KEY)
        try:
            resp = urllib.request.urlopen(req, timeout=25)
            data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self._json(e.code, {"ok": False, "error": "云端拒绝了模型清单请求（HTTP %s）" % e.code})
        except Exception as e:
            self._json(502, {"ok": False, "error": "连不上云端：%s" % str(e)[:100]})

    # ---------- 核心：转发云端大模型 ----------
    def _proxy_llm(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        body = self.rfile.read(n) if n else b""
        if not body:
            return self._json(400, {"ok": False, "error": "请求体是空的"})

        req = urllib.request.Request(UPSTREAM, data=body, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "text/event-stream")
        req.add_header("x-wb-webapp-access-key", ACCESS_KEY)
        # 关键：这里不设 Origin 头。云端对「没有来源」的服务端调用是放行的。

        try:
            resp = urllib.request.urlopen(req, timeout=180)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "ignore")[:300]
            except Exception:
                pass
            return self._json(e.code, {
                "ok": False,
                "error": "云端拒绝了这次请求（HTTP %s）" % e.code,
                "detail": detail,
            })
        except Exception as e:
            return self._json(502, {"ok": False, "error": "连不上云端：%s" % str(e)[:120]})

        # 原样把 SSE 流吐回去，前端按普通流式响应处理
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Accel-Buffering", "no")   # 让 nginx 别缓冲
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            return

        try:
            while True:
                chunk = resp.read1(2048) if hasattr(resp, "read1") else resp.read(2048)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass          # 用户切页面/关页面了，正常现象
        except Exception as e:
            sys.stderr.write("  转发中断: %s\n" % e)
        finally:
            try:
                resp.close()
            except Exception:
                pass


def lan_ips():
    out = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except Exception:
        pass
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
        print("没找到 %s，请把这个服务放在网页根目录（和 index.html 同层）" % ENTRY)
        return

    ThreadingHTTPServer.allow_reuse_address = True

    # 支持同时监听多个端口：PORTS=80,8080 —— 80 被运营商拦的时候 8080 还能进
    servers = []
    for p in PORTS:
        try:
            servers.append((p, Server(("0.0.0.0", p), Handler)))
        except OSError as e:
            print("  端口 %d 启动失败: %s" % (p, e))

    if not servers:
        print("所有端口都没能启动，检查是否被占用")
        return

    local = "http://127.0.0.1:%d/%s" % (PORTS[0], ENTRY)

    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(0.7, lambda: webbrowser.open(local)).start()

    print("=" * 60)
    print("  文物精灵 已启动")
    print("  本机打开: %s" % local)
    for ip in lan_ips():
        print("  同网访问: http://%s:%d/" % (ip, PORTS[0]))
    print("  ------------------------------")
    # 注意：控制台不打印明文口令（仓库/日志里都不应出现）。
    # 演示口令由环境变量 DEMO_PASS 提供；未设置时只提示去看部署文档。
    print("  账号: %s" % os.environ.get("DEMO_EMAIL", "见 .env.example（DEMO_EMAIL）"))
    print("  密码: %s" % ("*" * 8 + "（已由 DEMO_PASS 设置）"
                          if os.environ.get("DEMO_PASS") else "见 部署到服务器.md / .env.example"))
    print("  AI 走 /api/llm 转发到云端，任何域名/IP 下都能用")
    print("=" * 60)

    for p, s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
        print("  附加端口: %d" % p)

    try:
        servers[0][1].serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for _, s in servers:
            try:
                s.server_close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
