# -*- coding: utf-8 -*-
"""文物精灵 · 真 MCP Server：JSON-RPC 2.0 + SSE 双传输

实现 MCP 2024-11-05 与 2025-03-26 两套传输，客户端用哪一种都能握手成功：

  旧版 HTTP+SSE (2024-11-05)
      GET  /mcp/sse                      → text/event-stream
          第一条事件 event: endpoint，data 指向 /mcp/messages?sessionId=…
          后续事件 event: message，data 是 JSON-RPC 响应
      POST /mcp/messages?sessionId=…    → 202，响应从 SSE 推回

  Streamable HTTP (2025-03-26)
      POST /mcp                         → JSON-RPC 响应（支持单条与批量）
      GET  /mcp                         → 服务端 → 客户端的 SSE 监听流
      DELETE /mcp                      → 关闭会话
      会话号走 Mcp-Session-Id 头

支持的方法：
  initialize / notifications/initialized / ping
  tools/list / tools/call
  resources/list / resources/templates/list / resources/read
  prompts/list / prompts/get

三个设计约束：
  · 通知（无 id）绝不能回响应体，只能 202；
  · 工具真在服务端执行（mcp/tools_impl.py），不是转发前端结果；
  · 所有写操作都不开放，工具全为 read scope。
"""
import json
import os
import queue
import sys
import threading
import time
import uuid
from urllib.parse import parse_qs, urlparse

_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

import tools_impl  # noqa: E402

REGISTRY_PATH = os.path.join(os.path.dirname(_ROOT), "prompts", "registry.json")

PROTOCOL = "2025-03-26"
FALLBACK_PROTOCOLS = ["2025-03-26", "2025-06-18", "2024-11-05"]
SERVER_INFO = {"name": "wenwujingling-relic-mcp", "version": "1.0.0"}

# ---------------------------------------------------------------- 会话
_LOCK = threading.Lock()
_SESSIONS = {}          # sid -> {"q": Queue, "alive": bool, "created": ts, "client": str}


def new_session(client=""):
    sid = uuid.uuid4().hex
    with _LOCK:
        _SESSIONS[sid] = {"q": queue.Queue(), "alive": True,
                          "created": time.time(), "client": client}
    return sid


def get_session(sid):
    with _LOCK:
        return _SESSIONS.get(sid)


def drop_session(sid):
    with _LOCK:
        s = _SESSIONS.pop(sid, None)
    if s:
        s["alive"] = False


def session_count():
    with _LOCK:
        return len(_SESSIONS)


# ---------------------------------------------------------------- 注册表
def _registry():
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


def resources():
    return [
        {"uri": "relic://catalog", "name": "站内馆藏目录",
         "description": "全部 74 件文物的 id / 名称 / 年代 / 材质",
         "mimeType": "application/json"},
        {"uri": "relic://kb/stats", "name": "知识索引统计",
         "description": "片段数、词表规模、双路召回配置", "mimeType": "application/json"},
        {"uri": "relic://prompts/current", "name": "当前生效的提示词版本",
         "description": "版本号、特性开关、变更说明", "mimeType": "application/json"},
    ]


def read_resource(uri):
    if uri == "relic://catalog":
        data = [{"id": r["id"], "name": r["name"], "era": r["era"],
                 "material": r["primary"]} for r in tools_impl.KB["relics"]]
    elif uri == "relic://kb/stats":
        from hybrid_rag import get as rag_get
        data = {"index": tools_impl.KB["counts"], "rag": rag_get().stats,
                "tools": len(tools_impl.TOOLS)}
    elif uri == "relic://prompts/current":
        reg = _registry()
        data = {"current": reg["current"],
                "variant": next(v for v in reg["variants"] if v["id"] == reg["current"])}
    elif uri.startswith("relic://kb/doc/"):
        doc_id = uri.rsplit("/", 1)[-1]
        doc = next((d for d in tools_impl.KB["documents"] if d["id"] == doc_id), None)
        if not doc:
            raise KeyError("没有这份档案：" + doc_id)
        data = doc
    else:
        raise KeyError("未知资源：" + uri)
    return json.dumps(data, ensure_ascii=False, indent=2)


def prompts(registry=None):
    reg = registry or _registry()
    out = [
        {"name": "answer_relic", "description": "文物问答主系统提示（按版本取用）",
         "arguments": [{"name": "version", "description": "版本 id，留空取当前版", "required": False}]},
        {"name": "plan", "description": "Agent 显式规划阶段的提示词", "arguments": []},
        {"name": "reflect", "description": "Agent 反思阶段的提示词", "arguments": []},
        {"name": "ablation_matrix", "description": "消融实验配置矩阵", "arguments": []},
    ]
    return out


def get_prompt(name, args):
    reg = _registry()
    if name == "answer_relic":
        vid = (args or {}).get("version") or reg["current"]
        v = next((x for x in reg["variants"] if x["id"] == vid), None)
        if not v:
            raise KeyError("没有这个版本：" + str(vid))
        text = v["system"] + "\n\n[prompt_version=" + v["id"] + "]"
    elif name in ("plan", "reflect"):
        v = next(x for x in reg["variants"] if x["id"] == reg["current"])
        text = v[name] or "（该版本未启用此阶段）"
    elif name == "ablation_matrix":
        text = json.dumps({"current": reg["current"], "ablations": reg["ablations"]},
                          ensure_ascii=False, indent=2)
    else:
        raise KeyError("未知提示词：" + str(name))
    return {"description": name, "messages": [{"role": "user", "content": {"type": "text", "text": text}}]}


# ---------------------------------------------------------------- JSON-RPC
def _err(code, msg, rid=None, data=None):
    e = {"jsonrpc": "2.0", "error": {"code": code, "message": msg}, "id": rid}
    if data is not None:
        e["error"]["data"] = data
    return e


def _ok(result, rid):
    return {"jsonrpc": "2.0", "result": result, "id": rid}


def dispatch(req, sid=None):
    """处理一条 JSON-RPC 请求；通知返回 None。"""
    if not isinstance(req, dict):
        return _err(-32600, "请求必须是对象", None)
    rid = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}
    is_notification = "id" not in req

    if is_notification:
        # notifications/initialized 只要记下会话已就绪，绝不回包
        return None

    if method == "initialize":
        asked = params.get("protocolVersion") or PROTOCOL
        ver = asked if asked in FALLBACK_PROTOCOLS else PROTOCOL
        return _ok({
            "protocolVersion": ver,
            "capabilities": {
                "tools": {"listChanged": False},
                "resources": {"subscribe": False, "listChanged": False},
                "prompts": {"listChanged": False},
                "logging": {},
            },
            "serverInfo": SERVER_INFO,
            "instructions": "文物精灵站内知识 MCP 服务。工具全部只读；hybrid_search 返回带 [n] 角标的双路召回结果，回答时请保留角标以便溯源。",
        }, rid)

    if method == "ping":
        return _ok({}, rid)

    if method == "tools/list":
        return _ok({"tools": tools_impl.definitions()}, rid)

    if method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        r = tools_impl.call(name, args)
        payload = {"ok": r["ok"]}
        if r["ok"]:
            payload["data"] = r["data"]
            if r.get("note"):
                payload["note"] = r["note"]
        else:
            payload["error"] = r["error"]
        return _ok({
            "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
            "structuredContent": payload,
            "isError": not r["ok"],
        }, rid)

    if method == "resources/list":
        return _ok({"resources": resources()}, rid)

    if method == "resources/templates/list":
        return _ok({"resourceTemplates": [{
            "uriTemplate": "relic://kb/doc/{doc_id}",
            "name": "单条档案原文", "description": "按 doc_id 取片段全文，用于核对引用",
            "mimeType": "application/json",
        }]}, rid)

    if method == "resources/read":
        try:
            text = read_resource(params.get("uri", ""))
            return _ok({"contents": [{"uri": params.get("uri"), "mimeType": "application/json",
                                      "text": text}]}, rid)
        except KeyError as e:
            return _err(-32602, str(e), rid)

    if method == "prompts/list":
        return _ok({"prompts": prompts()}, rid)

    if method == "prompts/get":
        try:
            return _ok(get_prompt(params.get("name", ""), params.get("arguments")), rid)
        except KeyError as e:
            return _err(-32602, str(e), rid)

    if method == "logging/setLevel":
        return _ok({}, rid)

    return _err(-32601, "没有这个方法：" + str(method), rid)


def handle_payload(raw, sid=None):
    """单条或批量；返回 (响应对象或 None, 是否为通知)。"""
    try:
        payload = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except Exception:
        return _err(-32700, "JSON 解析失败", None), False

    if isinstance(payload, list):
        outs = [dispatch(x, sid) for x in payload]
        outs = [x for x in outs if x is not None]
        return (outs or None), not outs
    out = dispatch(payload, sid)
    if out is None:
        return None, True
    return out, False


# ---------------------------------------------------------------- HTTP 传输
def _cors(h):
    h.send_header("Access-Control-Allow-Origin", h.headers.get("Origin") or "*")
    h.send_header("Access-Control-Allow-Credentials", "true")
    h.send_header("Access-Control-Allow-Headers",
                  "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID")
    h.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    h.send_header("Access-Control-Expose-Headers", "Mcp-Session-Id")


def _send_json(h, code, obj, sid=None, extra_headers=True):
    data = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode("utf-8")
    h.send_response(code)
    if obj is not None:
        h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(data)))
    h.send_header("Cache-Control", "no-store")
    if sid:
        h.send_header("Mcp-Session-Id", sid)
    if extra_headers:
        _cors(h)
    h.end_headers()
    if data:
        h.wfile.write(data)


def handle_options(h, path):
    if not path.startswith("/mcp"):
        return False
    h.send_response(204)
    h.send_header("Content-Length", "0")
    _cors(h)
    h.end_headers()
    return True


def handle_get(h, path, full_path):
    if path not in ("/mcp/sse", "/mcp"):
        return False
    u = urlparse(full_path)
    sid = (parse_qs(u.query).get("sessionId") or [None])[0]
    if not sid:
        sid = h.headers.get("Mcp-Session-Id") or new_session()
    if not get_session(sid):
        sid = new_session()
    sess = get_session(sid)

    # 这个响应单独用 HTTP/1.1 + chunked，其它静态响应不受影响
    h.protocol_version = "HTTP/1.1"
    h.send_response(200)
    h.send_header("Content-Type", "text/event-stream; charset=utf-8")
    h.send_header("Cache-Control", "no-cache, no-transform")
    h.send_header("Connection", "keep-alive")
    h.send_header("X-Accel-Buffering", "no")
    h.send_header("Transfer-Encoding", "chunked")
    h.send_header("Mcp-Session-Id", sid)
    _cors(h)
    h.end_headers()

    def chunk(s):
        b = s.encode("utf-8") if isinstance(s, str) else s
        h.wfile.write(("%x\r\n" % len(b)).encode("ascii") + b + b"\r\n")
        h.wfile.flush()

    try:
        if path == "/mcp/sse":
            # 旧版传输：第一条必须是 endpoint 事件，告诉客户端往哪儿 POST
            chunk("event: endpoint\ndata: /mcp/messages?sessionId=%s\n\n" % sid)
        else:
            chunk(": streamable-http listening\n\n")

        last = time.time()
        while sess["alive"]:
            try:
                msg = sess["q"].get(timeout=1.0)
                chunk("event: message\ndata: " + json.dumps(msg, ensure_ascii=False) + "\n\n")
            except queue.Empty:
                if time.time() - last > 15:
                    chunk(": keepalive\n\n")
                    last = time.time()
                continue
        chunk("")
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass
    finally:
        drop_session(sid)
    return True


def handle_post(h, path, full_path, raw):
    if path not in ("/mcp", "/mcp/messages"):
        return False
    u = urlparse(full_path)
    sid = (parse_qs(u.query).get("sessionId") or [None])[0] or h.headers.get("Mcp-Session-Id")

    resp, is_notification = handle_payload(raw, sid)

    # initialize 要开新会话并把 id 放回响应头
    try:
        one = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception:
        one = {}
    if isinstance(one, dict) and one.get("method") == "initialize" and not sid:
        sid = new_session((one.get("params") or {}).get("clientInfo", {}).get("name", ""))
    if not sid:
        sid = new_session()

    if path == "/mcp/messages":
        # 旧版 SSE 传输：响应走 SSE 队列，这里只回 202
        sess = get_session(sid)
        if sess and resp is not None:
            if isinstance(resp, list):
                for r in resp:
                    sess["q"].put(r)
            else:
                sess["q"].put(resp)
        h.send_response(202)
        h.send_header("Content-Length", "0")
        h.send_header("Mcp-Session-Id", sid)
        _cors(h)
        h.end_headers()
        return True

    # Streamable HTTP：通知回 202，其余回 JSON
    if resp is None:
        h.send_response(202)
        h.send_header("Content-Length", "0")
        h.send_header("Mcp-Session-Id", sid)
        _cors(h)
        h.end_headers()
    else:
        _send_json(h, 200, resp, sid)
    return True


def handle_delete(h, path):
    if path != "/mcp":
        return False
    drop_session(h.headers.get("Mcp-Session-Id") or "")
    _send_json(h, 200, {"ok": True, "sessions": session_count()}, None)
    return True
