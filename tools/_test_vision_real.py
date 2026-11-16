# -*- coding: utf-8 -*-
"""用真实照片验证「AI 认文物 → 对上图鉴」这条链路。
roster 从 js/data.js 里的 SPIRITS 段直接抠，与线上运行时的名单一致。
"""
import base64
import io
import json
import re
import sys
import urllib.request

from PIL import Image

BASE = "https://123.57.21.18"
MODEL = "glm-5.3-flash"
PRIMARY = ["bronze", "ceramic", "jade", "gold", "stone", "lacquer", "textile", "wood", "painting", "glass"]


def roster_from_data(path="js/data.js"):
    src = open(path, encoding="utf-8").read()
    i = src.find("SPIRITS")
    seg = src[i:]
    names = []
    for m in re.finditer(r'^\s{2}(\w+):\s*\{\s*\n\s*id:\s*"\1",\s*\n\s*name:\s*"([^"]+)"', seg, re.M):
        names.append(m.group(2))
    return names


PROMPT_TPL = """你在帮一个「文博打卡」小程序认文物。看图，按「先看、再判」两步作答，只输出一行 JSON，不要解释、不要代码块。

第一步「看」：look 里写你眼睛实际看到的——材质（铁/青铜/白玉/陶瓷/木质…）、造型、单体还是成套、有没有铭文或底座、体量感。
第二步「判」：它是不是下面清单里的某一件？只有当你有把握认出它就是那件著名文物时，才填 match。

【图鉴已有清单】
{roster}

【输出】
{{"look":"","name":"","match":"","era":"如 唐/北宋/西汉","material":"如 铁/青铜/青瓷/汉白玉","primary":"{primary} 里选一个","confidence":0,"real":true}}

【硬规则】
1. match 非空 ⇒ name 必须与 match 里的原名一字不差。
2. match 为空 ⇒ name 不许从清单里挑一个凑数，要用你自己看到的说法。
3. 材质以眼睛为准，不许与 name 自相矛盾（说白玉就不能同时说是铁铸）。
4. real 为 false 表示图里不是文物（风景、人、宠物、食物、截图界面、表情包）。
5. confidence 是你真觉得「这就是清单里那件」的把握，0~100；拿不准就写低。"""


def to_data_url(path, maxpx=760):
    im = Image.open(path).convert("RGB")
    im.thumbnail((maxpx, maxpx))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def ask(durl, roster):
    prompt = PROMPT_TPL.format(roster="、".join(roster), primary="/".join(PRIMARY))
    body = {"model": MODEL, "stream": True, "temperature": 0,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": durl}}]}]}
    req = urllib.request.Request(BASE + "/api/llm", data=json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    resp = urllib.request.urlopen(req, timeout=120)
    text = ""
    for line in resp:
        line = line.decode("utf-8", "ignore").strip()
        if not line.startswith("data:"):
            continue
        p = line[5:].strip()
        if p == "[DONE]":
            break
        try:
            o = json.loads(p)
            d = (o.get("choices") or [{}])[0].get("delta") or {}
            if d.get("content"):
                text += d["content"]
        except Exception:
            pass
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return {"_raw": text[:300]}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"_raw": text[:300]}


if __name__ == "__main__":
    roster = roster_from_data()
    print("roster 条数:", len(roster), "| 前5:", roster[:5])
    for p in sys.argv[1:]:
        try:
            r = ask(to_data_url(p), roster)
        except Exception as e:
            r = {"_err": "%s: %s" % (type(e).__name__, e)}
        print("\n图片:", p)
        print("结果:", json.dumps(r, ensure_ascii=False))
        nm = str(r.get("match") or r.get("name") or "")
        hits = [x for x in roster if nm and (nm in x or x in nm)]
        print("对上清单:", hits[:3] or "无")
