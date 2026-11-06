# -*- coding: utf-8 -*-
"""MCP Server 协议自检

跑法：python tools/check_mcp.py [端口，默认 8901]
覆盖两套传输、全部协议方法、错误码、工具真执行、双路召回与引用溯源。
输出可直接贴进技术文档的「协议一致性验证」一节。
"""
import http.client
import json
import sys
import threading
import time
import urllib.error
import urllib.request

HOST, PORT = "127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8901
OP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
BASE = "http://%s:%d" % (HOST, PORT)

PASS, TOTAL = 0, 0


def chk(name, cond, detail=""):
    global PASS, TOTAL
    TOTAL += 1
    if cond:
        PASS += 1
        print("  OK   %s%s" % (name, ("  " + str(detail)) if detail else ""))
    else:
        print("  FAIL %s  %s" % (name, detail))


def rpc(method, params=None, rid=1, sid=None, extra=None):
    body = {"jsonrpc": "2.0", "method": method, "id": rid}
    if params is not None:
        body["params"] = params
    h = {"Content-Type": "application/json",
         "Accept": "application/json, text/event-stream"}
    if sid:
        h["Mcp-Session-Id"] = sid
    if extra:
        h.update(extra)
    req = urllib.request.Request(BASE + "/mcp",
                                 data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                                 headers=h, method="POST")
    r = OP.open(req, timeout=30)
    raw = r.read()
    return r.status, dict(r.headers), (json.loads(raw) if raw else None)


def post_raw(url, obj, sid=None):
    h = {"Content-Type": "application/json"}
    if sid:
        h["Mcp-Session-Id"] = sid
    req = urllib.request.Request(BASE + url,
                                 data=json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                                 headers=h, method="POST")
    try:
        r = OP.open(req, timeout=30)
        raw = r.read()
        return r.status, dict(r.headers), (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), None


print("=" * 66)
print(" MCP Server 协议自检  目标 %s" % BASE)
print("=" * 66)

# ---------- 1. 握手 ----------
print("\n[1] initialize / 会话")
st, hd, init = rpc("initialize", {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {"name": "wenwujingling-web", "version": "1.0"},
}, extra={"MCP-Protocol-Version": "2025-03-26"})
chk("HTTP 200", st == 200, st)
res = (init or {}).get("result", {})
chk("jsonrpc 2.0 + id 回显", (init or {}).get("jsonrpc") == "2.0" and (init or {}).get("id") == 1)
chk("协议版本协商", res.get("protocolVersion") == "2025-03-26", res.get("protocolVersion"))
chk("capabilities 含 tools/resources/prompts",
    all(k in res.get("capabilities", {}) for k in ("tools", "resources", "prompts")))
chk("serverInfo", res.get("serverInfo", {}).get("name") == "wenwujingling-relic-mcp")
SID = hd.get("Mcp-Session-Id") or hd.get("mcp-session-id")
chk("返回 Mcp-Session-Id", bool(SID), SID)

print("\n[2] 通知语义")
req = urllib.request.Request(BASE + "/mcp",
                             data=json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}).encode(),
                             headers={"Content-Type": "application/json", "Mcp-Session-Id": SID or ""},
                             method="POST")
r = OP.open(req, timeout=20)
chk("notifications/initialized → 202 且无响应体", r.status == 202 and r.read() == b"", r.status)

print("\n[3] tools/list（MCP 标准形状）")
st, _, tl = rpc("tools/list", {}, rid=2, sid=SID)
tools = (tl or {}).get("result", {}).get("tools", [])
chk("工具数 >= 8", len(tools) >= 8, len(tools))
chk("每个工具都有 name/description/inputSchema",
    all(all(k in t for k in ("name", "description", "inputSchema")) for t in tools))
names = [t["name"] for t in tools]
chk("含 hybrid_search 与 verify_citation",
    "hybrid_search" in names and "verify_citation" in names)
chk("inputSchema 是 JSON Schema object",
    all(t["inputSchema"].get("type") == "object" for t in tools))
print("       工具清单:", ", ".join(names))

print("\n[4] tools/call（服务端真执行，不是转发前端）")
st, _, tc = rpc("tools/call", {"name": "hybrid_search", "arguments": {
    "query": "汉代人怎么让屋子不被烟熏黑", "top_k": 4}}, rid=3, sid=SID)
result = (tc or {}).get("result", {})
chk("content 是 MCP text 块", isinstance(result.get("content"), list) and
    result["content"][0]["type"] == "text")
chk("isError = false", result.get("isError") is False)
structured = result.get("structuredContent", {})
data = structured.get("data", {})
hits = data.get("hits", [])
chk("双路都产出了候选", data.get("pool", {}).get("bm25", 0) > 0 and
    data.get("pool", {}).get("dense", 0) > 0, data.get("pool"))
chk("RRF 融合", data.get("fusion", "").startswith("RRF"), data.get("fusion"))
chk("每条命中带 [n] 角标与 doc_id",
    all("ref" in h and "doc_id" in h for h in hits), len(hits))
chk("两路同时命中 >= 1", data.get("two_channel_hits", 0) >= 1,
    data.get("two_channel_hits"))
chk("语义路确实找到排烟结构相关档案",
    any("烟" in h.get("snippet", "") for h in hits))
if hits:
    print("       Top1:", hits[0]["ref"], hits[0]["title"], "·", hits[0]["field_cn"],
          "| 路=", "+".join(hits[0]["channels"]))

st, _, tc2 = rpc("tools/call", {"name": "get_relic", "arguments": {"name": "长信宫灯"}}, rid=4, sid=SID)
d2 = (tc2 or {}).get("result", {}).get("structuredContent", {}).get("data", {})
chk("get_relic 命中档案", d2.get("found") is True and
    d2.get("relic", {}).get("name") == "长信宫灯", d2.get("relic", {}).get("name"))

st, _, tc3 = rpc("tools/call", {"name": "search_relic", "arguments": {"limit": "99"}}, rid=5, sid=SID)
sc3 = (tc3 or {}).get("result", {}).get("structuredContent", {})
chk("缺必填参数时返回可自我修正的错误", sc3.get("ok") is False and
    "keyword" in sc3.get("error", ""), sc3.get("error"))

st, _, tc4 = rpc("tools/call", {"name": "verify_citation", "arguments": {
    "answer": "烟道在右臂[1]，另见[9]。", "refs": ["[1]", "[2]"]}}, rid=6, sid=SID)
v4 = (tc4 or {}).get("result", {}).get("structuredContent", {}).get("data", {})
chk("识别悬空引用", v4.get("dangling") == [9], v4)

print("\n[5] resources / prompts")
st, _, rl = rpc("resources/list", {}, rid=7, sid=SID)
rs = (rl or {}).get("result", {}).get("resources", [])
chk("资源清单非空并带 uri", len(rs) >= 3 and all("uri" in x for x in rs), len(rs))
st, _, rr = rpc("resources/read", {"uri": "relic://kb/stats"}, rid=8, sid=SID)
txt = (rr or {}).get("result", {}).get("contents", [{}])[0].get("text", "")
chk("读资源返回索引统计 JSON", '"rag"' in txt and '"documents"' in txt)
st, _, pl = rpc("prompts/list", {}, rid=9, sid=SID)
ps = (pl or {}).get("result", {}).get("prompts", [])
chk("提示词清单含 answer_relic/plan/reflect",
    {"answer_relic", "plan", "reflect"}.issubset({x["name"] for x in ps}))
st, _, pg = rpc("prompts/get", {"name": "answer_relic"}, rid=10, sid=SID)
ptxt = (pg or {}).get("result", {}).get("messages", [{}])[0].get("content", {}).get("text", "")
chk("prompts/get 带 prompt_version", "prompt_version=v4.0-full" in ptxt)

print("\n[6] JSON-RPC 错误码 / 批量 / ping")
st, _, bad = rpc("no_such_method", {}, rid=11, sid=SID)
chk("未知方法 → -32601", (bad or {}).get("error", {}).get("code") == -32601)
req = urllib.request.Request(BASE + "/mcp", data=b"{not json",
                             headers={"Content-Type": "application/json"}, method="POST")
r = OP.open(req, timeout=20)
chk("非法 JSON → -32700", json.loads(r.read()).get("error", {}).get("code") == -32700)
batch = [
    {"jsonrpc": "2.0", "method": "ping", "id": 21},
    {"jsonrpc": "2.0", "method": "tools/list", "id": 22},
    {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}},
]
st, _, br = post_raw("/mcp", batch, SID)
chk("批量请求返回 2 条响应（通知不回包）", isinstance(br, list) and len(br) == 2,
    len(br) if isinstance(br, list) else type(br))

print("\n[7] 旧版 HTTP+SSE 传输（2024-11-05）")
conn = http.client.HTTPConnection(HOST, PORT, timeout=25)
conn.request("GET", "/mcp/sse")
resp = conn.getresponse()
chk("GET /mcp/sse → 200 text/event-stream", resp.status == 200 and
    "text/event-stream" in resp.getheader("Content-Type", ""), resp.status)
sse_sid = resp.getheader("Mcp-Session-Id")
first = resp.readline().decode("utf-8", "ignore")
endpoint = resp.readline().decode("utf-8", "ignore").strip()
chk("首帧是 endpoint 事件", first.strip() == "event: endpoint" and
    "/mcp/messages?sessionId=" in endpoint, endpoint)
sid2 = endpoint.split("sessionId=")[-1] if "sessionId=" in endpoint else sse_sid

st, _, _ = post_raw("/mcp/messages?sessionId=" + sid2,
                    {"jsonrpc": "2.0", "method": "tools/call", "id": 31,
                     "params": {"name": "lookup_craft", "arguments": {"name": "失蜡法"}}})
chk("POST /mcp/messages → 202（响应走 SSE）", st == 202, st)

lines = []
def read_sse():
    try:
        while True:
            ln = resp.readline().decode("utf-8", "ignore")
            if not ln:
                break
            lines.append(ln.strip())
            if len(lines) > 12:
                break
    except Exception:
        pass
th = threading.Thread(target=read_sse, daemon=True)
th.start()
time.sleep(2.5)
msg = next((l for l in lines if l.startswith("data:") and "失蜡法" in l), "")
chk("SSE 推回 message 事件且含工具真实结果", bool(msg), msg[:110])
conn.close()

print("\n[8] 直连接口")
rq = urllib.request.Request(BASE + "/api/rag",
                            data=json.dumps({"query": "长信宫灯排烟", "k": 3}).encode(),
                            headers={"Content-Type": "application/json"}, method="POST")
r = OP.open(rq, timeout=30)
rag = json.loads(r.read())
chk("/api/rag 返回 citations", rag.get("ok") is True and len(rag.get("citations", [])) == 3,
    len(rag.get("citations", [])))
pr = OP.open(BASE + "/api/prompt", timeout=20)
reg = json.loads(pr.read())
chk("/api/prompt 返回版本库与消融矩阵",
    reg.get("current") == "v4.0-full" and len(reg.get("ablations", [])) >= 7,
    len(reg.get("ablations", [])))

print("\n[9] DELETE 关闭会话")
req = urllib.request.Request(BASE + "/mcp", headers={"Mcp-Session-Id": SID or ""}, method="DELETE")
r = OP.open(req, timeout=20)
chk("DELETE /mcp → 200", r.status == 200 and json.loads(r.read()).get("ok") is True)

print("\n" + "=" * 66)
print(" 结果 %d/%d   %s" % (PASS, TOTAL, "全部通过" if PASS == TOTAL else "有失败项"))
print("=" * 66)
sys.exit(0 if PASS == TOTAL else 1)
