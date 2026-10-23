# -*- coding: utf-8 -*-
"""开场画卷旁白 · edge-tts(微软 Edge 神经语音)生成,本地播放不联网。

① 正式配音:音频\开场旁白.mp3(默认 1 号)
② 试听候选:开场旁白试听\(九段候选 + 试听页 index.html;在项目里)

用法:python tools\gen_intro_voice.py(生成时需要联网;生成好的文件随项目打包,页面播放不需要联网)
换音色:改 DEFAULT 后重跑,或者在试听页挑好后让 AI 换。
"""
import asyncio, io, os, shutil
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, u"音频")
TRIAL = os.path.join(ROOT, u"开场旁白试听")

TEXT = (u"文物有话说,千古述流光。沉睡千年的古物一朝苏醒,跨越岁月长河,自燕赵大地而来,"
        u"向你诉说埋藏在器物之中的千年故事。随君寻访博物,邂逅文物精灵,共览华夏文脉。")
TEXT = TEXT.replace(u",", u"\uff0c")  # 半角逗号统一为全角(防手滑),朗读停顿更自然

# (名称, 语音, 语速, 音调, 音量)
# 1~5 基础款;6~9 为「朗读者式豪迈」加强款
CANDIDATES = [
    (u"1 云健 · 雄浑大气", u"zh-CN-YunjianNeural", u"-12%", u"-3Hz", u"+10%"),
    (u"2 云扬 · 沉稳播音", u"zh-CN-YunyangNeural", u"-10%", u"-2Hz", u"+10%"),
    (u"3 云希 · 青年清朗", u"zh-CN-YunxiNeural", u"-8%", u"+0Hz", u"+10%"),
    (u"4 晓晓 · 温暖亲和", u"zh-CN-XiaoxiaoNeural", u"-8%", u"+0Hz", u"+10%"),
    (u"5 小北 · 东北话彩蛋", u"zh-CN-liaoning-XiaobeiNeural", u"-6%", u"+0Hz", u"+10%"),
    (u"6 云健 · 豪迈激昂", u"zh-CN-YunjianNeural", u"-4%", u"-9Hz", u"+30%"),
    (u"7 云健 · 低音洪钟", u"zh-CN-YunjianNeural", u"-10%", u"-16Hz", u"+25%"),
    (u"8 云扬 · 央视纪录片", u"zh-CN-YunyangNeural", u"-6%", u"-8Hz", u"+20%"),
    (u"9 安德鲁 · 国际旁白(中文)", u"en-US-AndrewMultilingualNeural", u"-8%", u"-4Hz", u"+15%"),
]
DEFAULT = 0  # 正式配音用第几号(从 0 数)


async def synth(voice, rate, pitch, volume, out):
    c = edge_tts.Communicate(TEXT, voice, rate=rate, pitch=pitch, volume=volume)
    await c.save(out)


def build_trial_page():
    rows = []
    for name, voice, rate, pitch, volume in CANDIDATES:
        rows.append(
            u'<div class="row"><b>%s<small>%s · 语速%s · 音调%s · 音量%s</small></b>'
            u'<audio controls preload="none" src="%s.mp3"></audio></div>'
            % (name, voice, rate, pitch, volume, name))
    seg = [s for s in TEXT.split(u"。") if s]
    poem = u"。<br>".join(seg) + u"。"
    page = u"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>开场画卷 · 旁白试听</title>
<style>
body{margin:0;font-family:"Microsoft YaHei",system-ui,sans-serif;color:#4a2c18;min-height:100vh;padding:40px 18px;
 background:#f6ead2;background-image:radial-gradient(ellipse at 50% 38%,rgba(255,252,242,.95),rgba(242,226,196,.92))}
h1{font-family:KaiTi,"楷体",serif;color:#8a1f10;text-align:center;letter-spacing:.12em;margin:6px 0 4px;font-size:30px}
.sub{text-align:center;color:#8a6a45;font-size:13px;margin-bottom:12px}
.poem{max-width:660px;margin:14px auto 22px;text-align:center;font-family:KaiTi,"楷体",serif;color:#5c3b24;
 line-height:1.95;font-size:15px;letter-spacing:.08em}
.row{max-width:660px;margin:0 auto 12px;background:#fffdf6;border:1px solid rgba(160,110,60,.3);border-radius:12px;
 padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 4px 14px rgba(96,54,22,.08)}
.row b{font-size:14.5px;color:#8a1f10;flex:none;width:190px;line-height:1.5}
.row b small{display:block;font-weight:400;color:#8a6a45;font-size:11px}
audio{flex:1;height:38px;min-width:240px}
.tip{max-width:660px;margin:20px auto 0;color:#8a6a45;font-size:12.5px;text-align:center;line-height:1.9}
</style></head><body>
<h1>开场画卷 · 旁白试听</h1>
<div class="sub">共九段候选,全是 AI 神经语音;6~9 号是为「朗读者式豪迈」新调的加强版</div>
<div class="poem">__POEM__</div>
__ROWS__
<div class="tip">挑好后告诉我编号(比如「用 6 号」),我就把正式旁白换成它;<br>想再调语速/音调/音量,或者想要更真人级的声线,直接说~</div>
</body></html>
"""
    return page.replace(u"__POEM__", poem).replace(u"__ROWS__", u"\n".join(rows))


async def main():
    os.makedirs(AUD, exist_ok=True)
    os.makedirs(TRIAL, exist_ok=True)
    for f in os.listdir(TRIAL):  # 清理旧候选,避免换名后残留
        if f.lower().endswith(u".mp3"):
            os.remove(os.path.join(TRIAL, f))
    for i, (name, voice, rate, pitch, volume) in enumerate(CANDIDATES):
        out = os.path.join(TRIAL, name + u".mp3")
        await synth(voice, rate, pitch, volume, out)
        print(u"✓ %s  %.0f KB" % (name, os.path.getsize(out) / 1024.0))
    src = os.path.join(TRIAL, CANDIDATES[DEFAULT][0] + u".mp3")
    shutil.copy(src, os.path.join(AUD, u"开场旁白.mp3"))
    print(u"正式配音 → %s(%.0f KB)" % (os.path.join(AUD, u"开场旁白.mp3"), os.path.getsize(os.path.join(AUD, u"开场旁白.mp3")) / 1024.0))
    io.open(os.path.join(TRIAL, u"index.html"), "w", encoding="utf-8", newline="\n").write(build_trial_page())
    print(u"试听页 → %s" % os.path.join(TRIAL, u"index.html"))


asyncio.run(main())
