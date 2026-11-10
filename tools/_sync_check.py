# -*- coding: utf-8 -*-
"""线上资源大检查：对比本地与 /opt/relic 的关键目录，列出缺失/大小不一致的文件。
用法：
  python tools/_sync_check.py            # 只报告
  python tools/_sync_check.py --push     # 报告并补传缺失文件
  python tools/_sync_check.py --push-only 精灵/透明   # 只补传指定子目录
"""
import os
import sys
import time

import paramiko

HOST = "123.57.21.18"
USER = "root"
PASS = os.environ.get("SSH_PASS", "")

LOCAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTE = "/opt/relic"

# 关键资源目录（相对项目根）
DIRS = ["精灵", "背景", "装饰", "属性图标", "音频", "audio"]

EXTS = (".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".mp3", ".ogg", ".wav", ".m4a")


def connect():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PASS, timeout=30, banner_timeout=35)
    return cli


def local_map():
    """{相对路径: 字节数}"""
    out = {}
    for d in DIRS:
        root = os.path.join(LOCAL, d)
        if not os.path.isdir(root):
            continue
        for base, _dirs, files in os.walk(root):
            for f in files:
                if not f.lower().endswith(EXTS):
                    continue
                ap = os.path.join(base, f)
                rel = os.path.relpath(ap, LOCAL).replace(os.sep, "/")
                try:
                    out[rel] = os.path.getsize(ap)
                except OSError:
                    pass
    return out


def remote_map(sftp):
    out = {}
    for d in DIRS:
        base_dir = REMOTE + "/" + d
        try:
            sftp.stat(base_dir)
        except IOError:
            continue
        stack = [d]
        while stack:
            cur = stack.pop()
            try:
                entries = sftp.listdir_attr(REMOTE + "/" + cur)
            except IOError:
                continue
            for e in entries:
                rel = cur + "/" + e.filename
                import stat as _stat
                if _stat.S_ISDIR(e.st_mode):
                    stack.append(rel)
                elif e.filename.lower().endswith(EXTS):
                    out[rel] = e.st_size
    return out


def main():
    push = "--push" in sys.argv
    push_only = None
    if "--push-only" in sys.argv:
        i = sys.argv.index("--push-only")
        if i + 1 < len(sys.argv):
            push_only = sys.argv[i + 1]

    if not PASS:
        print("请先设置 SSH_PASS 环境变量")
        return 2

    lm = local_map()
    print("本地资源文件：%d 个，合计 %.1f MB" % (len(lm), sum(lm.values()) / 1e6))
    cli = connect()
    sftp = cli.open_sftp()
    rm = remote_map(sftp)
    print("线上资源文件：%d 个，合计 %.1f MB" % (len(rm), sum(rm.values()) / 1e6))

    missing = sorted([k for k in lm if k not in rm])
    diff = sorted([k for k in lm if k in rm and rm[k] != lm[k]])
    extra = sorted([k for k in rm if k not in lm])

    print("\n=== 线上缺失 %d 个 ===" % len(missing))
    by_dir = {}
    for m in missing:
        top = m.split("/")[0]
        by_dir.setdefault(top, []).append(m)
    for top in sorted(by_dir):
        fs = by_dir[top]
        mb = sum(lm[k] for k in fs) / 1e6
        print("  %-8s %3d 个  %.2f MB" % (top, len(fs), mb))
        if len(fs) <= 40:
            for f in fs:
                print("      - %s (%d B)" % (f, lm[f]))
        else:
            for f in fs[:12]:
                print("      - %s" % f)
            print("      ... 其余 %d 个略" % (len(fs) - 12))

    print("\n=== 大小不一致 %d 个 ===" % len(diff))
    for k in diff[:40]:
        print("  ~ %s  本地 %d / 线上 %d" % (k, lm[k], rm[k]))

    if extra:
        print("\n=== 线上多余 %d 个（本地已无，先不动）===" % len(extra))
        for k in extra[:15]:
            print("  + %s" % k)

    if not push:
        print("\n(只检查，未上传。加 --push 补传缺失文件)")
        sftp.close()
        cli.close()
        return 0

    targets = missing
    if push_only:
        targets = [m for m in targets if m.startswith(push_only)]
    if not targets:
        print("\n没有需要补传的文件。")
        sftp.close()
        cli.close()
        return 0

    print("\n=== 开始补传 %d 个文件 ===" % len(targets))
    t0 = time.time()
    total = 0
    ok = 0
    fail = []
    for idx, rel in enumerate(targets, 1):
        lp = os.path.join(LOCAL, rel.replace("/", os.sep))
        rp = REMOTE + "/" + rel
        # 确保远端父目录存在
        parts = rel.split("/")[:-1]
        cur = REMOTE
        for p in parts:
            cur = cur + "/" + p
            try:
                sftp.stat(cur)
            except IOError:
                try:
                    sftp.mkdir(cur)
                except IOError:
                    pass
        try:
            sftp.put(lp, rp)
            total += lm[rel]
            ok += 1
            if idx % 20 == 0 or idx == len(targets):
                print("  ... %d/%d  %.1f MB  %.1fs" % (idx, len(targets), total / 1e6, time.time() - t0))
        except Exception as ex:  # noqa: BLE001
            fail.append((rel, str(ex)))

    print("上传完成：成功 %d 个，%.1f MB，用时 %.1fs" % (ok, total / 1e6, time.time() - t0))
    if fail:
        print("失败 %d 个：" % len(fail))
        for r, e in fail:
            print("  ! %s  %s" % (r, e))

    # 修权限
    stdin, stdout, stderr = cli.exec_command(
        "chown -R www-data:www-data %s/精灵 %s/背景 %s/装饰 %s/属性图标 %s/音频 %s/audio 2>/dev/null; chmod -R a+rX %s/精灵 %s/背景 %s/装饰 %s/属性图标 %s/音频 %s/audio 2>/dev/null; echo perm-ok"
        % ((REMOTE,) * 12),
        timeout=180,
    )
    print(stdout.read().decode("utf-8", "ignore").strip())

    sftp.close()
    cli.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
