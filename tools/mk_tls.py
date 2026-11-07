# -*- coding: utf-8 -*-
"""生成本地 HTTPS 证书（自签 CA + 服务器证书），只为本地开发/演示用。

为什么需要：
    浏览器的麦克风（getUserMedia）和语音识别（SpeechRecognition）只在「安全上下文」
    下开放，http:// 一律被禁。http://127.0.0.1 算安全，但手机通过局域网 IP
    （http://172.20.10.2:8080）访问时不算 —— 于是手机上麦克风直接不可用。
    换成 https:// 之后，局域网设备也能开麦。

产物（都落在 certs/，已在 .gitignore 里排除，不入库）：
    relic-ca.key / relic-ca.crt   本地根证书，装进系统信任区后浏览器不再报警
    relic.key / relic.crt         服务器证书，SAN 覆盖 localhost 与当前所有局域网 IP
    openssl.cnf                   生成时用的配置，留档便于排查
    SAN.txt                       本次签了哪些名字

用法:
    python tools/mk_tls.py            # 已有证书且 SAN 没变就跳过；IP 变了自动重签
    python tools/mk_tls.py --force    # 强制重签
"""
import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CERT_DIR = os.path.join(ROOT, "certs")

CA_KEY = os.path.join(CERT_DIR, "relic-ca.key")
CA_CRT = os.path.join(CERT_DIR, "relic-ca.crt")
SRV_KEY = os.path.join(CERT_DIR, "relic.key")
SRV_CRT = os.path.join(CERT_DIR, "relic.crt")
SAN_FILE = os.path.join(CERT_DIR, "SAN.txt")
CNF = os.path.join(CERT_DIR, "openssl.cnf")

# Chrome 对私有 CA 签发的叶子证书同样限制有效期（398 天上限），397 留一天余量
LEAF_DAYS = 397
CA_DAYS = 3650


def lan_ips():
    """本机可能被局域网设备访问到的 IPv4（排除回环/虚拟网卡噪声不必清，多签几个无害）。"""
    out = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in out:
                out.append(ip)
    except Exception:
        pass
    # 靠 UDP 探路拿默认出口网卡地址（hostname 经常解析不全）
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127.") and ip not in out:
            out.insert(0, ip)
    except Exception:
        pass
    return out


def want_names():
    names = ["localhost"]
    ips = ["127.0.0.1"] + lan_ips()
    return names, ips


def san_line(names, ips):
    parts = ["DNS:" + n for n in names] + ["IP:" + i for i in ips]
    return "subjectAltName=" + ",".join(parts)


def openssl(*args):
    # cwd 必须是已存在的目录：首次运行时 certs/ 还没建，用 ROOT 兜住
    work = CERT_DIR if os.path.isdir(CERT_DIR) else ROOT
    r = subprocess.run(["openssl"] + list(args), cwd=work,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        raise RuntimeError("openssl %s 失败:\n%s"
                           % (" ".join(args[:2]), r.stdout.decode("utf-8", "replace")))
    return r.stdout.decode("utf-8", "replace")


def main():
    force = "--force" in sys.argv
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    try:
        openssl("version")
    except Exception as e:
        print("找不到 openssl（Git for Windows 自带）。请从 Git Bash 里运行本脚本。")
        print(e)
        return 1

    os.makedirs(CERT_DIR, exist_ok=True)
    names, ips = want_names()
    san = san_line(names, ips)

    # 现成证书是否还能用：SAN 完全一致才算能用（换 WiFi 导致 IP 变化就重签）
    if not force and os.path.exists(SAN_FILE) and os.path.exists(SRV_CRT) and os.path.exists(CA_CRT):
        old = open(SAN_FILE, encoding="utf-8").read().strip()
        if old == san:
            print("证书已是最新，跳过。")
            print("  当前覆盖: %s" % san.replace("subjectAltName=", ""))
            return 0
        print("局域网地址变了，重新签发…")
    elif force:
        print("强制重签…")
    else:
        print("首次生成…")

    cnf = """[req]
distinguished_name = dn
prompt             = no
default_md         = sha256

[dn]
CN = localhost

[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage         = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage         = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
%s
""" % san
    with open(CNF, "w", encoding="utf-8") as f:
        f.write(cnf)

    # ---- 根证书（只生成一次，重签服务器证书时才复用；重生成会让之前装过的信任失效）----
    if force or not (os.path.exists(CA_KEY) and os.path.exists(CA_CRT)):
        openssl("genrsa", "-out", "relic-ca.key", "2048")
        openssl("req", "-x509", "-new", "-key", "relic-ca.key", "-sha256",
                "-days", str(CA_DAYS), "-out", "relic-ca.crt",
                "-subj", "/CN=RelicSpirit Local CA/O=RelicSpirit/OU=local-dev",
                "-config", "openssl.cnf", "-extensions", "v3_ca")
        print("  已生成根证书 relic-ca.crt")

    # ---- 服务器证书 ----
    openssl("genrsa", "-out", "relic.key", "2048")
    openssl("req", "-new", "-key", "relic.key", "-out", "relic.csr",
            "-config", "openssl.cnf")
    openssl("x509", "-req", "-in", "relic.csr",
            "-CA", "relic-ca.crt", "-CAkey", "relic-ca.key", "-CAcreateserial",
            "-out", "relic.crt", "-days", str(LEAF_DAYS), "-sha256",
            "-extfile", "openssl.cnf", "-extensions", "v3_req")
    try:
        os.remove(os.path.join(CERT_DIR, "relic.csr"))
        os.remove(os.path.join(CERT_DIR, "relic-ca.srl"))
    except OSError:
        pass

    with open(SAN_FILE, "w", encoding="utf-8") as f:
        f.write(san)

    # ---- 自检：证书里的 SAN 要能在文本里看到，且私钥要配对 ----
    txt = openssl("x509", "-in", "relic.crt", "-noout", "-text")
    missing = [x for x in names + ips if x not in txt]
    if missing:
        print("  !! 证书里没找到这些名字: %s" % ", ".join(missing))
        return 2

    print("  已签发服务器证书 relic.crt（%d 天）" % LEAF_DAYS)
    print("  覆盖: %s" % san.replace("subjectAltName=", ""))
    print()
    print("接下来:")
    print("  1) python server.py          # 会额外监听 https://127.0.0.1:8443/")
    print("  2) 浏览器首次访问会警告「不安全」——点「高级 → 继续前往」即可；")
    print("     想彻底不报警，双击 tools/trust_ca.bat 把根证书装进当前用户信任区。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
