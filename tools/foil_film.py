# -*- coding: utf-8 -*-
"""烫金风格短片流水线（12:10 定稿那版的口径）。

输入：
  --clip   主镜头（一条连续运镜，AI 生成的原片，允许带左上角「AI生成」水印）
  --title  标识卡 PNG（HTML/CSS 精确排版出来的，1280x720 或任意 16:9）
  --audio  原片音轨（wav/mp4 均可，会截取音轨；不给则出静音片）

输出：成片 mp4（1280x720 / 30fps / H.264 + AAC）

做四件事：
  1. 主镜头去水印 + 居中裁 16:9 + minterpolate 补帧到 30fps
  2. 标识卡 zoompan 极缓推镜（消掉「静止死帧」）
  3. 两者 xfade 交叉溶解（不是硬切）
  4. 原音轨循环延展，循环点 acrossfade，首尾淡入淡出

用法：
  python tools/foil_film.py --clip main.mp4 --title title.png --audio orig.wav --out 成片.mp4
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

# v9.0.2 才有 xfade；EVCapture 那个 2019 版没有，别用
FFCANDIDATES = [
    os.path.expandvars(
        r"%LOCALAPPDATA%\Programs\Python\Python311\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
    ),
    r"C:\Program Files\EVCapture\ffmpeg.exe",
]
PROBECANDIDATES = [r"C:\Program Files\EVCapture\ffprobe.exe"]


def find_ffmpeg():
    for p in FFCANDIDATES:
        if os.path.exists(p):
            return p
    p = shutil.which("ffmpeg")
    if p:
        return p
    sys.exit("找不到 ffmpeg")


def find_probe():
    for p in PROBECANDIDATES:
        if os.path.exists(p):
            return p
    p = shutil.which("ffprobe")
    return p


def run(cmd, quiet=True):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        sys.stderr.write(r.stderr.decode("utf-8", "ignore")[-2000:])
        raise SystemExit("ffmpeg 失败: %s" % " ".join(cmd[:6]))
    return r


def probe(path):
    """返回 (width, height, duration)"""
    probe_exe = find_probe()
    ff = find_ffmpeg()
    if probe_exe:
        r = subprocess.run(
            [probe_exe, "-v", "error", "-show_entries", "stream=width,height",
             "-show_entries", "format=duration", "-of", "json", path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            import json
            d = json.loads(r.stdout.decode("utf-8", "ignore"))
            st = [s for s in d.get("streams", []) if "width" in s][0]
            return st["width"], st["height"], float(d["format"]["duration"])
        except Exception:
            pass
    # 退路：解析 ffmpeg -i 输出
    r = subprocess.run([ff, "-hide_banner", "-i", path],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    txt = r.stderr.decode("utf-8", "ignore")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", txt)
    dur = 0.0
    if m:
        dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m2 = re.search(r"Video:.*?, (\d+)x(\d+)", txt)
    w, h = (int(m2.group(1)), int(m2.group(2))) if m2 else (0, 0)
    return w, h, dur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clip", required=True, help="主镜头 mp4")
    ap.add_argument("--title", required=True, help="标识卡 png")
    ap.add_argument("--audio", default="", help="原片音轨（可选）")
    ap.add_argument("--out", required=True, help="输出 mp4")
    ap.add_argument("--title-sec", type=float, default=4.2, help="标识卡时长")
    ap.add_argument("--dissolve", type=float, default=0.8, help="溶解时长")
    ap.add_argument("--zoom-rate", type=float, default=0.00045, help="标识卡推镜速度（每帧增量）")
    ap.add_argument("--delogo", default="2:2:106:50",
                    help="去水印区域 x:y:w:h；传 none 关闭")
    ap.add_argument("--crf", default="15")
    ap.add_argument("--keep-temp", action="store_true")
    a = ap.parse_args()

    ff = find_ffmpeg()
    tmp = tempfile.mkdtemp(prefix="foil_")
    print("[1/4] 主镜头：去水印 + 裁 16:9 + 补帧 30fps")
    cw, ch, cdur = probe(a.clip)
    if not cw:
        raise SystemExit("读不出主镜头尺寸")
    # 居中裁成 16:9
    if abs(cw / ch - 16 / 9) > 0.01:
        tw = min(cw, int(round(ch * 16 / 9)))
        th = min(ch, int(round(cw * 9 / 16)))
        crop = "crop=%d:%d:(iw-%d)/2:(ih-%d)/2" % (tw, th, tw, th)
    else:
        crop = "crop=trunc(iw/2)*2:trunc(ih/2)*2"
    chain = []
    if a.delogo and a.delogo.lower() != "none":
        x, y, w, h = a.delogo.split(":")
        chain.append("delogo=x=%s:y=%s:w=%s:h=%s" % (x, y, w, h))
    chain.append(crop)
    chain.append("minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    chain.append("scale=1280:720:flags=lanczos")
    chain.append("unsharp=3:3:0.25")
    main_mp4 = os.path.join(tmp, "main30.mp4")
    run([ff, "-v", "error", "-i", a.clip, "-vf", ",".join(chain), "-an",
         "-c:v", "libx264", "-crf", a.crf, "-preset", "medium",
         "-pix_fmt", "yuv420p", "-y", main_mp4])

    print("[2/4] 标识卡：极缓推镜 %gs" % a.title_sec)
    title_mp4 = os.path.join(tmp, "title.mp4")
    run([ff, "-v", "error", "-loop", "1", "-i", a.title,
         "-t", str(a.title_sec),
         "-vf", ("scale=5120:2880:flags=lanczos,"
                 "zoompan=z='1+%g*on':d=1:"
                 "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+on*0.25':"
                 "s=1280x720:fps=30,format=yuv420p") % a.zoom_rate,
         "-c:v", "libx264", "-crf", a.crf, "-preset", "slow",
         "-pix_fmt", "yuv420p", "-y", title_mp4])

    print("[3/4] 交叉溶解拼接")
    merged = os.path.join(tmp, "merged.mp4")
    offset = max(0.0, a.title_sec - a.dissolve)
    run([ff, "-v", "error", "-i", title_mp4, "-i", main_mp4,
         "-filter_complex",
         ("[0:v]fps=30,format=yuv420p[a];[1:v]fps=30,format=yuv420p[b];"
          "[a][b]xfade=transition=fade:duration=%g:offset=%g[v]") % (a.dissolve, offset),
         "-map", "[v]", "-an", "-c:v", "libx264", "-crf", a.crf,
         "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-y", merged])

    mw, mh, total = probe(merged)
    print("      成片时长 %.2fs" % total)

    out = a.out
    if a.audio and os.path.exists(a.audio):
        print("[4/4] 音轨：循环延展 + 循环点交叉淡化 + 首尾淡入淡出")
        aw, ah, adur = probe(a.audio)
        if adur <= 0:
            adur = total
        audio_m4a = os.path.join(tmp, "audio.m4a")
        fade_out_start = max(0.0, total - 1.2)
        # 循环 n 次拼接，循环点 acrossfade 0.4
        loops = max(1, int(total / max(adur - 0.4, 0.5)) + 1)
        parts = []
        for i in range(loops):
            parts.append("[0:a]atrim=0:%g,asetpts=N/SR/TB[c%d]" % (adur, i))
        fade_chain = []
        cur = "c0"
        for i in range(1, loops):
            fade_chain.append(
                "[%s][c%d]acrossfade=d=0.4:c1=tri:c2=tri[x%d]" % (cur, i, i))
            cur = "x%d" % i
        graph = ";".join(parts + fade_chain)
        graph += (";[%s]atrim=0:%g,afade=t=in:st=0:d=0.35,"
                  "afade=t=out:st=%g:d=1.2[aout]") % (cur, total, fade_out_start)
        run([ff, "-v", "error", "-i", a.audio, "-filter_complex", graph,
             "-map", "[aout]", "-ar", "48000", "-ac", "2",
             "-c:a", "aac", "-b:a", "192k", "-y", audio_m4a])
        run([ff, "-v", "error", "-i", merged, "-i", audio_m4a,
             "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy",
             "-shortest", "-movflags", "+faststart", "-y", out])
    else:
        run([ff, "-v", "error", "-i", merged, "-c", "copy",
             "-movflags", "+faststart", "-y", out])

    if not a.keep_temp:
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        print("临时目录保留：", tmp)
    print("完成：", out)


if __name__ == "__main__":
    main()
