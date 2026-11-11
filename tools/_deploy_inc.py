# -*- coding: utf-8 -*-
"""文物精灵 · 增量部署
只上传本次改动的前端文件，不动图片/音频等大资源。
用法: set SSH_PASS=密码 && python tools/_deploy_inc.py
"""
import os
import sys
import time

import paramiko

HOST = "123.57.21.18"
USER = "root"
PASS = os.environ.get("SSH_PASS", "")
REMOTE = "/opt/relic"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 本次改动的文件（相对项目根）
FILES = [
    "index.html",
    "css/mobile.css",
    "css/red-inner.css",
    "css/style.css",
    "js/app.js",
    "js/aw-craft.js",
    "js/newbie.js",
    "js/red-inner.js",
    "js/guide.js",
    "js/aw-live.js",
    "js/kb-rag.js",
    "js/flyleaf.js",
    "js/red-preset.js",
    "js/red-v2.js",
    "css/red-v2.css",
    "css/mtab-cutout.css",
]


def main():
    if not PASS:
        print("!! 缺少 SSH_PASS")
        return 2

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=22, username=USER, password=PASS,
                timeout=20, banner_timeout=25, auth_timeout=25,
                look_for_keys=False, allow_agent=False)
    print(">> 已登录 %s" % HOST)

    # 1) 备份将被覆盖的文件
    stamp = time.strftime("%Y%m%d-%H%M%S")
    bak = "/opt/relic-backup-%s" % stamp
    i, o, e = cli.exec_command("mkdir -p %s && echo ok" % bak, timeout=60)
    print(">> 备份目录 %s: %s" % (bak, o.read().decode().strip()))

    sftp = cli.open_sftp()
    uploaded = 0
    for rel in FILES:
        local = os.path.join(ROOT, rel)
        if not os.path.isfile(local):
            print("   ! 本地缺失 %s" % rel)
            continue
        remote = "%s/%s" % (REMOTE, rel)
        # 备份
        cli.exec_command("mkdir -p %s/%s && cp -f %s %s/%s 2>/dev/null"
                         % (bak, os.path.dirname(rel), remote, bak, rel), timeout=60)
        # 确保远端目录存在
        cli.exec_command("mkdir -p %s/%s" % (REMOTE, os.path.dirname(rel)), timeout=30)
        size = os.path.getsize(local)
        sftp.put(local, remote)
        print("   ✓ %-24s %8.1f KB" % (rel, size / 1024))
        uploaded += 1
    sftp.close()

    print("\n>> 共上传 %d 个文件" % uploaded)

    # 2) 远端自检
    print("\n>> 远端自检")
    checks = [
        ("index.html 引用 newbie 版本", "grep -o 'newbie.js?v=[a-z0-9]*' %s/index.html | head -1" % REMOTE),
        ("index.html 引用 mobile.css", "grep -o 'mobile.css?v=[a-z0-9]*' %s/index.html | head -1" % REMOTE),
        ("app.js 是否还有 106", "grep -c '全站共' %s/js/app.js || true" % REMOTE),
        ("app.js 是否含二十二站", "grep -c '二十二站' %s/js/guide.js || true" % REMOTE),
        ("newbie.js 文案", "grep -o '走一步、亮一步\\|所有节点都能点' %s/js/newbie.js | head -1" % REMOTE),
        ("静态资源可达", "curl -s -o /dev/null -w '%%{http_code}' http://127.0.0.1/ | tail -1"),
    ]
    for name, cmd in checks:
        i, o, e = cli.exec_command(cmd, timeout=60)
        out = o.read().decode("utf-8", "ignore").strip()
        print("   %-26s %s" % (name, out[:60]))

    cli.close()
    print("\n>> 完成。浏览器请 Ctrl+F5 强刷。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
