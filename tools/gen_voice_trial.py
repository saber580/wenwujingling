# -*- coding: utf-8 -*-
"""茶话会声线试听 · edge-tts 神经语音候选(8 款,照「动漫感」调参)+ 试听页。

用法:python tools\gen_voice_trial.py(生成时需要联网;生成后本地播放不联网)
产物:配音试听\*.mp3 + 配音试听\index.html(双击 index.html 挨个听,或直接双击单个 mp3)
挑好后回一句话「用 X 号」,再把该声线接进茶话会(预生成音频、离线播放)。
"""
import asyncio, os, sys
import edge_tts

try:
    sys.stdout.reconfigure(errors="replace")   # 控制台是 GBK,别为个别字符把脚本崩了
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, u"配音试听")

# 同一句台词,方便横向对比(自我介绍 + 汉代习俗,茶话会里的典型口气)
TEXT = (u"我先来!我叫玉坠,一块温润的美石,在土里睡了两千年。"
        u"你们知道吗?汉代人过年可有讲究——天不亮就喝屠苏酒,先敬祖先,再分给儿孙。")

# (编号, 文件名, 屏显名, 说明, 语音, 语速, 音调, 音量)
CANDIDATES = [
    (1, u"01 晓伊 · 元气少女", u"元气少女 · 晓伊", u"活泼机灵,动漫里的元气女主(zh-CN-Xiaoyi)", u"zh-CN-XiaoyiNeural", u"+6%", u"+8Hz", u"+0%"),
    (2, u"02 云夏 · 活泼少年", u"活泼少年 · 云夏", u"男孩声,少年男主/小师弟(zh-CN-Yunxia)", u"zh-CN-YunxiaNeural", u"+8%", u"+6Hz", u"+0%"),
    (3, u"03 晓晓 · 温柔清亮", u"温柔清亮 · 晓晓", u"治愈系女主,干净温柔(zh-CN-Xiaoxiao)", u"zh-CN-XiaoxiaoNeural", u"-4%", u"+2Hz", u"+0%"),
    (4, u"04 云希 · 清朗青年", u"清朗青年 · 云希", u"少年剑客/书生,清澈有礼(zh-CN-Yunxi)", u"zh-CN-YunxiNeural", u"+2%", u"+4Hz", u"+0%"),
    (5, u"05 云健 · 热血豪迈", u"热血豪迈 · 云健", u"开场旁白同款,沉厚有力量(zh-CN-Yunjian)", u"zh-CN-YunjianNeural", u"-6%", u"-2Hz", u"+8%"),
    (6, u"06 云扬 · 沉稳播音", u"沉稳播音 · 云扬", u"纪录片旁白感,端正如师长(zh-CN-Yunyang)", u"zh-CN-YunyangNeural", u"-6%", u"+0Hz", u"+0%"),
    (7, u"07 晓臻 · 甜软台腔", u"甜软台腔 · 曉臻", u"台湾腔甜妹,软糯亲切(zh-TW-HsiaoChen)", u"zh-TW-HsiaoChenNeural", u"+2%", u"+8Hz", u"+0%"),
    (8, u"08 小北 · 东北直爽", u"东北直爽 · 小北", u"东北话彩蛋,自带喜感(zh-CN-liaoning-Xiaobei)", u"zh-CN-liaoning-XiaobeiNeural", u"+4%", u"+2Hz", u"+0%"),
]


def build_page():
    rows = []
    for no, fn, label, desc, voice, rate, pitch, vol in CANDIDATES:
        rows.append(
            u'<div class="row"><div class="no">%d</div>'
            u'<div class="mid"><b>%s</b><small>%s</small></div>'
            u'<audio controls preload="metadata" src="%s.mp3"></audio></div>' % (no, label, desc, fn))
    page = u"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>配音试听 · 茶话会声线候选</title>
<style>
body{margin:0;padding:34px 16px 46px;background:#f6efe2;color:#3a3128;font:15px/1.8 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
h1{text-align:center;font-size:22px;letter-spacing:2px;color:#8a1f10;margin:0 0 8px}
.sub{text-align:center;color:#8a6a45;font-size:13px;margin:0 0 20px}
.poem{max-width:660px;margin:0 auto 18px;background:#fffdf6;border:1px dashed rgba(160,110,60,.45);border-radius:12px;padding:12px 18px;color:#6b5a44;font-size:13.5px}
.poem b{color:#8a1f10;font-weight:600}
.row{max-width:660px;margin:0 auto 12px;background:#fffdf6;border:1px solid rgba(160,110,60,.3);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 4px 14px rgba(96,54,22,.08)}
.no{flex:none;width:34px;height:34px;border-radius:50%;background:#8a1f10;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
.mid{flex:1 1 auto;min-width:0}
.mid b{display:block;font-size:14.5px;color:#8a1f10}
.mid small{display:block;color:#8a6a45;font-size:12px;line-height:1.6}
audio{flex:none;width:250px;height:38px}
.tip{max-width:660px;margin:22px auto 0;color:#8a6a45;font-size:12.5px;text-align:center;line-height:1.9}
@media(max-width:560px){.row{flex-wrap:wrap}audio{width:100%}}
</style></head><body>
<h1>配音试听 · 茶话会声线候选</h1>
<div class="sub">同一句台词、同一参数基准,共 8 款;挑好后回一句话「用 X 号」就行</div>
<div class="poem">试听台词:<b>__POEM__</b></div>
__ROWS__
<div class="tip">都是微软 AI 神经语音(edge-tts)照「动漫感」调过语速、音调;不是动画配音演员原声(版权原因没有素材),<br>但已经是本地方案里最接近的一档。挑中后我把茶话会台词预生成成这份声线,播放不联网。</div>
</body></html>
"""
    return page.replace(u"__POEM__", TEXT).replace(u"__ROWS__", u"\n".join(rows))


async def main():
    os.makedirs(OUT, exist_ok=True)
    for no, fn, label, desc, voice, rate, pitch, vol in CANDIDATES:
        out = os.path.join(OUT, fn + u".mp3")
        if os.path.isfile(out) and os.path.getsize(out) > 1024:
            print(u"[skip] %s" % fn)
            continue
        ok = False
        for attempt in (1, 2):
            try:
                comm = edge_tts.Communicate(TEXT, voice, rate=rate, pitch=pitch, volume=vol)
                await comm.save(out)
                ok = True
                break
            except Exception as e:
                print(u"[fail %d] %s -> %s" % (attempt, fn, e))
                await asyncio.sleep(1.2)
        if ok:
            print(u"[ok] %s  %.0f KB" % (fn, os.path.getsize(out) / 1024.0))
    with open(os.path.join(OUT, u"index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(build_page())
    print(u"[page] %s" % os.path.join(OUT, u"index.html"))


if __name__ == "__main__":
    asyncio.run(main())
