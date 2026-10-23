# -*- coding: utf-8 -*-
"""远程部署：把 relic-site.tar.gz 传上服务器并装好
用法:
    set SSH_PASS=密码  &&  python tools/_remote_deploy.py <IP> [端口] [用户] [网站端口]
环境变量:
    SSH_PASS   登录密码（不给就走密钥/agent）
"""
import os
import sys
import time

import paramiko

HOST = sys.argv[1]
SSH_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 22
USER = sys.argv[3] if len(sys.argv) > 3 else "root"
WEB_PORT = sys.argv[4] if len(sys.argv) > 4 else "8080"
PASS = os.environ.get("SSH_PASS", "")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAR = os.path.join(os.path.dirname(ROOT), "relic-site.tar.gz")
REMOTE_DIR = "/opt/relic"
REMOTE_TAR = "/tmp/relic-site.tar.gz"


def run(cli, cmd, timeout=600, quiet=False):
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout, get_pty=False)
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    code = stdout.channel.recv_exit_status()
    if not quiet:
        for line in (out + err).splitlines():
            if line.strip():
                print("   " + line[:200])
    return code, out, err


def main():
    print("=" * 58)
    print("  连接 %s:%d (用户 %s)" % (HOST, SSH_PORT, USER))
    print("=" * 58)

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        cli.connect(HOST, port=SSH_PORT, username=USER, password=PASS or None,
                    timeout=20, banner_timeout=25, auth_timeout=25,
                    look_for_keys=not PASS, allow_agent=not PASS)
    except paramiko.AuthenticationException:
        print("!! 认证失败：账号或密码不对")
        return 2
    except Exception as e:
        print("!! 连不上：%s" % str(e)[:160])
        return 3
    print(">> 已登录\n")

    # 1) 环境信息
    print(">> 服务器信息")
    run(cli, "cat /etc/os-release | head -2; uname -m; free -m | head -2")

    # 2) 检查 python3
    code, out, _ = run(cli, "command -v python3 || echo NONE", quiet=True)
    if "NONE" in out:
        print(">> 正在安装 python3…")
        run(cli, "(apt-get update -qq && apt-get install -y -qq python3) 2>&1 | tail -3", timeout=600)

    # 3) 上传
    size = os.path.getsize(TAR)
    print("\n>> 上传部署包 (%.1f MB)…" % (size / 1e6))
    sftp = cli.open_sftp()
    t0 = time.time()
    last = [0]

    def cb(done, total):
        pct = int(done * 100 / max(total, 1))
        if pct // 10 != last[0] // 10:
            last[0] = pct
            print("   %d%%  (%.1f/%.1f MB, %.1fs)" % (
                pct, done / 1e6, total / 1e6, time.time() - t0))

    sftp.put(TAR, REMOTE_TAR, callback=cb)
    print("   上传完成，用时 %.0f 秒" % (time.time() - t0))
    sftp.close()

    # 4) 解压
    print("\n>> 解压到 %s" % REMOTE_DIR)
    run(cli, "mkdir -p %s && rm -rf %s/* && tar -xzf %s -C %s && ls %s | head -12"
        % (REMOTE_DIR, REMOTE_DIR, REMOTE_TAR, REMOTE_DIR, REMOTE_DIR))

    # 5) 安装
    print("\n>> 执行安装脚本（端口 %s）" % WEB_PORT)
    run(cli, "cd %s && PORT=%s bash install.sh 2>&1 | tail -24" % (REMOTE_DIR, WEB_PORT),
        timeout=300)

    # 6) 自检
    print("\n>> 本机自检")
    run(cli, "sleep 2; curl -s -o /dev/null -w 'ping HTTP %%{http_code}\\n' "
             "http://127.0.0.1:%s/api/ping; "
             "curl -s -o /dev/null -w 'index HTTP %%{http_code} size %%{size_download}\\n' "
             "http://127.0.0.1:%s/" % (WEB_PORT, WEB_PORT))

    print("\n>> 服务状态")
    run(cli, "systemctl is-active relic-spirit; systemctl is-enabled relic-spirit")

    cli.close()
    print("\n" + "=" * 58)
    print("  部署结束")
    print("  访问: http://%s:%s/" % (HOST, WEB_PORT))
    print("=" * 58)
    return 0


if __name__ == "__main__":
    sys.exit(main())
