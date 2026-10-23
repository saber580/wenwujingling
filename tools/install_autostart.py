# -*- coding: utf-8 -*-
# 安装/卸载「文物精灵 · AI 云端小桥」开机自启（HKCU Run 键，不需要管理员权限）
import subprocess, sys

EXE = sys.executable.replace("python.exe", "pythonw.exe") if False else sys.executable
VBS = r"C:\Users\lenovo\Desktop\文物精灵\tools\bridge_autostart.vbs"
KEY = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
NAME = "WWJL_AI_Bridge"


def run(args):
    print("$ " + " ".join(args))
    p = subprocess.run(args, capture_output=True, text=True, encoding="gbk", errors="ignore")
    print((p.stdout or "") + (p.stderr or ""))
    return p.returncode


def installed():
    p = subprocess.run(["reg", "query", KEY, "/v", NAME], capture_output=True, text=True,
                       encoding="gbk", errors="ignore")
    return p.returncode == 0


mode = "install" if "--off" not in sys.argv else "uninstall"

if mode == "install":
    if installed():
        print("已经装过了，无需重复。")
    else:
        run(["reg", "add", KEY, "/v", NAME, "/t", "REG_SZ", "/d", '"%s"' % VBS, "/f"])
    print("\n现在的状态：")
    run(["reg", "query", KEY, "/v", NAME])
    print("\n说明：以后每次登录 Windows，小桥会自动在后台启动（无窗口）。")
    print("打开网页就能登录 + 用全部 AI 功能，不用再手动点任何启动脚本。")
else:
    run(["reg", "delete", KEY, "/v", NAME, "/f"])
    print("\n已取消开机自启。需要时手动双击：启动AI云端小桥.bat")
input("\n按回车关闭…")
