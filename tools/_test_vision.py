# -*- coding: utf-8 -*-
"""试云端视觉模型对「站内立绘 / 站外照片」的识别准确率。
用线上 /api/llm 同一条链路（服务端转发，浏览器不持钥匙）。
"""
import base64
import io
import json
import re
import sys
import urllib.request

from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://123.57.21.18"
MODEL = "glm-5.3-flash"
PRIMARY = "bronze|ceramic|jade|gold|stone|lacquer|textile|wood|painting|glass"

ROSTER = [
    "沧州铁狮子", "长信宫灯", "青花缠枝莲纹梅瓶", "金缕玉衣", "错金银四龙四凤铜方案",
    "中山王铁足铜鼎", "散氏盘", "满城汉墓金缕玉衣", "定窑白釉孩儿枕", "磁州窑白地黑花梅瓶",
]

PROMPT_TPL = """你在帮一个「文博打卡」小程序认文物。看这张图，判断它是什么，只输出一行 JSON，不要任何解释、不要代码块。

【图鉴已有清单】图里如果是其中一件，name 必须从这份清单里原样照抄（一个字都不改，不加朝代、不加材质），并把 match 填成同一个名字；
如果不是其中任何一件，name 用最通行的名字（例：灰陶双耳罐），match 填空字符串。
{roster}

【输出】
{{"name":"","match":"","era":"如 唐/北宋/西汉","material":"如 青铜/青瓷/汉白玉","primary":"{primary} 里选一个","confidence":0,"real":true}}
real 为 false 表示图里不是文物（风景、人、宠物、食物、截图界面、表情包）。
只认你真有把握的：拿不准就把 confidence 写低一点，不要硬把一件东西说成清单里的某一只。"""


def to_data_url(path, maxpx=760):
    im = Image.open(path).convert("RGB")
    im.thumbnail((maxpx, maxpx))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def ask(durl, roster):
    prompt = PROMPT_TPL.format(roster="、".join(roster), primary=PRIMARY)
    body = {
        "model": MODEL, "stream": True, "temperature": 0,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": durl}},
        ]}],
    }
    req = urllib.request.Request(BASE + "/api/llm", data=json.dumps(body).encode(), method="POST")
    req.add_header("Content-Type", "application/json")
    resp = urllib.request.urlopen(req, timeout=90)
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
        return {"_raw": text[:200]}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"_raw": text[:200]}


if __name__ == "__main__":
    for p in sys.argv[2:]:
        try:
            r = ask(to_data_url(p), ROSTER)
        except Exception as e:
            r = {"_err": "%s: %s" % (type(e).__name__, e)}
        print(p, "=>", json.dumps(r, ensure_ascii=False))
