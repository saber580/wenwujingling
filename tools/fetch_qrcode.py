# -*- coding: utf-8 -*-
"""尝试从多个(国内可达)镜像获取 qrcode-generator 的 qrcode.js → js/qrcode.js"""
import io, pathlib, sys, tarfile, urllib.request
sys.stdout.reconfigure(encoding="utf-8")

root = pathlib.Path(__file__).resolve().parent.parent
dest = root / "js" / "qrcode.js"

candidates = [
    ("tarball-npmmirror", "https://registry.npmmirror.com/qrcode-generator/-/qrcode-generator-1.4.4.tgz"),
    ("file-npmmirror",    "https://registry.npmmirror.com/qrcode-generator/1.4.4/files/qrcode.js"),
    ("baomitu",           "https://lib.baomitu.com/qrcode-generator/1.4.4/qrcode.min.js"),
    ("staticfile",        "https://cdn.staticfile.org/qrcode-generator/1.4.4/qrcode.min.js"),
    ("bootcdn",           "https://cdn.bootcdn.net/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"),
    ("unpkg",             "https://unpkg.com/qrcode-generator@1.4.4/qrcode.js"),
    ("jsdelivr-gcore",    "https://gcore.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"),
    ("jsdelivr-fastly",   "https://fastly.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"),
]

def try_url(name, url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=25).read()
    except Exception as e:
        print(f"[{name}] 失败: {type(e).__name__} {e}")
        return False
    print(f"[{name}] OK {len(data)} bytes")
    js = None
    if data[:2] == b"\x1f\x8b":  # gzip tarball
        tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
        for m in tf.getmembers():
            if m.name.endswith("qrcode.js") or m.name.endswith("qrcode.min.js"):
                js = tf.extractfile(m).read()
                print("   tar内文件:", m.name, len(js), "bytes")
                if m.name.endswith("qrcode.js"):
                    break
    else:
        js = data
    if not js:
        print(f"[{name}] 没找到 js 文件")
        return False
    txt = js.decode("utf-8", "replace")
    if "isDark" not in txt or "qrcode" not in txt.lower():
        print(f"[{name}] 内容不像 qrcode 库,忽略")
        return False
    dest.write_bytes(js)
    print(f"[{name}] 已保存 → {dest}")
    print("头 150:", txt[:150].replace("\n", " "))
    print("尾 150:", txt[-150:].replace("\n", " "))
    return True

for name, url in candidates:
    if try_url(name, url):
        print("DONE")
        break
else:
    print("ALL FAILED")
