# -*- coding: utf-8 -*-
"""生成服务器部署用的 tar.gz（Linux 自带 tar，不用装 unzip）"""
import os
import tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(ROOT), "relic-site.tar.gz")

DIRS = ["css", "js", "精灵", "背景", "音频", "装饰", "属性图标", "文物",
        "AI 赋彩", "打卡海报", "心仪卡"]
FILES = ["index.html", "server.py", "install.sh", "部署到服务器.md"]
SKIP_EXT = {".log", ".bak", ".tmp", ".tmp.mp3"}

if os.path.exists(OUT):
    os.remove(OUT)

n = 0
with tarfile.open(OUT, "w:gz", compresslevel=5) as t:
    for fn in FILES:
        p = os.path.join(ROOT, fn)
        if os.path.isfile(p):
            t.add(p, arcname=fn)
            n += 1
        else:
            print("  ! 缺少", fn)
    for d in DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            print("  ! 缺少目录", d)
            continue
        for dp, dns, fns in os.walk(base):
            dns[:] = [x for x in dns if x not in ("__pycache__",)]
            for f in sorted(fns):
                if os.path.splitext(f)[1].lower() in SKIP_EXT:
                    continue
                p = os.path.join(dp, f)
                t.add(p, arcname=os.path.relpath(p, ROOT).replace("\\", "/"))
                n += 1

print("打包完成: %d 个文件, %.1f MB -> %s" % (n, os.path.getsize(OUT) / 1e6, OUT))
