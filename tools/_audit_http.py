# -*- coding: utf-8 -*-
"""线上静态资源 HTTP 全量巡检：逐文件请求，统计 404 / 非 200。"""
import os
import re
import sys
import urllib3

import requests

urllib3.disable_warnings()

BASE = "https://123.57.21.18/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def spirit_ids():
    import json
    import subprocess
    js = (
        "const fs=require('fs'),vm=require('vm');"
        "const ctx={console,window:{},document:{}};vm.createContext(ctx);"
        "vm.runInContext(fs.readFileSync('js/data.js','utf8')+';globalThis.__I=Object.keys(SPIRITS);',ctx);"
        "process.stdout.write(JSON.stringify(ctx.__I));"
    )
    out = subprocess.check_output(["node", "-e", js], cwd=ROOT)
    return json.loads(out.decode("utf-8"))


def urls():
    out = []
    for sid in spirit_ids():
        out.append("精灵/透明/%s.webp" % sid)
    # 站点目录版立绘
    for d in ["三星堆", "上海", "南京", "故宫", "河南", "湖北", "湖南", "苏州", "辽宁", "陕西",
              "保定", "唐山", "国博", "廊坊", "张家口", "承德", "石家庄", "秦皇岛", "衡水", "沧州"]:
        p = os.path.join(ROOT, "精灵", d)
        if os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                if f.lower().endswith(".webp"):
                    out.append("精灵/%s/%s" % (d, f))
    # VN 背景 + 全国地图 + 河北地图
    for bg in ["palace", "garden", "shanhai", "grassland", "bronze", "banquet", "summerpalace",
               "kiln", "sea", "temple", "study", "street", "lotus", "museum", "clean"]:
        out.append("装饰/vn_bg_%s.png" % bg)
    out += ["装饰/全国地图.webp", "装饰/河北地图.webp", "装饰/青铜鼎.webp", "装饰/夔龙角.webp"]
    return out


def main():
    s = requests.Session()
    s.verify = False
    bad = []
    checked = 0
    for rel in urls():
        url = BASE + rel
        try:
            r = s.head(url, timeout=15, allow_redirects=True)
            if r.status_code != 200:
                r = s.get(url, timeout=20, stream=True)
            code = r.status_code
            size = int(r.headers.get("content-length") or 0)
        except Exception as ex:  # noqa: BLE001
            bad.append((rel, "ERR %s" % ex))
            continue
        checked += 1
        if code != 200 or size < 500:
            bad.append((rel, "HTTP %s size %s" % (code, size)))
    print("检查 %d 个资源，异常 %d 个" % (checked, len(bad)))
    for rel, why in bad:
        print("  ! %-56s %s" % (rel, why))
    return 0


if __name__ == "__main__":
    sys.exit(main())
