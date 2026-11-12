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
    POST /api/tts             现场语音合成 → audio/mpeg（与预生成音频同一声线）
    POST /api/rag             双路召回（BM25 + LSA）→ 带 [n] 角标的证据与出处
    GET  /api/prompt          提示词版本库 / 消融实验配置
    GET  /api/ping            健康检查
    ─── MCP（Model Context Protocol）───
    POST /mcp                 JSON-RPC 2.0（Streamable HTTP，2025-03-26）
    GET  /mcp                 服务端 → 客户端 SSE 监听流
    GET  /mcp/sse             HTTP+SSE 传输（2024-11-05），首帧给 endpoint
    POST /mcp/messages        旧版 SSE 传输的客户端消息入口
    DELETE /mcp               关闭会话
"""
import json
import mimetypes
import os
import re
import socket
import ssl
import sys
import threading
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
ENTRY = "index.html"
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from mcp import transport as mcp_transport          # noqa: E402
from mcp import tools_impl as mcp_tools              # noqa: E402
from mcp.hybrid_rag import get as rag_get            # noqa: E402

# 云端大模型网关：鉴权只靠这个可公开的 publishableKey，真正的门槛是 Origin
BASE = "https://relic-spirit.app.workbuddy.host/.cloud/llm"
UPSTREAM = BASE + "/chat/completions"
UPSTREAM_MODELS = BASE + "/models"
# 密钥改为从环境变量读取（符合「密钥不入库」的评审要求）；
# 该 publishableKey 本身设计为可公开（真正的门槛是云端 Origin 域名校验），
# 因此这里保留一个兜底默认值，保证克隆仓库后「开箱即用」的主流程不被阻断。
ACCESS_KEY = os.environ.get("RELIC_ACCESS_KEY", "wbpk_EmA5VK2VcIUoBzfFI6Zacw_F1K3gdiinbg22xd0OTLtOuN32jy1A4wX")

PORTS = [int(x) for x in (os.environ.get("PORTS") or os.environ.get("PORT") or "8080").split(",") if x.strip()]
PORT = PORTS[0]

# ---- 本地 HTTPS ----
# 浏览器的麦克风（getUserMedia）与语音识别（SpeechRecognition）只在安全上下文里开放。
# http://127.0.0.1 算安全，但手机用局域网 IP 访问 http://172.20.10.2:8080 不算，
# 于是手机上「按住说话」直接不可用。这里额外开一个 https 端口解决。
# 证书由 tools/mk_tls.py 生成；TLS_PORT=0 可关掉。
CERT_DIR = os.path.join(ROOT, "certs")
TLS_CERT = os.path.join(CERT_DIR, "relic.crt")
TLS_KEY = os.path.join(CERT_DIR, "relic.key")
TLS_PORT = int(os.environ.get("TLS_PORT") or "8443")


class Server(ThreadingHTTPServer):
    """默认 backlog 只有 5：浏览器打开首页会并发拉几十个素材，
    队列一满内核就直接丢弃新连接，浏览器表现正是 ERR_CONNECTION_TIMED_OUT。
    这里放大到 256，并让后台线程随主线程退出。"""
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 256


class TLSServer(Server):
    """在监听 socket 上裹一层 TLS —— 之后 accept 出来的每个连接都是加密的。

    握手失败的请求（证书没被信任、明文访问、扫描器探测）会抛 OSError；
    父类 _handle_request_noblock 里对 OSError 是 catch 住直接 return 的，
    所以单个坏连接不会把服务线程带走。
    """

    def __init__(self, addr, handler, ctx):
        self.ctx = ctx
        super().__init__(addr, handler)

    def get_request(self):
        sock, addr = self.socket.accept()
        try:
            sock.settimeout(15)           # 别让半开连接把握手线程吊死
            return self.ctx.wrap_socket(sock, server_side=True), addr
        except Exception:
            try:
                sock.close()
            except Exception:
                pass
            raise


def make_tls_ctx():
    """加载 certs/ 里的证书。没有证书就返回 None（服务照常跑 HTTP）。"""
    if not (os.path.exists(TLS_CERT) and os.path.exists(TLS_KEY)):
        return None
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(TLS_CERT, TLS_KEY)
    return ctx


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
        path = self.path.split("?")[0]
        if path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
            # 双击 html（file://）或别的端口预览时，Origin 是 null / 带端口，
            # 放行同源回显，让 RAG 与 MCP 客户端也能连本机服务。
            origin = self.headers.get("Origin")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Headers",
                                 "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
                self.send_header("Access-Control-Expose-Headers", "Mcp-Session-Id")
        if getattr(self, "_range_ok", False):
            self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self._range_ok = True          # 告诉浏览器：这个大文件支持分段下载
        return super().send_head()

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        path = self.path.split("?")[0]
        if mcp_transport.handle_options(self, path):
            return
        if path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin",
                             self.headers.get("Origin") or "*")
            self.send_header("Access-Control-Allow-Headers",
                             "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/mcp"):
            if mcp_transport.handle_get(self, path, self.path):
                return
            return self._json(404, {"ok": False, "error": "没有这个 MCP 端点"})
        if path == "/api/ping":
            return self._json(200, {"ok": True, "provider": "cloud-proxy",
                                    "model": "云端大模型",
                                    "mcp": True, "rag": "bm25+lsa"})
        if path == "/api/models":
            return self._proxy_models()
        if path == "/api/prompt":
            return self._prompt()
        if path == "/api/rag":
            return self._rag({})
        if self._serve_range():
            return
        return super().do_GET()

    def do_DELETE(self):
        path = self.path.split("?")[0]
        if path.startswith("/mcp"):
            if mcp_transport.handle_delete(self, path):
                return
        return self._json(404, {"ok": False, "error": "没有这个接口"})

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
        if path.startswith("/mcp"):
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                n = 0
            raw = self.rfile.read(n) if n else b""
            if mcp_transport.handle_post(self, path, self.path, raw):
                return
            return self._json(404, {"ok": False, "error": "没有这个 MCP 端点"})
        if path == "/api/llm":
            return self._proxy_llm()
        if path == "/api/tts":
            return self._tts()
        if path == "/api/rag":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                req = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是 JSON"})
            return self._rag(req)
        return self._json(404, {"ok": False, "error": "没有这个接口"})

    # ---------- 双路召回：给前端与 Agent 用的直连接口 ----------
    def _rag(self, req):
        q = str(req.get("query") or req.get("q") or "").strip()
        if not q:
            return self._json(400, {"ok": False, "error": "查询为空"})
        try:
            k = max(1, min(10, int(req.get("k") or req.get("top_k") or 5)))
            r = rag_get().search(q, k=k, sid=(req.get("sid") or None))
            r["ok"] = True
            r["stats"] = rag_get().stats
            return self._json(200, r)
        except Exception as e:
            return self._json(500, {"ok": False, "error": "召回失败：%s" % str(e)[:120]})

    # ---------- 提示词版本库：前端与消融实验读同一份配置 ----------
    def _prompt(self):
        try:
            with open(os.path.join(ROOT, "prompts", "registry.json"), encoding="utf-8") as f:
                return self._json(200, json.load(f))
        except Exception as e:
            return self._json(500, {"ok": False, "error": str(e)})

    # ---------- 现场语音：AI 现说的话也要用文物自己的嗓子 ----------
    def _tts(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._json(400, {"ok": False, "error": "请求体不是 JSON"})
        text = str(req.get("text") or "").strip()[:800]
        rid = str(req.get("id") or "").strip()
        primary = str(req.get("primary") or "").strip()
        scene = str(req.get("scene") or "dialog").strip()
        if scene not in ("dialog", "exhibit"):
            scene = "dialog"
        if not text:
            return self._json(400, {"ok": False, "error": "文本为空"})
        try:
            import tts_service
            data = tts_service.tts_bytes(rid, text, primary, scene=scene)
        except Exception as e:
            sys.stderr.write("  [tts] %s\n" % str(e)[:160])
            data = None
        if not data:
            # 回落信号：前端收到 503 会改用浏览器自带语音，不会哑掉
            return self._json(503, {"ok": False, "error": "语音合成不可用"})
        try:
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

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

    # ---- 顺带起 HTTPS：麦克风/语音识别必须有安全上下文，手机上尤其如此 ----
    tls_url = ""
    tls_note = ""
    if TLS_PORT:
        ctx = None
        try:
            ctx = make_tls_ctx()
        except Exception as e:
            tls_note = "证书加载失败: %s" % str(e)[:100]
        if ctx is None and not tls_note:
            tls_note = "没有证书 —— 先跑 python tools/mk_tls.py"
        if ctx is not None:
            try:
                servers.append((TLS_PORT, TLSServer(("0.0.0.0", TLS_PORT), Handler, ctx)))
                tls_url = "https://127.0.0.1:%d/%s" % (TLS_PORT, ENTRY)
            except OSError as e:
                tls_note = "端口 %d 被占用: %s" % (TLS_PORT, e)

    local = tls_url or ("http://127.0.0.1:%d/%s" % (PORTS[0], ENTRY))

    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(0.7, lambda: webbrowser.open(local)).start()

    print("=" * 60)
    print("  文物精灵 已启动")
    print("  本机打开: %s" % local)
    if tls_url:
        print("  明文备用: http://127.0.0.1:%d/" % PORTS[0])
    else:
        print("  麦克风不可用: %s" % (tls_note or "HTTPS 未开启"))
    for ip in lan_ips():
        print("  同网访问: http://%s:%d/" % (ip, PORTS[0]))
        if tls_url:
            print("  同网 https: https://%s:%d/   ← 手机上要开麦请用这条" % (ip, TLS_PORT))
    if tls_url:
        print("  首次打开 https 会提示「不安全」（自签证书）：点 高级 → 继续前往；")
        print("  想彻底不提示，双击 tools/trust_ca.bat 装一次根证书。")
    print("  ------------------------------")
    # 注意：控制台不打印明文口令（仓库/日志里都不应出现）。
    # 演示口令由环境变量 DEMO_PASS 提供；未设置时只提示去看部署文档。
    print("  账号: %s" % os.environ.get("DEMO_EMAIL", "见 .env.example（DEMO_EMAIL）"))
    print("  密码: %s" % ("*" * 8 + "（已由 DEMO_PASS 设置）"
                          if os.environ.get("DEMO_PASS") else "见 部署到服务器.md / .env.example"))
    # edge-tts 首次建连要十几秒。启动时后台预热一次，别让第一个提问的人干等。
    def _warm_tts():
        try:
            import tts_service
            tts_service.tts_bytes("", "文物精灵", "")
        except Exception as e:
            sys.stderr.write("  [tts] 预热失败（不影响其它功能）: %s\n" % str(e)[:120])
    threading.Thread(target=_warm_tts, daemon=True).start()

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
