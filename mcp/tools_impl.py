# -*- coding: utf-8 -*-
"""文物精灵 · MCP 工具实现（服务端真执行）

这一层不依赖前端：所有工具都在 Python 侧读 mcp/kb_index.json 独立算出来。
MCP 的价值正在于此 —— 换任何客户端（网页、CLI、别的 Agent）连上来，
拿到的都是同一份工具、同一份事实。

工具定义沿用 MCP 字段命名 name / description / inputSchema，
与 js/tools.js 一一对应，另外补充两个新的：
    hybrid_search    双路召回 + 引用溯源
    verify_citation  回答里的角标能否追回到档案
"""
import json
import os
import re
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from hybrid_rag import get as rag_get, HybridRAG, FIELD_CN  # noqa: E402

with open(os.path.join(_ROOT, "kb_index.json"), encoding="utf-8") as _f:
    KB = json.load(_f)

RELICS = {r["id"]: r for r in KB["relics"]}
BY_NAME = {}
for _r in KB["relics"]:
    for _k in (_r["name"], _r["alias"], _r["relicName"], _r["id"]):
        if _k:
            BY_NAME[str(_k).lower()] = _r


def clip(s, n):
    s = str(s if s is not None else "")
    return s if len(s) <= n else s[:n] + "…"


def clean_name(s):
    s = re.sub(r"^[\s，,。、]+|[\s，,。、]+$", "", str(s or ""))
    s = re.sub(r"^(请|帮我|帮忙|给我|我想|想要|麻烦)?(查|找|搜|看看|了解|介绍)(一下|一查)?", "", s)
    s = re.sub(r"(的|之)?(资料|信息|介绍|来历|详情|档案)$", "", s)
    return s.strip()


def find_relic(name):
    q = clean_name(name).lower()
    if not q:
        return None
    if q in BY_NAME:
        return BY_NAME[q]
    best, blen = None, 0
    for r in KB["relics"]:
        for c in (r["name"], r["alias"], r["relicName"]):
            c = str(c or "").lower()
            if c and (q in c or c in q) and len(c) > blen:
                best, blen = r, len(c)
    return best


def spirit_brief(r):
    return {
        "id": r["id"], "name": r["name"], "alias": r["alias"], "era": r["era"],
        "material": r["primary"], "use": r["secondary"],
        "intro": clip(r["intro"], 220),
        "comic": [clip(x, 160) for x in r["comic"][:3]],
        "qa": [{"keys": k["keys"][:4], "a": clip(k["a"], 200)} for k in r["knowledge"][:6]],
    }


# ------------------------------------------------------------------ 工具定义
TOOLS = [
    {
        "name": "search_relic", "title": "站内文物检索（BM25 关键词路）", "scope": "read",
        "description": "在站内知识库做 BM25 全文检索，返回最相关的原文片段。"
                       "适合实体名、朝代、术语这类需要精确字面的问题。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "keyword": {"type": "string", "description": "检索词，不要写整句话"},
                "limit": {"type": "integer", "description": "返回条数，默认 5，最多 8",
                          "minimum": 1, "maximum": 8},
            },
            "required": ["keyword"],
        },
        "run": lambda a: _search_relic(a),
    },
    {
        "name": "hybrid_search", "title": "双路召回检索（BM25 + LSA 语义）", "scope": "read",
        "description": "同时走关键词路和语义路，用 RRF 融合排名，每条命中都带 [n] 角标与出处"
                       "（档案编号 / 文物名 / 字段 / 原文）。问法与档案措辞不一致时用它，"
                       "回答里引用角标即可溯源。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "用户的问题或检索意图，可以是一整句话"},
                "top_k": {"type": "integer", "description": "返回条数，默认 5，最多 10",
                          "minimum": 1, "maximum": 10},
                "sid": {"type": "string", "description": "只看某件文物的档案，可留空"},
            },
            "required": ["query"],
        },
        "run": lambda a: _hybrid(a),
    },
    {
        "name": "get_relic", "title": "取文物档案", "scope": "read",
        "description": "按名称取一件文物的完整站内档案：年代、材质、用途、简介、看点、常见问答。",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "文物名称，可用别名"}},
            "required": ["name"],
        },
        "run": lambda a: _get_relic(a),
    },
    {
        "name": "compare_relics", "title": "文物对比", "scope": "read",
        "description": "对比两件文物，返回站内整理好的对比结论：谁更早、谁更巧、差在哪。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "a": {"type": "string", "description": "第一件文物名称"},
                "b": {"type": "string", "description": "第二件文物名称"},
            },
            "required": ["a", "b"],
        },
        "run": lambda a: _compare(a),
    },
    {
        "name": "lookup_craft", "title": "查工艺", "scope": "read",
        "description": "查中国传统工艺词条，返回释义、工序要点、代表作与辨析。",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "工艺名称，如「失蜡法」"}},
            "required": ["name"],
        },
        "run": lambda a: _craft(a),
    },
    {
        "name": "check_misconception", "title": "易混淆辨析", "scope": "read",
        "description": "查一件文物最容易被认成什么、两者差在哪。",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "待辨析的文物名称"}},
            "required": ["name"],
        },
        "run": lambda a: _confuse(a),
    },
    {
        "name": "list_collection", "title": "浏览馆藏", "scope": "read",
        "description": "按材质或朝代列出站内收录的文物名单。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "material": {"type": "string", "description": "材质筛选，如「青铜器」，不填不限"},
                "era": {"type": "string", "description": "朝代筛选，如「西汉」，不填不限"},
                "limit": {"type": "integer", "description": "最多几件，默认 20",
                          "minimum": 1, "maximum": 40},
            },
            "required": [],
        },
        "run": lambda a: _list(a),
    },
    {
        "name": "verify_citation", "title": "引用溯源核验", "scope": "read",
        "description": "检查一段回答里的 [1][2] 角标是否都能追回到本次检索给出的档案，"
                       "返回有效引用、悬空引用与覆盖率。用于安全自检。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "answer": {"type": "string", "description": "待核验的回答文本"},
                "refs": {"type": "array", "items": {"type": "string"},
                         "description": "本次检索给出的角标列表，如 [\"[1]\",\"[2]\"]"},
            },
            "required": ["answer", "refs"],
        },
        "run": lambda a: _verify(a),
    },
]

BY_TOOL = {t["name"]: t for t in TOOLS}


# ------------------------------------------------------------------ 实现
def _search_relic(a):
    kw = str(a.get("keyword") or "").strip()
    if not kw:
        return {"ok": False, "error": "keyword 不能为空"}
    n = max(1, min(8, int(a.get("limit") or 5)))
    rows = rag_get().c.bm25(kw, k=n)
    if not rows:
        return {"ok": True, "data": {"keyword": kw, "hits": []}, "note": "站内没检索到「%s」" % clip(kw, 20)}
    hits = []
    for i, s in rows:
        d = rag_get().c.docs[i]
        hits.append({"doc_id": d["id"], "name": d["sname"], "field": FIELD_CN.get(d["field"], d["field"]),
                     "text": clip(d["text"], 260), "score": s})
    return {"ok": True, "data": {"keyword": kw, "channel": "bm25", "hits": hits},
            "note": "命中 %d 条片段" % len(hits)}


def _hybrid(a):
    q = str(a.get("query") or "").strip()
    if not q:
        return {"ok": False, "error": "query 不能为空"}
    k = max(1, min(10, int(a.get("top_k") or 5)))
    r = rag_get().search(q, k=k, sid=(a.get("sid") or None))
    return {"ok": True, "data": r,
            "note": "双路各取候选，RRF 融合后返回 %d 条；其中 %d 条两路都命中" %
                    (len(r["hits"]), r["two_channel_hits"])}


def _get_relic(a):
    r = find_relic(a.get("name"))
    if not r:
        return {"ok": True, "data": {"found": False},
                "note": "站内档案没有收录「%s」" % clip(a.get("name"), 16)}
    return {"ok": True, "data": {"found": True, "relic": spirit_brief(r)},
            "note": "已取到「%s」的档案" % r["name"]}


def _compare(a):
    na, nb = clean_name(a.get("a")), clean_name(a.get("b"))

    def hit(name):
        out = []
        for g in KB["comparisons"]:
            if any(name in str(it.get("name", "")) or str(it.get("name", "")) in name
                   for it in g.get("items", [])):
                out.append(g)
        return out
    ha, hb = hit(na), hit(nb)
    found = next((g for g in ha if g in hb), None)
    if not found:
        return {"ok": True, "data": {"matched": False,
                                     "available": [g["title"] for g in KB["comparisons"]]},
                "note": "这两件不在预设对比组里"}
    return {"ok": True, "data": {"matched": True, "title": found["title"],
                                 "axis": found.get("axis"), "items": found.get("items"),
                                 "diff": found.get("diff"), "verdict": found.get("verdict")},
            "note": "命中对比组《%s》" % found["title"]}


def _craft(a):
    n = clean_name(a.get("name"))
    if not n:
        return {"ok": False, "error": "name 不能为空"}
    for c in KB["crafts"]:
        nm = str(c.get("n", ""))
        if nm and (n in nm or nm in n or n in str(c.get("aka", ""))):
            return {"ok": True, "data": {"found": True, "craft": c},
                    "note": "命中工艺「%s」" % nm}
    return {"ok": True, "data": {"found": False, "total": len(KB["crafts"])},
            "note": "没查到「%s」这个工艺" % clip(n, 12)}


def _confuse(a):
    n = clean_name(a.get("name"))
    for c in KB["confusions"]:
        blob = json.dumps(c, ensure_ascii=False)
        if n and n in blob:
            return {"ok": True, "data": {"found": True, "item": c},
                    "note": "已给出「%s」的辨析" % clip(n, 12)}
    return {"ok": True, "data": {"found": False},
            "note": "「%s」没有登记易混淆项" % clip(n, 12)}


def _list(a):
    mat, era = str(a.get("material") or "").strip(), str(a.get("era") or "").strip()
    lim = max(1, min(40, int(a.get("limit") or 20)))
    cn2key = {v: k for k, v in KB["attributes"]["primary"].items()}
    mat_key = ""
    for cn, key in cn2key.items():
        if mat and (mat in cn or cn in mat):
            mat_key = key
            break
    out = []
    for r in KB["relics"]:
        if mat_key and r["primary"] != mat_key:
            continue
        if era and era not in str(r.get("era", "")):
            continue
        out.append({"name": r["name"], "era": clip(r["era"], 40), "intro": clip(r["intro"], 60)})
        if len(out) >= lim:
            break
    return {"ok": True, "data": {"total": len(KB["relics"]),
                                 "filter": {"material": mat or "不限", "era": era or "不限"},
                                 "list": out},
            "note": "共收录 %d 件，本次列出 %d 件" % (len(KB["relics"]), len(out))}


def _verify(a):
    refs = a.get("refs") or []
    n = len(refs) if isinstance(refs, list) else 0
    fake = [{"ref": r} for r in refs]
    return {"ok": True,
            "data": rag_get().citation_check(a.get("answer", ""), fake),
            "note": "核验 %d 个可用角标" % n}


# ------------------------------------------------------------------ 校验与调用
def validate(tool, args):
    sc, props, req = tool["inputSchema"], tool["inputSchema"].get("properties", {}), tool["inputSchema"].get("required", [])
    out, errs = {}, []
    for k in req:
        if args.get(k) is None or str(args.get(k)).strip() == "":
            errs.append("缺少必填参数 " + k)
    for k, v in args.items():
        if k not in props or v is None or v == "":
            continue
        t = props[k].get("type")
        if t in ("integer", "number"):
            try:
                num = float(v)
            except (TypeError, ValueError):
                errs.append(k + " 应该是数字")
                continue
            lo, hi = props[k].get("minimum"), props[k].get("maximum")
            if lo is not None:
                num = max(lo, num)
            if hi is not None:
                num = min(hi, num)
            out[k] = int(round(num)) if t == "integer" else num
        elif t == "array":
            out[k] = v if isinstance(v, list) else [v]
        else:
            out[k] = str(v) if t == "string" else v
    return (errs == []), out, errs


def call(name, args, max_chars=4200):
    t = BY_TOOL.get(name)
    if not t:
        return {"ok": False, "error": "没有名为 %s 的工具，可用：%s" %
                (name, ", ".join(BY_TOOL))}
    ok, clean, errs = validate(t, args or {})
    if not ok:
        return {"ok": False, "error": "参数不对：" + "；".join(errs) + "。请修正后重试。"}
    try:
        r = t["run"](clean)
    except Exception as e:
        return {"ok": False, "error": "工具执行出错：" + str(e)[:140]}
    if not r or r.get("ok") is False:
        return {"ok": False, "error": (r or {}).get("error", "工具没有返回结果")}
    payload = r.get("data")
    s = json.dumps(payload, ensure_ascii=False)
    if len(s) > max_chars:
        payload = {"truncated": True, "preview": s[:max_chars] + "…"}
    return {"ok": True, "data": payload, "note": r.get("note", "")}


def definitions():
    """MCP tools/list 的标准形状：不暴露内部 run / scope。"""
    return [{"name": t["name"], "description": t["description"],
             "inputSchema": t["inputSchema"]} for t in TOOLS]


if __name__ == "__main__":
    print("工具数:", len(TOOLS))
    for name, args in [
        ("hybrid_search", {"query": "汉代人怎么让屋子不被烟熏黑", "top_k": 3}),
        ("get_relic", {"name": "长信宫灯"}),
        ("lookup_craft", {"name": "失蜡法"}),
        ("verify_citation", {"answer": "长信宫灯的烟道在宫女右臂[1]，见[9]。", "refs": ["[1]", "[2]"]}),
    ]:
        r = call(name, args)
        print("\n%s -> ok=%s note=%s" % (name, r["ok"], r.get("note", r.get("error"))))
        print("   ", json.dumps(r.get("data"), ensure_ascii=False)[:420])
