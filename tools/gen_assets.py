# -*- coding: utf-8 -*-
"""
文物精灵 · 矢量素材生成器
生成:主/副属性图标、精灵立绘(可爱风 chibi)、文物剪影
输出目录: <project>/assets/{attrs,spirits,relics}
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 直接输出到项目根下的中文文件夹,方便替换成 AI 生成图
DIRS = {
    "spirits": os.path.join(ROOT, "精灵"),
    "attrs": os.path.join(ROOT, "属性图标"),
    "relics": os.path.join(ROOT, "文物"),
}
for d in DIRS.values():
    os.makedirs(d, exist_ok=True)


# ---------- 颜色工具 ----------
def _rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c1, c2, t):
    a, b = _rgb(c1), _rgb(c2)
    return "#%02x%02x%02x" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def light(c, t=0.55):
    return mix(c, "#ffffff", t)


def dark(c, t=0.35):
    return mix(c, "#000000", t)


# ---------- 图形库(以 (0,0) 为中心,单色 c) ----------
def sh_coin(c, scale=1.0):
    return (f'<path fill="{c}" fill-rule="evenodd" d="'
            f'M0,-26 A26,26 0 1,0 0,26 A26,26 0 1,0 0,-26 Z '
            f'M-8,-8 h16 v16 h-16 Z"/>')


def sh_jade(c):
    return (f'<path fill="{c}" fill-rule="evenodd" d="'
            f'M0,-26 A26,26 0 1,0 0,26 A26,26 0 1,0 0,-26 Z '
            f'M0,-10 A10,10 0 1,1 0,10 A10,10 0 1,1 0,-10 Z"/>')


def sh_vase(c):
    return (f'<path fill="{c}" d="M-4,-28 L4,-28 L4,-16 '
            f'C14,-14 22,-4 22,8 C22,20 12,28 0,28 '
            f'C-12,28 -22,20 -22,8 C-22,-4 -14,-14 -4,-16 Z"/>')


def sh_rock(c):
    return (f'<path fill="{c}" d="M-24,18 L-15,-9 L-3,-20 L13,-13 L24,15 '
            f'L9,25 L-12,25 Z"/>')


def sh_bowl(c):
    return (f'<path fill="{c}" d="M-25,-3 C-25,16 -13,25 0,25 C13,25 25,16 25,-3 Z"/>'
            f'<rect x="-27" y="-10" width="54" height="8" rx="4" fill="{c}"/>')


def sh_cloth(c):
    return (f'<path fill="{c}" d="M-24,-11 C-12,-21 12,-1 24,-11 '
            f'L24,9 C12,19 -12,-1 -24,9 Z"/>')


def sh_bamboo(c):
    s = ""
    for x, o in ((-15, -4), (0, 2), (15, -2)):
        s += (f'<rect x="{x-5}" y="{-26+o}" width="10" height="52" rx="5" fill="{c}"/>'
              f'<rect x="{x-6}" y="{-2+o}" width="12" height="4" rx="2" fill="#ffffff" opacity="0.6"/>')
    return s


def sh_scroll(c):
    return (f'<rect x="-21" y="-13" width="42" height="26" rx="3" fill="{c}"/>'
            f'<circle cx="-24" cy="0" r="6" fill="{c}"/><circle cx="24" cy="0" r="6" fill="{c}"/>'
            f'<g stroke="#ffffff" stroke-width="2.5" opacity="0.75" stroke-linecap="round">'
            f'<path d="M-12,-6 H12 M-12,0 H12 M-12,6 H6"/></g>')


def sh_ding(c):
    return (f'<path fill="{c}" d="M-22,-14 L22,-14 L18,8 C18,17 -18,17 -18,8 Z"/>'
            f'<rect x="-25" y="-19" width="50" height="7" rx="3" fill="{c}"/>'
            f'<rect x="-13" y="14" width="6" height="12" rx="3" fill="{c}"/>'
            f'<rect x="7" y="14" width="6" height="12" rx="3" fill="{c}"/>')


def sh_sword(c):
    return (f'<path fill="{c}" d="M0,-28 L7,-16 L5,10 L-5,10 L-7,-16 Z"/>'
            f'<rect x="-15" y="9" width="30" height="6" rx="3" fill="{c}"/>'
            f'<rect x="-4" y="15" width="8" height="13" rx="3" fill="{c}"/>')


def sh_bell(c):
    return (f'<path fill="{c}" d="M-4,-26 L4,-26 L5,-20 '
            f'C16,-16 20,-6 21,10 L-21,10 C-20,-6 -16,-16 -5,-20 Z"/>'
            f'<rect x="-24" y="10" width="48" height="6" rx="3" fill="{c}"/>'
            f'<circle cx="0" cy="1" r="3" fill="#ffffff" opacity="0.7"/>')


def sh_cup(c):
    return (f'<path fill="{c}" d="M-16,-18 L16,-18 L12,2 C12,10 -12,10 -12,2 Z"/>'
            f'<rect x="-4" y="6" width="8" height="10" fill="{c}"/>'
            f'<rect x="-14" y="16" width="28" height="6" rx="3" fill="{c}"/>')


def sh_tassel(c):
    return (f'<circle cx="0" cy="-18" r="10" fill="{c}"/>'
            f'<path fill="{c}" d="M-16,-6 L16,-6 L10,26 L-10,26 Z"/>'
            f'<g stroke="#ffffff" stroke-width="2" opacity="0.7">'
            f'<path d="M-5,-4 L-7,24 M5,-4 L7,24"/></g>')


def sh_weight(c):
    return (f'<ellipse cx="0" cy="16" rx="24" ry="6" fill="{c}"/>'
            f'<path fill="{c}" d="M-24,16 C-24,-8 -13,-22 0,-22 C13,-22 24,-8 24,16 Z"/>')


def sh_figure(c):
    return (f'<circle cx="0" cy="-14" r="10" fill="{c}"/>'
            f'<path fill="{c}" d="M-14,-2 L14,-2 L18,26 L-18,26 Z"/>')


def sh_brush(c):
    return (f'<g transform="rotate(35)"><rect x="-4" y="-26" width="8" height="34" rx="4" fill="{c}"/>'
            f'<path fill="{c}" d="M-4,8 L4,8 L0,26 Z"/></g>'
            f'<ellipse cx="10" cy="18" rx="16" ry="8" fill="{c}"/>'
            f'<ellipse cx="10" cy="17" rx="10" ry="4" fill="#ffffff" opacity="0.5"/>')


def sh_building(c):
    return (f'<path fill="{c}" d="M-26,-6 L26,-6 L18,-18 L-18,-18 Z"/>'
            f'<rect x="-5" y="-6" width="10" height="32" fill="{c}"/>'
            f'<rect x="-20" y="26" width="40" height="6" rx="3" fill="{c}"/>')


def sh_ingot(c):
    return (f'<path fill="{c}" d="M-26,10 C-16,-8 -8,2 0,2 C8,2 16,-8 26,10 '
            f'C17,21 -17,21 -26,10 Z"/>')


def sh_cube(c):
    return (f'<path fill="{c}" d="M0,-24 L22,-12 L22,12 L0,24 L-22,12 L-22,-12 Z"/>'
            f'<path fill="#ffffff" opacity="0.35" d="M0,-24 L22,-12 L0,0 L-22,-12 Z"/>')


def sh_lion(c):
    mane = ""
    for i in range(12):
        import math
        a = i * (math.pi / 6)
        x, y = math.cos(a) * 27, math.sin(a) * 27
        mane += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{c}"/>'
    return (mane + f'<circle r="21" fill="{c}"/>'
            f'<circle cx="-7" cy="-3" r="3.5" fill="#ffffff"/><circle cx="7" cy="-3" r="3.5" fill="#ffffff"/>'
            f'<path d="M-8,7 Q0,13 8,7" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>')


def sh_floral(c):
    import math
    s = ""
    for i in range(5):
        a = i * (2 * math.pi / 5) - math.pi / 2
        x, y = math.cos(a) * 15, math.sin(a) * 15
        s += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="10" ry="10" fill="{c}"/>'
    return s + f'<circle r="9" fill="#ffffff"/><circle r="5" fill="{c}"/>'


def sh_dragon(c):
    return (f'<path fill="{c}" d="M-26,8 C-18,-14 0,-20 8,-6 C14,4 6,14 -2,8 '
            f'C-8,4 -6,-2 -1,-2" stroke="{c}" stroke-width="7" fill="none" stroke-linecap="round"/>'
            f'<circle cx="26" cy="-8" r="9" fill="{c}"/>'
            f'<circle cx="23" cy="-10" r="2.5" fill="#ffffff"/>')


def sh_round(c):
    return f'<circle r="24" fill="{c}"/>'


SHAPES = dict(coin=sh_coin, jade=sh_jade, vase=sh_vase, rock=sh_rock, bowl=sh_bowl,
              cloth=sh_cloth, bamboo=sh_bamboo, scroll=sh_scroll, ding=sh_ding,
              sword=sh_sword, bell=sh_bell, cup=sh_cup, tassel=sh_tassel, weight=sh_weight,
              figure=sh_figure, brush=sh_brush, building=sh_building, ingot=sh_ingot,
              cube=sh_cube, lion=sh_lion, floral=sh_floral, dragon=sh_dragon, round=sh_round)


# ---------- 属性图标 ----------
def attr_icon(color, shape, fname):
    glyph = SHAPES[shape]("#ffffff")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="{light(color,0.25)}"/>
<stop offset="1" stop-color="{dark(color,0.18)}"/>
</linearGradient>
</defs>
<circle cx="64" cy="64" r="60" fill="url(#g)"/>
<circle cx="64" cy="64" r="60" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="4"/>
<circle cx="64" cy="64" r="53" fill="none" stroke="#000000" stroke-opacity="0.10" stroke-width="2"/>
<g transform="translate(64,64) scale(0.92)">{glyph}</g>
</svg>'''
    open(os.path.join(DIRS["attrs"], fname), "w", encoding="utf-8").write(svg)


PRIMARY = {
    "bronze":  ("#b87333", "coin"),
    "iron":    ("#7f8b99", "cube"),
    "gold":    ("#d4af37", "ingot"),
    "ceramic": ("#3f7cac", "vase"),
    "jade":    ("#4f9d74", "jade"),
    "stone":   ("#9aa0a6", "rock"),
    "lacquer": ("#8e3b46", "bowl"),
    "textile": ("#c060a8", "cloth"),
    "wood":    ("#9c6b3f", "bamboo"),
    "painting": ("#5b6cab", "scroll"),
}
SECONDARY = {
    "currency":   ("#c9a227", "coin"),
    "ritual":     ("#7d5a9e", "ding"),
    "weapon":     ("#5c6b7a", "sword"),
    "instrument": ("#b5762a", "bell"),
    "household":  ("#c26b3f", "cup"),
    "adornment":  ("#c885a6", "tassel"),
    "ornament":   ("#6f8f4a", "weight"),
    "mingqi":     ("#8a8175", "figure"),
    "scholar":    ("#4a5a6a", "brush"),
    "guardian":   ("#a04d30", "building"),
}

for k, (c, s) in PRIMARY.items():
    attr_icon(c, s, f"p_{k}.svg")
for k, (c, s) in SECONDARY.items():
    attr_icon(c, s, f"s_{k}.svg")


# ---------- 精灵立绘 ----------
def spirit_svg(body, accent, emblem, extras="", star="round"):
    b_light = light(body, 0.62)
    b_dark = dark(body, 0.42)
    chest = f'<ellipse cx="128" cy="182" rx="42" ry="33" fill="#ffffff" opacity="0.65"/>'
    em = SHAPES[emblem](accent)
    em = f'<g transform="translate(128,182) scale(0.72)">{em}</g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<defs>
<radialGradient id="bg" cx="50%" cy="38%" r="75%">
<stop offset="0" stop-color="{light(accent,0.82)}"/>
<stop offset="1" stop-color="#ffffff"/>
</radialGradient>
<radialGradient id="bd" cx="36%" cy="28%" r="80%">
<stop offset="0" stop-color="{b_light}"/>
<stop offset="1" stop-color="{body}"/>
</radialGradient>
</defs>
<rect width="256" height="256" rx="30" fill="url(#bg)"/>
<circle cx="128" cy="126" r="100" fill="none" stroke="{accent}" stroke-opacity="0.14" stroke-width="8"/>
<g opacity="0.9" fill="{accent}">
<path d="M40,54 l3.5,8 8,3.5 -8,3.5 -3.5,8 -3.5,-8 -8,-3.5 8,-3.5 Z" opacity="0.5"/>
<path d="M216,70 l3,7 7,3 -7,3 -3,7 -3,-7 -7,-3 7,-3 Z" opacity="0.45"/>
<path d="M206,196 l2.5,6 6,2.5 -6,2.5 -2.5,6 -2.5,-6 -6,-2.5 6,-2.5 Z" opacity="0.4"/>
</g>
{extras}
<ellipse cx="128" cy="224" rx="66" ry="13" fill="#000000" opacity="0.08"/>
<ellipse cx="128" cy="150" rx="82" ry="76" fill="url(#bd)" stroke="{b_dark}" stroke-width="3"/>
<ellipse cx="52" cy="156" rx="17" ry="25" fill="{body}" stroke="{b_dark}" stroke-width="3" transform="rotate(-22 52 156)"/>
<ellipse cx="204" cy="156" rx="17" ry="25" fill="{body}" stroke="{b_dark}" stroke-width="3" transform="rotate(22 204 156)"/>
<ellipse cx="98" cy="216" rx="22" ry="14" fill="{b_dark}"/>
<ellipse cx="158" cy="216" rx="22" ry="14" fill="{b_dark}"/>
{chest}{em}
<ellipse cx="103" cy="137" rx="13" ry="16" fill="#3a2b22"/>
<ellipse cx="153" cy="137" rx="13" ry="16" fill="#3a2b22"/>
<circle cx="99" cy="131" r="4.6" fill="#ffffff"/>
<circle cx="149" cy="131" r="4.6" fill="#ffffff"/>
<ellipse cx="86" cy="160" rx="12" ry="7" fill="#ff9db0" opacity="0.72"/>
<ellipse cx="170" cy="160" rx="12" ry="7" fill="#ff9db0" opacity="0.72"/>
<path d="M119,162 Q128,172 137,162" fill="none" stroke="#7a5a4a" stroke-width="3.2" stroke-linecap="round"/>
</svg>'''


def mane_extras(color):
    import math
    s = f'<g transform="translate(128,120)">'
    for i in range(16):
        a = i * (2 * math.pi / 16)
        x, y = math.cos(a) * 84, math.sin(a) * 84
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="{color}" opacity="0.9"/>'
    return s + '</g>'


SPIRITS = {
    "wuzhuqian": dict(body="#c68a4e", accent="#8a5a20", emblem="coin"),
    "qinghuaci": dict(body="#eef4fb", accent="#2a5db0", emblem="floral"),
    "yuzhui":    dict(body="#e2f0e8", accent="#3f8f6a", emblem="jade"),
    "tielion":   dict(body="#8f959e", accent="#565c66", emblem="lion",
                      extras=mane_extras("#6f757e")),
    "baozhen":   dict(body="#c9a24a", accent="#7a5410", emblem="weight",
                      extras='<g fill="#7a5410" opacity="0.5"><circle cx="80" cy="120" r="6"/>'
                             '<circle cx="176" cy="120" r="6"/><circle cx="90" cy="196" r="5"/>'
                             '<circle cx="166" cy="196" r="5"/></g>'),
    "baiyulion": dict(body="#f4f3ee", accent="#b3b1a6", emblem="lion",
                      extras=mane_extras("#d9d7cd")),
    "longhu":    dict(body="#cfe6dc", accent="#3f8f6a", emblem="dragon"),
}

for k, p in SPIRITS.items():
    open(os.path.join(DIRS["spirits"], f"{k}.svg"), "w", encoding="utf-8").write(
        spirit_svg(p["body"], p["accent"], p["emblem"], p.get("extras", "")))


# ---------- 文物剪影(单色线稿风) ----------
def relic_svg(shape, color, fname):
    glyph = SHAPES[shape](color)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
<rect width="160" height="160" rx="18" fill="{light(color,0.86)}"/>
<circle cx="80" cy="80" r="62" fill="#ffffff" opacity="0.55"/>
<g transform="translate(80,80) scale(1.7)">{glyph}</g>
</svg>'''
    open(os.path.join(DIRS["relics"], fname), "w", encoding="utf-8").write(svg)


RELICS = {
    "wuzhuqian": ("coin", "#8a5a20"),
    "qinghuaci": ("vase", "#2a5db0"),
    "yuzhui": ("jade", "#3f8f6a"),
    "tielion": ("lion", "#565c66"),
    "baozhen": ("weight", "#7a5410"),
    "baiyulion": ("lion", "#a7a59a"),
    "longhu": ("dragon", "#3f8f6a"),
}
for k, (s, c) in RELICS.items():
    relic_svg(s, c, f"{k}.svg")


# ---------- 完成 ----------
n = lambda p: len(os.listdir(p))
print("spirits:", n(DIRS["spirits"]))
print("attrs  :", n(DIRS["attrs"]))
print("relics :", n(DIRS["relics"]))
print("OK ->", ROOT)
