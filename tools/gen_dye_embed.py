# -*- coding: utf-8 -*-
"""为「AI 赋彩」36 幅图稿生成内嵌数据(AI 赋彩\_data\<文件名>.js)。

背景:双击 index.html(file://)打开时,浏览器安全策略不允许读取本机图片的像素,
      「AI 赋彩」上色会显示「这一幅没打开成功」。把每幅图转成 data: 形式写进
      同名 JS 文件后,页面按需加载(见 js\app.js 的 dyeResolveSrc),双击也能正常上色。

用法:
    python tools\gen_dye_embed.py            生成/更新全部内嵌数据
    python tools\gen_dye_embed.py --check    只检查(不写文件):缺失或与原图不一致时提示

换图流程:把新图按原名覆盖进 AI 赋彩\,再跑一次本脚本即可。
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "js", "data.js")
SRC_DIR = os.path.join(ROOT, "AI 赋彩")
OUT_DIR = os.path.join(SRC_DIR, "_data")


def read_meta():
    txt = open(DATA_JS, encoding="utf-8").read()
    m = re.search(r"const DYE_IMAGES\s*=\s*\[(.*?)\];", txt, re.S)
    if not m:
        raise SystemExit("未找到 js\\data.js 里的 DYE_IMAGES")
    return re.findall(r'f:\s*"([^"]+)"', m.group(1))


def main():
    check = "--check" in sys.argv
    files = read_meta()
    if not files:
        raise SystemExit("DYE_IMAGES 里没有文件名")
    os.makedirs(OUT_DIR, exist_ok=True)
    made = 0
    total = 0
    stale = []
    miss = []
    for f in files:
        src = os.path.join(SRC_DIR, f)
        if not os.path.isfile(src):
            miss.append(f)
            continue
        raw = open(src, "rb").read()
        b64 = base64.b64encode(raw).decode("ascii")
        body = ('window.__DYE_DATA=window.__DYE_DATA||{};'
                'window.__DYE_DATA["%s"]="data:image/jpeg;base64,%s";\n' % (f, b64))
        dst = os.path.join(OUT_DIR, f + ".js")
        total += len(body)
        if os.path.isfile(dst) and os.path.getsize(dst) == len(body):
            continue
        if check:
            stale.append(f)
            continue
        with open(dst, "w", encoding="utf-8", newline="\n") as fp:
            fp.write(body)
        made += 1
    if miss:
        print("缺原图(请先放回 AI 赋彩\\):", ", ".join(miss))
    if check:
        if stale:
            print("[check] 有 %d 幅需更新,跑 python tools\\gen_dye_embed.py 重建" % len(stale))
            for f in stale[:8]:
                print("  -", f)
        else:
            print("[check] 内嵌数据齐全且与图稿一致(共 %d 幅)" % (len(files) - len(miss)))
    else:
        print("已生成/更新 %d 个内嵌数据文件 -> AI 赋彩\\_data\\(共 %.1f MB)" % (made, total / 1048576.0))
        print("提示:双击 index.html 与 HBuilder X 两种打开方式都能上色;换图后重跑一次本脚本。")


if __name__ == "__main__":
    main()
