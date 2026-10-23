# -*- coding: utf-8 -*-
"""按文件推送：python tools/_push_files.py <相对路径> [更多...]
环境变量 SSH_PASS / SSH_HOST / SSH_USER / REMOTE_DIR"""
import os, sys, time, paramiko

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

cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
for _ in range(3):
    try:
        cli.connect(HOST, 22, USER, PASS, timeout=25, banner_timeout=30)
        break
    except Exception as e:
        print("连接重试:", e); time.sleep(3)
sftp = cli.open_sftp()
for rel in files:
    local = os.path.join(ROOT, rel)
    remote = RDIR + "/" + rel.replace("\\", "/")
    try:
        sftp.stat(os.path.dirname(remote))
    except IOError:
        cli.exec_command('mkdir -p "%s"' % os.path.dirname(remote))
        time.sleep(.4)
    sftp.put(local, remote)
    print("↑ %-28s %8d B" % (rel, os.path.getsize(local)))
sftp.close()
cli.exec_command("chown -R www-data:www-data %s 2>/dev/null; chmod -R a+rX %s" % (RDIR, RDIR))
time.sleep(.6)
cli.close()
print("done")
