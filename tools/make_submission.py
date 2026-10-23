# -*- coding: utf-8 -*-
"""文物精灵 · 生成「干净提交包」:清掉所有 API 密钥,并全包扫描确认无残留。

用法(在「文物精灵」文件夹里跑):
    python tools\\make_submission.py            生成到同级「文物精灵-提交包」
    python tools\\make_submission.py D:\\提交包   自定义输出目录

做的事:
  ① 复制整个项目(跳过 __pycache__ / .git / *.pyc 等)
  ② 把 3 个含钥文件换成空模板:
       js\\ident-direct.js   → 钥匙清空(页面照常运行,云端自动降级本机)
       tools\\ident_key.txt  → 只留注释(小桥改读环境变量 ARK_API_KEY)
       tools\\volc_key.txt   → 只留注释(语音钥匙清空)
  ③ 全包扫描疑似密钥(方舟 ark- / 智谱 id.secret / api_key= 长串 / 火山 AK…)
     有残留就报错退出,绝不把钥匙打进提交包
  ④ 打印提交清单
"""
import io, os, re, shutil, sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))        # 项目根(本文件在 tools\ 下)
NAME = os.path.basename(SRC)
DST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(SRC), NAME + "-提交包")

EXCLUDE_DIRS = {"__pycache__", ".git", ".vscode", ".idea", "node_modules"}
EXCLUDE_FILES = {".DS_Store", "Thumbs.db", "desktop.ini",
                 "金器.png", "银器.jpeg", "宣纸.png", "象棋.png"}   # 四张新精灵的水印原图:仅供本机归档,不随提交包外发

TXT_EXT = {".html", ".htm", ".js", ".css", ".md", ".txt", ".json", ".py", ".bat", ".cmd",
           ".yml", ".yaml", ".xml", ".svg", ".gitignore", ".ini", ".cfg", ""}

PATTERNS = [
    (re.compile(r"ark-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-"), "火山方舟 API Key(ark-…)"),
    (re.compile(r"\b\d{6,}\.[A-Za-z0-9_-]{16,}\b"), "智谱 Key(id.secret)"),
    (re.compile(r"api_key\s*=\s*[A-Za-z0-9._-]{16,}"), "api_key= 长串"),
    (re.compile(r"AKLT[A-Za-z0-9]{10,}"), "火山 AccessKey(AKLT…)"),
    (re.compile(r"secret\s*[:=]\s*[\"']?[A-Za-z0-9._-]{20,}"), "secret= 长串"),
]

DIRECT_TEMPLATE = """/* 文物精灵 · AI 识别「直连模式」钥匙文件(提交版:已清空,不影响任何功能)
   没有钥匙时:识别 / 茶话会 / 拍照幻化都会自动用本机引擎,流程一个不少;
   想启用云端:① 本机运行 tools\\ident_cloud.py(密钥推荐用环境变量 ARK_API_KEY 配置)
             ② 或打开页面,在识别卡片 / 茶话会页头点「🔑 粘贴密钥」粘一次(只存在浏览器里)。
   注意:不要往本文件填真实密钥后对外提交;公开仓库用项目根的 .gitignore 挡住它。 */
window.__IDENT_DIRECT_KEY = "";
window.__IDENT_DIRECT_MODEL = "";
"""

IDENT_NOTE = "# (提交版说明)本文件不携带密钥:运行时可用环境变量 ARK_API_KEY / ZHIPU_API_KEY / IDENT_API_KEY 配置,"
IDENT_NOTE2 = "# 或把 Key 填回本文件第一行再跑 tools\\ident_cloud.py(保存即生效,不用重启)。"
VOLC_NOTE = "# (提交版说明)语音钥匙已清空:需要重新生成配音时,把火山语音的 api_key=你的新钥匙 填回本文件,"
VOLC_NOTE2 = "# 再跑 tools\\gen_voice_trial_volc.py。演示用音频已预生成,不填也能正常播放。"


def keep_comments(path, notes):
    """把含钥文件转成「只剩注释」的空模板"""
    lines = []
    for l in io.open(path, encoding="utf-8-sig", errors="replace").read().splitlines():
        if l.strip().startswith("#"):
            lines.append(l.rstrip())
    while lines and not lines[-1].strip():
        lines.pop()
    lines.extend(notes)
    io.open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")


def scan(path):
    """扫描疑似密钥;返回 [(相对路径, 行号, 类型, 掩码预览)]"""
    hits = []
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fn in files:
            fp = os.path.join(root, fn)
            ext = os.path.splitext(fn)[1].lower()
            if ext not in TXT_EXT and fn != ".gitignore":
                continue
            try:
                if os.path.getsize(fp) > 1_500_000:
                    continue
                text = io.open(fp, encoding="utf-8-sig", errors="replace").read()
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                for rx, label in PATTERNS:
                    m = rx.search(line)
                    if m:
                        s = m.group(0)
                        hits.append((os.path.relpath(fp, path), i, label, s[:12] + "…(" + str(len(s)) + ")"))
    return hits


def main():
    if not os.path.isdir(SRC) or not os.path.isdir(os.path.join(SRC, "js")):
        print("× 看起来不在项目里:请把本脚本放在 文物精灵\\tools\\ 下运行")
        return 2
    if os.path.abspath(DST).startswith(os.path.abspath(SRC) + os.sep):
        print("× 输出目录不能放在项目内(会被再次复制):", DST)
        return 2
    if os.path.exists(DST):
        print("· 输出目录已存在,先清空:", DST)
        shutil.rmtree(DST)

    def ignore(_dir, names):
        return [n for n in names if n in EXCLUDE_DIRS or n in EXCLUDE_FILES or n.endswith(".pyc")]

    shutil.copytree(SRC, DST, ignore=ignore)

    # ② 清钥匙
    djs = os.path.join(DST, "js", "ident-direct.js")
    io.open(djs, "w", encoding="utf-8", newline="\n").write(DIRECT_TEMPLATE)
    keep_comments(os.path.join(DST, "tools", "ident_key.txt"), [IDENT_NOTE, IDENT_NOTE2])
    keep_comments(os.path.join(DST, "tools", "volc_key.txt"), [VOLC_NOTE, VOLC_NOTE2])

    # ③ 扫描
    hits = scan(DST)
    n_files = sum(len(fs) for _, _, fs in os.walk(DST))
    size_mb = 0.0
    for root, _, fs in os.walk(DST):
        for f in fs:
            try:
                size_mb += os.path.getsize(os.path.join(root, f))
            except Exception:
                pass
    size_mb = round(size_mb / 1048576, 1)

    print()
    print("== 文物精灵 · 干净提交包 ==")
    print("  输出:", DST)
    print("  规模:%d 个文件 · 约 %s MB" % (n_files, size_mb))
    print("  已清空:js\\ident-direct.js · tools\\ident_key.txt · tools\\volc_key.txt")
    if hits:
        print("× 扫描发现疑似密钥残留(%d 处),请处理后重跑:" % len(hits))
        for h in hits[:20]:
            print("   - %s : 第 %d 行 : %s : %s" % h)
        return 1
    print("√ 全包扫描:未发现任何密钥残留")
    print()
    print("== 提交清单 ==")
    print("  ① 把上面这个「%s-提交包」整个文件夹打成 zip,按大赛官网要求上传" % NAME)
    print("  ② 密钥一律不进包:评委双击 index.html 即可全流程游玩(云端功能自动降级本机);")
    print("     要开云端:环境变量 ARK_API_KEY(配合 tools\\ident_cloud.py)或页面「粘贴密钥」按钮")
    print("  ③ 提交后不得修改 —— 先把 使用说明.md「九、提交注意事项」过一遍再传")
    return 0


if __name__ == "__main__":
    sys.exit(main())
