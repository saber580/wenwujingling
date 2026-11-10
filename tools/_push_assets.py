# -*- coding: utf-8 -*-
"""补传线上缺失的前端资源（跳过 _raw / vn_bg_generated 等原始素材）。"""
import os
import time

import paramiko

HOST = "123.57.21.18"
USER = "root"
PASS = os.environ["SSH_PASS"]
REMOTE = "/opt/relic"

# 只传这些目录
INCLUDE_DIRS = ["精灵/透明", "装饰"]
INCLUDE_SITE_DIRS = ["三星堆", "上海", "南京", "故宫", "河南", "湖北", "湖南", "苏州", "辽宁", "陕西"]
# 明确跳过
SKIP_PARTS = ["/_raw", "vn_bg_generated"]

EXTS = (".webp", ".png", ".jpg", ".jpeg", ".svg")


def rels():
    out = []
    for d in INCLUDE_DIRS:
        for base, _ds, fs in os.walk(d):
            if any(s in base.replace(os.sep, "/") for s in SKIP_PARTS):
                continue
            for f in sorted(fs):
                if f.lower().endswith(EXTS):
                    out.append(os.path.join(base, f).replace(os.sep, "/"))
    for d in INCLUDE_SITE_DIRS:
        p = "精灵/" + d
        if os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                if f.lower().endswith(EXTS):
                    out.append(p + "/" + f)
    return out


def main():
    todo = rels()
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PASS, timeout=30, banner_timeout=35)
    sftp = cli.open_sftp()

    missing = []
    for rel in todo:
        try:
            st = sftp.stat(REMOTE + "/" + rel)
            if st.st_size == os.path.getsize(rel):
                continue
            missing.append((rel, "size"))
        except IOError:
            missing.append((rel, "miss"))

    print("待检查 %d 个，需上传 %d 个" % (len(todo), len(missing)))
    t0 = time.time()
    total = 0
    ok = 0
    fail = []
    for idx, (rel, why) in enumerate(missing, 1):
        cur = REMOTE
        for part in rel.split("/")[:-1]:
            cur = cur + "/" + part
            try:
                sftp.stat(cur)
            except IOError:
                try:
                    sftp.mkdir(cur)
                except IOError:
                    pass
        try:
            sftp.put(rel, REMOTE + "/" + rel)
            sz = os.path.getsize(rel)
            total += sz
            ok += 1
            print("  [%3d/%3d] %-52s %8.0f KB %s" % (idx, len(missing), rel[-52:], sz / 1024, why))
        except Exception as ex:  # noqa: BLE001
            fail.append((rel, str(ex)))
    print("\n上传 %d 个，共 %.1f MB，用时 %.1fs" % (ok, total / 1e6, time.time() - t0))
    for r, e in fail:
        print("  ! 失败 %s :: %s" % (r, e))

    sftp.close()
    i, o, e = cli.exec_command(
        "chown -R www-data:www-data %s/精灵 %s/装饰; chmod -R a+rX %s/精灵 %s/装饰; echo perm-ok" % ((REMOTE,) * 4),
        timeout=180,
    )
    print(o.read().decode("utf-8", "ignore").strip())
    cli.close()


if __name__ == "__main__":
    main()
