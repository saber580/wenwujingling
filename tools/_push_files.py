# -*- coding: utf-8 -*-
"""按文件推送：python tools/_push_files.py <相对路径> [更多...]
环境变量 SSH_PASS / SSH_HOST / SSH_USER / REMOTE_DIR

上传后逐个 md5 校验，任一文件不一致即退出码 1——曾经出现过 sftp.put
返回正常但远端文件未变的情况，所以校验不能省。
"""
import hashlib
import os
import sys
import time

import paramiko

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = os.environ.get("SSH_HOST", "")   # 服务器地址由环境变量提供，不写死进仓库
USER = os.environ.get("SSH_USER", "root")
PASS = os.environ.get("SSH_PASS", "")
RDIR = os.environ.get("REMOTE_DIR", "/opt/relic")

if not HOST or not PASS:
    print("请先设置环境变量：SSH_HOST / SSH_PASS（不要写死在代码里）")
    sys.exit(1)

files = sys.argv[1:]
if not files:
    sys.exit("用法: python tools/_push_files.py <相对路径> ...")


def local_md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(262144), b""):
            h.update(chunk)
    return h.hexdigest()


cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for _ in range(3):
    try:
        cli.connect(HOST, 22, USER, PASS, timeout=25, banner_timeout=30)
        break
    except Exception as e:
        print("连接重试:", e)
        time.sleep(3)

sftp = cli.open_sftp()
pairs = []
for rel in files:
    local = os.path.join(ROOT, rel)
    remote = RDIR + "/" + rel.replace("\\", "/")
    try:
        sftp.stat(os.path.dirname(remote))
    except IOError:
        cli.exec_command('mkdir -p "%s"' % os.path.dirname(remote))
        time.sleep(.4)
    sftp.put(local, remote, confirm=True)
    size = sftp.stat(remote).st_size
    lsize = os.path.getsize(local)
    flag = "" if size == lsize else "  ⚠ 字节数不符(远端 %d)" % size
    print("↑ %-28s %8d B%s" % (rel, lsize, flag))
    pairs.append((remote, local_md5(local)))
sftp.close()

# 远端 md5 复核
remote_list = " ".join('"%s"' % r for r, _ in pairs)
_, out, _ = cli.exec_command("md5sum %s" % remote_list, timeout=120)
remote_md5 = {}
for line in out.read().decode("utf-8", "ignore").splitlines():
    parts = line.split()
    if len(parts) == 2:
        remote_md5[parts[1]] = parts[0]

bad = [(r, l) for r, l in pairs if remote_md5.get(r) != l]
for r, l in pairs:
    ok = remote_md5.get(r) == l
    print("  %s %s  %s" % ("✓" if ok else "✗", l[:10], r))

# 权限与属主；等命令真的执行完再断开
_, out, _ = cli.exec_command(
    "chown -R www-data:www-data %s 2>/dev/null; chmod -R a+rX %s; echo ok" % (RDIR, RDIR), timeout=120)
out.read()
cli.close()

if bad:
    print("!! %d 个文件校验失败，远端内容与本地不一致" % len(bad))
    sys.exit(1)
print("done · %d 个文件全部校验通过" % len(pairs))
